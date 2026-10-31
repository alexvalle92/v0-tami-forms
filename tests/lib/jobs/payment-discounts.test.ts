import { describe, expect, it, vi } from "vitest"
import { createApplyPaymentDiscounts, DISCOUNT_HOURS } from "@/lib/jobs/payment-discounts"
import type { Logger } from "@/lib/log"
import type { DiscountResult } from "@/lib/services/apply-payment-discount"

function setup(nowIso: string, ids: string[] = ["a", "b"], results: Record<string, DiscountResult | Error> = {}) {
  const now = new Date(nowIso)
  const listDiscountEligible = vi.fn(
    async (_d: { fromUtc: Date; toUtc: Date; discountAmount: string; limit: number }) => ids,
  )
  const applyDiscount = vi.fn(async (id: string, _o: { deadline: number }): Promise<DiscountResult> => {
    const r = results[id] ?? "applied"
    if (r instanceof Error) throw r
    return r
  })
  const log: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const run = createApplyPaymentDiscounts({
    payments: { listDiscountEligible },
    applyDiscount,
    discountAmount: "29.90",
    limit: 50,
    deadlineMs: 30_000,
    now: () => now,
    log,
  })
  return { now, listDiscountEligible, applyDiscount, log, run }
}

describe("createApplyPaymentDiscounts", () => {
  it("a janela é de 9h às 20h (exclusivo) no horário de São Paulo", () => {
    expect(DISCOUNT_HOURS).toEqual({ from: 9, to: 20 })
  })

  it("8h59 e 20h00 devolvem 0 sem listar", async () => {
    for (const iso of ["2026-10-31T11:59:00Z", "2026-10-31T23:00:00Z"]) {
      const s = setup(iso)

      expect(await s.run()).toBe(0)

      expect(s.listDiscountEligible).not.toHaveBeenCalled()
      expect(s.applyDiscount).not.toHaveBeenCalled()
      expect(s.log.info).not.toHaveBeenCalled()
    }
  })

  it("9h00 e 19h59 listam o dia anterior em UTC", async () => {
    for (const iso of ["2026-10-31T12:00:00Z", "2026-10-31T22:59:00Z"]) {
      const s = setup(iso)

      await s.run()

      expect(s.listDiscountEligible).toHaveBeenCalledTimes(1)
      expect(s.listDiscountEligible).toHaveBeenCalledWith({
        fromUtc: new Date("2026-10-30T03:00:00.000Z"),
        toUtc: new Date("2026-10-31T03:00:00.000Z"),
        discountAmount: "29.90",
        limit: 50,
      })
    }
  })

  it("virada do mês: ontem é 31/10", async () => {
    const s = setup("2026-11-01T12:00:00Z")

    await s.run()

    expect(s.listDiscountEligible).toHaveBeenCalledWith({
      fromUtc: new Date("2026-10-31T03:00:00.000Z"),
      toUtc: new Date("2026-11-01T03:00:00.000Z"),
      discountAmount: "29.90",
      limit: 50,
    })
  })

  it("chama o serviço por id com deadline e devolve o total", async () => {
    const s = setup("2026-10-31T15:00:00Z", ["a", "b", "c", "d", "e"], {
      b: "skipped",
      c: "retry",
      d: "busy",
    })

    expect(await s.run()).toBe(5)

    expect(s.applyDiscount.mock.calls.map((c) => c[0])).toEqual(["a", "b", "c", "d", "e"])
    for (const call of s.applyDiscount.mock.calls) {
      expect(call[1]).toEqual({ deadline: s.now.getTime() + 30_000 })
    }
    expect(s.log.info).toHaveBeenCalledWith("job.discounts.done", {
      applied: 2,
      skipped: 1,
      retry: 1,
      busy: 1,
      errors: 0,
    })
  })

  it("exceção de um item é logada e não para os demais", async () => {
    const s = setup("2026-10-31T15:00:00Z", ["a", "b"], { a: new Error("db down") })

    expect(await s.run()).toBe(2)

    expect(s.log.error).toHaveBeenCalledWith("job.discount.error", { paymentId: "a", message: "db down" })
    expect(s.applyDiscount).toHaveBeenCalledTimes(2)
    expect(s.log.info).toHaveBeenCalledWith("job.discounts.done", {
      applied: 1,
      skipped: 0,
      retry: 0,
      busy: 0,
      errors: 1,
    })
  })

  it("a mensagem do erro não vaza dados pessoais para o log", async () => {
    const s = setup("2026-10-31T15:00:00Z", ["a"], {
      a: new Error("Failed query: select ... params: ana@example.com,11999990000"),
    })

    await s.run()

    const text = JSON.stringify((s.log.error as ReturnType<typeof vi.fn>).mock.calls)
    expect(text).toContain("job.discount.error")
    expect(text).not.toContain("ana@example.com")
    expect(text).not.toContain("11999990000")
  })

  it("lista vazia: sem log de done", async () => {
    const s = setup("2026-10-31T15:00:00Z", [])

    expect(await s.run()).toBe(0)

    expect(s.listDiscountEligible).toHaveBeenCalledTimes(1)
    expect(s.applyDiscount).not.toHaveBeenCalled()
    expect(s.log.info).not.toHaveBeenCalled()
  })
})
