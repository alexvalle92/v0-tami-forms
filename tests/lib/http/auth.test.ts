import { describe, expect, it } from "vitest"
import { isBearerAuthorized } from "@/lib/http/auth"

const T = "segredo-do-cron-1234567890"

describe("isBearerAuthorized", () => {
  it("aceita o token correto com prefixo Bearer", () => {
    expect(isBearerAuthorized("Bearer " + T, T)).toBe(true)
  })

  it("rejeita token errado", () => {
    expect(isBearerAuthorized("Bearer outro-token", T)).toBe(false)
  })

  it("rejeita header ausente", () => {
    expect(isBearerAuthorized(null, T)).toBe(false)
  })

  it("rejeita token sem o prefixo Bearer", () => {
    expect(isBearerAuthorized(T, T)).toBe(false)
  })

  it("rejeita token de tamanho diferente sem lançar", () => {
    expect(() => isBearerAuthorized("Bearer x", T)).not.toThrow()
    expect(isBearerAuthorized("Bearer x", T)).toBe(false)
  })

  it("não autoriza quando o token esperado é vazio (fail closed)", () => {
    expect(isBearerAuthorized("Bearer ", "")).toBe(false)
    expect(isBearerAuthorized(null, "")).toBe(false)
  })
})
