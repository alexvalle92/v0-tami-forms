import { describe, expect, it } from "vitest"
import { buildUserData, sha256Hex } from "@/lib/meta/user-data"

describe("sha256Hex", () => {
  it("devolve o SHA-256 em hexadecimal minúsculo", () => {
    expect(sha256Hex("test@example.com")).toBe("973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b")
  })
})

describe("buildUserData", () => {
  it("sem dados, devolve só o país com hash", () => {
    expect(buildUserData({})).toEqual({ country: [sha256Hex("br")] })
  })

  it("e-mail: tira espaços e põe em minúsculas antes do hash", () => {
    expect(buildUserData({ email: "  Test@Example.COM " }).em).toEqual([sha256Hex("test@example.com")])
  })

  it.each([
    ["(11) 98765-4321", "5511987654321"],
    ["5511987654321", "5511987654321"],
    ["1198765432", "551198765432"],
    ["+55 11 98765-4321", "5511987654321"],
  ])("telefone %s vira %s antes do hash", (raw, normalized) => {
    expect(buildUserData({ phone: raw }).ph).toEqual([sha256Hex(normalized)])
  })

  it("telefone com tamanho inválido é descartado", () => {
    expect(buildUserData({ phone: "123" }).ph).toBeUndefined()
    expect(buildUserData({ phone: "551198765432109" }).ph).toBeUndefined()
  })

  it("nome composto: primeiro nome em fn e último sobrenome em ln, sem acento e em minúsculas", () => {
    const u = buildUserData({ name: "  Maria José da Silva " })
    expect(u.fn).toEqual([sha256Hex("maria")])
    expect(u.ln).toEqual([sha256Hex("silva")])
  })

  it("nome de uma palavra só gera fn e não gera ln, e o acento sai", () => {
    const u = buildUserData({ name: "Ângela" })
    expect(u.fn).toEqual([sha256Hex("angela")])
    expect(u.ln).toBeUndefined()
  })

  it("external_id vai em minúsculas e com hash", () => {
    expect(buildUserData({ externalId: " ABC-1 " }).external_id).toEqual([sha256Hex("abc-1")])
  })

  it("ip, user agent, fbp e fbc vão sem hash", () => {
    const u = buildUserData({ ip: "1.2.3.4", userAgent: "UA-X", fbp: "fb.1.1.2", fbc: "fb.1.1.abc" })
    expect(u).toMatchObject({
      client_ip_address: "1.2.3.4",
      client_user_agent: "UA-X",
      fbp: "fb.1.1.2",
      fbc: "fb.1.1.abc",
    })
  })

  it("campos nulos, vazios ou só com espaços são omitidos", () => {
    const u = buildUserData({ email: "   ", phone: "", name: null, externalId: null, ip: null, userAgent: "", fbp: null, fbc: "" })
    expect(u).toEqual({ country: [sha256Hex("br")] })
  })
})
