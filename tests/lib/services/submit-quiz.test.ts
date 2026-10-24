import { describe, expect, it, vi } from "vitest"
import type {
  Channel,
  MetaAttributionRepo,
  NotificationRepo,
  PaymentRepo,
  SubmissionRepo,
} from "@/lib/db/repos/types"
import { HttpError } from "@/lib/http/retry"
import type { Logger } from "@/lib/log"
import type { ParsedSubmission } from "@/lib/quiz/validation"
import { createSubmitQuiz } from "@/lib/services/submit-quiz"
import { createSyncPayment } from "@/lib/services/sync-payment"
import type { SyncPayment } from "@/lib/services/sync-payment"
import { createFakeAsaas } from "../../fakes/fake-asaas"
import { createMemoryRepos } from "../../fakes/memory-repos"

const NOW = new Date("2026-10-07T15:00:00Z")
const CPF = "52998224725"
const CHANNELS: Channel[] = ["email", "whatsapp"]
const BUDGET_MS = 20_000
const EMAIL = "ana.secreta@example.com"
const PHONE = "11999990000"

function submission(submissionId: string, cpf = CPF): ParsedSubmission {
  return {
    submissionId,
    patient: { name: "Ana Souza", cpf, email: EMAIL, phone: PHONE },
    answers: { nome_completo: "Ana Souza", faixa_etaria: "25-34 anos" },
  }
}

type Overrides = {
  submissions?: SubmissionRepo
  payments?: PaymentRepo
  notifications?: NotificationRepo
  syncPayment?: (real: SyncPayment) => SyncPayment
}

function setup(
  wrap: (repos: ReturnType<typeof createMemoryRepos>) => Overrides = () => ({}),
  opts: { metaEnabled?: boolean; metaAttributions?: MetaAttributionRepo } = {},
) {
  const repos = createMemoryRepos()
  const asaas = createFakeAsaas()
  const log: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const alertAdmin = vi.fn(async (_a: unknown) => {})
  const override = wrap(repos)
  const realSync = createSyncPayment({
    payments: repos.payments,
    notifications: repos.notifications,
    asaas,
    alertAdmin,
    log,
    now: () => NOW,
    config: { dueDays: 2, successUrl: "https://app.example.com/obrigado", channels: CHANNELS },
  })
  const syncPayment = override.syncPayment ? override.syncPayment(realSync) : realSync
  const submit = createSubmitQuiz({
    submissions: override.submissions ?? repos.submissions,
    payments: override.payments ?? repos.payments,
    notifications: override.notifications ?? repos.notifications,
    syncPayment,
    metaAttributions: opts.metaAttributions ?? repos.metaAttributions,
    log,
    now: () => NOW,
    config: { amount: "39.90", channels: CHANNELS, requestBudgetMs: BUDGET_MS, metaEnabled: opts.metaEnabled ?? false },
  })
  return { repos, asaas, log, alertAdmin, submit }
}

function loggedText(log: Logger): string {
  return JSON.stringify([
    ...(log.info as ReturnType<typeof vi.fn>).mock.calls,
    ...(log.warn as ReturnType<typeof vi.fn>).mock.calls,
    ...(log.error as ReturnType<typeof vi.fn>).mock.calls,
  ])
}

const countCalls = (calls: string[], method: string) => calls.filter((c) => c === method).length

describe("createSubmitQuiz", () => {
  it("desfecho 1: Asaas responde dentro do pedido -> link", async () => {
    const s = setup()

    const result = await s.submit(submission("sub-1"))

    const payment = [...s.asaas.payments.values()][0]
    expect(result).toMatchObject({ kind: "link", link: payment.invoiceUrl })
    expect(result.kind === "link" && result.quizResponseId).toBeTruthy()
    expect(s.repos.state.notifications.size).toBe(2)
  })

  it("grava o valor e a data de São Paulo recebidos da configuração/relógio", async () => {
    const s = setup()
    const spy = vi.spyOn(s.repos.submissions, "create")

    await s.submit(submission("sub-1"))

    expect(spy).toHaveBeenCalledWith({
      submissionId: "sub-1",
      patient: { name: "Ana Souza", cpf: CPF, email: EMAIL, phone: PHONE },
      answers: { nome_completo: "Ana Souza", faixa_etaria: "25-34 anos" },
      amount: "39.90",
      todaySP: "2026-10-07",
    })
  })

  it("desfecho 2: Asaas falha toda chamada com 503 -> pending; cobrança segue PENDING_ASAAS e fica na fila do job", async () => {
    const s = setup()
    for (const method of [
      "findCustomerByCpf",
      "createCustomer",
      "findPaymentByExternalReference",
      "createPayment",
    ] as const) {
      vi.spyOn(s.asaas, method).mockRejectedValue(new HttpError("HTTP 503", { transient: true, status: 503 }))
    }

    const result = await s.submit(submission("sub-1"))

    expect(result.kind).toBe("pending")
    const [payment] = [...s.repos.state.payments.values()]
    expect(payment.status).toBe("PENDING_ASAAS")
    expect(payment.paymentUrl).toBeNull()
    expect(await s.repos.payments.listDue(new Date(NOW.getTime() + 2 * 60_000), 10)).toEqual([payment.id])
  })

  it("desfecho 3: falha ao gravar -> db_error, sem pending/link", async () => {
    const s = setup((repos) => ({
      submissions: {
        findBySubmissionId: repos.submissions.findBySubmissionId,
        create: async () => {
          throw new Error("conexão perdida")
        },
      },
    }))

    expect(await s.submit(submission("sub-1"))).toEqual({ kind: "db_error" })
    expect(s.asaas.calls).toEqual([])
  })

  it("falha em findBySubmissionId -> db_error", async () => {
    const s = setup((repos) => ({
      submissions: {
        create: repos.submissions.create,
        findBySubmissionId: async () => {
          throw new Error("conexão perdida")
        },
      },
    }))

    expect(await s.submit(submission("sub-1"))).toEqual({ kind: "db_error" })
  })

  it("mesmo submissionId duas vezes: as duas dão link com a mesma URL, 1 quiz_response e 1 createPayment", async () => {
    const s = setup()

    const first = await s.submit(submission("sub-1"))
    const second = await s.submit(submission("sub-1"))

    expect(first.kind).toBe("link")
    expect(second.kind).toBe("link")
    if (first.kind !== "link" || second.kind !== "link") return
    expect(second.link).toBe(first.link)
    expect(second.quizResponseId).toBe(first.quizResponseId)
    expect(countCalls(s.asaas.calls, "createPayment")).toBe(1)
    expect(s.repos.state.payments.size).toBe(1)
  })

  it("Promise.all com o mesmo submissionId: nenhuma db_error, 1 quiz_response, 1 createPayment", async () => {
    const s = setup()

    const results = await Promise.all([s.submit(submission("sub-1")), s.submit(submission("sub-1"))])

    expect(results.map((r) => r.kind)).not.toContain("db_error")
    for (const r of results) expect(["link", "pending"]).toContain(r.kind)
    const ids = new Set(results.map((r) => (r.kind === "db_error" ? null : r.quizResponseId)))
    expect(ids.size).toBe(1)
    expect(s.repos.state.payments.size).toBe(1)
    expect(countCalls(s.asaas.calls, "createPayment")).toBe(1)
  })

  it("'duplicate' seguido de leitura vazia -> db_error", async () => {
    const s = setup((repos) => ({
      submissions: {
        findBySubmissionId: async () => null,
        create: async () => "duplicate" as const,
      },
    }))

    expect(await s.submit(submission("sub-1"))).toEqual({ kind: "db_error" })
  })

  it("cliente recorrente: mesmo CPF, novo submissionId -> mesma URL, sem chamar o Asaas e 2 notificações novas", async () => {
    const s = setup()
    const first = await s.submit(submission("sub-1"))
    expect(first.kind).toBe("link")
    const callsBefore = [...s.asaas.calls]

    const second = await s.submit(submission("sub-2"))

    expect(second.kind).toBe("link")
    if (first.kind !== "link" || second.kind !== "link") return
    expect(second.link).toBe(first.link)
    expect(second.quizResponseId).not.toBe(first.quizResponseId)
    expect(s.asaas.calls).toEqual(callsBefore)
    expect(await s.repos.notifications.listPendingIdsForQuizResponse(second.quizResponseId)).toHaveLength(2)
  })

  it("recorrente com URL já pronta não chama o syncPayment", async () => {
    const spy = vi.fn()
    const s = setup(() => ({ syncPayment: (real) => (spy.mockImplementation(real), spy as unknown as SyncPayment) }))
    await s.submit(submission("sub-1"))
    spy.mockClear()

    const second = await s.submit(submission("sub-2"))

    expect(second.kind).toBe("link")
    expect(spy).not.toHaveBeenCalled()
  })

  it("recorrente: se enfileirar as notificações lançar, ainda devolve link e loga mensagem segura", async () => {
    let failEnqueue = false
    const s = setup((repos) => ({
      notifications: {
        ...repos.notifications,
        enqueuePaymentLink: async (filter, channels) => {
          if (failEnqueue) throw new Error(`insert falhou params: ${EMAIL}, ${PHONE}`)
          return repos.notifications.enqueuePaymentLink(filter, channels)
        },
      },
    }))
    const first = await s.submit(submission("sub-1"))
    expect(first.kind).toBe("link")
    failEnqueue = true

    const second = await s.submit(submission("sub-2"))

    expect(second.kind).toBe("link")
    if (first.kind !== "link" || second.kind !== "link") return
    expect(second.link).toBe(first.link)
    expect(s.log.error).toHaveBeenCalled()
    expect(loggedText(s.log)).not.toContain(EMAIL)
    expect(loggedText(s.log)).not.toContain(PHONE)
  })

  it("exceção depois de gravar (payments.get) -> pending, nunca db_error", async () => {
    const s = setup((repos) => ({
      payments: {
        ...repos.payments,
        get: async () => {
          throw new Error("conexão perdida")
        },
      },
    }))

    const result = await s.submit(submission("sub-1"))

    expect(result.kind).toBe("pending")
    expect(result.kind === "pending" && result.quizResponseId).toBeTruthy()
    expect(s.log.error).toHaveBeenCalled()
  })

  it("exceção do syncPayment -> pending", async () => {
    const s = setup(() => ({
      syncPayment: () => async () => {
        throw new Error("falha inesperada")
      },
    }))

    expect((await s.submit(submission("sub-1"))).kind).toBe("pending")
  })

  it("cobrança que sumiu depois de gravar (payments.get devolve null) -> pending", async () => {
    const s = setup((repos) => ({ payments: { ...repos.payments, get: async () => null } }))

    expect((await s.submit(submission("sub-1"))).kind).toBe("pending")
  })

  it.each(["busy", "retry_scheduled", "failed", "not_found"] as const)(
    "syncPayment devolve %s -> pending",
    async (status) => {
      const s = setup(() => ({ syncPayment: () => async () => ({ status }) }))

      expect((await s.submit(submission("sub-1"))).kind).toBe("pending")
    },
  )

  it("passa ao syncPayment o deadline now + requestBudgetMs", async () => {
    const spy = vi.fn()
    const s = setup(() => ({ syncPayment: (real) => (spy.mockImplementation(real), spy as unknown as SyncPayment) }))

    await s.submit(submission("sub-1"))

    expect(spy).toHaveBeenCalledTimes(1)
    expect(spy.mock.calls[0][1]).toEqual({ deadline: NOW.getTime() + 20_000 })
  })

  it("R17: erro do banco com e-mail/telefone do paciente não vaza em nenhum log", async () => {
    const leaky = new Error(`Failed query: insert into patients params: ${EMAIL},${PHONE},${CPF}`)
    const dbFail = setup((repos) => ({
      submissions: {
        findBySubmissionId: repos.submissions.findBySubmissionId,
        create: async () => {
          throw leaky
        },
      },
    }))
    expect(await dbFail.submit(submission("sub-1"))).toEqual({ kind: "db_error" })
    expect(dbFail.log.error).toHaveBeenCalled()

    const afterStore = setup((repos) => ({
      payments: {
        ...repos.payments,
        get: async () => {
          throw leaky
        },
      },
    }))
    expect((await afterStore.submit(submission("sub-1"))).kind).toBe("pending")

    const syncFail = setup(() => ({
      syncPayment: () => async () => {
        throw leaky
      },
    }))
    expect((await syncFail.submit(submission("sub-1"))).kind).toBe("pending")

    for (const s of [dbFail, afterStore, syncFail]) {
      const text = loggedText(s.log)
      expect(text).not.toContain(EMAIL)
      expect(text).not.toContain(PHONE)
      expect(text).not.toContain(CPF)
      expect(text).not.toContain("Ana Souza")
    }
  })
})

describe("createSubmitQuiz: atribuição da Meta", () => {
  const META = { externalId: "123e4567-e89b-42d3-a456-426614174000", fbp: "fb.1.1700000000000.123" }
  const withMeta = (submissionId: string): ParsedSubmission => ({ ...submission(submissionId), meta: META })

  it("com o rastreamento ligado, grava a atribuição do envio com IP e User-Agent do pedido", async () => {
    const s = setup(undefined, { metaEnabled: true })

    const result = await s.submit(withMeta("sub-1"), { clientIp: "1.2.3.4", userAgent: "UA" })

    expect(result.kind).toBe("link")
    const quizResponseId = result.kind === "link" ? result.quizResponseId : ""
    expect(s.repos.state.metaAttributions.get(quizResponseId)).toEqual({
      quizResponseId,
      externalId: META.externalId,
      fbp: META.fbp,
      fbc: null,
      clientIp: "1.2.3.4",
      userAgent: "UA",
      eventSourceUrl: null,
      createdAt: NOW,
    })
  })

  it("IP 'unknown' vira nulo e IP e User-Agent enormes são cortados no tamanho da coluna", async () => {
    const s = setup(undefined, { metaEnabled: true })
    await s.submit(withMeta("sub-1"), { clientIp: "unknown", userAgent: "u".repeat(600) })
    await s.submit(withMeta("sub-2"), { clientIp: "i".repeat(80) })

    const rows = [...s.repos.state.metaAttributions.values()]
    expect(rows).toHaveLength(2)
    expect(rows.find((r) => r.clientIp === null)?.userAgent).toHaveLength(500)
    expect(rows.find((r) => r.clientIp !== null)?.clientIp).toHaveLength(45)
    expect(rows.find((r) => r.clientIp !== null)?.userAgent).toBeNull()
  })

  it("sem meta no envio, ou com o rastreamento desligado, não grava nada", async () => {
    const on = setup(undefined, { metaEnabled: true })
    await on.submit(submission("sub-1"), { clientIp: "1.2.3.4", userAgent: "UA" })
    const off = setup(undefined, { metaEnabled: false })
    await off.submit(withMeta("sub-1"), { clientIp: "1.2.3.4", userAgent: "UA" })

    expect(on.repos.state.metaAttributions.size).toBe(0)
    expect(off.repos.state.metaAttributions.size).toBe(0)
  })

  it("o reenvio do mesmo submissionId não troca a atribuição já gravada", async () => {
    const s = setup(undefined, { metaEnabled: true })
    await s.submit(withMeta("sub-1"), { clientIp: "1.1.1.1" })
    await s.submit(withMeta("sub-1"), { clientIp: "2.2.2.2" })

    const rows = [...s.repos.state.metaAttributions.values()]
    expect(rows).toHaveLength(1)
    expect(rows[0].clientIp).toBe("1.1.1.1")
  })

  it("se gravar a atribuição falhar, o envio segue igual e só um aviso sem dado pessoal é logado", async () => {
    const failing: MetaAttributionRepo = {
      save: async () => {
        throw new Error(`insert falhou para ${EMAIL}`)
      },
      purgeOlderThan: async () => 0,
    }
    const s = setup(undefined, { metaEnabled: true, metaAttributions: failing })

    const result = await s.submit(withMeta("sub-1"), { clientIp: "1.2.3.4" })

    expect(result.kind).toBe("link")
    const quizResponseId = result.kind === "link" ? result.quizResponseId : ""
    expect(s.log.warn).toHaveBeenCalledWith("submit.meta_attribution_failed", {
      submissionId: "sub-1",
      quizResponseId,
      message: expect.any(String),
    })
    const text = loggedText(s.log)
    expect(text).not.toContain(EMAIL)
    expect(text).not.toContain("1.2.3.4")
  })
})
