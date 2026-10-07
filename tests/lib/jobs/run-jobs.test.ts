import { describe, expect, it, vi } from "vitest"
import type { Channel, NotificationRepo, PaymentRepo } from "@/lib/db/repos/types"
import { createRunJobs } from "@/lib/jobs/run-jobs"
import type { Logger } from "@/lib/log"
import { createDispatchNotification, type DispatchNotification } from "@/lib/services/dispatch-notification"
import { createSyncPayment, type SyncPayment } from "@/lib/services/sync-payment"
import { createFakeAsaas } from "../../fakes/fake-asaas"
import { createMemoryRepos } from "../../fakes/memory-repos"

const CHANNELS: Channel[] = ["email", "whatsapp"]
const PATIENTS = [
  { name: "Ana Souza", cpf: "52998224725", email: "ana@example.com", phone: "11999990000" },
  { name: "Bia Lima", cpf: "11144477735", email: "bia@example.com", phone: "11888880000" },
]
const LIMITS = { payments: 20, notifications: 50 }

type Overrides = {
  payments?: (r: ReturnType<typeof createMemoryRepos>) => PaymentRepo
  notifications?: (r: ReturnType<typeof createMemoryRepos>) => NotificationRepo
  wrapSync?: (real: SyncPayment) => SyncPayment
  wrapDispatch?: (real: DispatchNotification) => DispatchNotification
  now?: () => Date
}

async function setup(patientCount = 1, o: Overrides = {}) {
  const repos = createMemoryRepos()
  const asaas = createFakeAsaas()
  const log: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const email = { send: vi.fn(async (_m: unknown) => {}) }
  const whatsapp = { sendText: vi.fn(async (_n: string, _t: string) => {}) }
  const now = o.now ?? (() => new Date())
  const paymentIds: string[] = []
  for (let i = 0; i < patientCount; i++) {
    const created = await repos.submissions.create({
      submissionId: `sub-${i}`,
      patient: PATIENTS[i],
      answers: {},
      amount: "39.90",
      todaySP: "2026-10-07",
    })
    if (created === "duplicate") throw new Error("unexpected duplicate")
    paymentIds.push(created.paymentId)
  }
  const alertAdmin = vi.fn(async (_a: unknown) => {})
  const syncPayment = createSyncPayment({
    payments: repos.payments,
    notifications: repos.notifications,
    asaas,
    alertAdmin,
    log,
    now,
    config: { dueDays: 2, successUrl: "https://app.example.com/obrigado", channels: CHANNELS },
  })
  const dispatchNotification = createDispatchNotification({
    notifications: repos.notifications,
    email,
    whatsapp,
    alertAdmin,
    log,
    now,
    sleep: async () => {},
  })
  const runJobs = createRunJobs({
    payments: o.payments ? o.payments(repos) : repos.payments,
    notifications: o.notifications ? o.notifications(repos) : repos.notifications,
    syncPayment: o.wrapSync ? o.wrapSync(syncPayment) : syncPayment,
    dispatchNotification: o.wrapDispatch ? o.wrapDispatch(dispatchNotification) : dispatchNotification,
    log,
    now,
    paymentDeadlineMs: 30_000,
    limits: LIMITS,
  })
  return { repos, asaas, log, email, whatsapp, paymentIds, runJobs }
}

function loggedText(log: Logger): string {
  return JSON.stringify([
    ...(log.info as ReturnType<typeof vi.fn>).mock.calls,
    ...(log.warn as ReturnType<typeof vi.fn>).mock.calls,
    ...(log.error as ReturnType<typeof vi.fn>).mock.calls,
  ])
}

describe("createRunJobs", () => {
  it("sincroniza a cobrança vencida e envia as 2 notificações na mesma rodada", async () => {
    const s = await setup()

    const summary = await s.runJobs()

    expect(summary).toEqual({ payments: 1, notifications: 2, errors: 0 })
    const payment = s.repos.state.payments.get(s.paymentIds[0])!
    expect(payment.paymentUrl).toBeTruthy()
    expect(payment.nextSyncAt).toBeNull()
    const notifications = [...s.repos.state.notifications.values()]
    expect(notifications.map((n) => n.status)).toEqual(["sent", "sent"])
    expect(s.email.send).toHaveBeenCalledTimes(1)
    expect(s.whatsapp.sendText).toHaveBeenCalled()
  })

  it("uma segunda rodada não tem mais nada a fazer", async () => {
    const s = await setup()
    await s.runJobs()
    expect(await s.runJobs()).toEqual({ payments: 0, notifications: 0, errors: 0 })
  })

  it("syncPayment que lança na 1ª de 2 cobranças: errors 1 e a 2ª é processada", async () => {
    const s = await setup(2, {
      wrapSync: (real) => async (id, opts) => {
        if (id === first) throw new Error("boom")
        return real(id, opts)
      },
    })
    const first = (await s.repos.payments.listDue(new Date(Date.now() + 1000), 10))[0]
    const second = s.paymentIds.find((id) => id !== first)!

    const summary = await s.runJobs()

    expect(summary).toEqual({ payments: 2, notifications: 2, errors: 1 })
    expect(s.repos.state.payments.get(second)!.paymentUrl).toBeTruthy()
    expect(s.repos.state.payments.get(first)!.paymentUrl).toBeNull()
    expect(s.log.error).toHaveBeenCalledWith("job.payment.error", { paymentId: first, message: "boom" })
  })

  it("dispatchNotification que lança numa notificação: errors 1 e a outra é processada", async () => {
    let calls = 0
    const s = await setup(1, {
      wrapDispatch: (real) => async (id) => {
        if (calls++ === 0) throw new Error("boom")
        return real(id)
      },
    })

    const summary = await s.runJobs()

    expect(summary).toEqual({ payments: 1, notifications: 2, errors: 1 })
    expect([...s.repos.state.notifications.values()].map((n) => n.status).sort()).toEqual(["pending", "sent"])
  })

  it("falha ao listar as cobranças conta 1 erro e as notificações ainda são processadas", async () => {
    const s = await setup(1, {
      payments: (r) => ({
        ...r.payments,
        listDue: async () => {
          throw new Error("db down")
        },
      }),
    })
    // Cobrança já sincronizada por outro caminho, com notificações pendentes.
    await s.repos.payments.markSynced(s.paymentIds[0], {
      asaasId: "pay_1",
      asaasCustomerId: "cus_1",
      status: "PENDING",
      paymentUrl: "https://asaas.test/i/abc",
      invoiceNumber: null,
      billingType: "UNDEFINED",
      dueDate: "2026-10-09",
    })
    await s.repos.notifications.enqueuePaymentLink({ paymentId: s.paymentIds[0] }, CHANNELS)

    const summary = await s.runJobs()

    expect(summary).toEqual({ payments: 0, notifications: 2, errors: 1 })
    expect(s.log.error).toHaveBeenCalledWith("job.payments.list_failed", { message: "db down" })
  })

  it("usa os limites e o deadline configurados (agora + 30 s) e processa em sequência", async () => {
    const now = new Date("2026-10-07T15:00:00Z")
    const paymentListDue = vi.fn(async (_n: Date, _l: number) => ["p1", "p2"])
    const notificationListDue = vi.fn(async (_n: Date, _l: number) => ["n1"])
    const order: string[] = []
    const s = await setup(0, {
      now: () => now,
      payments: (r) => ({ ...r.payments, listDue: paymentListDue }),
      notifications: (r) => ({ ...r.notifications, listDue: notificationListDue }),
      wrapSync: () => async (id, opts) => {
        order.push(`sync:${id}:${opts.deadline - now.getTime()}`)
        return { status: "busy" }
      },
      wrapDispatch: () => async (id) => {
        order.push(`dispatch:${id}`)
        return "busy"
      },
    })

    const summary = await s.runJobs()

    expect(paymentListDue).toHaveBeenCalledWith(now, 20)
    expect(notificationListDue).toHaveBeenCalledWith(now, 50)
    expect(order).toEqual(["sync:p1:30000", "sync:p2:30000", "dispatch:n1"])
    expect(summary).toEqual({ payments: 2, notifications: 1, errors: 0 })
  })

  it("loga uma linha job.round.done (info) por rodada, com o resumo e a duração", async () => {
    let t = Date.now()
    const s = await setup(1, { now: () => new Date((t += 10)) })

    const summary = await s.runJobs()

    const infoCalls = (s.log.info as ReturnType<typeof vi.fn>).mock.calls.filter((c) =>
      (c[0] as string).startsWith("job."),
    )
    expect(infoCalls).toHaveLength(1)
    expect(infoCalls[0][0]).toBe("job.round.done")
    expect(infoCalls[0][1]).toEqual({ ...summary, durationMs: expect.any(Number) })
    expect(infoCalls[0][1].durationMs).toBeGreaterThan(0)
  })

  it("erros dos itens (com e-mail/telefone/CPF na mensagem) não vazam para nenhum log", async () => {
    const leak = "falha para ana@example.com tel 11999990000 cpf 52998224725"
    const s = await setup(2, {
      wrapSync: () => async () => {
        throw new Error(leak)
      },
      wrapDispatch: () => async () => {
        throw new Error(leak)
      },
    })
    // A 2ª cobrança já está sincronizada, com 2 notificações pendentes para o dispatch lançar.
    await s.repos.payments.markSynced(s.paymentIds[1], {
      asaasId: "pay_1",
      asaasCustomerId: "cus_1",
      status: "PENDING",
      paymentUrl: "https://asaas.test/i/abc",
      invoiceNumber: null,
      billingType: "UNDEFINED",
      dueDate: "2026-10-09",
    })
    await s.repos.notifications.enqueuePaymentLink({ paymentId: s.paymentIds[1] }, CHANNELS)

    const summary = await s.runJobs()

    expect(summary).toEqual({ payments: 1, notifications: 2, errors: 3 })
    const text = loggedText(s.log)
    expect(text).toContain("job.payment.error")
    expect(text).toContain("job.notification.error")
    expect(text).not.toContain("ana@example.com")
    expect(text).not.toContain("11999990000")
    expect(text).not.toContain("52998224725")
  })

  it("erro de repositório ao listar (mensagem com e-mail/telefone) não vaza para nenhum log", async () => {
    const leak = "Failed query: select ... params: ana@example.com,11999990000"
    const s = await setup(0, {
      payments: (r) => ({
        ...r.payments,
        listDue: async () => {
          throw new Error(leak)
        },
      }),
      notifications: (r) => ({
        ...r.notifications,
        listDue: async () => {
          throw Object.assign(new Error(leak), { cause: undefined })
        },
      }),
    })

    const summary = await s.runJobs()

    expect(summary).toEqual({ payments: 0, notifications: 0, errors: 2 })
    const text = loggedText(s.log)
    expect(text).not.toContain("ana@example.com")
    expect(text).not.toContain("11999990000")
    expect(text).toContain("job.payments.list_failed")
    expect(text).toContain("job.notifications.list_failed")
  })
})
