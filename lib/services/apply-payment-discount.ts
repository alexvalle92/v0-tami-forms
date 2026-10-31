import type { AsaasClient } from "@/lib/asaas/client"
import type { Channel, PaymentRepo, PaymentView } from "@/lib/db/repos/types"
import { HttpError } from "@/lib/http/retry"
import type { Logger } from "@/lib/log"
import { addDaysISO, todayInSaoPaulo } from "@/lib/time"
import type { AlertAdmin } from "./alert-admin"
import { safeErrorMessage, toLastError } from "./last-error"

export type DiscountResult = "applied" | "skipped" | "retry" | "busy"

export type ApplyPaymentDiscount = (paymentId: string, opts: { deadline: number }) => Promise<DiscountResult>

const LOCK_TTL_MS = 120_000
// Mesmo motivo de `syncPayment`: o lock expira em 120 s e o repositório não confere o dono. Uma chamada ao
// Asaas que passasse disso deixaria outro worker pegar o lock vencido e repetir o PUT e a gravação.
const LOCK_SAFE_WINDOW_MS = 100_000

/** Só cobranças ainda em aberto recebem o desconto, e uma única vez (`discountStatus` nulo). */
function skipReason(p: PaymentView): string | null {
  if (p.discountStatus !== null) return "already_evaluated"
  if (p.status !== "PENDING" && p.status !== "OVERDUE") return "not_open"
  if (!p.asaasId) return "no_asaas_id"
  return null
}

/** Valor em centavos, para não comparar `29.9` com `"29.90"` como ponto flutuante. */
const cents = (value: number | string) => Math.round(Number(value) * 100)

/**
 * Aplica o desconto numa cobrança em aberto do Asaas: altera valor, vencimento e descrição por PUT e
 * grava o resultado (com as mensagens) numa transação. Idempotente: se o PUT de uma rodada anterior deu
 * certo e a gravação falhou, o GET mostra o valor novo e o PUT é pulado. Se a gravação falha com o Asaas já
 * alterado, o preço lá e o daqui divergem até a rodada seguinte: avisa o admin além de pedir nova tentativa.
 */
export function createApplyPaymentDiscount(d: {
  payments: PaymentRepo
  asaas: AsaasClient
  alertAdmin: AlertAdmin
  log: Logger
  now: () => Date
  config: { amount: string; dueDays: number; successUrl: string; channels: Channel[] }
}): ApplyPaymentDiscount {
  return async function applyPaymentDiscount(paymentId, opts) {
    const skippedWithoutWriting = (reason: string): DiscountResult => {
      d.log.info("discount.skipped", { paymentId, reason })
      return "skipped"
    }

    const first = await d.payments.get(paymentId)
    if (!first) return skippedWithoutWriting("not_found")
    const firstReason = skipReason(first)
    if (firstReason) return skippedWithoutWriting(firstReason)

    if (!(await d.payments.tryLock(paymentId, LOCK_TTL_MS))) return "busy"

    // `applyDiscount` e `markDiscountSkipped` soltam o lock; em qualquer outro caminho o `finally` o solta.
    const lockTakenAtMs = d.now().getTime()
    const asaasOpts = { deadline: Math.min(opts.deadline, lockTakenAtMs + LOCK_SAFE_WINDOW_MS) }
    let lockHeld = true
    try {
      // Outra rodada ou o webhook pode ter chegado entre o `get` e o lock: relê e confere de novo.
      const payment = await d.payments.get(paymentId)
      if (!payment) return skippedWithoutWriting("not_found")
      const reason = skipReason(payment)
      if (reason) return skippedWithoutWriting(reason)

      /** Marca a cobrança como avaliada sem desconto (solta o lock). */
      async function skip(why: string, fields: Record<string, unknown> = {}): Promise<DiscountResult> {
        step = "db.mark_discount_skipped"
        await d.payments.markDiscountSkipped(paymentId, d.now())
        lockHeld = false
        d.log.info("discount.skipped", { paymentId, reason: why, ...fields })
        return "skipped"
      }

      let step = "db.has_applied_discount"
      // O Asaas já tem o valor novo (PUT feito agora, ou feito numa rodada anterior): se o banco falhar, divergem.
      let asaasChanged = false
      try {
        if (await d.payments.hasAppliedDiscount(payment.patientId)) return await skip("patient_already_discounted")

        const amount = d.config.amount
        const originalAmount = payment.amount
        const dueDate = addDaysISO(todayInSaoPaulo(d.now()), d.config.dueDays)
        const asaasId = payment.asaasId!

        step = "asaas.get_payment"
        const remote = await d.asaas.getPayment(asaasId, asaasOpts)
        // Paga, excluída ou estornada: o webhook cuida do resto, nada de mensagem de desconto.
        if (remote.status !== "PENDING" && remote.status !== "OVERDUE") {
          return await skip("asaas_not_open", { asaasStatus: remote.status })
        }

        const alreadyDiscounted = cents(remote.value) === cents(amount) && remote.dueDate === dueDate
        let status = remote.status
        if (alreadyDiscounted) {
          asaasChanged = true
        } else {
          // O valor local pode estar defasado: nunca "descontar" para um preço igual ou maior que o de verdade.
          if (cents(remote.value) <= cents(amount)) {
            return await skip("asaas_value_not_above_discount", { asaasValue: remote.value })
          }
          step = "asaas.update_payment"
          const updated = await d.asaas.updatePayment(
            asaasId,
            {
              value: Number(amount),
              dueDate,
              description: `Plano Alimentar Personalizado - ${payment.patient.name} - 30 dias - condição especial`,
              // Não muda a forma de pagamento que a pessoa escolheu.
              billingType: remote.billingType ?? "UNDEFINED",
              // O PUT pode apagar o que não vem no corpo: manda de volta o que a criação gravou.
              externalReference: payment.id,
              callback: { successUrl: d.config.successUrl },
            },
            asaasOpts,
          )
          asaasChanged = true
          // O Asaas tira a cobrança vencida de OVERDUE ao mudar o vencimento; o webhook de update é ignorado.
          status = updated.status || remote.status
        }

        step = "db.apply_discount"
        const { notificationsEnqueued } = await d.payments.applyDiscount(paymentId, {
          amount,
          originalAmount,
          dueDate,
          status,
          at: d.now(),
          channels: d.config.channels,
        })
        lockHeld = false
        if (notificationsEnqueued === 0 && d.config.channels.length > 0) {
          d.log.warn("discount.no_quiz_response", { paymentId })
        }
        d.log.info("discount.applied", { paymentId, originalAmount, amount, dueDate })
        return "applied"
      } catch (err) {
        // Nunca logar `err.body` nem dados pessoais.
        const lastError = toLastError(step, err, 1, d.now())
        const { httpStatus, message } = lastError
        const fields = { paymentId, step, ...(httpStatus !== undefined ? { httpStatus } : {}), message }
        // 4xx do Asaas é definitivo; o resto (rede, timeout, 5xx, 429, banco) é passageiro.
        if (err instanceof HttpError && !err.transient) {
          try {
            await d.payments.markDiscountSkipped(paymentId, d.now())
            lockHeld = false
          } catch (markErr) {
            d.log.warn("discount.retry", { ...fields, markMessage: safeErrorMessage(markErr) })
            return "retry"
          }
          d.log.error("discount.skipped", fields)
          return "skipped"
        }
        d.log.warn("discount.retry", fields)
        if (step === "db.apply_discount" && asaasChanged) {
          // Preço novo no Asaas e antigo aqui: a próxima rodada tenta de novo, mas alguém precisa ficar sabendo.
          d.log.error("discount.asaas_changed_db_not", { paymentId, message })
          try {
            await d.alertAdmin({ kind: "payment", id: paymentId, patientName: payment.patient.name, error: lastError })
          } catch (alertErr) {
            d.log.error("discount.alert_failed", { paymentId, message: safeErrorMessage(alertErr) })
          }
        }
        return "retry"
      }
    } finally {
      if (lockHeld) {
        try {
          await d.payments.unlock(paymentId)
        } catch (err) {
          d.log.error("discount.unlock_failed", { paymentId, message: safeErrorMessage(err) })
        }
      }
    }
  }
}
