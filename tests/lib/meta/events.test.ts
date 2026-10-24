import { describe, expect, it } from "vitest"
import { parseBrowserMetaEvent, parseSubmitMeta } from "@/lib/meta/events"

const UUID = "123e4567-e89b-42d3-a456-426614174000"
const URL_OK = "https://quiz.example.com/?utm_source=fb"

const base = { eventName: "Lead", eventId: `lead:${UUID}`, eventSourceUrl: URL_OK }

describe("parseBrowserMetaEvent", () => {
  it("aceita um evento mínimo", () => {
    expect(parseBrowserMetaEvent(base)).toEqual(base)
  })

  it("aceita os três nomes, cada um com o seu prefixo de eventId", () => {
    expect(parseBrowserMetaEvent({ ...base, eventName: "ViewContent", eventId: `vc:${UUID}` })).not.toBeNull()
    expect(parseBrowserMetaEvent({ ...base, eventName: "InitiateCheckout", eventId: `ic:${UUID}` })).not.toBeNull()
  })

  it.each([
    ["Purchase não vem do navegador", { ...base, eventName: "Purchase", eventId: `purchase:${UUID}` }],
    ["prefixo do eventId não bate com o evento", { ...base, eventId: `vc:${UUID}` }],
    ["eventId sem UUID", { ...base, eventId: "lead:abc" }],
    ["URL que não é http(s)", { ...base, eventSourceUrl: "javascript:alert(1)" }],
    ["URL com 501 caracteres", { ...base, eventSourceUrl: `https://a.b/${"x".repeat(501 - 12)}` }],
    ["sem eventSourceUrl", { eventName: "Lead", eventId: `lead:${UUID}` }],
    ["corpo que não é objeto", "Lead"],
    ["corpo nulo", null],
  ])("rejeita: %s", (_, body) => {
    expect(parseBrowserMetaEvent(body)).toBeNull()
  })

  it("aceita os campos opcionais válidos", () => {
    const full = {
      ...base,
      externalId: UUID,
      fbp: "fb.1.1700000000000.123456",
      fbc: "fb.1.1700000000000.abc",
      email: "ana@gmail.com",
      phone: "(44) 9 9165-1250",
      name: "Ana Souza",
    }
    expect(parseBrowserMetaEvent(full)).toEqual(full)
  })

  it("campo opcional inválido vira ausente e não derruba o evento", () => {
    const result = parseBrowserMetaEvent({
      ...base,
      externalId: "x",
      fbp: "abc",
      fbc: `fb.1.1.${"y".repeat(500)}`,
      email: "não-é-email",
      phone: "1".repeat(21),
      name: "n".repeat(201),
    })
    expect(result).toStrictEqual(base)
  })
})

describe("parseSubmitMeta", () => {
  it("devolve undefined quando não há meta ou ele não é objeto", () => {
    expect(parseSubmitMeta(undefined)).toBeUndefined()
    expect(parseSubmitMeta(null)).toBeUndefined()
    expect(parseSubmitMeta("x")).toBeUndefined()
    expect(parseSubmitMeta([])).toBeUndefined()
  })

  it("devolve undefined quando nenhum campo é válido", () => {
    expect(parseSubmitMeta({})).toBeUndefined()
    expect(parseSubmitMeta({ fbp: "x".repeat(2000), externalId: "não-uuid" })).toBeUndefined()
  })

  it("mantém só os campos válidos", () => {
    expect(
      parseSubmitMeta({ fbp: "fb.1.123.456", externalId: "não-uuid", eventSourceUrl: "https://a.b/", fbc: "lixo" }),
    ).toStrictEqual({ fbp: "fb.1.123.456", eventSourceUrl: "https://a.b/" })
  })

  it("aceita todos os campos válidos", () => {
    const all = { externalId: UUID, fbp: "fb.1.1.2", fbc: "fb.1.1.abc", eventSourceUrl: URL_OK }
    expect(parseSubmitMeta(all)).toStrictEqual(all)
  })
})
