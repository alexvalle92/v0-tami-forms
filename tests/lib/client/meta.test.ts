import { describe, expect, it, vi } from "vitest"
import { META_FBC_KEY, META_SENT_KEY, createMeta, type MetaDeps } from "@/lib/client/meta"

const SID = "123e4567-e89b-42d3-a456-426614174000"
const HREF = "https://quiz.example.com/?utm_source=fb"
const CONFIG = { pixelId: "1234567890", value: "39.90" }

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: vi.fn((k: string) => data.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => void data.set(k, v)),
    data,
  }
}

function setup(over: Partial<MetaDeps> = {}) {
  const fbq = vi.fn()
  const blobs: Blob[] = []
  const sendBeacon = vi.fn((_url: string, data: Blob) => {
    blobs.push(data)
    return true
  })
  const fetchImpl = vi.fn(async () => new Response(null, { status: 204 })) as unknown as typeof fetch & ReturnType<typeof vi.fn>
  const deps: MetaDeps = {
    config: CONFIG,
    sessionId: SID,
    cookie: "",
    search: "",
    href: HREF,
    storage: memoryStorage(),
    fbq,
    fetchImpl,
    sendBeacon,
    nowMs: () => 1_700_000_000_000,
    ...over,
  }
  return { meta: createMeta(deps), fbq, blobs, sendBeacon, fetchImpl, deps }
}

const bodyOf = async (blob: Blob) => JSON.parse(await blob.text()) as Record<string, unknown>
const bodyOfFetch = (fetchImpl: ReturnType<typeof vi.fn>) =>
  JSON.parse((fetchImpl.mock.calls[0][1] as { body: string }).body) as Record<string, unknown>

describe("createMeta: rastreamento ligado ou desligado", () => {
  it("sem config, nada é chamado e não há atribuição", () => {
    const t = setup({ config: null })

    expect(t.meta.trackingAllowed()).toBe(false)
    t.meta.event("Lead", { user: { email: "ana@example.com" } })

    expect(t.fbq).not.toHaveBeenCalled()
    expect(t.sendBeacon).not.toHaveBeenCalled()
    expect(t.fetchImpl).not.toHaveBeenCalled()
    expect(t.meta.attributionForSubmit()).toBeUndefined()
  })

  it("com config, o rastreamento está liberado", () => {
    expect(setup().meta.trackingAllowed()).toBe(true)
  })

  it("sem id de sessão não envia nenhum evento (sem event_id estável não há deduplicação)", () => {
    const t = setup({ sessionId: "" })
    t.meta.event("ViewContent", {})
    t.meta.event("InitiateCheckout", { user: { email: "ana@example.com" } })

    expect(t.fbq).not.toHaveBeenCalled()
    expect(t.sendBeacon).not.toHaveBeenCalled()
    expect(t.fetchImpl).not.toHaveBeenCalled()
  })
})

describe("createMeta: eventos", () => {
  it("ViewContent chama o fbq com o eventID e espelha no servidor", async () => {
    const t = setup()
    t.meta.event("ViewContent", {})

    expect(t.fbq).toHaveBeenCalledWith("track", "ViewContent", {}, { eventID: `vc:${SID}` })
    expect(t.sendBeacon).toHaveBeenCalledWith("/api/meta/events", expect.any(Blob))
    expect(t.blobs[0].type).toBe("application/json")
    expect(await bodyOf(t.blobs[0])).toEqual({
      eventName: "ViewContent",
      eventId: `vc:${SID}`,
      eventSourceUrl: HREF,
      externalId: SID,
    })
  })

  it("InitiateCheckout leva valor e moeda no Pixel e os dados do usuário no espelho", async () => {
    const t = setup()
    t.meta.event("InitiateCheckout", {
      user: { email: "  ana@example.com ", phone: "(44) 9 9165-1250", name: "Ana Souza" },
    })

    expect(t.fbq).toHaveBeenCalledWith(
      "track",
      "InitiateCheckout",
      { value: 39.9, currency: "BRL" },
      { eventID: `ic:${SID}` },
    )
    expect(await bodyOf(t.blobs[0])).toMatchObject({
      eventName: "InitiateCheckout",
      eventId: `ic:${SID}`,
      email: "ana@example.com",
      phone: "(44) 9 9165-1250",
      name: "Ana Souza",
    })
  })

  it("dados do usuário vazios não vão no espelho", async () => {
    const t = setup()
    t.meta.event("Lead", { user: { email: "   ", phone: "", name: undefined } })

    const body = await bodyOf(t.blobs[0])
    expect(body).not.toHaveProperty("email")
    expect(body).not.toHaveProperty("phone")
    expect(body).not.toHaveProperty("name")
  })

  it("o mesmo evento só sai uma vez, mesmo depois de recarregar a página", () => {
    const storage = memoryStorage()
    const first = setup({ storage })
    first.meta.event("ViewContent", {})
    first.meta.event("ViewContent", {})
    expect(first.fbq).toHaveBeenCalledTimes(1)
    expect(first.sendBeacon).toHaveBeenCalledTimes(1)
    expect(JSON.parse(storage.data.get(META_SENT_KEY)!)).toEqual([`vc:${SID}`])

    const reloaded = setup({ storage })
    reloaded.meta.event("ViewContent", {})
    expect(reloaded.fbq).not.toHaveBeenCalled()
    expect(reloaded.sendBeacon).not.toHaveBeenCalled()
  })

  it("eventos diferentes da mesma sessão saem cada um uma vez", () => {
    const t = setup()
    t.meta.event("ViewContent", {})
    t.meta.event("Lead", { user: { email: "ana@example.com" } })
    expect(t.fbq).toHaveBeenCalledTimes(2)
  })

  it("se o sendBeacon recusar, cai para o fetch com keepalive", async () => {
    const t = setup({ sendBeacon: () => false })
    t.meta.event("Lead", { user: { email: "ana@example.com" } })

    expect(t.fetchImpl).toHaveBeenCalledTimes(1)
    const [url, init] = t.fetchImpl.mock.calls[0] as [string, RequestInit]
    expect(url).toBe("/api/meta/events")
    expect(init).toMatchObject({ method: "POST", keepalive: true, headers: { "Content-Type": "application/json" } })
    expect(bodyOfFetch(t.fetchImpl)).toMatchObject({ eventName: "Lead", eventId: `lead:${SID}` })
  })

  it("sem sendBeacon usa o fetch", () => {
    const t = setup({ sendBeacon: null })
    t.meta.event("ViewContent", {})
    expect(t.fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("sem fbq (bloqueador) o espelho no servidor ainda sai", () => {
    const t = setup({ fbq: null })
    t.meta.event("ViewContent", {})
    expect(t.sendBeacon).toHaveBeenCalledTimes(1)
  })
})

describe("createMeta: fbp e fbc", () => {
  it("lê _fbp e _fbc dos cookies, vai no espelho e na atribuição do envio", async () => {
    const t = setup({ cookie: "a=1; _fbp=fb.1.1700000000000.123456; _fbc=fb.1.1700000000000.AbC_d-e; b=2" })

    t.meta.event("ViewContent", {})

    expect(await bodyOf(t.blobs[0])).toMatchObject({ fbp: "fb.1.1700000000000.123456", fbc: "fb.1.1700000000000.AbC_d-e" })
    expect(t.meta.attributionForSubmit()).toEqual({
      fbp: "fb.1.1700000000000.123456",
      fbc: "fb.1.1700000000000.AbC_d-e",
      eventSourceUrl: HREF,
      externalId: SID,
    })
  })

  it("cookie fora do formato é ignorado", () => {
    const t = setup({ cookie: "_fbp=lixo; _fbc=" })
    expect(t.meta.attributionForSubmit()).toEqual({ eventSourceUrl: HREF, externalId: SID })
  })

  it("sem _fbc, monta a partir do fbclid da URL e guarda para as próximas etapas", () => {
    const storage = memoryStorage()
    const t = setup({ search: "?utm_source=fb&fbclid=XYZ-1_a", storage })

    expect(t.meta.attributionForSubmit()?.fbc).toBe("fb.1.1700000000000.XYZ-1_a")
    expect(storage.data.get(META_FBC_KEY)).toBe("fb.1.1700000000000.XYZ-1_a")

    const nextPage = setup({ search: "", storage, nowMs: () => 1_800_000_000_000 })
    expect(nextPage.meta.attributionForSubmit()?.fbc).toBe("fb.1.1700000000000.XYZ-1_a")
  })

  it("o cookie _fbc vale mais que o fbclid da URL", () => {
    const t = setup({ cookie: "_fbc=fb.1.1600000000000.fromcookie", search: "?fbclid=XYZ" })
    expect(t.meta.attributionForSubmit()?.fbc).toBe("fb.1.1600000000000.fromcookie")
  })

  it("novo fbclid na mesma sessão substitui o guardado", () => {
    const storage = memoryStorage({ [META_FBC_KEY]: "fb.1.1600000000000.old" })
    const t = setup({ search: "?fbclid=new", storage })
    expect(t.meta.attributionForSubmit()?.fbc).toBe("fb.1.1700000000000.new")
  })

  it("fbclid com caracteres estranhos é ignorado", () => {
    const t = setup({ search: "?fbclid=a%20b<script>" })
    expect(t.meta.attributionForSubmit()).not.toHaveProperty("fbc")
  })
})

describe("createMeta: nunca lança", () => {
  it("storage, fbq, sendBeacon e fetch que lançam não escapam, e o evento ainda é tentado", () => {
    const boom = () => {
      throw new Error("boom")
    }
    const storage = { getItem: vi.fn(boom), setItem: vi.fn(boom) }
    const t = setup({
      storage,
      fbq: vi.fn(boom),
      sendBeacon: vi.fn(boom),
      fetchImpl: vi.fn(boom) as unknown as typeof fetch,
    })

    expect(() => t.meta.event("InitiateCheckout", { user: { email: "ana@example.com" } })).not.toThrow()
    expect(() => t.meta.attributionForSubmit()).not.toThrow()
    expect(t.deps.fbq).toHaveBeenCalled()
  })

  it("fetch que rejeita não gera rejeição não tratada", async () => {
    const t = setup({ sendBeacon: null, fetchImpl: vi.fn(async () => Promise.reject(new Error("rede"))) as unknown as typeof fetch })
    expect(() => t.meta.event("ViewContent", {})).not.toThrow()
    await Promise.resolve()
  })

  it("com storage bloqueado a deduplicação vale só na memória da página", () => {
    const boom = () => {
      throw new Error("bloqueado")
    }
    const t = setup({ storage: { getItem: boom, setItem: boom } })
    t.meta.event("ViewContent", {})
    t.meta.event("ViewContent", {})
    expect(t.fbq).toHaveBeenCalledTimes(1)
  })
})
