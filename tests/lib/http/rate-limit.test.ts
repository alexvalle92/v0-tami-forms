import { describe, expect, it } from "vitest"
import { createRateLimiter } from "@/lib/http/rate-limit"

describe("createRateLimiter", () => {
  it("bloqueia acima do limite, isola chaves e libera após a janela", () => {
    let t = 1_000_000
    const limiter = createRateLimiter({ limit: 5, windowMs: 60_000, now: () => t })

    for (let i = 0; i < 5; i++) expect(limiter.hit("ip")).toBe(true)
    expect(limiter.hit("ip")).toBe(false)
    expect(limiter.hit("outro")).toBe(true)

    t += 60_001
    expect(limiter.hit("ip")).toBe(true)
  })
})
