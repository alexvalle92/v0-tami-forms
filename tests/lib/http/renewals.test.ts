import { describe, expect, it, vi } from "vitest"
import { RENEWALS_MAX_BODY_BYTES, createRenewalsHandler } from "@/lib/http/handlers/renewals"
import type { Logger } from "@/lib/log"
import type { SubmitQuiz } from "@/lib/services/submit-quiz"
import { createSubmitQuiz } from "@/lib/services/submit-quiz"
import { createMemoryRepos } from "../../fakes/memory-repos"

const URL_RENEWALS = "http://localhost/api/renewals"
const TOKEN = "t".repeat(40)
const SUBMISSION_ID = "3f1c2d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f"
const OTHER_SUBMISSION_ID = "9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d"
const LINK = "https://www.asaas.com/i/abc123"
const PRIVATE_NAME = "Ana Secreta Souza"
const PRIVATE_EMAIL = "ana.secreta@example.com"

type LogLine = { level: string; event: string; fields?: Record<string, unknown> }

function fakeLog(): Logger & { lines: LogLine[] } {
  const lines: LogLine[] = []
  const at = (level: string) => (event: string, fields?: Record<string, unknown>) => {
    lines.push({ level, event, fields })
  }
  return { lines, info: at("info"), warn: at("warn"), error: at("error") }
}

function answers(overrides: Record<string, unknown> = {}) {
  return {
    nome_completo: PRIVATE_NAME,
    email: PRIVATE_EMAIL,
    whatsapp: "(44) 9 9165-1250",
    cpf: "529.982.247-25",
    faixa_etaria: "25-34 anos",
    peso_kg: 70,
    ...overrides,
  }
}

function bodyOf(overrides: { submissionId?: string; answers?: Record<string, unknown> } = {}): string {
  return JSON.stringify({ submissionId: SUBMISSION_ID, answers: answers(), ...overrides })
}

function post(body: string, token: string | null = TOKEN): Request {
  const headers: Record<string, string> = { "content-type": "application/json" }
  if (token !== null) headers.authorization = `Bearer ${token}`
  return new Request(URL_RENEWALS, { method: "POST", headers, body })
}

function setup(submitQuiz?: SubmitQuiz) {
  const submit = vi.fn<SubmitQuiz>(submitQuiz ?? (async () => ({ kind: "link", link: LINK, quizResponseId: "qr-1" })))
  const dispatched: string[] = []
  const deferred: (() => Promise<void>)[] = []
  const log = fakeLog()
  const handler = createRenewalsHandler({
    token: TOKEN,
    submitQuiz: submit,
    dispatchForQuizResponse: async (id) => {
      dispatched.push(id)
    },
    defer: (fn) => {
      deferred.push(fn)
    },
    log,
  })
  return { handler, submit, dispatched, deferred, log }
}

describe("POST /api/renewals", () => {
  it("sem Authorization → 401 e submitQuiz não é chamado", async () => {
    const s = setup()
    const res = await s.handler(post(bodyOf(), null))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ ok: false })
    expect(s.submit).not.toHaveBeenCalled()
    expect(s.deferred).toHaveLength(0)
  })

  it("token errado → 401 e submitQuiz não é chamado", async () => {
    const s = setup()
    const res = await s.handler(post(bodyOf(), "x".repeat(40)))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ ok: false })
    expect(s.submit).not.toHaveBeenCalled()
  })

  it("corpo que não é JSON → 400", async () => {
    const s = setup()
    const res = await s.handler(post("{nao e json"))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ ok: false })
    expect(s.submit).not.toHaveBeenCalled()
  })

  it("answers sem cpf → 400", async () => {
    const s = setup()
    const { cpf: _cpf, ...semCpf } = answers()
    const res = await s.handler(post(bodyOf({ answers: semCpf })))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ ok: false })
    expect(s.submit).not.toHaveBeenCalled()
  })

  it("submissionId que não é UUID → 400", async () => {
    const s = setup()
    const res = await s.handler(post(bodyOf({ submissionId: "abc" })))
    expect(res.status).toBe(400)
    expect(s.submit).not.toHaveBeenCalled()
  })

  it("whatsapp preenchido e inválido → 400", async () => {
    const s = setup()
    const res = await s.handler(post(bodyOf({ answers: answers({ whatsapp: "123" }) })))
    expect(res.status).toBe(400)
    expect(s.submit).not.toHaveBeenCalled()
  })

  it("corpo acima de 64 KB → 413", async () => {
    const s = setup()
    const big = bodyOf({ answers: answers({ pad: "p".repeat(RENEWALS_MAX_BODY_BYTES) }) })
    const res = await s.handler(post(big))
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual({ ok: false })
    expect(s.submit).not.toHaveBeenCalled()
  })

  it("link → 200 com paymentUrl e adia o envio das mensagens com o quizResponseId", async () => {
    const s = setup()

    const res = await s.handler(post(bodyOf()))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, paymentUrl: LINK })
    expect(s.submit).toHaveBeenCalledTimes(1)
    expect(s.submit.mock.calls[0][0]).toMatchObject({
      submissionId: SUBMISSION_ID,
      patient: { name: PRIVATE_NAME, cpf: "52998224725", email: PRIVATE_EMAIL, phone: "44991651250" },
    })
    // O envio das mensagens só roda depois da resposta.
    expect(s.dispatched).toEqual([])
    expect(s.deferred).toHaveLength(1)
    await s.deferred[0]()
    expect(s.dispatched).toEqual(["qr-1"])
  })

  it("falha ao enviar as mensagens adiadas é logada e não propaga", async () => {
    const s = setup()
    const log = fakeLog()
    const deferred: (() => Promise<void>)[] = []
    const handler = createRenewalsHandler({
      token: TOKEN,
      submitQuiz: s.submit,
      dispatchForQuizResponse: async () => {
        throw new Error("smtp caiu")
      },
      defer: (fn) => {
        deferred.push(fn)
      },
      log,
    })

    const res = await handler(post(bodyOf()))
    expect(res.status).toBe(200)
    await expect(deferred[0]()).resolves.toBeUndefined()
    expect(log.lines.some((l) => l.level === "error" && l.event === "renewals.dispatch_failed")).toBe(true)
  })

  it("pending → 200 com paymentUrl nulo e nada é adiado", async () => {
    const s = setup(async () => ({ kind: "pending", quizResponseId: "qr-2" }))

    const res = await s.handler(post(bodyOf()))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, paymentUrl: null })
    expect(s.deferred).toHaveLength(0)
  })

  it("db_error → 500", async () => {
    const s = setup(async () => ({ kind: "db_error" }))

    const res = await s.handler(post(bodyOf()))

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ ok: false })
    expect(s.deferred).toHaveLength(0)
  })

  it("exceção inesperada → 500, log renewals.unexpected_error e nada do corpo no log", async () => {
    const s = setup(async () => {
      throw new Error("falha qualquer")
    })

    const res = await s.handler(post(bodyOf()))

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ ok: false })
    const error = s.log.lines.find((l) => l.event === "renewals.unexpected_error")
    expect(error?.level).toBe("error")
    expect(JSON.stringify(s.log.lines)).not.toContain(PRIVATE_EMAIL)
    expect(JSON.stringify(s.log.lines)).not.toContain(PRIVATE_NAME)
  })

  it("não loga dados pessoais nos caminhos de erro de validação", async () => {
    const s = setup()
    await s.handler(post(bodyOf({ answers: answers({ cpf: "000" }) })))
    expect(JSON.stringify(s.log.lines)).not.toContain(PRIVATE_EMAIL)
    expect(JSON.stringify(s.log.lines)).not.toContain(PRIVATE_NAME)
  })

  it("whatsapp vazio é aceito (paciente cadastrado pelo admin sem telefone)", async () => {
    const s = setup()

    const res = await s.handler(post(bodyOf({ answers: answers({ whatsapp: "" }) })))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, paymentUrl: LINK })
    expect(s.submit.mock.calls[0][0].patient.phone).toBe("")
  })

  it("dois envios com submissionId diferentes para o mesmo CPF devolvem a mesma cobrança", async () => {
    const repos = createMemoryRepos()
    const log = fakeLog()
    // Dublê do syncPayment: marca a cobrança como sincronizada e devolve o link, sem falar com o Asaas.
    const syncPayment = vi.fn(async (paymentId: string) => {
      await repos.payments.markSynced(paymentId, {
        asaasId: "pay_1",
        asaasCustomerId: "cus_1",
        status: "PENDING",
        paymentUrl: LINK,
        invoiceNumber: null,
        billingType: null,
        dueDate: "2026-10-14",
      })
      return { status: "synced", paymentUrl: LINK } as const
    })
    const submitQuiz = createSubmitQuiz({
      submissions: repos.submissions,
      payments: repos.payments,
      notifications: repos.notifications,
      syncPayment,
      log,
      now: () => new Date("2026-10-12T15:00:00Z"),
      config: { amount: "39.90", channels: ["email", "whatsapp"], requestBudgetMs: 20_000 },
    })
    const handler = createRenewalsHandler({
      token: TOKEN,
      submitQuiz,
      dispatchForQuizResponse: async () => {},
      defer: () => {},
      log,
    })

    const first = await handler(post(bodyOf({ submissionId: SUBMISSION_ID })))
    const second = await handler(post(bodyOf({ submissionId: OTHER_SUBMISSION_ID })))

    expect(first.status).toBe(200)
    expect(second.status).toBe(200)
    const firstBody = (await first.json()) as { ok: boolean; paymentUrl: string | null }
    const secondBody = (await second.json()) as { ok: boolean; paymentUrl: string | null }
    expect(firstBody).toEqual({ ok: true, paymentUrl: LINK })
    expect(secondBody.paymentUrl).toBe(firstBody.paymentUrl)
    expect(repos.state.payments.size).toBe(1)
    expect(syncPayment).toHaveBeenCalledTimes(1)
  })
})
