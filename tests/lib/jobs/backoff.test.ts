import { describe, expect, it } from "vitest"
import { MAX_NOTIFICATION_ATTEMPTS, MAX_PAYMENT_ATTEMPTS, MAX_PLAN_ATTEMPTS, jobBackoffMs } from "@/lib/jobs/backoff"

describe("jobBackoffMs", () => {
  it("cresce 2, 4, 8, 16, 32 minutos e limita em 60", () => {
    const minutes = [1, 2, 3, 4, 5, 6, 10].map((n) => jobBackoffMs(n) / 60_000)
    expect(minutes).toEqual([2, 4, 8, 16, 32, 60, 60])
  })

  it("define o máximo de tentativas", () => {
    expect(MAX_PAYMENT_ATTEMPTS).toBe(8)
    expect(MAX_NOTIFICATION_ATTEMPTS).toBe(5)
    expect(MAX_PLAN_ATTEMPTS).toBe(5)
  })
})
