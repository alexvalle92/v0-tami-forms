import { describe, expect, it } from "vitest"
import { parseSubmitGoogleAds } from "@/lib/google-ads/attribution"

describe("parseSubmitGoogleAds", () => {
  it("aceita gclid, gbraid e wbraid válidos", () => {
    expect(parseSubmitGoogleAds({ gclid: "Cj0KCQiA-abc_123", gbraid: "0AAAAAB", wbraid: "CkA-x" })).toEqual({
      gclid: "Cj0KCQiA-abc_123",
      gbraid: "0AAAAAB",
      wbraid: "CkA-x",
    })
  })

  it("descarta identificador fora do formato e campo desconhecido, mantendo os válidos", () => {
    expect(
      parseSubmitGoogleAds({ gclid: "abc def", gbraid: "ok_1", wbraid: 123, extra: "x", fbclid: "y" }),
    ).toEqual({ gbraid: "ok_1" })
    expect(parseSubmitGoogleAds({ gclid: "a".repeat(256) })).toBeUndefined()
  })

  it.each([undefined, null, "gclid", [], {}, { gclid: "" }, { gclid: "<script>" }])(
    "%j: sem identificador válido não há atribuição",
    (raw) => {
      expect(parseSubmitGoogleAds(raw)).toBeUndefined()
    },
  )
})
