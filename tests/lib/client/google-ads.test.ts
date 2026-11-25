import { describe, expect, it, vi } from "vitest"
import { GADS_CLICK_KEY, GADS_SENT_KEY, createGoogleAds, type GoogleAdsDeps } from "@/lib/client/google-ads"

const SID = "123e4567-e89b-42d3-a456-426614174000"
const CONFIG = { tagId: "AW-123456789", value: "39.90", leadLabel: "lead-LBL", checkoutLabel: "ic-LBL" }

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: vi.fn((k: string) => data.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => void data.set(k, v)),
    data,
  }
}

function setup(over: Partial<GoogleAdsDeps> = {}) {
  const gtag = vi.fn()
  const storage = memoryStorage()
  const deps: GoogleAdsDeps = { config: CONFIG, sessionId: SID, cookie: "", search: "", storage, gtag, ...over }
  return { ads: createGoogleAds(deps), gtag, storage: (deps.storage ?? storage) as ReturnType<typeof memoryStorage> }
}

describe("createGoogleAds: ligado ou desligado", () => {
  it("sem config, nada é chamado e não há atribuição, mesmo com gclid na URL", () => {
    const t = setup({ config: null, search: "?gclid=abc" })

    expect(t.ads.trackingAllowed()).toBe(false)
    t.ads.captureClick()
    t.ads.conversion("Lead")

    expect(t.gtag).not.toHaveBeenCalled()
    expect(t.storage.setItem).not.toHaveBeenCalled()
    expect(t.ads.attributionForSubmit()).toBeUndefined()
  })
})

describe("createGoogleAds: conversões", () => {
  it("Lead chama o gtag com o send_to do rótulo e o transaction_id da sessão, sem valor", () => {
    const t = setup()
    t.ads.conversion("Lead")

    expect(t.gtag).toHaveBeenCalledWith("event", "conversion", {
      send_to: "AW-123456789/lead-LBL",
      transaction_id: `lead:${SID}`,
    })
  })

  it("InitiateCheckout leva o valor do config em BRL", () => {
    const t = setup()
    t.ads.conversion("InitiateCheckout")

    expect(t.gtag).toHaveBeenCalledWith("event", "conversion", {
      send_to: "AW-123456789/ic-LBL",
      transaction_id: `ic:${SID}`,
      value: 39.9,
      currency: "BRL",
    })
  })

  it("a mesma conversão sai uma vez por sessão, inclusive em outra instância (recarga)", () => {
    const t = setup()
    t.ads.conversion("Lead")
    t.ads.conversion("Lead")
    expect(t.gtag).toHaveBeenCalledTimes(1)
    expect(JSON.parse(t.storage.data.get(GADS_SENT_KEY)!)).toEqual([`lead:${SID}`])

    const reload = createGoogleAds({ config: CONFIG, sessionId: SID, storage: t.storage, gtag: t.gtag })
    reload.conversion("Lead")
    expect(t.gtag).toHaveBeenCalledTimes(1)
  })

  it("sem rótulo configurado, sem sessão ou sem gtag, não envia (e não marca como enviada)", () => {
    const noLabel = setup({ config: { tagId: "AW-1", value: "39.90" } })
    noLabel.ads.conversion("Lead")
    expect(noLabel.gtag).not.toHaveBeenCalled()

    const noSession = setup({ sessionId: "" })
    noSession.ads.conversion("Lead")
    expect(noSession.gtag).not.toHaveBeenCalled()

    const noGtag = setup({ gtag: null })
    noGtag.ads.conversion("Lead")
    expect(noGtag.storage.data.has(GADS_SENT_KEY)).toBe(false)
  })

  it("gtag que lança não escapa", () => {
    const t = setup({
      gtag: () => {
        throw new Error("gtag quebrado")
      },
    })
    expect(() => t.ads.conversion("InitiateCheckout")).not.toThrow()
  })
})

describe("createGoogleAds: clique no anúncio", () => {
  it("captura o gclid da URL, guarda na sessão e manda no envio do quiz", () => {
    const t = setup({ search: "?utm_source=google&gclid=Cj0KCQ-abc_1" })
    t.ads.captureClick()

    expect(JSON.parse(t.storage.data.get(GADS_CLICK_KEY)!)).toEqual({ gclid: "Cj0KCQ-abc_1" })
    expect(t.ads.attributionForSubmit()).toEqual({ gclid: "Cj0KCQ-abc_1" })
  })

  it("nas etapas seguintes (URL sem gclid), usa o guardado na sessão", () => {
    const storage = memoryStorage({ [GADS_CLICK_KEY]: JSON.stringify({ gbraid: "0AAAA-b" }) })
    const t = setup({ storage, search: "?utm_source=google" })
    expect(t.ads.attributionForSubmit()).toEqual({ gbraid: "0AAAA-b" })
  })

  it("um clique novo na URL substitui o guardado por inteiro", () => {
    const storage = memoryStorage({ [GADS_CLICK_KEY]: JSON.stringify({ gclid: "velho" }) })
    const t = setup({ storage, search: "?wbraid=novo-w" })
    expect(t.ads.attributionForSubmit()).toEqual({ wbraid: "novo-w" })
    expect(JSON.parse(storage.data.get(GADS_CLICK_KEY)!)).toEqual({ wbraid: "novo-w" })
  })

  it("sem URL nem sessão, usa os cookies do gtag (_gcl_aw e _gcl_gb)", () => {
    const t = setup({ cookie: "_ga=GA1.1.1; _gcl_aw=GCL.1700000000.Cj0-cookie; _gcl_gb=GCL.1700000000.0AAAA-gb" })
    expect(t.ads.attributionForSubmit()).toEqual({ gclid: "Cj0-cookie", gbraid: "0AAAA-gb" })
  })

  it("identificador fora do formato é ignorado", () => {
    const t = setup({ search: "?gclid=%3Cscript%3E", cookie: "_gcl_aw=GCL.1.<x>" })
    expect(t.ads.attributionForSubmit()).toBeUndefined()
  })

  it("storage bloqueado: o clique vale na memória da página", () => {
    const blocked = {
      getItem: () => {
        throw new Error("blocked")
      },
      setItem: () => {
        throw new Error("blocked")
      },
    }
    let search = "?gclid=abc"
    const ads = createGoogleAds({
      config: CONFIG,
      sessionId: SID,
      storage: blocked,
      gtag: vi.fn(),
      get search() {
        return search
      },
    })
    ads.captureClick()
    search = ""
    expect(ads.attributionForSubmit()).toEqual({ gclid: "abc" })
  })
})
