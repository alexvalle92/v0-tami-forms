export const MAX_PAYMENT_ATTEMPTS = 8
export const MAX_NOTIFICATION_ATTEMPTS = 5

const MINUTE_MS = 60_000
const MAX_BACKOFF_MS = 60 * MINUTE_MS

/** Espera após a tentativa `attempt` (1-based): 2, 4, 8, 16, 32 min, depois 60 min. */
export function jobBackoffMs(attempt: number): number {
  return Math.min(2 ** attempt * MINUTE_MS, MAX_BACKOFF_MS)
}
