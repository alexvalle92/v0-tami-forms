import { describe, expect, it } from "vitest"
import { parseAsaasEvent } from "@/lib/asaas/webhook-event"

const REF = "6f1c2a52-8f0e-4a35-9c55-0f3f3a1b2c3d"

const example = {
  id: "evt_05b708f961d739ea7eba7e4db318f621&368604920",
  event: "PAYMENT_RECEIVED",
  payment: {
    id: "pay_080225913252",
    externalReference: REF,
    status: "RECEIVED",
    billingType: "PIX",
    invoiceNumber: "00005101",
    paymentDate: "2026-10-11",
    clientPaymentDate: "2026-10-11",
    confirmedDate: "2026-10-11",
  },
}

const withEvent = (event: string, payment: Record<string, unknown> = { id: "pay_1" }) => ({
  id: "evt_1",
  event,
  payment,
})

describe("parseAsaasEvent", () => {
  it("lê o evento de exemplo", () => {
    expect(parseAsaasEvent(example)).toEqual({
      eventId: "evt_05b708f961d739ea7eba7e4db318f621&368604920",
      event: "PAYMENT_RECEIVED",
      group: "paid",
      asaasPaymentId: "pay_080225913252",
      externalReference: REF,
      status: "RECEIVED",
      billingType: "PIX",
      invoiceNumber: "00005101",
      paymentDate: "2026-10-11",
    })
  })

  it.each(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"])("%s é do grupo paid", (event) => {
    expect(parseAsaasEvent(withEvent(event))?.group).toBe("paid")
  })

  it.each([
    "PAYMENT_REFUNDED",
    "PAYMENT_PARTIALLY_REFUNDED",
    "PAYMENT_REFUND_IN_PROGRESS",
    "PAYMENT_CHARGEBACK_REQUESTED",
    "PAYMENT_CHARGEBACK_DISPUTE",
    "PAYMENT_AWAITING_CHARGEBACK_REVERSAL",
    "PAYMENT_RECEIVED_IN_CASH_UNDONE",
  ])("%s é reversal", (event) => {
    expect(parseAsaasEvent(withEvent(event))?.group).toBe("reversal")
  })

  it.each(["PAYMENT_OVERDUE", "PAYMENT_DELETED", "PAYMENT_RESTORED"])("%s é pre_payment", (event) => {
    expect(parseAsaasEvent(withEvent(event))?.group).toBe("pre_payment")
  })

  it("PAYMENT_CREATED e eventos que não são de cobrança são other", () => {
    expect(parseAsaasEvent(withEvent("PAYMENT_CREATED"))?.group).toBe("other")
    expect(parseAsaasEvent(withEvent("PAYMENT_UPDATED"))?.group).toBe("other")

    // Sem `payment`: campos da cobrança nulos.
    expect(parseAsaasEvent({ id: "evt_2", event: "INVOICE_CREATED" })).toEqual({
      eventId: "evt_2",
      event: "INVOICE_CREATED",
      group: "other",
      asaasPaymentId: null,
      externalReference: null,
      status: null,
      billingType: null,
      invoiceNumber: null,
      paymentDate: null,
    })
  })

  it("evento que não é de cobrança lê `payment` quando ele vem, sem exigir id", () => {
    const parsed = parseAsaasEvent({
      id: "evt_3",
      event: "INVOICE_CREATED",
      payment: { id: 7, status: "PENDING", externalReference: REF },
    })
    expect(parsed).toMatchObject({ group: "other", asaasPaymentId: null, status: "PENDING", externalReference: REF })
  })

  it("PAYMENT_DELETED sempre tem status DELETED", () => {
    expect(parseAsaasEvent(withEvent("PAYMENT_DELETED", { id: "pay_1", status: "PENDING" }))?.status).toBe("DELETED")
    expect(parseAsaasEvent(withEvent("PAYMENT_DELETED", { id: "pay_1" }))?.status).toBe("DELETED")
  })

  it("data: clientPaymentDate, senão paymentDate, senão confirmedDate; formato inválido vira null", () => {
    const date = (p: Record<string, unknown>) => parseAsaasEvent(withEvent("PAYMENT_RECEIVED", { id: "pay_1", ...p }))?.paymentDate

    expect(date({ clientPaymentDate: "2026-10-01", paymentDate: "2026-10-02", confirmedDate: "2026-10-03" })).toBe("2026-10-01")
    expect(date({ paymentDate: "2026-10-02", confirmedDate: "2026-10-03" })).toBe("2026-10-02")
    expect(date({ confirmedDate: "2026-10-03" })).toBe("2026-10-03")
    expect(date({})).toBeNull()

    // Valor inválido não é aproveitado; cai para o próximo candidato válido.
    expect(date({ clientPaymentDate: "11/10/2026", paymentDate: "2026-10-02" })).toBe("2026-10-02")
    expect(date({ clientPaymentDate: "11/10/2026" })).toBeNull()
    expect(date({ paymentDate: "2026-10-11T10:00:00Z" })).toBeNull()
    expect(date({ paymentDate: "2026-02-30" })).toBeNull()
    expect(date({ paymentDate: 20261011 })).toBeNull()
  })

  it("campos de texto ausentes ou não textuais viram null", () => {
    const parsed = parseAsaasEvent(
      withEvent("PAYMENT_RECEIVED", { id: "pay_1", externalReference: 12, billingType: {}, invoiceNumber: 5101, status: null }),
    )
    expect(parsed).toMatchObject({
      asaasPaymentId: "pay_1",
      externalReference: null,
      billingType: null,
      invoiceNumber: null,
      status: null,
    })
  })

  it("ignora campos desconhecidos", () => {
    const parsed = parseAsaasEvent({
      ...example,
      account: { id: "acc_1", ownerId: "x" },
      payment: {
        ...example.payment,
        creditCard: { creditCardNumber: "1234", creditCardBrand: "VISA", creditCardToken: "tok" },
        split: [{ walletId: "w", fixedValue: 1 }],
        value: 189.9,
      },
    })
    expect(parsed).toEqual(parseAsaasEvent(example))
    expect(parsed).not.toBeNull()
    expect(Object.keys(parsed!).sort()).toEqual(
      [
        "asaasPaymentId",
        "billingType",
        "event",
        "eventId",
        "externalReference",
        "group",
        "invoiceNumber",
        "paymentDate",
        "status",
      ].sort(),
    )
  })

  it("respeita os limites das colunas (id 128, evento 64, cobrança 64)", () => {
    expect(parseAsaasEvent({ id: "x".repeat(128), event: "PAYMENT_RECEIVED", payment: { id: "pay_1" } })).not.toBeNull()
    expect(parseAsaasEvent({ id: "evt_1", event: "E".repeat(64) })).not.toBeNull()
    expect(parseAsaasEvent({ id: "evt_1", event: "E".repeat(65) })).toBeNull()
    expect(parseAsaasEvent({ id: "evt_1", event: "PAYMENT_RECEIVED", payment: { id: "p".repeat(65) } })).toBeNull()
  })

  it.each([
    null,
    undefined,
    "texto",
    42,
    true,
    [],
    {},
    { id: "evt_1" },
    { event: "PAYMENT_RECEIVED" },
    { id: "", event: "PAYMENT_RECEIVED", payment: { id: "pay_1" } },
    { id: 1, event: "PAYMENT_RECEIVED", payment: { id: "pay_1" } },
    { id: "evt_1", event: "" },
    { id: "evt_1", event: 5 },
    { id: "x".repeat(129), event: "PAYMENT_RECEIVED", payment: { id: "pay_1" } },
    { id: "evt_1", event: "PAYMENT_RECEIVED" }, // evento de cobrança sem `payment`
    { id: "evt_1", event: "PAYMENT_RECEIVED", payment: null },
    { id: "evt_1", event: "PAYMENT_RECEIVED", payment: "pay_1" },
    { id: "evt_1", event: "PAYMENT_RECEIVED", payment: { status: "RECEIVED" } },
    { id: "evt_1", event: "PAYMENT_RECEIVED", payment: { id: "" } },
    { id: "evt_1", event: "PAYMENT_RECEIVED", payment: { id: 123 } },
  ])("corpo inválido %j → null", (body) => {
    expect(parseAsaasEvent(body)).toBeNull()
  })

  it("nunca lança, mesmo com objeto hostil", () => {
    const hostile = {
      get id(): string {
        throw new Error("boom")
      },
      event: "PAYMENT_RECEIVED",
    }
    expect(() => parseAsaasEvent(hostile)).not.toThrow()
    expect(parseAsaasEvent(hostile)).toBeNull()
  })
})
