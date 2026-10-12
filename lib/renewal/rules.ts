// Regras de vencimento e renovação (spec de vencimento e renovação, §4). Fonte: v0-tami-forms; o PlanA mantém uma cópia idêntica.

export type RenewalStatus = "none" | "awaiting_payment" | "payment_expired" | "paid"

/** Cobrança de renovação do plano ativo, já no formato que a regra precisa. */
export type RenewalCharge = {
  id: string
  status: string
  dueDate: string | null
  paymentUrl: string | null
  paidAt: Date | null
}

export type RenewalState = {
  status: RenewalStatus
  paymentId: string | null
  dueDate: string | null
  paymentUrl: string | null
}

export type ExpiryStage = "d5" | "d2" | "d0"

/** Primeiro aviso: faltando até 5 dias. */
export const WARN_DAYS = 5
/** O formulário de renovação abre faltando até 2 dias. */
export const RENEWAL_OPEN_DAYS = 2

const MS_PER_DAY = 86_400_000

/** `endDate` menos `today`, em dias; as duas datas são YYYY-MM-DD. */
export function daysLeft(endDate: string | null, today: string): number | null {
  if (!endDate) return null
  // Aritmética em UTC, como addDaysISO: não depende do fuso nem do horário de verão.
  const end = Date.parse(`${endDate}T00:00:00Z`)
  const now = Date.parse(`${today}T00:00:00Z`)
  return Math.round((end - now) / MS_PER_DAY)
}

/** Estágio do aviso para os dias restantes; `null` quando ainda não há aviso. */
export function expiryStage(days: number | null): ExpiryStage | "expired" | null {
  if (days === null) return null
  if (days < 0) return "expired"
  if (days === 0) return "d0"
  if (days <= RENEWAL_OPEN_DAYS) return "d2"
  if (days <= WARN_DAYS) return "d5"
  return null
}

/** O formulário de renovação está aberto: faltam 2 dias ou menos, ou o plano já venceu. */
export function isRenewalOpen(days: number | null): boolean {
  return days !== null && days <= RENEWAL_OPEN_DAYS
}

const NONE: RenewalState = { status: "none", paymentId: null, dueDate: null, paymentUrl: null }

/** Estado da renovação a partir da cobrança de renovação do plano ativo; `today` é YYYY-MM-DD. */
export function renewalState(charge: RenewalCharge | null, today: string): RenewalState {
  if (!charge) return NONE
  // As linhas valem na ordem: pago vence qualquer status.
  if (charge.paidAt) {
    return { status: "paid", paymentId: charge.id, dueDate: null, paymentUrl: null }
  }
  if (charge.status === "PENDING_ASAAS") {
    // O link ainda está sendo criado.
    return { status: "awaiting_payment", paymentId: charge.id, dueDate: null, paymentUrl: null }
  }
  if (charge.status === "PENDING") {
    if (charge.dueDate !== null && charge.dueDate < today) {
      return { status: "payment_expired", paymentId: charge.id, dueDate: charge.dueDate, paymentUrl: null }
    }
    return {
      status: "awaiting_payment",
      paymentId: charge.id,
      dueDate: charge.dueDate,
      paymentUrl: charge.paymentUrl,
    }
  }
  if (charge.status === "OVERDUE") {
    return { status: "payment_expired", paymentId: charge.id, dueDate: charge.dueDate, paymentUrl: null }
  }
  return NONE
}
