import { createVerify } from "node:crypto"
import { describe, expect, it, vi } from "vitest"
import {
  createServiceAccountTokenProvider,
  DATA_MANAGER_SCOPE,
  parseServiceAccountKey,
  signServiceAccountJwt,
} from "@/lib/google-ads/auth"
import {
  serviceAccountJson,
  TEST_CLIENT_EMAIL,
  TEST_PRIVATE_KEY_PEM,
  TEST_PUBLIC_KEY,
} from "../../fakes/service-account"

const NOW_MS = Date.parse("2026-11-25T12:00:00.000Z")
const KEY = parseServiceAccountKey(serviceAccountJson())!

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

describe("parseServiceAccountKey", () => {
  it("lê o JSON cru e o JSON em base64", () => {
    const raw = serviceAccountJson()
    expect(parseServiceAccountKey(raw)).toEqual({
      clientEmail: TEST_CLIENT_EMAIL,
      privateKey: TEST_PRIVATE_KEY_PEM,
      tokenUri: "https://oauth2.googleapis.com/token",
    })
    expect(parseServiceAccountKey(Buffer.from(raw).toString("base64"))).toEqual(parseServiceAccountKey(raw))
  })

  it("aceita a private_key com \\n literais (colada num painel de variáveis)", () => {
    const flattened = serviceAccountJson({ private_key: TEST_PRIVATE_KEY_PEM.replace(/\n/g, "\\n") })
    expect(parseServiceAccountKey(flattened)?.privateKey).toBe(TEST_PRIVATE_KEY_PEM)
  })

  it.each([
    ["vazio", ""],
    ["lixo", "não é json"],
    ["sem client_email", serviceAccountJson({ client_email: undefined })],
    ["sem private_key", serviceAccountJson({ private_key: "" })],
    ["array", "[]"],
  ])("%s: nulo", (_name, raw) => {
    expect(parseServiceAccountKey(raw)).toBeNull()
  })

  it("token_uri que não é https cai no padrão do Google", () => {
    expect(parseServiceAccountKey(serviceAccountJson({ token_uri: "http://evil.test" }))?.tokenUri).toBe(
      "https://oauth2.googleapis.com/token",
    )
  })
})

describe("signServiceAccountJwt", () => {
  it("assina com RS256 e leva emissor, escopo, público e validade de 1 h", () => {
    const jwt = signServiceAccountJwt(KEY, DATA_MANAGER_SCOPE, NOW_MS)
    const [header, claims, signature] = jwt.split(".")

    expect(JSON.parse(Buffer.from(header, "base64url").toString())).toEqual({ alg: "RS256", typ: "JWT" })
    const iat = Math.floor(NOW_MS / 1000)
    expect(JSON.parse(Buffer.from(claims, "base64url").toString())).toEqual({
      iss: TEST_CLIENT_EMAIL,
      scope: "https://www.googleapis.com/auth/datamanager",
      aud: "https://oauth2.googleapis.com/token",
      iat,
      exp: iat + 3600,
    })
    const valid = createVerify("RSA-SHA256")
      .update(`${header}.${claims}`)
      .verify(TEST_PUBLIC_KEY, Buffer.from(signature, "base64url"))
    expect(valid).toBe(true)
  })
})

describe("createServiceAccountTokenProvider", () => {
  it("troca o JWT pelo token no endpoint do Google e guarda o token até perto de vencer", async () => {
    let nowMs = NOW_MS
    const fetchImpl = vi.fn(async (_url: string | URL | Request, _init?: RequestInit) =>
      json(200, { access_token: "ya29.token-1", expires_in: 3600, token_type: "Bearer" }),
    )
    const provider = createServiceAccountTokenProvider({ key: KEY, fetchImpl, now: () => nowMs })

    expect(await provider.getToken()).toEqual({ kind: "ok", token: "ya29.token-1" })
    const [url, init] = fetchImpl.mock.calls[0]
    expect(url).toBe("https://oauth2.googleapis.com/token")
    expect(init?.method).toBe("POST")
    const form = new URLSearchParams(String(init?.body))
    expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer")
    expect(form.get("assertion")?.split(".")).toHaveLength(3)

    nowMs += 58 * 60_000
    await provider.getToken()
    expect(fetchImpl).toHaveBeenCalledTimes(1)

    nowMs += 2 * 60_000 // a menos de 1 min do vencimento: pede outro
    await provider.getToken()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it("invalidate descarta o token guardado", async () => {
    const fetchImpl = vi.fn(async () => json(200, { access_token: "t", expires_in: 3600 }))
    const provider = createServiceAccountTokenProvider({ key: KEY, fetchImpl, now: () => NOW_MS })
    await provider.getToken()
    provider.invalidate()
    await provider.getToken()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it("400 invalid_grant é fatal, com a descrição do Google e sem a chave na mensagem", async () => {
    const provider = createServiceAccountTokenProvider({
      key: KEY,
      fetchImpl: async () => json(400, { error: "invalid_grant", error_description: "Invalid JWT Signature." }),
      now: () => NOW_MS,
    })
    const r = await provider.getToken()
    expect(r).toEqual({ kind: "fatal", status: 400, message: "OAuth 400: invalid_grant: Invalid JWT Signature." })
    expect(JSON.stringify(r)).not.toContain("PRIVATE KEY")
  })

  it("5xx, 429 e erro de rede são retryable; resposta sem token também", async () => {
    const at = (fetchImpl: typeof fetch) => createServiceAccountTokenProvider({ key: KEY, fetchImpl, now: () => NOW_MS })
    expect((await at(async () => json(503, {})).getToken()).kind).toBe("retryable")
    expect((await at(async () => json(429, {})).getToken()).kind).toBe("retryable")
    expect(
      (
        await at(async () => {
          throw new Error("ECONNRESET")
        }).getToken()
      ).kind,
    ).toBe("retryable")
    expect(await at(async () => json(200, { expires_in: 10 })).getToken()).toMatchObject({ kind: "retryable" })
  })

  it("chave que não assina é fatal e não chama a rede", async () => {
    const fetchImpl = vi.fn()
    const provider = createServiceAccountTokenProvider({
      key: { ...KEY, privateKey: "-----BEGIN PRIVATE KEY-----\nlixo\n-----END PRIVATE KEY-----" },
      fetchImpl,
    })
    expect(await provider.getToken()).toMatchObject({ kind: "fatal" })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("estoura o prazo mesmo se o fetch nunca responder", async () => {
    const provider = createServiceAccountTokenProvider({
      key: KEY,
      fetchImpl: () => new Promise<Response>(() => {}),
      timeoutMs: 20,
    })
    expect(await provider.getToken()).toMatchObject({ kind: "retryable", message: expect.stringContaining("timeout") })
  })
})
