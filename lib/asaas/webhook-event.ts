import { z } from "zod"
import type { PaymentEventGroup, PaymentEventInput } from "@/lib/db/repos/types"

const PAID = new Set(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"])
const REVERSAL = new Set([
  "PAYMENT_REFUNDED",
  "PAYMENT_PARTIALLY_REFUNDED",
  "PAYMENT_REFUND_IN_PROGRESS",
  "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE",
  "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
  "PAYMENT_RECEIVED_IN_CASH_UNDONE",
])
const PRE_PAYMENT = new Set(["PAYMENT_OVERDUE", "PAYMENT_DELETED", "PAYMENT_RESTORED"])

function classify(event: string): PaymentEventGroup {
  if (PAID.has(event)) return "paid"
  if (REVERSAL.has(event)) return "reversal"
  if (PRE_PAYMENT.has(event)) return "pre_payment"
  return "other"
}

// Texto opcional: ausente, não textual, vazio ou maior que a coluna vira null.
// O limite acompanha o schema do banco; um valor maior derrubaria a gravação
// (500) e o Asaas reenviaria o mesmo evento indefinidamente.
const optionalText = (max: number) => z.string().min(1).max(max).nullish().catch(null)

// Só `YYYY-MM-DD` e só data que existe no calendário (2026-02-30 vira null).
const optionalDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`)
    return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(v)
  })
  .nullish()
  .catch(null)

const envelopeSchema = z
  .object({
    id: z.string().min(1, "id obrigatório").max(128, "id muito longo"),
    event: z.string().min(1, "event obrigatório").max(64, "event muito longo"),
    payment: z.unknown().optional(),
  })
  .passthrough()

const paymentSchema = z
  .object({
    id: optionalText(64),
    externalReference: optionalText(36),
    status: optionalText(32),
    billingType: optionalText(32),
    invoiceNumber: optionalText(32),
    paymentDate: optionalDate,
    clientPaymentDate: optionalDate,
    confirmedDate: optionalDate,
  })
  .passthrough()

/**
 * Lê o corpo do webhook do Asaas e devolve o evento classificado, ou null se o
 * corpo não tem o formato esperado. O corpo vem da internet: nunca lança.
 * Campos desconhecidos são ignorados; nada do corpo bruto é devolvido.
 */
export function parseAsaasEvent(body: unknown): PaymentEventInput | null {
  try {
    const envelope = envelopeSchema.safeParse(body)
    if (!envelope.success) return null
    const { id: eventId, event } = envelope.data

    // `payment` malformado em evento que não é de cobrança é tratado como ausente.
    const payment = paymentSchema.safeParse(envelope.data.payment)
    const p = payment.success ? payment.data : null

    // Evento de cobrança sem o id da cobrança não tem como ser aplicado.
    if (event.startsWith("PAYMENT_") && !p?.id) return null

    return {
      eventId,
      event,
      group: classify(event),
      asaasPaymentId: p?.id ?? null,
      externalReference: p?.externalReference ?? null,
      // Cobrança apagada: o payload do Asaas pode ainda trazer o status anterior.
      status: event === "PAYMENT_DELETED" ? "DELETED" : (p?.status ?? null),
      billingType: p?.billingType ?? null,
      invoiceNumber: p?.invoiceNumber ?? null,
      paymentDate: p?.clientPaymentDate ?? p?.paymentDate ?? p?.confirmedDate ?? null,
    }
  } catch {
    return null
  }
}
