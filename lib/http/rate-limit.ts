export type RateLimiter = { hit(key: string): boolean }

/** Rate limit em memória com janela deslizante. `hit` retorna true se a chamada é permitida. */
export function createRateLimiter(opts: {
  limit: number
  windowMs: number
  now?: () => number
}): RateLimiter {
  const { limit, windowMs, now = Date.now } = opts
  const hits = new Map<string, number[]>()

  return {
    hit(key) {
      const t = now()
      const recent = (hits.get(key) ?? []).filter((ts) => t - ts < windowMs)
      if (recent.length >= limit) {
        hits.set(key, recent)
        return false
      }
      recent.push(t)
      hits.set(key, recent)
      return true
    },
  }
}
