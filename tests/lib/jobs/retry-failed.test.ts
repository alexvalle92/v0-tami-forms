import { describe, expect, it } from "vitest"
import type { LastError } from "@/lib/db/repos/types"
import { createRetryFailed } from "@/lib/jobs/retry-failed"
import { createMemoryRepos } from "../../fakes/memory-repos"

const err: LastError = { step: "x", message: "x", attempt: 1, at: "2026-10-07T15:00:00.000Z" }

/** `withConversion` cria uma terceira paciente paga com atribuição da Meta: o Purchase entra na fila. */
async function setup(withConversion = false) {
  const repos = createMemoryRepos()
  const created = await repos.submissions.create({
    submissionId: "sub-1",
    patient: { name: "Ana Souza", cpf: "52998224725", email: "ana@example.com", phone: "11999990000" },
    answers: {},
    amount: "39.90",
    todaySP: "2026-10-07",
  })
  if (created === "duplicate") throw new Error("unexpected duplicate")
  await repos.notifications.enqueuePaymentLink({ paymentId: created.paymentId }, ["email"])
  const notificationId = [...repos.state.notifications.keys()][0]
  // Outra paciente já pagou: o webhook cria a geração do plano (`pending`).
  const paid = await repos.submissions.create({
    submissionId: "sub-2",
    patient: { name: "Bia Lima", cpf: "11144477735", email: "bia@example.com", phone: "11888880000" },
    answers: {},
    amount: "39.90",
    todaySP: "2026-10-07",
  })
  if (paid === "duplicate") throw new Error("unexpected duplicate")
  const event = await repos.webhooks.applyPaymentEvent(
    {
      eventId: "evt-1",
      event: "PAYMENT_RECEIVED",
      group: "paid",
      asaasPaymentId: "pay_1",
      externalReference: paid.paymentId,
      status: "RECEIVED",
      billingType: "PIX",
      invoiceNumber: null,
      paymentDate: "2026-10-07",
    },
    new Date(),
  )
  if (event.outcome !== "processed" || !event.pendingGeneration) throw new Error("geração não criada")
  const generationId = event.pendingGeneration.id
  async function queueConversion(): Promise<string> {
    const attributed = await repos.submissions.create({
      submissionId: "sub-3",
      patient: { name: "Carla Dias", cpf: "39053344705", email: "carla@example.com", phone: "11777770000" },
      answers: {},
      amount: "39.90",
      todaySP: "2026-10-07",
    })
    if (attributed === "duplicate") throw new Error("unexpected duplicate")
    await repos.metaAttributions.save(
      attributed.quizResponseId,
      { externalId: null, fbp: null, fbc: null, clientIp: "1.2.3.4", userAgent: "UA", eventSourceUrl: null },
      new Date(),
    )
    const paid = await repos.webhooks.applyPaymentEvent(
      {
        eventId: "evt-3",
        event: "PAYMENT_RECEIVED",
        group: "paid",
        asaasPaymentId: "pay_3",
        externalReference: attributed.paymentId,
        status: "RECEIVED",
        billingType: "PIX",
        invoiceNumber: null,
        paymentDate: "2026-10-07",
      },
      new Date(),
    )
    if (paid.outcome !== "processed" || !paid.pendingConversion) throw new Error("conversão não criada")
    return paid.pendingConversion.id
  }
  let conversionId = ""
  if (withConversion) conversionId = await queueConversion()
  const retry = createRetryFailed({
    payments: repos.payments,
    notifications: repos.notifications,
    planGenerations: repos.planGenerations,
    metaConversions: repos.metaConversions,
  })
  const failPayment = () =>
    repos.payments.markSyncFailure(created.paymentId, { attempts: 5, nextSyncAt: null, failed: true, error: err })
  const failNotification = () =>
    repos.notifications.markFailure(notificationId, { attempts: 5, nextAttemptAt: null, failed: true, error: err })
  const failGeneration = () =>
    repos.planGenerations.markFailure(generationId, { attempts: 5, nextAttemptAt: null, failed: true, error: err })
  const failConversion = () => repos.metaConversions.markFailed(conversionId, err)
  return {
    repos,
    retry,
    paymentId: created.paymentId,
    notificationId,
    generationId,
    failPayment,
    failNotification,
    failGeneration,
    conversionId,
    failConversion,
  }
}

describe("createRetryFailed", () => {
  it("{ paymentId } de uma cobrança ASAAS_FAILED a reabre e ela entra em listDue", async () => {
    const s = await setup()
    await s.failPayment()
    expect(await s.repos.payments.listDue(new Date(Date.now() + 1000), 10)).toEqual([])

    expect(await s.retry({ paymentId: s.paymentId })).toEqual({ reopened: 1 })

    expect(s.repos.state.payments.get(s.paymentId)!.status).toBe("PENDING_ASAAS")
    expect(await s.repos.payments.listDue(new Date(Date.now() + 1000), 10)).toEqual([s.paymentId])
  })

  it("{ paymentId } de uma cobrança que não falhou (ou inexistente) reabre 0", async () => {
    const s = await setup()
    expect(await s.retry({ paymentId: s.paymentId })).toEqual({ reopened: 0 })
    expect(await s.retry({ paymentId: "nao-existe" })).toEqual({ reopened: 0 })
  })

  it("{ notificationId } reabre só a notificação falhada", async () => {
    const s = await setup()
    expect(await s.retry({ notificationId: s.notificationId })).toEqual({ reopened: 0 })
    await s.failNotification()

    expect(await s.retry({ notificationId: s.notificationId })).toEqual({ reopened: 1 })

    expect(s.repos.state.notifications.get(s.notificationId)!.status).toBe("pending")
  })

  it("{ planGenerationId } reabre uma geração failed e ela volta a listDue", async () => {
    const s = await setup()
    await s.failGeneration()
    expect(s.repos.state.planGenerations.get(s.generationId)!.status).toBe("failed")
    expect(await s.repos.planGenerations.listDue(new Date(Date.now() + 1000), 10)).toEqual([])

    expect(await s.retry({ planGenerationId: s.generationId })).toEqual({ reopened: 1 })

    const row = s.repos.state.planGenerations.get(s.generationId)!
    expect(row.status).toBe("pending")
    expect(row.attempts).toBe(0)
    expect(await s.repos.planGenerations.listDue(new Date(Date.now() + 1000), 10)).toEqual([s.generationId])
  })

  it("{ planGenerationId } de geração que não está failed → reopened 0", async () => {
    const s = await setup()
    // pending
    expect(await s.retry({ planGenerationId: s.generationId })).toEqual({ reopened: 0 })
    // inexistente
    expect(await s.retry({ planGenerationId: "nao-existe" })).toEqual({ reopened: 0 })
    expect(s.repos.state.planGenerations.get(s.generationId)!.status).toBe("pending")
  })

  it("{ metaConversionId } reabre só a conversão da Meta que falhou", async () => {
    const s = await setup(true)
    expect(await s.retry({ metaConversionId: s.conversionId })).toEqual({ reopened: 0 })
    await s.failConversion()
    expect(s.repos.state.metaConversions.get(s.conversionId)!.status).toBe("failed")

    expect(await s.retry({ metaConversionId: s.conversionId })).toEqual({ reopened: 1 })

    const row = s.repos.state.metaConversions.get(s.conversionId)!
    expect(row.status).toBe("pending")
    expect(row.attempts).toBe(0)
    expect(await s.retry({ metaConversionId: "nao-existe" })).toEqual({ reopened: 0 })
  })

  it("{ allFailed: true } soma cobranças, notificações, gerações e conversões da Meta", async () => {
    const s = await setup(true)
    await s.failPayment()
    await s.failNotification()
    await s.failGeneration()
    await s.failConversion()

    expect(await s.retry({ allFailed: true })).toEqual({ reopened: 4 })
    expect(s.repos.state.metaConversions.get(s.conversionId)!.status).toBe("pending")

    expect(s.repos.state.payments.get(s.paymentId)!.status).toBe("PENDING_ASAAS")
    expect(s.repos.state.notifications.get(s.notificationId)!.status).toBe("pending")
    expect(s.repos.state.planGenerations.get(s.generationId)!.status).toBe("pending")
    expect(await s.retry({ allFailed: true })).toEqual({ reopened: 0 })
  })
})
