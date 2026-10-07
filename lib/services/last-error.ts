import type { LastError } from "@/lib/db/repos/types"
import { HttpError } from "@/lib/http/retry"

const MAX_BODY_CHARS = 2048

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
  return { ...base, message: String(err instanceof Error ? err.message : err) }
}
