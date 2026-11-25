// Token de acesso OAuth 2.0 de uma conta de serviço do Google Cloud (fluxo JWT bearer), sem biblioteca:
// assina o JWT com a chave privada (RS256) e troca no endpoint de token. O token fica em cache até 1 min
// antes de vencer. A chave e o token nunca entram no resultado nem em mensagem de erro.

import { createSign } from "node:crypto"
import { safeErrorMessage } from "@/lib/services/last-error"

export const DATA_MANAGER_SCOPE = "https://www.googleapis.com/auth/datamanager"
const DEFAULT_TOKEN_URI = "https://oauth2.googleapis.com/token"
const DEFAULT_TIMEOUT_MS = 10_000
const JWT_LIFETIME_S = 3600
const EXPIRY_MARGIN_MS = 60_000
const MAX_MESSAGE_CHARS = 200

export type ServiceAccountKey = { clientEmail: string; privateKey: string; tokenUri: string }

export type TokenResult =
  | { kind: "ok"; token: string }
  | { kind: "retryable" | "fatal"; status?: number; message: string }

export type AccessTokenProvider = {
  getToken(): Promise<TokenResult>
  /** Descarta o token em cache (ex.: a API respondeu 401). */
  invalidate(): void
}

/**
 * Lê o JSON da chave da conta de serviço, cru ou em base64 (mais fácil de colar num painel de variáveis).
 * Aceita a `private_key` com `\n` literais no lugar das quebras de linha. Nulo se faltar algo.
 */
export function parseServiceAccountKey(raw: string | null | undefined): ServiceAccountKey | null {
  try {
    const text = (raw ?? "").trim()
    if (!text) return null
    const json = text.startsWith("{") ? text : Buffer.from(text, "base64").toString("utf8")
    const parsed: unknown = JSON.parse(json)
    if (typeof parsed !== "object" || parsed === null) return null
    const { client_email, private_key, token_uri } = parsed as Record<string, unknown>
    if (typeof client_email !== "string" || !client_email.includes("@")) return null
    if (typeof private_key !== "string" || !private_key.includes("PRIVATE KEY")) return null
    return {
      clientEmail: client_email,
      privateKey: private_key.replace(/\\n/g, "\n"),
      tokenUri: typeof token_uri === "string" && token_uri.startsWith("https://") ? token_uri : DEFAULT_TOKEN_URI,
    }
  } catch {
    return null
  }
}

const base64url = (value: string | Buffer) => Buffer.from(value).toString("base64url")

export function signServiceAccountJwt(key: ServiceAccountKey, scope: string, nowMs: number): string {
  const iat = Math.floor(nowMs / 1000)
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }))
  const claims = base64url(
    JSON.stringify({ iss: key.clientEmail, scope, aud: key.tokenUri, iat, exp: iat + JWT_LIFETIME_S }),
  )
  const signature = createSign("RSA-SHA256").update(`${header}.${claims}`).sign(key.privateKey)
  return `${header}.${claims}.${base64url(signature)}`
}

export function createServiceAccountTokenProvider(d: {
  key: ServiceAccountKey
  scope?: string
  fetchImpl?: typeof fetch
  now?: () => number
  timeoutMs?: number
}): AccessTokenProvider {
  const scope = d.scope ?? DATA_MANAGER_SCOPE
  const now = d.now ?? Date.now
  const timeoutMs = d.timeoutMs ?? DEFAULT_TIMEOUT_MS
  let cached: { token: string; expiresAtMs: number } | null = null

  async function errorDetail(response: Response): Promise<string | null> {
    try {
      const body = (await response.json()) as { error?: unknown; error_description?: unknown } | null
      const parts = [body?.error, body?.error_description].filter((v): v is string => typeof v === "string")
      return parts.length > 0 ? parts.join(": ").slice(0, MAX_MESSAGE_CHARS) : null
    } catch {
      return null
    }
  }

  return {
    invalidate() {
      cached = null
    },

    async getToken() {
      if (cached && cached.expiresAtMs - EXPIRY_MARGIN_MS > now()) return { kind: "ok", token: cached.token }

      let assertion: string
      try {
        assertion = signServiceAccountJwt(d.key, scope, now())
      } catch {
        // Chave inválida: repetir não resolve. A mensagem do crypto não vai adiante (pode citar a chave).
        return { kind: "fatal", message: "OAuth: não foi possível assinar o JWT com a chave da conta de serviço" }
      }

      const controller = new AbortController()
      let timer: ReturnType<typeof setTimeout> | undefined
      const timedOut = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort()
          reject(new Error(`timeout após ${timeoutMs}ms`))
        }, timeoutMs)
      })

      let response: Response
      try {
        response = await Promise.race([
          (d.fetchImpl ?? fetch)(d.key.tokenUri, {
            method: "POST",
            headers: { "content-type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
              grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
              assertion,
            }).toString(),
            signal: controller.signal,
          }),
          timedOut,
        ])
      } catch (err) {
        return { kind: "retryable", message: `OAuth rede: ${safeErrorMessage(err)}` }
      } finally {
        clearTimeout(timer)
      }

      const status = response.status
      if (!response.ok) {
        const detail = await errorDetail(response)
        const message = detail ? `OAuth ${status}: ${detail}` : `OAuth ${status}`
        return { kind: status >= 500 || status === 429 ? "retryable" : "fatal", status, message }
      }

      try {
        const body = (await response.json()) as { access_token?: unknown; expires_in?: unknown }
        if (typeof body.access_token !== "string" || !body.access_token) {
          return { kind: "retryable", status, message: "OAuth: resposta sem access_token" }
        }
        const expiresInS = typeof body.expires_in === "number" && body.expires_in > 0 ? body.expires_in : 3600
        cached = { token: body.access_token, expiresAtMs: now() + expiresInS * 1000 }
        return { kind: "ok", token: body.access_token }
      } catch {
        return { kind: "retryable", status, message: "OAuth: resposta ilegível" }
      }
    },
  }
}
