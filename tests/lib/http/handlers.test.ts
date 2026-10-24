import { describe, expect, it } from "vitest"
import { createHealthHandler } from "@/lib/http/handlers/health"
import { createJobsRetryHandler, createJobsRunHandler } from "@/lib/http/handlers/jobs"
import { createSubmitQuizHandler } from "@/lib/http/handlers/submit-quiz"
import { readJsonBody } from "@/lib/http/read-json"
import type { RetryTarget } from "@/lib/jobs/retry-failed"
import { createRateLimiter } from "@/lib/http/rate-limit"
import type { Logger } from "@/lib/log"
import { MENSAGEM_ERRO_PADRAO } from "@/lib/quiz/messages"
import type { ParsedSubmission } from "@/lib/quiz/validation"
import type { SubmitResult } from "@/lib/services/submit-quiz"
import { createDispatchForQuizResponse } from "@/lib/services/dispatch-for-quiz-response"
import type { NotificationRepo } from "@/lib/db/repos/types"

const URL_SUBMIT = "http://localhost/api/submit-quiz"
const TOKEN = "t".repeat(40)
const CPF = "529.982.247-25"
const EMAIL = "ana.secreta@example.com"
const PHONE = "(11) 99999-0000"

type LogLine = { level: string; event: string; fields?: Record<string, unknown> }

function fakeLog(): Logger & { lines: LogLine[] } {
  const lines: LogLine[] = []
  const at = (level: string) => (event: string, fields?: Record<string, unknown>) => {
    lines.push({ level, event, fields })
  }
  return { lines, info: at("info"), warn: at("warn"), error: at("error") }
}

function validBody(overrides: Record<string, unknown> = {}) {
  return {
    submissionId: "0b6f2f0e-6f0a-4b8e-9d2a-3c1f5e7a9b10",
    answers: { nome_completo: "Ana Souza", email: EMAIL, whatsapp: PHONE, cpf: CPF, faixa_etaria: "25-34", ...overrides },
  }
}

function post(body: string, headers: Record<string, string> = {}): Request {
  return new Request(URL_SUBMIT, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  })
}

function setupSubmit(opts: { result?: SubmitResult | (() => Promise<SubmitResult>); limiter?: { hit(k: string): boolean } } = {}) {
  const calls = {
    submitQuiz: [] as ParsedSubmission[],
    contexts: [] as unknown[],
    dispatch: [] as string[],
    deferred: [] as (() => Promise<void>)[],
    hits: [] as string[],
  }
  const result = opts.result ?? { kind: "link", link: "https://pay.example/i/1", quizResponseId: "qr-1" }
  const limiter = opts.limiter ?? { hit: () => true }
  const log = fakeLog()
  const handler = createSubmitQuizHandler({
    submitQuiz: async (input, ctx) => {
      calls.submitQuiz.push(input)
      calls.contexts.push(ctx)
      return typeof result === "function" ? result() : result
    },
    dispatchForQuizResponse: async (id) => {
      calls.dispatch.push(id)
    },
    rateLimiter: {
      hit(k) {
        calls.hits.push(k)
        return limiter.hit(k)
      },
    },
    defer: (fn) => {
      calls.deferred.push(fn)
    },
    log,
  })
  return { handler, calls, log }
}

const errorBody = { sucesso: false, mensagemErro: MENSAGEM_ERRO_PADRAO }

describe("readJsonBody", () => {
  it("parses a JSON body within the limit", async () => {
    const r = await readJsonBody(post('{"a":1}'), 64)
    expect(r).toEqual({ ok: true, value: { a: 1 } })
  })

  it("rejects invalid JSON and an empty body with 400", async () => {
    expect(await readJsonBody(post("{"), 64)).toEqual({ ok: false, status: 400 })
    expect(await readJsonBody(post(""), 64)).toEqual({ ok: false, status: 400 })
  })

  it("rejects by content-length before reading", async () => {
    const r = await readJsonBody(post('{"a":1}', { "content-length": "999999" }), 64)
    expect(r).toEqual({ ok: false, status: 413 })
  })

  it("rejects by the bytes actually read when content-length is absent", async () => {
    const big = JSON.stringify({ a: "x".repeat(200) })
    const r = await readJsonBody(post(big), 64)
    expect(r).toEqual({ ok: false, status: 413 })
  })

  it("stops reading a streamed body that exceeds the limit (never buffers it all)", async () => {
    let pulled = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled++
        if (pulled > 1000) throw new Error("read past the limit")
        controller.enqueue(new Uint8Array(1024).fill(0x61))
      },
    })
    const req = new Request(URL_SUBMIT, { method: "POST", body: stream, duplex: "half" } as RequestInit)
    const r = await readJsonBody(req, 4096)
    expect(r).toEqual({ ok: false, status: 413 })
    expect(pulled).toBeLessThan(10)
  })
})

describe("submit-quiz handler: respostas por caso", () => {
  it('corpo "{" → 400 com a mensagem padrão, sem chamar o serviço', async () => {
    const { handler, calls } = setupSubmit()
    const res = await handler(post("{"))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual(errorBody)
    expect(calls.submitQuiz).toEqual([])
  })

  it("string de 70 000 bytes → 413", async () => {
    const { handler, calls } = setupSubmit()
    const res = await handler(post("x".repeat(70_000)))
    expect(res.status).toBe(413)
    expect(await res.json()).toEqual(errorBody)
    expect(calls.submitQuiz).toEqual([])
  })

  it("CPF inválido → 400, e o log não ecoa dados pessoais", async () => {
    const { handler, calls, log } = setupSubmit()
    const res = await handler(post(JSON.stringify(validBody({ cpf: "111.111.111-11" }))))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual(errorBody)
    expect(calls.submitQuiz).toEqual([])
    const logged = JSON.stringify(log.lines)
    expect(logged).not.toContain("111.111.111-11")
    expect(logged).not.toContain(EMAIL)
    expect(logged).not.toContain("Ana Souza")
  })

  it("6ª requisição do mesmo IP com um limiter real (limit 5) → 429; a chave é o primeiro IP de x-forwarded-for", async () => {
    const { handler, calls } = setupSubmit({ limiter: createRateLimiter({ limit: 5, windowMs: 60_000 }) })
    const headers = { "x-forwarded-for": " 203.0.113.7 , 10.0.0.1" }
    for (let i = 0; i < 5; i++) {
      const res = await handler(post(JSON.stringify(validBody()), headers))
      expect(res.status).toBe(200)
    }
    const res = await handler(post(JSON.stringify(validBody()), headers))
    expect(res.status).toBe(429)
    expect(await res.json()).toEqual(errorBody)
    expect(calls.submitQuiz).toHaveLength(5)
    expect(calls.hits).toEqual(Array(6).fill("203.0.113.7"))

    // Outro IP continua liberado.
    const other = await handler(post(JSON.stringify(validBody()), { "x-forwarded-for": "198.51.100.1" }))
    expect(other.status).toBe(200)
  })

  it('sem x-forwarded-for a chave é "unknown"', async () => {
    const { handler, calls } = setupSubmit()
    await handler(post(JSON.stringify(validBody())))
    expect(calls.hits).toEqual(["unknown"])
  })

  it("o rate limit vem antes da leitura do corpo", async () => {
    const { handler, calls } = setupSubmit({ limiter: { hit: () => false } })
    const res = await handler(post("{"))
    expect(res.status).toBe(429)
    expect(calls.submitQuiz).toEqual([])
  })
})

describe("submit-quiz handler: contexto do pedido para a atribuição da Meta", () => {
  it("passa o primeiro IP de x-forwarded-for e o User-Agent ao serviço", async () => {
    const { handler, calls } = setupSubmit()
    await handler(
      post(JSON.stringify(validBody()), { "x-forwarded-for": "9.9.9.9, 10.0.0.1", "user-agent": "UA-X" }),
    )
    expect(calls.contexts).toEqual([{ clientIp: "9.9.9.9", userAgent: "UA-X" }])
  })

  it("sem os cabeçalhos, o IP é 'unknown' e o User-Agent fica ausente", async () => {
    const { handler, calls } = setupSubmit()
    await handler(post(JSON.stringify(validBody())))
    expect(calls.contexts).toEqual([{ clientIp: "unknown", userAgent: undefined }])
  })
})

describe("submit-quiz handler: resultado do serviço", () => {
  it("link → 200 { sucesso, linkPagamento }; defer recebe uma função que despacha as notificações do envio", async () => {
    const { handler, calls } = setupSubmit({
      result: { kind: "link", link: "https://pay.example/i/abc", quizResponseId: "qr-42" },
    })
    const res = await handler(post(JSON.stringify(validBody())))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ sucesso: true, linkPagamento: "https://pay.example/i/abc" })

    expect(calls.submitQuiz).toHaveLength(1)
    expect(calls.submitQuiz[0].submissionId).toBe(validBody().submissionId)
    expect(calls.submitQuiz[0].patient.cpf).toBe("52998224725")

    expect(calls.deferred).toHaveLength(1)
    expect(calls.dispatch).toEqual([]) // só roda depois da resposta
    await calls.deferred[0]()
    expect(calls.dispatch).toEqual(["qr-42"])
  })

  it("a função adiada não lança se o despacho falhar (loga mensagem segura)", async () => {
    const log = fakeLog()
    const deferred: (() => Promise<void>)[] = []
    const handler = createSubmitQuizHandler({
      submitQuiz: async () => ({ kind: "link", link: "https://pay.example/i/abc", quizResponseId: "qr-42" }),
      dispatchForQuizResponse: async () => {
        throw new Error(`smtp refused for ${EMAIL}`)
      },
      rateLimiter: { hit: () => true },
      defer: (fn) => {
        deferred.push(fn)
      },
      log,
    })
    await handler(post(JSON.stringify(validBody())))
    await expect(deferred[0]()).resolves.toBeUndefined()
    expect(log.lines.some((l) => l.level === "error")).toBe(true)
    expect(JSON.stringify(log.lines)).not.toContain(EMAIL)
  })

  it("pending → 200 com o corpo exatamente { sucesso: true }, sem defer", async () => {
    const { handler, calls } = setupSubmit({ result: { kind: "pending", quizResponseId: "qr-1" } })
    const res = await handler(post(JSON.stringify(validBody())))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body).toStrictEqual({ sucesso: true })
    expect("linkPagamento" in body).toBe(false)
    expect(calls.deferred).toEqual([])
  })

  it("db_error → 500 com a mensagem padrão, e defer não foi chamado", async () => {
    const { handler, calls } = setupSubmit({ result: { kind: "db_error" } })
    const res = await handler(post(JSON.stringify(validBody())))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual(errorBody)
    expect(calls.deferred).toEqual([])
  })

  it("exceção inesperada do serviço → 500 com a mensagem padrão, sem detalhes internos", async () => {
    const { handler, calls, log } = setupSubmit({
      result: async () => {
        throw new Error(`Failed query: insert ... params: ${EMAIL}`)
      },
    })
    const res = await handler(post(JSON.stringify(validBody())))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual(errorBody)
    expect(calls.deferred).toEqual([])
    expect(JSON.stringify(log.lines)).not.toContain(EMAIL)
  })
})

function jobsReq(path: string, opts: { auth?: string; body?: string } = {}): Request {
  const headers: Record<string, string> = { "content-type": "application/json" }
  if (opts.auth !== undefined) headers.authorization = opts.auth
  return new Request(`http://localhost/api/jobs/${path}`, { method: "POST", headers, body: opts.body ?? "" })
}

describe("jobs/run handler", () => {
  function setupRun(result: "ran" | "skipped" = "ran") {
    const calls = { runner: 0 }
    const handler = createJobsRunHandler({
      token: TOKEN,
      runner: async () => {
        calls.runner++
        return result
      },
    })
    return { handler, calls }
  }

  it("sem header → 401 { ok: false }, sem rodar", async () => {
    const { handler, calls } = setupRun()
    const res = await handler(jobsReq("run"))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ ok: false })
    expect(calls.runner).toBe(0)
  })

  it("token errado → 401", async () => {
    const { handler, calls } = setupRun()
    const res = await handler(jobsReq("run", { auth: `Bearer ${"x".repeat(40)}` }))
    expect(res.status).toBe(401)
    expect(calls.runner).toBe(0)
  })

  it("com Bearer <token> → 200 { ok: true, resultado: 'ran' }", async () => {
    const { handler, calls } = setupRun()
    const res = await handler(jobsReq("run", { auth: `Bearer ${TOKEN}` }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, resultado: "ran" })
    expect(calls.runner).toBe(1)
  })

  it("skipped é devolvido como está", async () => {
    const { handler } = setupRun("skipped")
    const res = await handler(jobsReq("run", { auth: `Bearer ${TOKEN}` }))
    expect(await res.json()).toEqual({ ok: true, resultado: "skipped" })
  })

  it("runner lança → 500 { ok: false }, sem detalhes", async () => {
    const handler = createJobsRunHandler({
      token: TOKEN,
      runner: async () => {
        throw new Error("boom secret")
      },
    })
    const res = await handler(jobsReq("run", { auth: `Bearer ${TOKEN}` }))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ ok: false })
  })
})

describe("jobs/retry handler", () => {
  function setupRetry(reopened = 1) {
    const calls = { retryFailed: [] as RetryTarget[], runner: 0, deferred: [] as (() => Promise<void>)[] }
    const handler = createJobsRetryHandler({
      token: TOKEN,
      retryFailed: async (t) => {
        calls.retryFailed.push(t)
        return { reopened }
      },
      runner: async () => {
        calls.runner++
        return "ran"
      },
      defer: (fn) => {
        calls.deferred.push(fn)
      },
    })
    return { handler, calls }
  }
  const auth = `Bearer ${TOKEN}`

  it("sem token válido → 401, nada reaberto", async () => {
    const { handler, calls } = setupRetry()
    for (const a of [undefined, "Bearer errado", TOKEN]) {
      const res = await handler(jobsReq("retry", { auth: a, body: '{"allFailed":true}' }))
      expect(res.status).toBe(401)
      expect(await res.json()).toEqual({ ok: false })
    }
    expect(calls.retryFailed).toEqual([])
    expect(calls.deferred).toEqual([])
  })

  it("corpo {} → 400 { ok: false }", async () => {
    const { handler, calls } = setupRetry()
    const res = await handler(jobsReq("retry", { auth, body: "{}" }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ ok: false })
    expect(calls.retryFailed).toEqual([])
    expect(calls.deferred).toEqual([])
  })

  it.each([
    ["JSON inválido", "{"],
    ["allFailed false", '{"allFailed":false}'],
    ["dois alvos", '{"paymentId":"x","notificationId":"y"}'],
    ["id vazio", '{"paymentId":""}'],
    ["id não string", '{"paymentId":5}'],
    ["array", "[]"],
  ])("corpo inválido (%s) → 400", async (_name, body) => {
    const { handler, calls } = setupRetry()
    const res = await handler(jobsReq("retry", { auth, body }))
    expect(res.status).toBe(400)
    expect(await res.json()).toEqual({ ok: false })
    expect(calls.retryFailed).toEqual([])
  })

  it("{ paymentId: 'x' } → 200 { ok: true, reopened: 1 }; retryFailed recebeu o alvo; defer chamado com o runner", async () => {
    const { handler, calls } = setupRetry(1)
    const res = await handler(jobsReq("retry", { auth, body: '{"paymentId":"x"}' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, reopened: 1 })
    expect(calls.retryFailed).toEqual([{ paymentId: "x" }])
    expect(calls.deferred).toHaveLength(1)
    expect(calls.runner).toBe(0)
    await calls.deferred[0]()
    expect(calls.runner).toBe(1)
  })

  it('POST /api/jobs/retry aceita { "planGenerationId": "…" }', async () => {
    const { handler, calls } = setupRetry(1)
    const res = await handler(jobsReq("retry", { auth, body: '{"planGenerationId":"g-1"}' }))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true, reopened: 1 })
    expect(calls.retryFailed).toEqual([{ planGenerationId: "g-1" }])
    expect(calls.deferred).toHaveLength(1)
  })

  it("{ planGenerationId } com id vazio ou junto de outro alvo → 400", async () => {
    const { handler, calls } = setupRetry()
    for (const body of ['{"planGenerationId":""}', '{"planGenerationId":"g-1","paymentId":"x"}']) {
      const res = await handler(jobsReq("retry", { auth, body }))
      expect(res.status).toBe(400)
    }
    expect(calls.retryFailed).toEqual([])
  })

  it("aceita { notificationId } e { allFailed: true }", async () => {
    const { handler, calls } = setupRetry(3)
    const a = await handler(jobsReq("retry", { auth, body: '{"notificationId":"n-1"}' }))
    const b = await handler(jobsReq("retry", { auth, body: '{"allFailed":true}' }))
    expect(await a.json()).toEqual({ ok: true, reopened: 3 })
    expect(await b.json()).toEqual({ ok: true, reopened: 3 })
    expect(calls.retryFailed).toEqual([{ notificationId: "n-1" }, { allFailed: true }])
  })

  it("retryFailed lança → 500 { ok: false }, sem defer", async () => {
    const deferred: unknown[] = []
    const handler = createJobsRetryHandler({
      token: TOKEN,
      retryFailed: async () => {
        throw new Error("db down")
      },
      runner: async () => "ran",
      defer: (fn) => {
        deferred.push(fn)
      },
    })
    const res = await handler(jobsReq("retry", { auth, body: '{"allFailed":true}' }))
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ ok: false })
    expect(deferred).toEqual([])
  })

  it("a função adiada não lança se o runner falhar", async () => {
    const deferred: (() => Promise<void>)[] = []
    const handler = createJobsRetryHandler({
      token: TOKEN,
      retryFailed: async () => ({ reopened: 0 }),
      runner: async () => {
        throw new Error("boom")
      },
      defer: (fn) => {
        deferred.push(fn)
      },
    })
    await handler(jobsReq("retry", { auth, body: '{"allFailed":true}' }))
    await expect(deferred[0]()).resolves.toBeUndefined()
  })
})

describe("health handler", () => {
  it("ping ok → 200 { ok: true }", async () => {
    let pings = 0
    const res = await createHealthHandler({
      ping: async () => {
        pings++
      },
    })()
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(pings).toBe(1)
  })

  it("ping lança → 503 { ok: false }", async () => {
    const res = await createHealthHandler({
      ping: async () => {
        throw new Error("ECONNREFUSED 127.0.0.1:3306")
      },
    })()
    expect(res.status).toBe(503)
    expect(await res.json()).toEqual({ ok: false })
  })
})

describe("dispatchForQuizResponse", () => {
  function setupDispatch(opts: { ids?: string[]; listThrows?: boolean; failOn?: string } = {}) {
    const calls = { list: [] as string[], dispatched: [] as string[] }
    const log = fakeLog()
    const notifications = {
      async listPendingIdsForQuizResponse(id: string) {
        calls.list.push(id)
        if (opts.listThrows) throw new Error(`Failed query: select params: ${EMAIL}`)
        return opts.ids ?? []
      },
    } as unknown as NotificationRepo
    const run = createDispatchForQuizResponse({
      notifications,
      dispatchNotification: async (id) => {
        calls.dispatched.push(id)
        if (id === opts.failOn) throw new Error(`smtp refused ${EMAIL}`)
        return "sent"
      },
      log,
    })
    return { run, calls, log }
  }

  it("despacha as pendentes do envio, em sequência", async () => {
    const { run, calls } = setupDispatch({ ids: ["n1", "n2"] })
    await run("qr-1")
    expect(calls.list).toEqual(["qr-1"])
    expect(calls.dispatched).toEqual(["n1", "n2"])
  })

  it("exceção em uma não interrompe as demais e é logada sem dados pessoais", async () => {
    const { run, calls, log } = setupDispatch({ ids: ["n1", "n2", "n3"], failOn: "n2" })
    await expect(run("qr-1")).resolves.toBeUndefined()
    expect(calls.dispatched).toEqual(["n1", "n2", "n3"])
    expect(log.lines.filter((l) => l.level === "error")).toHaveLength(1)
    expect(JSON.stringify(log.lines)).not.toContain(EMAIL)
  })

  it("falha ao listar é logada e não lança", async () => {
    const { run, calls, log } = setupDispatch({ listThrows: true })
    await expect(run("qr-1")).resolves.toBeUndefined()
    expect(calls.dispatched).toEqual([])
    expect(log.lines.filter((l) => l.level === "error")).toHaveLength(1)
    expect(JSON.stringify(log.lines)).not.toContain(EMAIL)
  })
})
