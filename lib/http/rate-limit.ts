export type RateLimiter = {
  /** true quando a chamada é permitida. */
  hit(key: string): boolean
  /** Quantidade de chaves em memória (para testes). */
  size(): number
}

/** A cada N hits, varre todas as chaves e descarta as que só têm timestamps expirados. */
const SWEEP_EVERY_HITS = 1000

/** Rate limit em memória com janela deslizante. */
export function createRateLimiter(opts: {
  limit: number
  windowMs: number
  now?: () => number
}): RateLimiter {
  const { limit, windowMs, now = Date.now } = opts
  const hits = new Map<string, number[]>()
  let totalHits = 0

  const live = (timestamps: number[], t: number) => timestamps.filter((ts) => t - ts < windowMs)

  const sweep = (t: number) => {
    for (const [key, timestamps] of hits) {
      if (live(timestamps, t).length === 0) hits.delete(key)
    }
  }

  return {
    hit(key) {
      const t = now()
      if (++totalHits % SWEEP_EVERY_HITS === 0) sweep(t)

      const recent = live(hits.get(key) ?? [], t)
      if (recent.length >= limit) {
        if (recent.length === 0) hits.delete(key)
        else hits.set(key, recent)
        return false
      }
      recent.push(t)
      hits.set(key, recent)
      return true
    },
    size: () => hits.size,
  }
}
