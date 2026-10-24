// Cliente da API de Conversões da Meta. Uma chamada por `send`, sem nova tentativa aqui: quem chama decide
// (o Purchase repete pelo job; o espelho do navegador tenta uma vez). O token vai só no corpo da requisição
// e nunca entra no resultado.

import { safeErrorMessage } from "@/lib/services/last-error"
import type { CapiUserData } from "./user-data"

export type CapiEvent = {
  event_name: "ViewContent" | "Lead" | "InitiateCheckout" | "Purchase"
  /** Segundos Unix. */
  event_time: number
  event_id: string
  action_source: "website"
  event_source_url?: string
  user_data: CapiUserData
  custom_data?: { value: number; currency: "BRL" }
}

export type CapiResult =
  | { kind: "ok" }
  | { kind: "retryable" | "fatal"; status?: number; message: string }

export type MetaCapiClient = { send(events: CapiEvent[]): Promise<CapiResult> }

const DEFAULT_TIMEOUT_MS = 10_000
const MAX_META_MESSAGE_CHARS = 200

export function createMetaCapiClient(d: {
  pixelId: string
  token: string
  apiVersion: string
  testEventCode?: string
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): MetaCapiClient {
  const url = `https://graph.facebook.com/${d.apiVersion}/${d.pixelId}/events`
  const timeoutMs = d.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const hideToken = (text: string) => text.replaceAll(d.token, "[token]")

  async function metaErrorMessage(response: Response): Promise<string | null> {
    try {
      const body: unknown = await response.json()
      const message = (body as { error?: { message?: unknown } } | null)?.error?.message
      return typeof message === "string" ? hideToken(message).slice(0, MAX_META_MESSAGE_CHARS) : null
    } catch {
      return null
    }
  }

  return {
    async send(events) {
      const body: Record<string, unknown> = { data: events, access_token: d.token }
      if (d.testEventCode) body.test_event_code = d.testEventCode

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
          (d.fetchImpl ?? fetch)(url, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
            signal: controller.signal,
          }),
          timedOut,
        ])
      } catch (err) {
        return { kind: "retryable", message: hideToken(`rede: ${safeErrorMessage(err)}`) }
      } finally {
        clearTimeout(timer)
      }

      if (response.ok) return { kind: "ok" }

      const status = response.status
      const detail = await metaErrorMessage(response)
      const message = detail ? `Meta ${status}: ${detail}` : `Meta ${status}`
      return { kind: status >= 500 || status === 429 ? "retryable" : "fatal", status, message }
    },
  }
}
