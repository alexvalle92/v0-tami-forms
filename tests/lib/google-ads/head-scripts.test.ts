import { describe, expect, it } from "vitest"
import { googleAdsHeadScripts } from "@/lib/google-ads/head-scripts"

const ON = { GOOGLE_ADS_TRACKING_ENABLED: "true", GOOGLE_ADS_TAG_ID: "AW-123456789", PAYMENT_AMOUNT: "39.90" }

describe("googleAdsHeadScripts", () => {
  it.each([
    ["env vazio", {}],
    ["rastreamento desligado", { ...ON, GOOGLE_ADS_TRACKING_ENABLED: "false" }],
    ["sem a chave, só a tag", { GOOGLE_ADS_TAG_ID: "AW-123456789" }],
    ["ligado sem tag", { GOOGLE_ADS_TRACKING_ENABLED: "true" }],
    ["tag do GA4 (G-) no lugar da do Ads", { ...ON, GOOGLE_ADS_TAG_ID: "G-ABC123" }],
    ["tag que tenta fechar o script", { ...ON, GOOGLE_ADS_TAG_ID: "AW-1');alert(1);//" }],
  ])("%s: não renderiza nada", (_name, env) => {
    expect(googleAdsHeadScripts(env)).toBeNull()
  })

  it("ligado: carrega o gtag.js da tag e configura a tag (page_view e cookie do clique)", () => {
    const s = googleAdsHeadScripts(ON)!

    expect(s.tagId).toBe("AW-123456789")
    expect(s.src).toBe("https://www.googletagmanager.com/gtag/js?id=AW-123456789")
    expect(s.gtag).toContain("window.dataLayer=window.dataLayer||[]")
    expect(s.gtag).toContain("gtag('config','AW-123456789')")
    expect(s.config).toBe('window.__TF_GADS__={"tagId":"AW-123456789","value":"39.90"};')
  })

  it("os rótulos de conversão entram no config; rótulo fora do formato é ignorado sem derrubar a tag", () => {
    const s = googleAdsHeadScripts({
      ...ON,
      GOOGLE_ADS_LEAD_LABEL: "AbC-lead_1",
      GOOGLE_ADS_CHECKOUT_LABEL: "x'</script>",
    })!

    expect(s.config).toContain('"leadLabel":"AbC-lead_1"')
    expect(s.config).not.toContain("checkoutLabel")
    expect(s.config).not.toContain("<")
  })

  it("sem PAYMENT_AMOUNT ou com valor fora do formato, o valor é 39.90", () => {
    expect(googleAdsHeadScripts({ ...ON, PAYMENT_AMOUNT: undefined })!.config).toContain('"value":"39.90"')
    expect(googleAdsHeadScripts({ ...ON, PAYMENT_AMOUNT: "39,90" })!.config).toContain('"value":"39.90"')
  })
})
