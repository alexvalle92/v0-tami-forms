import { describe, expect, it } from "vitest"
import { createMetaEventsHandler, META_EVENTS_MAX_BODY_BYTES } from "@/lib/http/handlers/meta-events"
import type { Logger } from "@/lib/log"
import type { CapiEvent, CapiResult, MetaCapiClient } from "@/lib/meta/capi"
import { sha256Hex } from "@/lib/meta/user-data"

const URL_EVENTS = "http://localhost/api/meta/events"
const NOW = new Date("2026-10-24T12:00:00.000Z")
const SID = "123e4567-e89b-42d3-a456-426614174000"
const PAGE = "https://quiz.example.com/?utm_source=fb"
const EMAIL = "ana.secreta@example.com"
const UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1"

type LogLine = { level: string; event: string; fields?: Record<string, unknown> }

function fakeLog(): Logger & { lines: LogLine[] } {
  const lines: LogLine[] = []
  const at = (level: string) => (event: string, fields?: Record<string, unknown>) => {
    lines.push({ level, event, fields })
  }
  return { lines, info: at("info"), warn: at("warn"), error: at("error") }
}

function setup(
  opts: { enabled?: boolean; result?: CapiResult | (() => Promise<CapiResult>); limiter?: { hit(k: string): boolean } } = {},
) {
  const sent: CapiEvent[][] = []
  const hits: string[] = []
  const deferred: (() => Promise<void>)[] = []
  const log = fakeLog()
  const capi: MetaCapiClient = {
    async send(events) {
      sent.push(events)
      const r = opts.result ?? { kind: "ok" as const }
      return typeof r === "function" ? r() : r
    },
  }
  const handler = createMetaEventsHandler({
    capi: opts.enabled === false ? null : capi,
    amount: "39.90",
    rateLimiter: opts.limiter ?? {
      hit(k) {
        hits.push(k)
        return true
      },
    },
    defer: (fn) => {
      deferred.push(fn)
    },
    log,
    now: () => NOW,
  })
  return { handler, sent, hits, deferred, log }
}

function post(body: string, headers: Record<string, string> = {}): Request {
  return new Request(URL_EVENTS, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": UA, "x-forwarded-for": "1.2.3.4, 10.0.0.1", ...headers },
    body,
  })
}

const lead = (over: Record<string, unknown> = {}) =>
  JSON.stringify({ eventName: "Lead", eventId: `lead:${SID}`, eventSourceUrl: PAGE, externalId: SID, email: EMAIL, ...over })

describe("POST /api/meta/events", () => {
  it("rastreamento desligado: 204 e nada é enviado", async () => {
    const t = setup({ enabled: false })
    const res = await t.handler(post(lead()))
    expect(res.status).toBe(204)
    expect(t.deferred).toEqual([])
    expect(t.hits).toEqual([])
  })

  it("evento válido: 204 na hora e o envio à Meta acontece depois, com IP, User-Agent e e-mail com hash", async () => {
    const t = setup()
    const res = await t.handler(post(lead()))

    expect(res.status).toBe(204)
    expect(await res.text()).toBe("")
    expect(t.hits).toEqual(["1.2.3.4"])
    expect(t.deferred).toHaveLength(1)
    expect(t.sent).toEqual([]) // só depois da resposta

    await t.deferred[0]()
    expect(t.sent).toHaveLength(1)
    const event = t.sent[0][0]
    expect(event).toMatchObject({
      event_name: "Lead",
      event_id: `lead:${SID}`,
      event_time: Math.floor(NOW.getTime() / 1000),
      action_source: "website",
      event_source_url: PAGE,
      user_data: {
        em: [sha256Hex(EMAIL)],
        external_id: [sha256Hex(SID)],
        client_ip_address: "1.2.3.4",
        client_user_agent: UA,
      },
    })
    expect(event).not.toHaveProperty("custom_data")
  })

  it("InitiateCheckout leva o valor do servidor, mesmo que o corpo traga outro", async () => {
    const t = setup()
    await t.handler(
      post(lead({ eventName: "InitiateCheckout", eventId: `ic:${SID}`, value: 9999, custom_data: { value: 1 } })),
    )
    await t.deferred[0]()

    expect(t.sent[0][0].custom_data).toEqual({ value: 39.9, currency: "BRL" })
  })

  it("sem x-forwarded-for, o user_data não leva IP", async () => {
    const t = setup()
    await t.handler(post(lead(), { "x-forwarded-for": "" }))
    await t.deferred[0]()
    expect(t.sent[0][0].user_data).not.toHaveProperty("client_ip_address")
  })

  it("robô (User-Agent de crawler): 204 e nada é enviado", async () => {
    const t = setup()
    const res = await t.handler(post(lead(), { "user-agent": "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)" }))
    expect(res.status).toBe(204)
    expect(t.deferred).toEqual([])
  })

  it.each([
    ["corpo grande demais", "x".repeat(META_EVENTS_MAX_BODY_BYTES + 1), "too_large"],
    ["JSON inválido", "{", "bad_body"],
    ["evento fora da lista", lead({ eventName: "Purchase", eventId: `purchase:${SID}` }), "schema"],
    ["prefixo do eventId errado", lead({ eventId: `vc:${SID}` }), "schema"],
  ])("%s: 204, nada é enviado e o log não leva o conteúdo", async (_name, body, reason) => {
    const t = setup()
    const res = await t.handler(post(body))

    expect(res.status).toBe(204)
    expect(t.deferred).toEqual([])
    expect(t.log.lines).toEqual([{ level: "warn", event: "meta.events.invalid", fields: { reason } }])
    expect(JSON.stringify(t.log.lines)).not.toContain(EMAIL)
  })

  it("limite por IP estourado: 204, nada é enviado e o log só diz o motivo", async () => {
    const t = setup({ limiter: { hit: () => false } })
    const res = await t.handler(post(lead()))

    expect(res.status).toBe(204)
    expect(t.deferred).toEqual([])
    expect(t.log.lines).toEqual([{ level: "warn", event: "meta.events.rate_limited", fields: undefined }])
  })

  it.each([
    ["retryable", { kind: "retryable", status: 503, message: "Meta 503" } as CapiResult, { eventName: "Lead", kind: "retryable", status: 503 }],
    ["fatal", { kind: "fatal", status: 400, message: "Meta 400" } as CapiResult, { eventName: "Lead", kind: "fatal", status: 400 }],
  ])("resposta %s da Meta vira aviso no log, sem repetir", async (_name, result, fields) => {
    const t = setup({ result })
    await t.handler(post(lead()))
    await t.deferred[0]()

    expect(t.sent).toHaveLength(1)
    expect(t.log.lines).toEqual([{ level: "warn", event: "meta.events.send_failed", fields }])
  })

  it("envio que lança também só vira aviso", async () => {
    const t = setup({
      result: async () => {
        throw new Error("rede caiu")
      },
    })
    await t.handler(post(lead()))
    await expect(t.deferred[0]()).resolves.toBeUndefined()

    expect(t.log.lines).toEqual([
      { level: "warn", event: "meta.events.send_failed", fields: { eventName: "Lead", kind: "error", message: "rede caiu" } },
    ])
  })
})
