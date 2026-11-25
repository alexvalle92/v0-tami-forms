import { describe, expect, it, vi } from "vitest"
import type { AccessTokenProvider, TokenResult } from "@/lib/google-ads/auth"
import { createDataManagerClient, DATA_MANAGER_INGEST_URL, type DataManagerEvent } from "@/lib/google-ads/data-manager"

const EVENT: DataManagerEvent = {
  transactionId: "purchase:pay-1",
  eventTimestamp: "2026-11-25T12:00:00.000Z",
  eventSource: "WEB",
  conversionValue: 39.9,
  currency: "BRL",
  adIdentifiers: { gclid: "Cj0KCQ-abc" },
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

function fakeAuth(result: TokenResult = { kind: "ok", token: "ya29.token" }) {
  return { getToken: vi.fn(async () => result), invalidate: vi.fn((): void => {}) } satisfies AccessTokenProvider
}

function client(over: { fetchImpl?: typeof fetch; auth?: AccessTokenProvider; validateOnly?: boolean; login?: string } = {}) {
  return createDataManagerClient({
    customerId: "1234567890",
    loginCustomerId: over.login,
    conversionActionId: "987654321",
    validateOnly: over.validateOnly ?? false,
    auth: over.auth ?? fakeAuth(),
    fetchImpl: over.fetchImpl ?? (async () => json(200, { requestId: "req-1" })),
  })
}

describe("createDataManagerClient", () => {
  it("envia para events:ingest com o token, o destino da ação de conversão e codificação HEX", async () => {
    const fetchImpl = vi.fn(async (_u: string | URL | Request, _i?: RequestInit) => json(200, { requestId: "req-1" }))

    const r = await client({ fetchImpl }).ingest([EVENT])

    expect(r).toEqual({ kind: "ok", requestId: "req-1" })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe(DATA_MANAGER_INGEST_URL)
    expect(url).toBe("https://datamanager.googleapis.com/v1/events:ingest")
    expect(init?.method).toBe("POST")
    expect((init?.headers as Record<string, string>).authorization).toBe("Bearer ya29.token")
    expect(JSON.parse(String(init?.body))).toEqual({
      destinations: [
        {
          operatingAccount: { accountType: "GOOGLE_ADS", accountId: "1234567890" },
          loginAccount: { accountType: "GOOGLE_ADS", accountId: "1234567890" },
          productDestinationId: "987654321",
        },
      ],
      encoding: "HEX",
      events: [EVENT],
    })
  })

  it("com conta de administrador, ela vai como loginAccount; validateOnly vai no corpo", async () => {
    const fetchImpl = vi.fn(async (_u: string | URL | Request, _i?: RequestInit) => json(200, {}))

    const r = await client({ fetchImpl, login: "1112223333", validateOnly: true }).ingest([EVENT])

    expect(r).toEqual({ kind: "ok", requestId: null })
    const body = JSON.parse(String(fetchImpl.mock.calls[0][1]?.body))
    expect(body.destinations[0].loginAccount.accountId).toBe("1112223333")
    expect(body.validateOnly).toBe(true)
  })

  it("falha ao obter o token volta como está e não chama a API", async () => {
    const fetchImpl = vi.fn()
    const r = await client({ fetchImpl, auth: fakeAuth({ kind: "fatal", status: 400, message: "OAuth 400" }) }).ingest([EVENT])
    expect(r).toEqual({ kind: "fatal", status: 400, message: "OAuth 400" })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("400 é fatal, com o status e a mensagem do Google, sem o token", async () => {
    const r = await client({
      fetchImpl: async () =>
        json(400, { error: { code: 400, status: "INVALID_ARGUMENT", message: "Invalid hex encoding." } }),
    }).ingest([EVENT])

    expect(r).toEqual({ kind: "fatal", status: 400, message: "Google 400: INVALID_ARGUMENT: Invalid hex encoding." })
    expect(JSON.stringify(r)).not.toContain("ya29")
  })

  it("403 (API desligada no projeto, sem acesso à conta) é fatal", async () => {
    const r = await client({ fetchImpl: async () => json(403, { error: { status: "PERMISSION_DENIED" } }) }).ingest([EVENT])
    expect(r).toMatchObject({ kind: "fatal", status: 403 })
  })

  it("401 descarta o token guardado e é retryable", async () => {
    const auth = fakeAuth()
    const r = await client({ auth, fetchImpl: async () => json(401, {}) }).ingest([EVENT])
    expect(r).toMatchObject({ kind: "retryable", status: 401 })
    expect(auth.invalidate).toHaveBeenCalledTimes(1)
  })

  it("5xx, 429 e erro de rede são retryable", async () => {
    expect((await client({ fetchImpl: async () => json(503, {}) }).ingest([EVENT])).kind).toBe("retryable")
    expect((await client({ fetchImpl: async () => json(429, {}) }).ingest([EVENT])).kind).toBe("retryable")
    const network = await client({
      fetchImpl: async () => {
        throw new Error("ECONNREFUSED")
      },
    }).ingest([EVENT])
    expect(network).toEqual({ kind: "retryable", message: "rede: ECONNREFUSED" })
  })

  it("estoura o prazo mesmo se o fetch nunca responder", async () => {
    const c = createDataManagerClient({
      customerId: "1234567890",
      conversionActionId: "1",
      validateOnly: false,
      auth: fakeAuth(),
      fetchImpl: () => new Promise<Response>(() => {}),
      timeoutMs: 20,
    })
    expect(await c.ingest([EVENT])).toMatchObject({ kind: "retryable", message: expect.stringContaining("timeout") })
  })
})
