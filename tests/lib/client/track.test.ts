import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import {
  TRACK_FLUSH_DELAY_MS,
  TRACK_MAX_BYTES,
  TRACK_MAX_PER_REQUEST,
  TRACK_MAX_QUEUE,
  TRACK_SESSION_KEY,
  createTracker,
  getTracker,
} from "@/lib/client/track"
import { parseEventsBatch, type FunnelEventInput } from "@/lib/analytics/events"

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
const EXISTING_ID = "3f1c2d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f"

type Body = { sessionId: string; events: Array<Record<string, unknown>> }

function memoryStorage(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial))
  return {
    getItem: vi.fn((k: string) => data.get(k) ?? null),
    setItem: vi.fn((k: string, v: string) => void data.set(k, v)),
    data,
  }
}

function okFetch() {
  return vi.fn(async () => new Response("{}", { status: 200 })) as unknown as typeof fetch & ReturnType<typeof vi.fn>
}

function bodies(fetchImpl: typeof fetch): Body[] {
  const mock = fetchImpl as unknown as ReturnType<typeof vi.fn>
  return mock.mock.calls.map((c) => JSON.parse((c[1] as { body: string }).body) as Body)
}

const view = (step = 1): FunnelEventInput => ({ event: "step_view", step, stepSlug: "genero" })

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(new Date("2026-10-24T12:00:00.000Z"))
})

afterEach(() => {
  vi.useRealTimers()
})

describe("createTracker: sessão", () => {
  it("storage vazio: cria o id, grava e envia session_start com utm, referrerHost e viewport", () => {
    const storage = memoryStorage()
    const fetchImpl = okFetch()
    const t = createTracker({
      storage,
      fetchImpl,
      search: "?utm_source=ig&utm_campaign=c1&x=1",
      referrer: "https://www.instagram.com/some/path?q=1",
      ownHost: "quiz.exemplo.com",
      viewport: { w: 390, h: 844 },
    })

    expect(t.sessionId).toMatch(UUID)
    expect(storage.data.get(TRACK_SESSION_KEY)).toBe(t.sessionId)

    vi.advanceTimersByTime(TRACK_FLUSH_DELAY_MS)
    const [body] = bodies(fetchImpl)
    expect(body.sessionId).toBe(t.sessionId)
    expect(body.events).toEqual([
      {
        event: "session_start",
        ts: "2026-10-24T12:00:00.000Z",
        utm: { source: "ig", campaign: "c1" },
        referrerHost: "www.instagram.com",
        viewport: { w: 390, h: 844 },
      },
    ])
  })

  it("omite referrerHost quando é o próprio host, vazio ou inválido", () => {
    for (const referrer of ["https://quiz.exemplo.com/outra", "", "não é url"]) {
      const fetchImpl = okFetch()
      createTracker({ storage: memoryStorage(), fetchImpl, referrer, ownHost: "quiz.exemplo.com" })
      vi.advanceTimersByTime(TRACK_FLUSH_DELAY_MS)
      const [body] = bodies(fetchImpl)
      expect(body.events[0]).not.toHaveProperty("referrerHost")
      expect(body.events[0]).not.toHaveProperty("viewport")
      expect(body.events[0].utm).toEqual({})
    }
  })

  it("lê os cinco parâmetros utm", () => {
    const fetchImpl = okFetch()
    createTracker({
      storage: memoryStorage(),
      fetchImpl,
      search: "?utm_source=a&utm_medium=b&utm_campaign=c&utm_content=d&utm_term=e",
    })
    vi.advanceTimersByTime(TRACK_FLUSH_DELAY_MS)
    expect(bodies(fetchImpl)[0].events[0].utm).toEqual({
      source: "a",
      medium: "b",
      campaign: "c",
      content: "d",
      term: "e",
    })
  })

  it("o session_start é aceito pelo contrato do servidor", () => {
    const fetchImpl = okFetch()
    createTracker({
      storage: memoryStorage(),
      fetchImpl,
      search: "?utm_source=ig",
      referrer: "https://l.instagram.com/",
      ownHost: "quiz.exemplo.com",
      viewport: { w: 390, h: 844 },
    })
    vi.advanceTimersByTime(TRACK_FLUSH_DELAY_MS)
    expect(parseEventsBatch(bodies(fetchImpl)[0]).ok).toBe(true)
  })

  it("viewport inválido (0, NaN, negativo, acima de 10.000) é omitido e o lote continua válido", () => {
    const invalid = [
      { w: 0, h: 0 },
      { w: Number.NaN, h: 800 },
      { w: 390, h: Number.NaN },
      { w: -1, h: 800 },
      { w: 10_001, h: 800 },
      { w: Number.POSITIVE_INFINITY, h: 800 },
    ]
    for (const viewport of invalid) {
      const fetchImpl = okFetch()
      createTracker({ storage: memoryStorage(), fetchImpl, viewport })
      vi.advanceTimersByTime(TRACK_FLUSH_DELAY_MS)
      const [body] = bodies(fetchImpl)
      expect(body.events[0]).not.toHaveProperty("viewport")
      expect(parseEventsBatch(body).ok).toBe(true)
    }
  })

  it("id guardado que não é UUID: gera outro, grava e conta como sessão nova com session_start", () => {
    for (const stale of ["abc", "undefined", "3f1c2d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5fXX", " "]) {
      const storage = memoryStorage({ [TRACK_SESSION_KEY]: stale })
      const fetchImpl = okFetch()
      const t = createTracker({ storage, fetchImpl })

      expect(t.sessionId).toMatch(UUID)
      expect(storage.data.get(TRACK_SESSION_KEY)).toBe(t.sessionId)
      vi.advanceTimersByTime(TRACK_FLUSH_DELAY_MS)
      const [body] = bodies(fetchImpl)
      expect(body.events.map((e) => e.event)).toEqual(["session_start"])
      expect(parseEventsBatch(body).ok).toBe(true)
    }
  })

  it("utm e referrerHost longos são cortados em 100 caracteres e o session_start é enviado", () => {
    const fetchImpl = okFetch()
    const long = "x".repeat(5000)
    createTracker({
      storage: memoryStorage(),
      fetchImpl,
      search: `?utm_source=${long}&utm_medium=${long}&utm_campaign=${long}&utm_content=${long}&utm_term=${long}`,
      referrer: `https://${"h".repeat(150)}.com/`,
      ownHost: "quiz.exemplo.com",
    })
    vi.advanceTimersByTime(TRACK_FLUSH_DELAY_MS)

    const [body] = bodies(fetchImpl)
    const start = body.events[0] as { utm: Record<string, string>; referrerHost: string }
    expect(body.events).toHaveLength(1)
    expect(start.utm).toEqual({
      source: "x".repeat(100),
      medium: "x".repeat(100),
      campaign: "x".repeat(100),
      content: "x".repeat(100),
      term: "x".repeat(100),
    })
    expect(start.referrerHost).toHaveLength(100)
    expect(parseEventsBatch(body).ok).toBe(true)
  })

  it("storage com id: reaproveita e não manda session_start", () => {
    const storage = memoryStorage({ [TRACK_SESSION_KEY]: EXISTING_ID })
    const fetchImpl = okFetch()
    const t = createTracker({ storage, fetchImpl })

    expect(t.sessionId).toBe(EXISTING_ID)
    expect(storage.setItem).not.toHaveBeenCalled()
    vi.advanceTimersByTime(TRACK_FLUSH_DELAY_MS * 5)
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("storage.getItem que lança: id em memória e o track continua funcionando", () => {
    const storage = {
      getItem: vi.fn(() => {
        throw new Error("bloqueado")
      }),
      setItem: vi.fn(() => {
        throw new Error("bloqueado")
      }),
    }
    const fetchImpl = okFetch()
    const t = createTracker({ storage, fetchImpl })
    expect(t.sessionId).toMatch(UUID)

    expect(() => t.track(view())).not.toThrow()
    vi.advanceTimersByTime(TRACK_FLUSH_DELAY_MS)
    const [body] = bodies(fetchImpl)
    expect(body.sessionId).toBe(t.sessionId)
    expect(body.events.map((e) => e.event)).toEqual(["session_start", "step_view"])
  })

  it("sem storage (null): id em memória", () => {
    const t = createTracker({ storage: null, fetchImpl: okFetch() })
    expect(t.sessionId).toMatch(UUID)
  })
})

describe("createTracker: fila e envio", () => {
  function tracker(extra: Parameters<typeof createTracker>[0] = {}) {
    const fetchImpl = okFetch()
    const t = createTracker({ storage: memoryStorage({ [TRACK_SESSION_KEY]: EXISTING_ID }), fetchImpl, ...extra })
    return { t, fetchImpl }
  }

  it("três track viram um só fetch depois de 1.000 ms, com ts ISO em cada evento", () => {
    const { t, fetchImpl } = tracker()
    t.track(view(1))
    t.track(view(2))
    t.track(view(3))

    vi.advanceTimersByTime(TRACK_FLUSH_DELAY_MS - 1)
    expect(fetchImpl).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)

    expect(fetchImpl).toHaveBeenCalledTimes(1)
    const call = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0]
    expect(call[0]).toBe("/api/events")
    expect(call[1]).toMatchObject({ method: "POST", headers: { "Content-Type": "application/json" } })
    const [body] = bodies(fetchImpl)
    expect(body.sessionId).toBe(EXISTING_ID)
    expect(body.events).toHaveLength(3)
    for (const e of body.events) expect(e.ts).toBe("2026-10-24T12:00:00.000Z")
    expect(body.events.map((e) => e.step)).toEqual([1, 2, 3])
  })

  it("usa o endpoint informado", () => {
    const { t, fetchImpl } = tracker({ endpoint: "/outro" })
    t.track(view())
    vi.advanceTimersByTime(TRACK_FLUSH_DELAY_MS)
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][0]).toBe("/outro")
  })

  it("30 eventos viram duas requisições (25 + 5)", () => {
    const { t, fetchImpl } = tracker()
    for (let i = 0; i < 30; i++) t.track(view(i % 28))
    vi.advanceTimersByTime(TRACK_FLUSH_DELAY_MS)

    const sent = bodies(fetchImpl)
    expect(sent.map((b) => b.events.length)).toEqual([TRACK_MAX_PER_REQUEST, 5])
  })

  it("25 step_answer com 15 strings de 80 caracteres: nenhum corpo passa de 15.000 bytes e todos são enviados", () => {
    const { t, fetchImpl } = tracker()
    const answer = Array.from({ length: 15 }, (_, i) => String(i % 10).repeat(80))
    for (let i = 0; i < 25; i++) {
      t.track({ event: "step_answer", step: i % 28, stepSlug: "sintomas", durationMs: 1000 + i, answer })
    }
    vi.advanceTimersByTime(TRACK_FLUSH_DELAY_MS)

    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls
    expect(calls.length).toBeGreaterThan(1)
    let total = 0
    for (const c of calls) {
      const raw = (c[1] as { body: string }).body
      expect(new TextEncoder().encode(raw).length).toBeLessThanOrEqual(TRACK_MAX_BYTES)
      const parsed = JSON.parse(raw) as Body
      expect(parsed.events.length).toBeLessThanOrEqual(TRACK_MAX_PER_REQUEST)
      total += parsed.events.length
    }
    expect(total).toBe(25)
    // a ordem é preservada
    const durations = bodies(fetchImpl).flatMap((b) => b.events.map((e) => e.durationMs))
    expect(durations).toEqual(Array.from({ length: 25 }, (_, i) => 1000 + i))
  })

  it("mede bytes e não caracteres (acentos ocupam 2 bytes)", () => {
    const { t, fetchImpl } = tracker()
    const answer = Array.from({ length: 15 }, () => "é".repeat(80))
    for (let i = 0; i < 10; i++) {
      t.track({ event: "step_answer", step: 1, stepSlug: "sintomas", durationMs: i, answer })
    }
    vi.advanceTimersByTime(TRACK_FLUSH_DELAY_MS)
    const calls = (fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls
    let total = 0
    for (const c of calls) {
      const raw = (c[1] as { body: string }).body
      expect(new TextEncoder().encode(raw).length).toBeLessThanOrEqual(TRACK_MAX_BYTES)
      total += (JSON.parse(raw) as Body).events.length
    }
    expect(total).toBe(10)
  })

  it("um evento que sozinho passa de 15.000 bytes é descartado e os outros seguem", () => {
    const { t, fetchImpl } = tracker()
    t.track(view(1))
    t.track({ event: "step_answer", step: 2, stepSlug: "x", durationMs: 1, answer: ["a".repeat(16_000)] })
    t.track(view(3))
    vi.advanceTimersByTime(TRACK_FLUSH_DELAY_MS)

    const events = bodies(fetchImpl).flatMap((b) => b.events)
    expect(events.map((e) => e.step)).toEqual([1, 3])
  })

  it("120 track sem envio: a fila guarda os 100 mais recentes", () => {
    const { t, fetchImpl } = tracker()
    for (let i = 0; i < 120; i++) {
      t.track({ event: "step_answer", step: 1, stepSlug: "x", durationMs: i })
    }
    vi.advanceTimersByTime(TRACK_FLUSH_DELAY_MS)

    const durations = bodies(fetchImpl).flatMap((b) => b.events.map((e) => e.durationMs))
    expect(durations).toHaveLength(TRACK_MAX_QUEUE)
    expect(durations[0]).toBe(20)
    expect(durations[99]).toBe(119)
  })

  it("flush manual envia na hora e o timer pendente não repete o lote", () => {
    const { t, fetchImpl } = tracker()
    t.track(view())
    t.flush()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    vi.advanceTimersByTime(TRACK_FLUSH_DELAY_MS * 2)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("flush com fila vazia não envia nada", () => {
    const { t, fetchImpl } = tracker()
    t.flush()
    t.flush({ beacon: true })
    expect(fetchImpl).not.toHaveBeenCalled()
  })

  it("depois de enviar, novos eventos agendam um novo envio", () => {
    const { t, fetchImpl } = tracker()
    t.track(view(1))
    vi.advanceTimersByTime(TRACK_FLUSH_DELAY_MS)
    t.track(view(2))
    vi.advanceTimersByTime(TRACK_FLUSH_DELAY_MS)
    expect(bodies(fetchImpl).map((b) => b.events.length)).toEqual([1, 1])
  })

  it("usa o setTimer injetado, um só timer por vez", () => {
    const timers: Array<() => void> = []
    const setTimer = vi.fn((fn: () => void) => void timers.push(fn))
    const { t, fetchImpl } = tracker({ setTimer })
    t.track(view(1))
    t.track(view(2))
    expect(setTimer).toHaveBeenCalledTimes(1)
    expect(setTimer).toHaveBeenCalledWith(expect.any(Function), TRACK_FLUSH_DELAY_MS)
    timers[0]()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })
})

describe("createTracker: beacon", () => {
  it("flush({ beacon: true }) usa sendBeacon com Blob application/json", async () => {
    const fetchImpl = okFetch()
    const sendBeacon = vi.fn((_url: string, _data: Blob) => true)
    const t = createTracker({
      storage: memoryStorage({ [TRACK_SESSION_KEY]: EXISTING_ID }),
      fetchImpl,
      sendBeacon,
    })
    t.track(view(4))
    t.flush({ beacon: true })

    expect(fetchImpl).not.toHaveBeenCalled()
    expect(sendBeacon).toHaveBeenCalledTimes(1)
    const [url, blob] = sendBeacon.mock.calls[0]
    expect(url).toBe("/api/events")
    expect(blob).toBeInstanceOf(Blob)
    expect(blob.type).toBe("application/json")
    const body = JSON.parse(await blob.text()) as Body
    expect(body.sessionId).toBe(EXISTING_ID)
    expect(body.events).toHaveLength(1)
  })

  it("sendBeacon devolvendo false: cai para fetch com keepalive", () => {
    const fetchImpl = okFetch()
    const sendBeacon = vi.fn(() => false)
    const t = createTracker({
      storage: memoryStorage({ [TRACK_SESSION_KEY]: EXISTING_ID }),
      fetchImpl,
      sendBeacon,
    })
    t.track(view())
    t.flush({ beacon: true })

    expect(sendBeacon).toHaveBeenCalledTimes(1)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1]).toMatchObject({ keepalive: true })
  })

  it("sendBeacon que lança: cai para fetch com keepalive", () => {
    const fetchImpl = okFetch()
    const sendBeacon = vi.fn(() => {
      throw new Error("x")
    })
    const t = createTracker({
      storage: memoryStorage({ [TRACK_SESSION_KEY]: EXISTING_ID }),
      fetchImpl,
      sendBeacon,
    })
    t.track(view())
    expect(() => t.flush({ beacon: true })).not.toThrow()
    expect(fetchImpl).toHaveBeenCalledTimes(1)
  })

  it("sem sendBeacon: usa fetch com keepalive", () => {
    const fetchImpl = okFetch()
    const t = createTracker({
      storage: memoryStorage({ [TRACK_SESSION_KEY]: EXISTING_ID }),
      fetchImpl,
      sendBeacon: null,
    })
    t.track(view())
    t.flush({ beacon: true })
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect((fetchImpl as unknown as ReturnType<typeof vi.fn>).mock.calls[0][1]).toMatchObject({ keepalive: true })
  })

  it("beacon divide por bytes também: cada Blob respeita o limite", () => {
    const sizes: number[] = []
    const sendBeacon = vi.fn((_u: string, b: Blob) => {
      sizes.push(b.size)
      return true
    })
    const t = createTracker({
      storage: memoryStorage({ [TRACK_SESSION_KEY]: EXISTING_ID }),
      fetchImpl: okFetch(),
      sendBeacon,
    })
    const answer = Array.from({ length: 15 }, () => "z".repeat(80))
    for (let i = 0; i < 25; i++) t.track({ event: "step_answer", step: 1, stepSlug: "s", durationMs: i, answer })
    t.flush({ beacon: true })
    expect(sizes.length).toBeGreaterThan(1)
    for (const s of sizes) expect(s).toBeLessThanOrEqual(TRACK_MAX_BYTES)
  })
})

describe("createTracker: nunca lança", () => {
  it("fetch que rejeita: nada lança e o lote é descartado", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("rede")
    }) as unknown as typeof fetch
    const unhandled = vi.fn()
    process.on("unhandledRejection", unhandled)
    try {
      const t = createTracker({ storage: memoryStorage({ [TRACK_SESSION_KEY]: EXISTING_ID }), fetchImpl })
      t.track(view(1))
      vi.advanceTimersByTime(TRACK_FLUSH_DELAY_MS)
      await vi.advanceTimersByTimeAsync(0)
      t.track(view(2))
      vi.advanceTimersByTime(TRACK_FLUSH_DELAY_MS)
      await vi.advanceTimersByTimeAsync(0)

      expect(bodies(fetchImpl).map((b) => b.events.map((e) => e.step))).toEqual([[1], [2]])
      expect(unhandled).not.toHaveBeenCalled()
    } finally {
      process.off("unhandledRejection", unhandled)
    }
  })

  it("fetchImpl que lança de forma síncrona: nada lança", () => {
    const fetchImpl = vi.fn(() => {
      throw new Error("sync")
    }) as unknown as typeof fetch
    const t = createTracker({ storage: memoryStorage({ [TRACK_SESSION_KEY]: EXISTING_ID }), fetchImpl })
    expect(() => {
      t.track(view())
      vi.advanceTimersByTime(TRACK_FLUSH_DELAY_MS)
      t.track(view())
      t.flush({ beacon: true })
      t.flush()
    }).not.toThrow()
  })

  it("relógio e setTimer que lançam: nada lança", () => {
    const t = createTracker({
      storage: memoryStorage({ [TRACK_SESSION_KEY]: EXISTING_ID }),
      fetchImpl: okFetch(),
      now: () => {
        throw new Error("relógio")
      },
      setTimer: () => {
        throw new Error("timer")
      },
    })
    expect(() => {
      t.track(view())
      t.flush()
    }).not.toThrow()
  })

  it("evento inválido (null) não lança", () => {
    const t = createTracker({ storage: memoryStorage({ [TRACK_SESSION_KEY]: EXISTING_ID }), fetchImpl: okFetch() })
    expect(() => t.track(null as unknown as FunnelEventInput)).not.toThrow()
  })

  it("evento com referência circular não lança nem trava o envio dos demais", () => {
    const fetchImpl = okFetch()
    const t = createTracker({ storage: memoryStorage({ [TRACK_SESSION_KEY]: EXISTING_ID }), fetchImpl })
    const circular: Record<string, unknown> = { event: "step_view", step: 1, stepSlug: "a" }
    circular.self = circular
    expect(() => t.track(circular as unknown as FunnelEventInput)).not.toThrow()
    t.track(view(2))
    expect(() => vi.advanceTimersByTime(TRACK_FLUSH_DELAY_MS)).not.toThrow()
    expect(bodies(fetchImpl).flatMap((b) => b.events.map((e) => e.step))).toEqual([2])
  })
})

describe("getTracker", () => {
  it("fora do navegador devolve um rastreador que não faz nada", () => {
    expect(typeof window).toBe("undefined")
    const t = getTracker()
    expect(() => {
      t.track(view())
      t.flush()
      t.flush({ beacon: true })
    }).not.toThrow()
    expect(typeof t.sessionId).toBe("string")
  })

  async function browserSessionStart(innerWidth: number, innerHeight: number) {
    vi.resetModules()
    const fetchMock = okFetch()
    const store = new Map<string, string>()
    vi.stubGlobal("window", {
      sessionStorage: { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) },
      navigator: {},
      fetch: fetchMock,
      location: { search: "", host: "quiz.exemplo.com" },
      document: { referrer: "" },
      innerWidth,
      innerHeight,
    })
    try {
      const mod = await import("@/lib/client/track")
      mod.getTracker()
      vi.advanceTimersByTime(TRACK_FLUSH_DELAY_MS)
      return bodies(fetchMock)[0]
    } finally {
      vi.unstubAllGlobals()
    }
  }

  it("no navegador, innerWidth/innerHeight válidos entram no session_start", async () => {
    const body = await browserSessionStart(390.4, 844.6)
    expect(body.events[0].viewport).toEqual({ w: 390, h: 845 })
    expect(parseEventsBatch(body).ok).toBe(true)
  })

  it("no navegador, innerWidth/innerHeight 0 ou NaN não geram viewport", async () => {
    for (const [w, h] of [
      [0, 0],
      [Number.NaN, Number.NaN],
      [0.2, 800],
    ]) {
      const body = await browserSessionStart(w, h)
      expect(body.events[0]).not.toHaveProperty("viewport")
      expect(parseEventsBatch(body).ok).toBe(true)
    }
  })
})
