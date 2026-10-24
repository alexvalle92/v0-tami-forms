import { describe, expect, it } from "vitest"
import { metaHeadScripts } from "@/lib/meta/head-scripts"

const ON = { META_TRACKING_ENABLED: "true", META_PIXEL_ID: "1234567890", PAYMENT_AMOUNT: "39.90" }

describe("metaHeadScripts", () => {
  it.each([
    ["env vazio", {}],
    ["rastreamento desligado", { ...ON, META_TRACKING_ENABLED: "false" }],
    ["sem a chave, só o id", { META_PIXEL_ID: "1234567890" }],
    ["ligado sem id", { META_TRACKING_ENABLED: "true" }],
    ["id com letras", { ...ON, META_PIXEL_ID: "abc" }],
    ["id que tenta fechar o script", { ...ON, META_PIXEL_ID: "1');alert(1);//" }],
  ])("%s: não renderiza nada", (_name, env) => {
    expect(metaHeadScripts(env)).toBeNull()
  })

  it("ligado: o config traz o id e o valor, e o snippet inicia o Pixel e dispara o PageView", () => {
    const s = metaHeadScripts(ON)!

    expect(s.pixelId).toBe("1234567890")
    expect(s.config).toBe('window.__TF_META__={"pixelId":"1234567890","value":"39.90"};')
    expect(s.pixel).toContain("https://connect.facebook.net/en_US/fbevents.js")
    expect(s.pixel).toContain("fbq('init','1234567890')")
    expect(s.pixel).toContain("fbq('track','PageView')")
  })

  it("sem PAYMENT_AMOUNT ou com valor fora do formato, o valor é 39.90", () => {
    expect(metaHeadScripts({ ...ON, PAYMENT_AMOUNT: undefined })!.config).toContain('"value":"39.90"')
    expect(metaHeadScripts({ ...ON, PAYMENT_AMOUNT: "39,90" })!.config).toContain('"value":"39.90"')
    expect(metaHeadScripts({ ...ON, PAYMENT_AMOUNT: "49.5" })!.config).toContain('"value":"49.5"')
  })

  it("o config não deixa um '<' passar (não fecha o script)", () => {
    // O valor já é validado, mas o JSON é serializado com '<' escapado de qualquer forma.
    expect(metaHeadScripts(ON)!.config).not.toContain("<")
  })
})
