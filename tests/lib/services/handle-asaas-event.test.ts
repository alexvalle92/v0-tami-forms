import { describe, expect, it, vi } from "vitest"
import type { PaymentEventInput, PaymentEventResult, WebhookRepo } from "@/lib/db/repos/types"
import type { Logger } from "@/lib/log"
import { createHandleAsaasEvent } from "@/lib/services/handle-asaas-event"
import { createMemoryRepos } from "../../fakes/memory-repos"

const NOW = new Date("2026-10-11T15:00:00Z")

type LogLine = { level: string; event: string; fields?: Record<string, unknown> }

function fakeLog(): Logger & { lines: LogLine[] } {
  const lines: LogLine[] = []
  const at = (level: string) => (event: string, fields?: Record<string, unknown>) => {
    lines.push({ level, event, fields })
  }
  return { lines, info: at("info"), warn: at("warn"), error: at("error") }
}

/** Envio com a cobrança já criada no Asaas (`PENDING`). */
async function setup() {
  const repos = createMemoryRepos()
  const ref = await repos.submissions.create({
    submissionId: "0b6f2f0e-6f0a-4b8e-9d2a-3c1f5e7a9b10",
    patient: { name: "Ana Souza", cpf: "52998224725", email: "ana@example.com", phone: "11999990000" },
    answers: { peso: 70 },
    amount: "39.90",
    todaySP: "2026-10-11",
  })
  if (ref === "duplicate") throw new Error("duplicate")
  await repos.payments.markSynced(ref.paymentId, {
    asaasId: "pay_1",
    asaasCustomerId: "cus_1",
    status: "PENDING",
    paymentUrl: "https://asaas.example/i/1",
    invoiceNumber: "100",
    billingType: "UNDEFINED",
    dueDate: "2026-10-18",
  })
  const log = fakeLog()
  const handle = createHandleAsaasEvent({ webhooks: repos.webhooks, log, now: () => NOW })
  return { repos, ref, log, handle }
}

const event = (over: Partial<PaymentEventInput> = {}): PaymentEventInput => ({
  eventId: "evt_1",
  event: "PAYMENT_RECEIVED",
  group: "paid",
  asaasPaymentId: "pay_1",
  externalReference: null,
  status: "RECEIVED",
  billingType: "PIX",
  invoiceNumber: "100",
  paymentDate: "2026-10-11",
  ...over,
})

describe("createHandleAsaasEvent", () => {
  it("evento pago: processed com a geração pendente e sem aviso", async () => {
    const { repos, ref, log, handle } = await setup()

    const r = await handle(event({ externalReference: ref.paymentId }))

    expect(r.outcome).toBe("processed")
    expect(r.notice).toBeNull()
    expect(r.pendingGeneration).toEqual({ id: expect.any(String), quizResponseId: ref.quizResponseId })
    expect(repos.state.payments.get(ref.paymentId)?.paidAt).toEqual(NOW)
    expect(log.lines).toEqual([
      {
        level: "info",
        event: "webhook.asaas.received",
        fields: { eventId: "evt_1", event: "PAYMENT_RECEIVED", paymentId: ref.paymentId },
      },
    ])
  })

  it("duplicado: outcome duplicate, sem geração e sem aviso", async () => {
    const { ref, log, handle } = await setup()
    const e = event({ externalReference: ref.paymentId })
    await handle(e)
    log.lines.length = 0

    const r = await handle(e)

    expect(r).toEqual({ outcome: "duplicate", pendingGeneration: null, notice: null })
    expect(log.lines).toEqual([
      {
        level: "info",
        event: "webhook.asaas.duplicate",
        fields: { eventId: "evt_1", event: "PAYMENT_RECEIVED", paymentId: ref.paymentId },
      },
    ])
  })

  it("ignorado: outcome ignored e log com o motivo", async () => {
    const { log, handle } = await setup()

    const r = await handle(event({ externalReference: "00000000-0000-4000-8000-000000000000" }))

    expect(r).toEqual({ outcome: "ignored", pendingGeneration: null, notice: null })
    expect(log.lines).toHaveLength(1)
    expect(log.lines[0]).toMatchObject({
      level: "info",
      event: "webhook.asaas.ignored",
      fields: { eventId: "evt_1", event: "PAYMENT_RECEIVED", reason: "unknown_payment" },
    })
  })

  it("ignorado por asaas_id divergente: log de aviso", async () => {
    const { ref, log, handle } = await setup()

    const r = await handle(event({ externalReference: ref.paymentId, asaasPaymentId: "pay_outro" }))

    expect(r.outcome).toBe("ignored")
    expect(log.lines[0]).toMatchObject({
      level: "warn",
      event: "webhook.asaas.ignored",
      fields: { reason: "asaas_id_mismatch" },
    })
  })

  it("reversão: aviso payment_reversal com evento, cobrança e nome do paciente", async () => {
    const { repos, ref, handle } = await setup()
    await handle(event({ eventId: "evt_pago", externalReference: ref.paymentId }))

    const r = await handle(
      event({
        eventId: "evt_2",
        event: "PAYMENT_REFUNDED",
        group: "reversal",
        status: "REFUNDED",
        externalReference: ref.paymentId,
      }),
    )

    expect(r.outcome).toBe("processed")
    expect(r.pendingGeneration).toBeNull()
    expect(r.notice).toEqual({
      kind: "payment_reversal",
      paymentId: ref.paymentId,
      patientName: "Ana Souza",
      event: "PAYMENT_REFUNDED",
      asaasPaymentId: "pay_1",
    })
    expect(repos.state.payments.get(ref.paymentId)?.status).toBe("REFUNDED")
  })

  it("evento antes de pagar: processed, sem geração e sem aviso", async () => {
    const { ref, handle } = await setup()

    const r = await handle(
      event({ event: "PAYMENT_OVERDUE", group: "pre_payment", status: "OVERDUE", externalReference: ref.paymentId }),
    )

    expect(r).toEqual({ outcome: "processed", pendingGeneration: null, notice: null })
  })

  it("pago sem envio do quiz: aviso payment_without_quiz e nenhuma geração", async () => {
    const processed: PaymentEventResult = {
      outcome: "processed",
      paymentId: "pay-local-1",
      patientName: "Ana Souza",
      pendingGeneration: null,
      missingQuizResponse: true,
      pendingConversion: null,
    }
    const webhooks: WebhookRepo = { applyPaymentEvent: vi.fn(async () => processed) }
    const handle = createHandleAsaasEvent({ webhooks, log: fakeLog(), now: () => NOW })

    const r = await handle(event({ externalReference: "pay-local-1" }))

    expect(webhooks.applyPaymentEvent).toHaveBeenCalledWith(expect.objectContaining({ eventId: "evt_1" }), NOW)
    expect(r.outcome).toBe("processed")
    expect(r.pendingGeneration).toBeNull()
    expect(r.notice).toEqual({
      kind: "payment_without_quiz",
      paymentId: "pay-local-1",
      patientName: "Ana Souza",
      event: "PAYMENT_RECEIVED",
      asaasPaymentId: "pay_1",
    })
  })

  it("erro do repositório é propagado", async () => {
    const webhooks: WebhookRepo = {
      applyPaymentEvent: async () => {
        throw new Error("db down")
      },
    }
    const handle = createHandleAsaasEvent({ webhooks, log: fakeLog(), now: () => NOW })

    await expect(handle(event())).rejects.toThrow("db down")
  })
})
