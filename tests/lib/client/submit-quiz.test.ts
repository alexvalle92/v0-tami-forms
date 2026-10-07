import { describe, expect, it } from "vitest"
import { GENERIC_SUBMIT_ERROR, submitQuizRequest } from "@/lib/client/submit-quiz"

const submissionId = "3f1c2d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f"
const answers = { nome_completo: "Ana", email: "ana@gmail.com" }

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  })
}

function run(fetchImpl: typeof fetch, extra: { timeoutMs?: number } = {}) {
  return submitQuizRequest({ submissionId, answers, fetchImpl, ...extra })
}

describe("submitQuizRequest", () => {
  it("sucesso com link de pagamento", async () => {
    const result = await run((async () =>
      jsonResponse({ sucesso: true, linkPagamento: "https://sandbox.asaas.com/i/abc" })) as unknown as typeof fetch)
    expect(result).toEqual({ ok: true, linkPagamento: "https://sandbox.asaas.com/i/abc" })
  })

  it("sucesso sem link", async () => {
    const result = await run((async () => jsonResponse({ sucesso: true })) as unknown as typeof fetch)
    expect(result.ok).toBe(true)
    expect((result as { linkPagamento?: string }).linkPagamento).toBeUndefined()
  })

  it("200 com corpo vazio é sucesso", async () => {
    const result = await run((async () =>
      new Response("", { status: 200, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch)
    expect(result.ok).toBe(true)
  })

  it("200 sem content-type JSON é sucesso", async () => {
    const result = await run((async () =>
      new Response("ok", { status: 200, headers: { "Content-Type": "text/plain" } })) as unknown as typeof fetch)
    expect(result.ok).toBe(true)
  })

  it("200 com sucesso=false e mensagemErro devolve a mensagem", async () => {
    const result = await run((async () =>
      jsonResponse({ sucesso: false, mensagemErro: "X" })) as unknown as typeof fetch)
    expect(result).toEqual({ ok: false, message: "X" })
  })

  it.each([400, 429, 500])("status %i devolve a mensagem genérica", async (status) => {
    const result = await run((async () =>
      jsonResponse({ sucesso: false, mensagemErro: "detalhe do servidor" }, status)) as unknown as typeof fetch)
    expect(result).toEqual({ ok: false, message: GENERIC_SUBMIT_ERROR })
  })

  it("falha de rede devolve a mensagem genérica", async () => {
    const result = await run((async () => {
      throw new TypeError("Failed to fetch")
    }) as unknown as typeof fetch)
    expect(result).toEqual({ ok: false, message: GENERIC_SUBMIT_ERROR })
  })

  it("JSON inválido devolve a mensagem genérica", async () => {
    const result = await run((async () =>
      new Response("{nope", { status: 200, headers: { "Content-Type": "application/json" } })) as unknown as typeof fetch)
    expect(result).toEqual({ ok: false, message: GENERIC_SUBMIT_ERROR })
  })

  it("timeout (fetch que nunca resolve) devolve a mensagem genérica e passa um AbortSignal", async () => {
    let received: AbortSignal | null | undefined
    const fetchImpl = ((_url: unknown, init?: RequestInit) => {
      received = init?.signal
      return new Promise<Response>((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(init.signal?.reason))
      })
    }) as unknown as typeof fetch
    const result = await run(fetchImpl, { timeoutMs: 20 })
    expect(result).toEqual({ ok: false, message: GENERIC_SUBMIT_ERROR })
    expect(received).toBeInstanceOf(AbortSignal)
  })

  it("envia POST para /api/submit-quiz com JSON exato", async () => {
    let url: unknown
    let init: RequestInit | undefined
    const fetchImpl = (async (u: unknown, i?: RequestInit) => {
      url = u
      init = i
      return jsonResponse({ sucesso: true })
    }) as unknown as typeof fetch
    await run(fetchImpl)
    expect(url).toBe("/api/submit-quiz")
    expect(init?.method).toBe("POST")
    expect(init?.headers).toEqual({ "Content-Type": "application/json" })
    expect(init?.body).toBe(JSON.stringify({ submissionId, answers }))
  })
})
