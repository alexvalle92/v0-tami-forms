import { describe, expect, it } from "vitest"
import { addDaysISO, hourInSaoPaulo, todayInSaoPaulo } from "@/lib/time"

describe("todayInSaoPaulo", () => {
  it("usa o fuso de São Paulo (UTC-3), não o UTC", () => {
    expect(todayInSaoPaulo(new Date("2026-10-08T02:30:00Z"))).toBe("2026-10-07")
  })

  it("às 22h30 de São Paulo ainda é o dia anterior ao do UTC", () => {
    expect(todayInSaoPaulo(new Date("2026-10-13T01:30:00Z"))).toBe("2026-10-12")
  })
})

describe("hourInSaoPaulo", () => {
  it("converte o meio-dia UTC para 9h", () => {
    expect(hourInSaoPaulo(new Date("2026-10-12T12:00:00Z"))).toBe(9)
  })

  it("atravessa a meia-noite do UTC", () => {
    expect(hourInSaoPaulo(new Date("2026-10-13T01:30:00Z"))).toBe(22)
  })

  it("devolve 0 (e não 24) à meia-noite de São Paulo", () => {
    expect(hourInSaoPaulo(new Date("2026-10-12T03:00:00Z"))).toBe(0)
  })
})

describe("addDaysISO", () => {
  it("soma dias atravessando o fim do ano", () => {
    expect(addDaysISO("2026-12-31", 2)).toBe("2027-01-02")
  })
})
