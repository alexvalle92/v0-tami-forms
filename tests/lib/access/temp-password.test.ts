import { describe, expect, it } from "vitest"
import { deriveTempPassword } from "@/lib/access/temp-password"

const ID = "5c5c73f0-325c-414c-b007-ca7b2471b8be"

describe("deriveTempPassword", () => {
  it("vetores fixos", () => {
    expect(deriveTempPassword("s".repeat(32), ID)).toBe("SWSC8VWD8T")
    expect(deriveTempPassword("s".repeat(32), "00000000-0000-4000-8000-000000000001")).toBe("UKAMSUGHTA")
    expect(deriveTempPassword("t".repeat(32), ID)).toBe("D5TZDT93C3")
  })

  it("10 caracteres do alfabeto, sem 0, 1, I e O", () => {
    expect(deriveTempPassword("s".repeat(32), ID)).toMatch(/^[2-9A-HJ-NP-Z]{10}$/)
  })

  it("é determinística para o mesmo segredo e paciente", () => {
    expect(deriveTempPassword("s".repeat(32), ID)).toBe(deriveTempPassword("s".repeat(32), ID))
  })
})
