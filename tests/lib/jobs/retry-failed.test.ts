import { describe, expect, it } from "vitest"
import type { LastError } from "@/lib/db/repos/types"
import { createRetryFailed } from "@/lib/jobs/retry-failed"
import { createMemoryRepos } from "../../fakes/memory-repos"

const err: LastError = { step: "x", message: "x", attempt: 1, at: "2026-10-07T15:00:00.000Z" }

async function setup() {
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
  const retry = createRetryFailed({
    payments: repos.payments,
    notifications: repos.notifications,
    planGenerations: repos.planGenerations,
  })
  const failPayment = () =>
    repos.payments.markSyncFailure(created.paymentId, { attempts: 5, nextSyncAt: null, failed: true, error: err })
  const failNotification = () =>
    repos.notifications.markFailure(notificationId, { attempts: 5, nextAttemptAt: null, failed: true, error: err })
  const failGeneration = () =>
    repos.planGenerations.markFailure(generationId, { attempts: 5, nextAttemptAt: null, failed: true, error: err })
  return {
    repos,
    retry,
    paymentId: created.paymentId,
    notificationId,
    generationId,
    failPayment,
    failNotification,
    failGeneration,
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

  it("{ allFailed: true } soma cobranças, notificações e gerações", async () => {
    const s = await setup()
    await s.failPayment()
    await s.failNotification()
    await s.failGeneration()

    expect(await s.retry({ allFailed: true })).toEqual({ reopened: 3 })

    expect(s.repos.state.payments.get(s.paymentId)!.status).toBe("PENDING_ASAAS")
    expect(s.repos.state.notifications.get(s.notificationId)!.status).toBe("pending")
    expect(s.repos.state.planGenerations.get(s.generationId)!.status).toBe("pending")
    expect(await s.retry({ allFailed: true })).toEqual({ reopened: 0 })
  })
})
