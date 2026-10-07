import type { LastError } from "@/lib/db/repos/types"
import { HttpError } from "@/lib/http/retry"

const MAX_BODY_CHARS = 2048
const MAX_MESSAGE_CHARS = 300
const REDACTED = "[redacted]"

/**
 * Mensagem de um erro segura para log, `last_error.message` e e-mail ao admin.
 * O Drizzle embute no texto do erro a query e seus parâmetros (e-mail, telefone, `last_error`
 * serializado com o corpo da resposta), então esse texto nunca pode sair do processo.
 *  - HttpError: a mensagem ("HTTP 503", "timeout ...") é segura.
 *  - Erro com `cause` do mysql2 (`code`/`errno`): só `Nome: CÓDIGO`.
 *  - Outro Error: a mensagem, cortada em "params:" / "Failed query" e limitada a 300 caracteres.
 */
export function safeErrorMessage(err: unknown): string {
  if (err instanceof HttpError) return err.message
  if (!(err instanceof Error)) return String(err).slice(0, MAX_MESSAGE_CHARS)

  const cause: unknown = err.cause
  if (typeof cause === "object" && cause !== null) {
    const { code, errno } = cause as { code?: unknown; errno?: unknown }
    const id = code ?? errno
    if (id !== undefined && id !== null) return `${err.name}: ${String(id)}`
  }

  const msg = err.message
  const paramsAt = msg.indexOf("params:")
  const startsFailedQuery = msg.startsWith("Failed query")
  if (paramsAt >= 0 || startsFailedQuery) {
    const cut = paramsAt >= 0 ? paramsAt : "Failed query".length
    return msg.slice(0, Math.min(cut, MAX_MESSAGE_CHARS - REDACTED.length)) + REDACTED
  }
  return msg.slice(0, MAX_MESSAGE_CHARS)
}

/** Converte qualquer erro lançado no `last_error` gravado no banco. O corpo da resposta (se houver) vai truncado. */
export function toLastError(step: string, err: unknown, attempt: number, at: Date): LastError {
  const base = { step, attempt, at: at.toISOString() }
  if (err instanceof HttpError) {
    return {
      ...base,
      ...(err.status !== undefined ? { httpStatus: err.status } : {}),
      ...(err.body !== undefined ? { responseBody: err.body.slice(0, MAX_BODY_CHARS) } : {}),
      message: err.message,
    }
  }
  return { ...base, message: safeErrorMessage(err) }
}
