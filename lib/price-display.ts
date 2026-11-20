import { formatBRL } from "@/lib/notify/templates"
import { paymentAmount } from "@/lib/payment-amount"

/** Dias que o plano cobre; base do "equivale a R$ x por dia". */
const PLAN_DAYS = 30

export type PriceOffer = {
  /** "Por": o valor cobrado (`PAYMENT_AMOUNT`), já formatado. */
  price: string
  /** "De": `PAYMENT_DISPLAY_FROM_AMOUNT`, formatado; ausente se não configurado, inválido ou não maior que o preço. */
  fromPrice?: string
  /** `PAYMENT_DISPLAY_DISCOUNT_PERCENT` (inteiro de 1 a 99); ausente se não configurado ou inválido. */
  discountPercent?: number
  /** Preço dividido pelos 30 dias do plano, formatado. */
  perDay: string
}

const toCents = (decimal: string) => {
  const [int, frac = ""] = decimal.split(".")
  return Number(int) * 100 + Number(frac.padEnd(2, "0"))
}

const centsToBRL = (cents: number) => formatBRL(`${Math.floor(cents / 100)}.${String(cents % 100).padStart(2, "0")}`)

/**
 * Valores do card de preço do quiz. "De" e o percentual são só vitrine: não entram na cobrança, que usa
 * `PAYMENT_AMOUNT`. Nada aqui derruba a página; valor ausente ou fora do formato só esconde a linha.
 */
export function priceOffer(env: Record<string, string | undefined>): PriceOffer {
  const amount = paymentAmount(env)
  const amountCents = toCents(amount)

  const from = env.PAYMENT_DISPLAY_FROM_AMOUNT?.trim()
  const fromValid = !!from && /^\d+(\.\d{1,2})?$/.test(from) && toCents(from) > amountCents

  const percentRaw = env.PAYMENT_DISPLAY_DISCOUNT_PERCENT?.trim()
  const percent = percentRaw && /^\d{1,2}$/.test(percentRaw) ? Number(percentRaw) : 0

  return {
    price: formatBRL(amount),
    fromPrice: fromValid ? formatBRL(from) : undefined,
    discountPercent: percent >= 1 && percent <= 99 ? percent : undefined,
    perDay: centsToBRL(Math.round(amountCents / PLAN_DAYS)),
  }
}
