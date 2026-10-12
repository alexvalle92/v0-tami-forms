import type { NotificationRepo, NotificationView } from "@/lib/db/repos/types"
import { HttpError } from "@/lib/http/retry"
import { MAX_NOTIFICATION_ATTEMPTS, jobBackoffMs } from "@/lib/jobs/backoff"
import type { Logger } from "@/lib/log"
import type { EmailSender } from "@/lib/notify/email"
import {
  renderFirstAccess,
  renderPasswordReset,
  renderPaymentLink,
  renderPlanExpiring,
  renderPlanReady,
  renderRenewalPaymentLink,
  toWhatsAppParts,
} from "@/lib/notify/templates"
import { daysLeft, renewalState, type ExpiryStage } from "@/lib/renewal/rules"
import type { WhatsAppSender } from "@/lib/notify/whatsapp"
import { todayInSaoPaulo } from "@/lib/time"
import type { AlertAdmin } from "./alert-admin"
import { safeErrorMessage, toLastError } from "./last-error"

export type DispatchResult = "sent" | "retry_scheduled" | "failed" | "busy" | "skipped"

export type DispatchNotification = (id: string) => Promise<DispatchResult>

const LOCK_TTL_MS = 120_000
const WHATSAPP_PART_GAP_MS = 3000

/** Mensagem que não adianta repetir (ex.: `password_reset` sem link): falha definitiva na primeira tentativa. */
export class PermanentNotificationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PermanentNotificationError"
  }
}

/**
 * Envia uma notificação enfileirada (e-mail ou WhatsApp; `payment_link`, `plan_ready`, `password_reset` ou
 * `plan_expiring_d5|d2|d0`). O `payment_link` de quem já tem senha usa o texto da renovação. O WhatsApp é retomável: cada parte enviada
 * é gravada (`parts_sent`), então uma nova tentativa continua da próxima parte e não reenvia as anteriores.
 * Falhas viram nova tentativa com backoff; a definitiva (erro permanente ou 5ª tentativa) alerta o admin.
 * O aviso de vencimento que perdeu a validade até o envio sai da fila sem ser enviado e sem alerta (`skipped`).
 */
export function createDispatchNotification(d: {
  notifications: NotificationRepo
  email: EmailSender
  whatsapp: WhatsAppSender
  alertAdmin: AlertAdmin
  log: Logger
  now: () => Date
  sleep: (ms: number) => Promise<void>
  /** Senha temporária do paciente (derivada) e conferência contra o `password_hash` gravado (§8). */
  access: {
    tempPassword: (patientId: string) => string
    verifyPassword: (password: string, stored: string) => Promise<boolean>
  }
  /** Endereço do PlanA, o `PLANA_APP_URL`. */
  appUrl: string
}): DispatchNotification {
  async function recordFailure(
    n: NotificationView,
    partsSent: number,
    step: string,
    err: unknown,
  ): Promise<{ result: DispatchResult; lockCleared: boolean }> {
    const attempts = n.attempts + 1
    const failed =
      (err instanceof HttpError && !err.transient) ||
      err instanceof PermanentNotificationError ||
      attempts >= MAX_NOTIFICATION_ATTEMPTS
    const at = d.now()
    const error = toLastError(step, err, attempts, at)
    // Nunca logar `err.body`, destinatário, nome do paciente nem o texto da mensagem.
    const fields = {
      notificationId: n.id,
      channel: n.channel,
      step,
      httpStatus: error.httpStatus,
      attempt: attempts,
      partsSent,
      message: error.message,
    }

    try {
      await d.notifications.markFailure(n.id, {
        attempts,
        nextAttemptAt: failed ? null : new Date(at.getTime() + jobBackoffMs(attempts)),
        failed,
        error,
      })
    } catch (recordErr) {
      d.log.error("notification.dispatch.record_failure_failed", {
        ...fields,
        recordMessage: safeErrorMessage(recordErr),
      })
      return { result: "retry_scheduled", lockCleared: false }
    }

    if (!failed) {
      d.log.warn("notification.dispatch.retry_scheduled", fields)
      return { result: "retry_scheduled", lockCleared: true }
    }

    d.log.error("notification.dispatch.failed", fields)
    try {
      await d.alertAdmin({ kind: "notification", id: n.id, patientName: n.patientName, error })
    } catch (alertErr) {
      d.log.error("notification.dispatch.alert_failed", {
        notificationId: n.id,
        message: safeErrorMessage(alertErr),
      })
    }
    return { result: "failed", lockCleared: true }
  }

  /**
   * Conteúdo conforme o `kind`. No `plan_ready` a escolha é feita agora, contra a credencial atual do paciente (§9):
   * a senha ainda é a temporária derivada → primeiro acesso; qualquer outra coisa (já trocada, ou hash em outro
   * formato, que `verifyPassword` recusa) → plano novo disponível. Sem credencial é erro (vira nova tentativa).
   * A senha temporária só existe nesta função e no corpo da mensagem: nunca em log nem em erro.
   */
  async function renderMessage(n: NotificationView): Promise<{ subject: string; html: string; text: string }> {
    if (n.kind === "payment_link") {
      if (!n.paymentUrl) throw new Error("payment without url")
      // Quem já tem senha é paciente que renova (ou que refez o quiz): o texto do cadastro novo não serve.
      if (n.patientPasswordHash) return renderRenewalPaymentLink({ name: n.patientName, link: n.paymentUrl })
      return renderPaymentLink({ name: n.patientName, link: n.paymentUrl })
    }

    // Aviso de vencimento: o plano dá a data e o link do formulário; a cobrança, quando ligada, troca a variante.
    if (n.kind === "plan_expiring_d5" || n.kind === "plan_expiring_d2" || n.kind === "plan_expiring_d0") {
      if (!n.mealPlan || !n.mealPlan.endDate) throw new PermanentNotificationError(`${n.kind} without meal plan`)
      const stage = n.kind.slice("plan_expiring_".length) as ExpiryStage
      const endDate = n.mealPlan.endDate
      if (n.paymentUrl) {
        return renderPlanExpiring({ stage, name: n.patientName, endDate, variant: "payment", link: n.paymentUrl })
      }
      const link = new URL(`cliente/planos/${n.mealPlan.id}/renovar`, d.appUrl).href
      return renderPlanExpiring({ stage, name: n.patientName, endDate, variant: "form", link })
    }

    // O link vive no payload da mensagem até ela sair (`markSent` o apaga); sem ele não há o que enviar.
    if (n.kind === "password_reset") {
      const link = n.payload?.link
      if (!link) throw new PermanentNotificationError("password_reset without link")
      return renderPasswordReset({ name: n.patientName, link })
    }

    if (!n.patientPasswordHash) throw new Error("patient without password hash")
    const tempPassword = d.access.tempPassword(n.patientId)
    if (await d.access.verifyPassword(tempPassword, n.patientPasswordHash)) {
      return renderFirstAccess({ name: n.patientName, appUrl: d.appUrl, tempPassword })
    }
    return renderPlanReady({ name: n.patientName, appUrl: d.appUrl })
  }

  /**
   * Aviso de vencimento que perdeu a validade entre a fila e o envio (atraso por novas tentativas ou reabertura):
   * plano que deixou de ser ativo, plano já vencido (nenhuma mensagem depois do vencimento) ou renovação já paga
   * (spec §13: nunca pedir pagamento a quem já pagou). Devolve o motivo, ou null se o aviso ainda vale.
   * Faltando 0 a 5 dias o aviso ainda vale mesmo que o estágio de hoje seja outro: d5 e d2 trazem a data explícita.
   * Sem plano ou sem data, quem decide é `renderMessage` (falha definitiva).
   */
  function staleReason(n: NotificationView): string | null {
    if (n.kind !== "plan_expiring_d5" && n.kind !== "plan_expiring_d2" && n.kind !== "plan_expiring_d0") return null
    if (!n.mealPlan || !n.mealPlan.endDate) return null
    if (n.mealPlan.status !== "active") return "plan no longer active"
    const today = todayInSaoPaulo(d.now())
    const days = daysLeft(n.mealPlan.endDate, today)
    if (days !== null && days < 0) return "plan already expired"
    if (renewalState(n.mealPlan.renewalCharge, today).status === "paid") return "renewal already paid"
    return null
  }

  /**
   * Tira da fila, sem enviar e sem alertar o admin, o aviso que perdeu a validade: `failed` com o motivo em
   * `last_error` (etapa `notify.stale`). Se a gravação falhar, a linha segue pendente e o próximo envio confere de novo.
   */
  async function discardStale(n: NotificationView, reason: string): Promise<boolean> {
    const attempts = n.attempts + 1
    const at = d.now()
    try {
      await d.notifications.markFailure(n.id, {
        attempts,
        nextAttemptAt: null,
        failed: true,
        error: { step: "notify.stale", message: reason, attempt: attempts, at: at.toISOString() },
      })
    } catch (err) {
      d.log.error("notification.dispatch.record_stale_failed", {
        notificationId: n.id,
        channel: n.channel,
        reason,
        recordMessage: safeErrorMessage(err),
      })
      return false
    }
    d.log.info("notification.dispatch.stale", { notificationId: n.id, channel: n.channel, reason })
    return true
  }

  return async function dispatchNotification(id) {
    const first = await d.notifications.get(id)
    if (!first || first.status !== "pending") return "skipped"

    if (!(await d.notifications.tryLock(id, LOCK_TTL_MS))) return "busy"

    // `markSent` e `markFailure` soltam o lock; em qualquer outro caminho o `finally` o solta.
    let lockHeld = true
    try {
      // Outro processo pode ter terminado entre o `get` e o lock: relê para não reenviar partes nem recontar tentativas.
      const n = await d.notifications.get(id)
      if (!n || n.status !== "pending") return "skipped"

      // Conferido depois do lock e da releitura: o pagamento ou o plano novo podem ter chegado agora há pouco.
      const stale = staleReason(n)
      if (stale !== null) {
        // `markFailure` solta o lock; se não gravou, o `finally` o solta.
        if (await discardStale(n, stale)) lockHeld = false
        return "skipped"
      }

      let step = `notify.${n.channel}`
      let partsSent = n.partsSent
      try {
        const message = await renderMessage(n)

        if (n.channel === "email") {
          await d.email.send({
            to: n.recipient,
            subject: message.subject,
            html: message.html,
            text: message.text,
          })
        } else {
          const parts = toWhatsAppParts(message.subject, message.html)
          const start = n.partsSent
          for (let i = start; i < parts.length; i++) {
            if (i > start) await d.sleep(WHATSAPP_PART_GAP_MS)
            step = "notify.whatsapp"
            await d.whatsapp.sendText(n.recipient, parts[i])
            // Se a gravação falhar depois que a parte saiu, a nova tentativa a reenvia (parte duplicada):
            // aceito, é o custo de não perder nenhuma parte sem transação com o provedor.
            step = "db.mark_part_sent"
            await d.notifications.markPartSent(id, i + 1)
            partsSent = i + 1
          }
        }

        step = "db.mark_sent"
        await d.notifications.markSent(id)
        lockHeld = false
        d.log.info("notification.dispatch.sent", { notificationId: id, channel: n.channel, partsSent })
        return "sent"
      } catch (err) {
        const { result, lockCleared } = await recordFailure(n, partsSent, step, err)
        if (lockCleared) lockHeld = false
        return result
      }
    } finally {
      if (lockHeld) {
        try {
          await d.notifications.unlock(id)
        } catch (err) {
          d.log.error("notification.dispatch.unlock_failed", { notificationId: id, message: safeErrorMessage(err) })
        }
      }
    }
  }
}
