// Cliente da Data Manager API do Google (events:ingest), o caminho que o Google exige para importar
// conversões offline em integrações novas desde 15/06/2026 (o UploadClickConversions da Google Ads API
// recusa quem não usava antes). Uma chamada por `ingest`, sem nova tentativa aqui: quem chama decide.
// O processamento no Google é assíncrono: 200 quer dizer "aceito", e o `requestId` devolvido serve para
// consultar o resultado em requestStatus:retrieve.

import { safeErrorMessage } from "@/lib/services/last-error"
import type { AccessTokenProvider } from "./auth"
import type { GoogleUserIdentifier } from "./user-data"

export const DATA_MANAGER_INGEST_URL = "https://datamanager.googleapis.com/v1/events:ingest"

export type DataManagerEvent = {
  transactionId: string
  /** RFC 3339. */
  eventTimestamp: string
  eventSource: "WEB"
  conversionValue: number
  currency: "BRL"
  /** Só um dos três: o Google não aceita misturar identificadores de cliques diferentes. */
  adIdentifiers: { gclid: string } | { gbraid: string } | { wbraid: string }
  userData?: { userIdentifiers: GoogleUserIdentifier[] }
}

export type IngestResult =
  | { kind: "ok"; requestId: string | null }
  | { kind: "retryable" | "fatal"; status?: number; message: string }

export type DataManagerClient = { ingest(events: DataManagerEvent[]): Promise<IngestResult> }

const DEFAULT_TIMEOUT_MS = 15_000
const MAX_MESSAGE_CHARS = 200

const account = (accountId: string) => ({ accountType: "GOOGLE_ADS", accountId })

export function createDataManagerClient(d: {
  /** Conta do Google Ads dona da ação de conversão, só dígitos. */
  customerId: string
  /** Conta de administrador (MCC) por onde a credencial acessa; ausente = a própria conta. */
  loginCustomerId?: string
  /** Id da ação de conversão do tipo "Importação de cliques". */
  conversionActionId: string
  validateOnly: boolean
  auth: AccessTokenProvider
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): DataManagerClient {
  const timeoutMs = d.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const destination = {
    operatingAccount: account(d.customerId),
    loginAccount: account(d.loginCustomerId ?? d.customerId),
    productDestinationId: d.conversionActionId,
  }

  async function errorDetail(response: Response): Promise<string | null> {
    try {
      const body = (await response.json()) as { error?: { status?: unknown; message?: unknown } } | null
      const parts = [body?.error?.status, body?.error?.message].filter((v): v is string => typeof v === "string")
      return parts.length > 0 ? parts.join(": ").slice(0, MAX_MESSAGE_CHARS) : null
    } catch {
      return null
    }
  }

  return {
    async ingest(events) {
      const token = await d.auth.getToken()
      if (token.kind !== "ok") return token

      const body: Record<string, unknown> = { destinations: [destination], encoding: "HEX", events }
      if (d.validateOnly) body.validateOnly = true

      const controller = new AbortController()
      let timer: ReturnType<typeof setTimeout> | undefined
      // O fetch pode ignorar o cancelamento: a corrida garante que a chamada termina no prazo.
      const timedOut = new Promise<never>((_, reject) => {
        timer = setTimeout(() => {
          controller.abort()
          reject(new Error(`timeout após ${timeoutMs}ms`))
        }, timeoutMs)
      })

      let response: Response
      try {
        response = await Promise.race([
          (d.fetchImpl ?? fetch)(DATA_MANAGER_INGEST_URL, {
            method: "POST",
            headers: { "content-type": "application/json", authorization: `Bearer ${token.token}` },
            body: JSON.stringify(body),
            signal: controller.signal,
          }),
          timedOut,
        ])
      } catch (err) {
        return { kind: "retryable", message: `rede: ${safeErrorMessage(err)}` }
      } finally {
        clearTimeout(timer)
      }

      const status = response.status
      if (response.ok) {
        try {
          const json = (await response.json()) as { requestId?: unknown } | null
          return { kind: "ok", requestId: typeof json?.requestId === "string" ? json.requestId : null }
        } catch {
          return { kind: "ok", requestId: null }
        }
      }

      // 401: token vencido ou revogado antes do previsto. Descarta o cache e deixa a próxima tentativa pedir outro.
      if (status === 401) d.auth.invalidate()
      const detail = await errorDetail(response)
      const message = detail ? `Google ${status}: ${detail}` : `Google ${status}`
      const retryable = status >= 500 || status === 429 || status === 408 || status === 401
      return { kind: retryable ? "retryable" : "fatal", status, message }
    },
  }
}
