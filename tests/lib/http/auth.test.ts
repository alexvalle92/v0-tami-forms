import { describe, expect, it } from "vitest"
import { isBearerAuthorized, isTokenAuthorized } from "@/lib/http/auth"

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

describe("isTokenAuthorized", () => {
  it("autoriza o valor igual ao token", () => {
    expect(isTokenAuthorized(T, T)).toBe(true)
  })

  it("não autoriza valor diferente, de outro tamanho ou com o prefixo Bearer", () => {
    expect(isTokenAuthorized("outro-token", T)).toBe(false)
    expect(isTokenAuthorized("x", T)).toBe(false)
    expect(isTokenAuthorized("Bearer " + T, T)).toBe(false)
  })

  it("não autoriza header ausente", () => {
    expect(isTokenAuthorized(null, T)).toBe(false)
  })

  it("não autoriza quando o token esperado é vazio (fail closed)", () => {
    expect(isTokenAuthorized("", "")).toBe(false)
    expect(isTokenAuthorized(null, "")).toBe(false)
    expect(isTokenAuthorized("qualquer", "")).toBe(false)
  })
})
