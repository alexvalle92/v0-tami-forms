import { describe, expect, it } from "vitest"
import { addDaysISO, todayInSaoPaulo } from "@/lib/time"

describe("todayInSaoPaulo", () => {
  it("usa o fuso de São Paulo (UTC-3), não o UTC", () => {
    expect(todayInSaoPaulo(new Date("2026-10-08T02:30:00Z"))).toBe("2026-10-07")
  })
})

describe("addDaysISO", () => {
  it("soma dias atravessando o fim do ano", () => {
    expect(addDaysISO("2026-12-31", 2)).toBe("2027-01-02")
  })
})
