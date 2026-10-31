import type { PaymentRepo } from "@/lib/db/repos/types"
import type { Logger } from "@/lib/log"
import type { ApplyPaymentDiscount } from "@/lib/services/apply-payment-discount"
import { safeErrorMessage } from "@/lib/services/last-error"
import { addDaysISO, hourInSaoPaulo, saoPauloDayStartUtc, todayInSaoPaulo } from "@/lib/time"

/** Janela do desconto, em horas de São Paulo: de `from` (inclusive) até `to` (exclusivo). */
export const DISCOUNT_HOURS = { from: 9, to: 20 }

/**
 * Aplica o desconto nas cobranças criadas ontem (dia de São Paulo) que seguem em aberto, só dentro da
 * janela (ninguém recebe oferta de madrugada). Fora do horário devolve 0 sem tocar no banco; depois das
 * 20h as cobranças de ontem perdem a oferta, porque no dia seguinte já não são "de ontem".
 * A exceção de um item é logada (mensagem segura) e não interrompe os demais. Devolve as cobranças tentadas.
 */
export function createApplyPaymentDiscounts(d: {
  payments: Pick<PaymentRepo, "listDiscountEligible">
  applyDiscount: ApplyPaymentDiscount
  discountAmount: string
  limit: number
  deadlineMs: number
  now: () => Date
  log: Logger
}): () => Promise<number> {
  return async function applyPaymentDiscounts() {
    const now = d.now()
    const hour = hourInSaoPaulo(now)
    if (hour < DISCOUNT_HOURS.from || hour >= DISCOUNT_HOURS.to) return 0

    const today = todayInSaoPaulo(now)
    const ids = await d.payments.listDiscountEligible({
      fromUtc: saoPauloDayStartUtc(addDaysISO(today, -1)),
      toUtc: saoPauloDayStartUtc(today),
      discountAmount: d.discountAmount,
      limit: d.limit,
    })

    const counts = { applied: 0, skipped: 0, retry: 0, busy: 0, errors: 0 }
    for (const paymentId of ids) {
      try {
        counts[await d.applyDiscount(paymentId, { deadline: d.now().getTime() + d.deadlineMs })]++
      } catch (err) {
        counts.errors++
        d.log.error("job.discount.error", { paymentId, message: safeErrorMessage(err) })
      }
    }

    if (ids.length > 0) d.log.info("job.discounts.done", counts)
    return ids.length
  }
}
