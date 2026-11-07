// Envio do quiz para a API. Módulo sem React e sem sessionStorage: quem chama
// (loading-screen) cuida do armazenamento do link de pagamento.

import type { SubmitFailure } from "@/lib/analytics/events"
import type { SubmitMetaInput } from "@/lib/meta/shared"

export const GENERIC_SUBMIT_ERROR =
  "Houve um problema ao registrar seus dados. Por favor, aguarde alguns instantes e tente novamente ou entre em contato com o suporte."

export type SubmitQuizResult =
  | { ok: true; linkPagamento?: string }
  | { ok: false; message: string; failure: SubmitFailure }

function uuidV4FromBytes(bytes: Uint8Array): string {
  bytes[6] = (bytes[6] & 0x0f) | 0x40
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

// Gera um UUID v4 sem lançar exceção: crypto.randomUUID só existe em contexto
// seguro (https/localhost) e em navegadores recentes, então há dois fallbacks.
export function newSubmissionId(): string {
  try {
    const c = globalThis.crypto
    if (c && typeof c.randomUUID === "function") {
      return c.randomUUID()
    }
    if (c && typeof c.getRandomValues === "function") {
      return uuidV4FromBytes(c.getRandomValues(new Uint8Array(16)))
    }
  } catch {
    // cai para o último recurso
  }
  const bytes = new Uint8Array(16)
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = Math.floor(Math.random() * 256)
  }
  return uuidV4FromBytes(bytes)
}

export async function submitQuizRequest(args: {
  submissionId: string
  answers: Record<string, unknown>
  /** Atribuição do anúncio (Meta); vai junto do corpo só quando existe. */
  meta?: SubmitMetaInput
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): Promise<SubmitQuizResult> {
  const { submissionId, answers, meta, fetchImpl = fetch, timeoutMs = 30000 } = args

  // AbortController + setTimeout em vez de AbortSignal.timeout (ausente no Safari < 16).
  // O timer fica ativo até o corpo da resposta ser lido, para que um corpo travado também estoure.
  let timer: ReturnType<typeof setTimeout> | undefined
  const controller = new AbortController()
  try {
    timer = setTimeout(() => controller.abort(), timeoutMs)

    const response = await fetchImpl("/api/submit-quiz", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(meta ? { submissionId, answers, meta } : { submissionId, answers }),
      signal: controller.signal,
    })

    if (!response.ok) {
      return { ok: false, message: GENERIC_SUBMIT_ERROR, failure: response.status >= 500 ? "http_5xx" : "http_4xx" }
    }

    const contentType = response.headers?.get("content-type")

    if (contentType?.includes("application/json")) {
      const text = await response.text()
      if (text) {
        let data: any
        try {
          data = JSON.parse(text)
          if (data === null || typeof data !== "object") throw new Error("corpo não é um objeto")
        } catch {
          return { ok: false, message: GENERIC_SUBMIT_ERROR, failure: "resposta_invalida" }
        }
        if (data.sucesso == true) {
          return data.linkPagamento ? { ok: true, linkPagamento: data.linkPagamento } : { ok: true }
        }
        if (data.mensagemErro) {
          return { ok: false, message: data.mensagemErro, failure: "resposta_invalida" }
        }
      }
    }
    return { ok: true }
  } catch {
    return { ok: false, message: GENERIC_SUBMIT_ERROR, failure: controller.signal.aborted ? "timeout" : "rede" }
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}
