import { describe, expect, it, vi } from "vitest"
import type { Channel, LastError, NotificationRepo, PaymentRepo } from "@/lib/db/repos/types"
import { HttpError } from "@/lib/http/retry"
import type { Logger } from "@/lib/log"
import { createSyncPayment } from "@/lib/services/sync-payment"
import { createFakeAsaas } from "../../fakes/fake-asaas"
import { createMemoryRepos } from "../../fakes/memory-repos"

const NOW = new Date("2026-10-07T15:00:00Z")
const CPF = "52998224725"
const SUCCESS_URL = "https://app.example.com/obrigado"
const OPTS = { deadline: NOW.getTime() + 60_000 }
const CHANNELS: Channel[] = ["email", "whatsapp"]

const seedError: LastError = { step: "seed", message: "seed", attempt: 1, at: NOW.toISOString() }

type Setup = Awaited<ReturnType<typeof setup>>

async function setup(
  wrap: (repos: ReturnType<typeof createMemoryRepos>) => {
    payments?: PaymentRepo
    notifications?: NotificationRepo
  } = () => ({}),
) {
  const repos = createMemoryRepos()
  const asaas = createFakeAsaas()
  const alertAdmin = vi.fn(async (_a: unknown) => {})
  const log: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const created = await repos.submissions.create({
    submissionId: "sub-1",
    patient: { name: "Ana Souza", cpf: CPF, email: "ana@example.com", phone: "11999990000" },
    answers: {},
    amount: "39.90",
    todaySP: "2026-10-07",
  })
  if (created === "duplicate") throw new Error("unexpected duplicate")
  const override = wrap(repos)
  const sync = createSyncPayment({
    payments: override.payments ?? repos.payments,
    notifications: override.notifications ?? repos.notifications,
    asaas,
    alertAdmin,
    log,
    now: () => NOW,
    config: { dueDays: 2, successUrl: SUCCESS_URL, channels: CHANNELS },
  })
  return { repos, asaas, alertAdmin, log, sync, paymentId: created.paymentId }
}

const row = (s: Setup) => s.repos.state.payments.get(s.paymentId)!

async function expectUnlocked(s: Setup) {
  expect(row(s).lockedUntil).toBeNull()
  expect(await s.repos.payments.tryLock(s.paymentId, 1000)).toBe(true)
  await s.repos.payments.unlock(s.paymentId)
}

function loggedText(log: Logger): string {
  return JSON.stringify([
    ...(log.info as ReturnType<typeof vi.fn>).mock.calls,
    ...(log.warn as ReturnType<typeof vi.fn>).mock.calls,
    ...(log.error as ReturnType<typeof vi.fn>).mock.calls,
  ])
}

describe("createSyncPayment", () => {
  it("caminho feliz: cria cliente e cobrança, grava o resultado e enfileira as notificações", async () => {
    const s = await setup()

    const result = await s.sync(s.paymentId, OPTS)

    const payment = [...s.asaas.payments.values()][0]
    expect(result).toEqual({ status: "synced", paymentUrl: payment.invoiceUrl })
    expect(s.asaas.createdPayments).toEqual([
      {
        customer: s.asaas.customers.get(CPF)!.id,
        billingType: "UNDEFINED",
        value: 39.9,
        dueDate: "2026-10-09",
        description: "Plano Alimentar Personalizado - Ana Souza - 30 dias",
        externalReference: s.paymentId,
        callback: { successUrl: SUCCESS_URL },
      },
    ])
    expect((await s.repos.payments.get(s.paymentId))!.patient.asaasCustomerId).toBe(s.asaas.customers.get(CPF)!.id)
    expect(row(s)).toMatchObject({ paymentUrl: payment.invoiceUrl, asaasId: payment.id, status: "PENDING" })
    expect([...s.repos.state.notifications.values()].map((n) => [n.channel, n.status]).sort()).toEqual([
      ["email", "pending"],
      ["whatsapp", "pending"],
    ])
    expect(s.alertAdmin).not.toHaveBeenCalled()
    await expectUnlocked(s)
  })

  it("passa o deadline para o Asaas", async () => {
    const s = await setup()
    const spy = vi.spyOn(s.asaas, "createPayment")
    await s.sync(s.paymentId, OPTS)
    expect(spy.mock.calls[0][1]).toEqual(OPTS)
  })

  it("cliente já existe no Asaas pelo CPF: não cria o cliente", async () => {
    const s = await setup()
    s.asaas.customers.set(CPF, { id: "cus_existing" })

    const result = await s.sync(s.paymentId, OPTS)

    expect(result.status).toBe("synced")
    expect(s.asaas.calls).not.toContain("createCustomer")
    expect(s.asaas.createdPayments[0].customer).toBe("cus_existing")
    expect((await s.repos.payments.get(s.paymentId))!.patient.asaasCustomerId).toBe("cus_existing")
  })

  it("paciente já tem asaasCustomerId: não busca nem cria cliente", async () => {
    const s = await setup()
    const view = (await s.repos.payments.get(s.paymentId))!
    await s.repos.payments.setPatientAsaasCustomer(view.patientId, "cus_known")

    const result = await s.sync(s.paymentId, OPTS)

    expect(result.status).toBe("synced")
    expect(s.asaas.calls).not.toContain("findCustomerByCpf")
    expect(s.asaas.calls).not.toContain("createCustomer")
    expect(s.asaas.createdPayments[0].customer).toBe("cus_known")
  })

  it("timeout depois de criar: a cobrança já existe no Asaas, então não chama createPayment", async () => {
    const s = await setup()
    s.asaas.customers.set(CPF, { id: "cus_existing" })
    s.asaas.payments.set(s.paymentId, {
      id: "pay_existing",
      status: "PENDING",
      invoiceUrl: "https://asaas.test/i/existing",
      invoiceNumber: "INV-1",
      billingType: "UNDEFINED",
      dueDate: "2026-10-09",
    })

    const result = await s.sync(s.paymentId, OPTS)

    expect(result).toEqual({ status: "synced", paymentUrl: "https://asaas.test/i/existing" })
    expect(s.asaas.calls).not.toContain("createPayment")
    expect(row(s)).toMatchObject({
      asaasId: "pay_existing",
      paymentUrl: "https://asaas.test/i/existing",
      dueDate: "2026-10-09",
    })
  })

  it("503 transitório em createPayment: agenda nova tentativa com backoff e libera o lock", async () => {
    const s = await setup()
    s.asaas.failNext(
      "createPayment",
      new HttpError("asaas 503", { transient: true, status: 503, body: "SEGREDO-DO-CORPO" }),
    )

    const result = await s.sync(s.paymentId, OPTS)

    expect(result).toEqual({ status: "retry_scheduled" })
    expect(row(s).syncAttempts).toBe(1)
    expect(row(s).status).toBe("PENDING_ASAAS")
    expect(row(s).nextSyncAt).toEqual(new Date(NOW.getTime() + 2 * 60_000))
    expect(await s.repos.payments.listDue(new Date(NOW.getTime() + 60_000), 10)).not.toContain(s.paymentId)
    expect(await s.repos.payments.listDue(new Date(NOW.getTime() + 2 * 60_000), 10)).toContain(s.paymentId)
    expect(row(s).lastError).toMatchObject({
      step: "asaas.create_payment",
      httpStatus: 503,
      responseBody: "SEGREDO-DO-CORPO",
      attempt: 1,
      at: NOW.toISOString(),
    })
    expect(s.alertAdmin).not.toHaveBeenCalled()
    expect(loggedText(s.log)).not.toContain("SEGREDO-DO-CORPO")
    await expectUnlocked(s)
  })

  it("400 permanente: ASAAS_FAILED e alerta ao admin", async () => {
    const s = await setup()
    s.asaas.failNext("createPayment", new HttpError("asaas 400", { transient: false, status: 400, body: "SEGREDO" }))

    const result = await s.sync(s.paymentId, OPTS)

    expect(result).toEqual({ status: "failed" })
    expect(row(s).status).toBe("ASAAS_FAILED")
    expect(row(s).nextSyncAt).toBeNull()
    expect(s.alertAdmin).toHaveBeenCalledTimes(1)
    expect(s.alertAdmin).toHaveBeenCalledWith({
      kind: "payment",
      id: s.paymentId,
      patientName: "Ana Souza",
      error: expect.objectContaining({ step: "asaas.create_payment", httpStatus: 400 }),
    })
    expect(loggedText(s.log)).not.toContain("SEGREDO")
    await expectUnlocked(s)
  })

  it("8ª falha transitória: vira definitiva e alerta", async () => {
    const s = await setup()
    await s.repos.payments.markSyncFailure(s.paymentId, {
      attempts: 7,
      nextSyncAt: NOW,
      failed: false,
      error: seedError,
    })
    s.asaas.failNext("createPayment", new HttpError("asaas 503", { transient: true, status: 503 }))

    const result = await s.sync(s.paymentId, OPTS)

    expect(result).toEqual({ status: "failed" })
    expect(row(s).status).toBe("ASAAS_FAILED")
    expect(row(s).syncAttempts).toBe(8)
    expect(s.alertAdmin).toHaveBeenCalledTimes(1)
    await expectUnlocked(s)
  })

  it("7ª falha transitória ainda reagenda, com backoff no teto de 60 min", async () => {
    const s = await setup()
    await s.repos.payments.markSyncFailure(s.paymentId, {
      attempts: 6,
      nextSyncAt: NOW,
      failed: false,
      error: seedError,
    })
    s.asaas.failNext("createPayment", new HttpError("asaas 503", { transient: true, status: 503 }))

    expect(await s.sync(s.paymentId, OPTS)).toEqual({ status: "retry_scheduled" })
    expect(row(s).nextSyncAt).toEqual(new Date(NOW.getTime() + 60 * 60_000))
  })

  it.each([
    ["findCustomerByCpf", "asaas.find_customer"],
    ["createCustomer", "asaas.create_customer"],
    ["findPaymentByExternalReference", "asaas.find_payment"],
    ["createPayment", "asaas.create_payment"],
  ])("falha em %s registra o step %s", async (method, step) => {
    const s = await setup()
    s.asaas.failNext(method, new HttpError("boom", { transient: true, status: 502 }))

    expect(await s.sync(s.paymentId, OPTS)).toEqual({ status: "retry_scheduled" })
    expect(row(s).lastError?.step).toBe(step)
    await expectUnlocked(s)
  })

  it("erro que não é HttpError é tratado como transitório, com a mensagem", async () => {
    const s = await setup()
    s.asaas.failNext("createCustomer", new Error("socket hang up"))

    expect(await s.sync(s.paymentId, OPTS)).toEqual({ status: "retry_scheduled" })
    expect(row(s).lastError).toMatchObject({ step: "asaas.create_customer", message: "socket hang up" })
    expect(row(s).lastError?.httpStatus).toBeUndefined()
  })

  it("já reservada por outro processo: busy, sem chamar o Asaas e sem soltar o lock alheio", async () => {
    const s = await setup()
    expect(await s.repos.payments.tryLock(s.paymentId, 60_000)).toBe(true)

    expect(await s.sync(s.paymentId, OPTS)).toEqual({ status: "busy" })
    expect(s.asaas.calls).toEqual([])
    expect(row(s).lockedUntil).not.toBeNull()
  })

  it("cobrança já sincronizada: devolve a mesma URL sem chamar o Asaas", async () => {
    const s = await setup()
    const first = await s.sync(s.paymentId, OPTS)
    s.asaas.calls.length = 0

    const second = await s.sync(s.paymentId, OPTS)

    expect(second).toEqual(first)
    expect(s.asaas.calls).toEqual([])
    await expectUnlocked(s)
  })

  it("ASAAS_FAILED: failed, sem chamar o Asaas", async () => {
    const s = await setup()
    await s.repos.payments.markSyncFailure(s.paymentId, {
      attempts: 8,
      nextSyncAt: null,
      failed: true,
      error: seedError,
    })

    expect(await s.sync(s.paymentId, OPTS)).toEqual({ status: "failed" })
    expect(s.asaas.calls).toEqual([])
    expect(s.alertAdmin).not.toHaveBeenCalled()
  })

  it("não encontrada: not_found", async () => {
    const s = await setup()
    expect(await s.sync("nao-existe", OPTS)).toEqual({ status: "not_found" })
    expect(s.asaas.calls).toEqual([])
  })

  it("R16: enqueue lança antes do markSynced; segue PENDING_ASAAS e a próxima chamada sincroniza", async () => {
    let failEnqueue = true
    const s = await setup((repos) => ({
      notifications: {
        ...repos.notifications,
        enqueuePaymentLink: async (filter, channels) => {
          if (failEnqueue) throw new Error("db down")
          return repos.notifications.enqueuePaymentLink(filter, channels)
        },
      },
    }))

    expect(await s.sync(s.paymentId, OPTS)).toEqual({ status: "retry_scheduled" })
    expect(row(s).status).toBe("PENDING_ASAAS")
    expect(row(s).paymentUrl).toBeNull()
    expect(row(s).lastError).toMatchObject({ step: "db.enqueue_notifications", message: "db down" })
    expect(s.repos.state.notifications.size).toBe(0)
    await expectUnlocked(s)

    failEnqueue = false
    const result = await s.sync(s.paymentId, OPTS)

    expect(result.status).toBe("synced")
    expect(row(s).paymentUrl).not.toBeNull()
    expect(s.repos.state.notifications.size).toBe(2)
    expect(s.asaas.createdPayments).toHaveLength(1) // a segunda passada reaproveita a cobrança do Asaas
    await expectUnlocked(s)
  })

  it("markSynced lança: registra db.mark_synced como falha desta tentativa", async () => {
    const s = await setup((repos) => ({
      payments: {
        ...repos.payments,
        markSynced: async () => {
          throw new Error("db down")
        },
      },
    }))

    expect(await s.sync(s.paymentId, OPTS)).toEqual({ status: "retry_scheduled" })
    expect(row(s).lastError?.step).toBe("db.mark_synced")
    expect(row(s).paymentUrl).toBeNull()
    await expectUnlocked(s)
  })

  it("setPatientAsaasCustomer lança: registra db.set_customer e libera o lock", async () => {
    const s = await setup((repos) => ({
      payments: {
        ...repos.payments,
        setPatientAsaasCustomer: async () => {
          throw new Error("db down")
        },
      },
    }))

    expect(await s.sync(s.paymentId, OPTS)).toEqual({ status: "retry_scheduled" })
    expect(row(s).lastError?.step).toBe("db.set_customer")
    await expectUnlocked(s)
  })

  it("não consegue registrar a falha: loga sem o corpo, devolve retry_scheduled e libera o lock", async () => {
    const s = await setup((repos) => ({
      payments: {
        ...repos.payments,
        markSyncFailure: async () => {
          throw new Error("db down")
        },
      },
    }))
    s.asaas.failNext("createPayment", new HttpError("asaas 503", { transient: true, status: 503, body: "SEGREDO" }))

    expect(await s.sync(s.paymentId, OPTS)).toEqual({ status: "retry_scheduled" })
    expect(s.log.error).toHaveBeenCalled()
    expect(loggedText(s.log)).not.toContain("SEGREDO")
    await expectUnlocked(s)
  })

  it("alertAdmin que lança não derruba o resultado failed", async () => {
    const s = await setup()
    s.alertAdmin.mockRejectedValueOnce(new Error("alert broke"))
    s.asaas.failNext("createPayment", new HttpError("asaas 400", { transient: false, status: 400 }))

    expect(await s.sync(s.paymentId, OPTS)).toEqual({ status: "failed" })
    expect(row(s).status).toBe("ASAAS_FAILED")
    await expectUnlocked(s)
  })

  it("quando markSynced e markSyncFailure falham juntos, o lock ainda é solto", async () => {
    const s = await setup((repos) => ({
      payments: {
        ...repos.payments,
        markSyncFailure: async () => {
          throw new Error("db down")
        },
        markSynced: async () => {
          throw new Error("db down too")
        },
      },
    }))

    expect(await s.sync(s.paymentId, OPTS)).toEqual({ status: "retry_scheduled" })
    await expectUnlocked(s)
  })
})
