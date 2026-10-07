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

  it("usa janela deslizante: libera um slot por vez, não a janela inteira", () => {
    let t = 1_000_000
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000, now: () => t })

    expect(limiter.hit("ip")).toBe(true) // t0
    t += 30_000
    expect(limiter.hit("ip")).toBe(true) // t0 + 30s
    expect(limiter.hit("ip")).toBe(false)

    t += 30_000 // t0 + 60s: o primeiro expirou, o segundo não
    expect(limiter.hit("ip")).toBe(true)
    expect(limiter.hit("ip")).toBe(false)
  })

  it("remove chaves expiradas para a memória não crescer sem limite", () => {
    let t = 1_000_000
    const limiter = createRateLimiter({ limit: 5, windowMs: 60_000, now: () => t })

    for (let i = 0; i < 999; i++) limiter.hit(`k${i}`)
    expect(limiter.size()).toBe(999)

    t += 60_001
    limiter.hit("novo") // 1000º hit dispara a varredura
    expect(limiter.size()).toBe(1)
  })

  it("não deixa a chave para trás quando o limite é 0", () => {
    const limiter = createRateLimiter({ limit: 0, windowMs: 60_000, now: () => 1 })
    expect(limiter.hit("ip")).toBe(false)
    expect(limiter.size()).toBe(0)
  })
})
