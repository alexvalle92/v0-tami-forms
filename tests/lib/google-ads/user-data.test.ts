import { describe, expect, it } from "vitest"
import { sha256Hex } from "@/lib/meta/user-data"
import {
  buildGoogleUserIdentifiers,
  normalizeGoogleEmail,
  normalizeGooglePhoneE164,
} from "@/lib/google-ads/user-data"

describe("normalizeGoogleEmail", () => {
  it("tira espaços e passa para minúsculas", () => {
    expect(normalizeGoogleEmail("  Ana.Souza@Example.COM ")).toBe("ana.souza@example.com")
  })

  it("em gmail.com e googlemail.com tira os pontos e o sufixo depois do +", () => {
    expect(normalizeGoogleEmail("cloudy.sanfrancisco+shopping@gmail.com")).toBe("cloudysanfrancisco@gmail.com")
    expect(normalizeGoogleEmail("A.na+x@GoogleMail.com")).toBe("ana@googlemail.com")
  })

  it("nos outros domínios mantém pontos e o +", () => {
    expect(normalizeGoogleEmail("user.name+NYC@Example.com")).toBe("user.name+nyc@example.com")
  })

  it.each(["", "sem-arroba", "@example.com", "ana@", "+tag@gmail.com", null, undefined])("%j vira nulo", (raw) => {
    expect(normalizeGoogleEmail(raw)).toBeNull()
  })

  it("bate com o exemplo de hash da documentação do Google", () => {
    expect(sha256Hex(normalizeGoogleEmail("john.smith@EXAMPLE.COM")!).toUpperCase()).toBe(
      "8E621E3D0368631D263D07A351FA8D34FBA0D17C15FBCDEC11A5F58008D022A0",
    )
  })
})

describe("normalizeGooglePhoneE164", () => {
  it("põe +55 no número brasileiro com DDD, com ou sem máscara", () => {
    expect(normalizeGooglePhoneE164("(44) 9 9165-1250")).toBe("+5544991651250")
    expect(normalizeGooglePhoneE164("4433334444")).toBe("+554433334444")
  })

  it("número que já tem o 55 só ganha o +", () => {
    expect(normalizeGooglePhoneE164("5544991651250")).toBe("+5544991651250")
    expect(normalizeGooglePhoneE164("+55 44 3333-4444")).toBe("+554433334444")
  })

  it.each(["", "123", "991651250", "12345678901234", null])("%j vira nulo", (raw) => {
    expect(normalizeGooglePhoneE164(raw)).toBeNull()
  })
})

describe("buildGoogleUserIdentifiers", () => {
  it("devolve e-mail e telefone com SHA-256 em hex, sem o valor em texto", () => {
    const ids = buildGoogleUserIdentifiers({ email: "Ana@Gmail.com", phone: "44991651250" })

    expect(ids).toEqual([
      { emailAddress: sha256Hex("ana@gmail.com") },
      { phoneNumber: sha256Hex("+5544991651250") },
    ])
    expect(JSON.stringify(ids)).not.toContain("ana")
    expect(JSON.stringify(ids)).not.toContain("99165")
  })

  it("omite o que não normaliza", () => {
    expect(buildGoogleUserIdentifiers({ email: "invalido", phone: "" })).toEqual([])
    expect(buildGoogleUserIdentifiers({ phone: "11999990000" })).toEqual([{ phoneNumber: sha256Hex("+5511999990000") }])
  })
})
