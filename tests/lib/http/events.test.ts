import { describe, expect, it } from "vitest"
import { EVENTS_MAX_BODY_BYTES, createEventsHandler } from "@/lib/http/handlers/events"
import type { FunnelEventRow, FunnelSessionPatch } from "@/lib/db/repos/types"
import type { Logger } from "@/lib/log"

const URL_EVENTS = "http://localhost/api/events"
const SESSION = "6f1c2b0e-8a4d-4e0b-9a55-3a1f6c1d7b10"
const NOW = new Date("2026-10-24T12:00:00.000Z")
const IPHONE_UA =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1"

type LogLine = { level: string; event: string; fields?: Record<string, unknown> }

function fakeLog(): Logger & { lines: LogLine[] } {
  const lines: LogLine[] = []
  const at = (level: string) => (event: string, fields?: Record<string, unknown>) => {
    lines.push({ level, event, fields })
  }
  return { lines, info: at("info"), warn: at("warn"), error: at("error") }
}

type Call = { session: FunnelSessionPatch; events: FunnelEventRow[]; now: Date }

function setup(opts: { limiter?: { hit(k: string): boolean }; fail?: Error } = {}) {
  const calls: Call[] = []
  const hits: string[] = []
  const log = fakeLog()
  const handler = createEventsHandler({
    analytics: {
      async recordBatch(session, events, now) {
        if (opts.fail) throw opts.fail
        calls.push({ session, events, now })
      },
    },
    rateLimiter: opts.limiter ?? {
      hit(k) {
        hits.push(k)
        return true
      },
    },
    log,
    now: () => NOW,
  })
  return { handler, calls, hits, log }
}

function post(body: string, headers: Record<string, string> = {}): Request {
  return new Request(URL_EVENTS, {
    method: "POST",
    headers: { "content-type": "application/json", "user-agent": IPHONE_UA, ...headers },
    body,
  })
}

function batchBody(events: unknown[] = [stepView()]) {
  return JSON.stringify({ sessionId: SESSION, events })
}

function stepView(ts: string = NOW.toISOString()) {
  return { event: "step_view", ts, step: 0, stepSlug: "faixa_etaria" }
}

describe("POST /api/events", () => {
  it("lote válido com UA de iPhone → 204 sem corpo e uma gravação com deviceType mobile", async () => {
    const { handler, calls } = setup()
    const res = await handler(post(batchBody()))
    expect(res.status).toBe(204)
    expect(await res.text()).toBe("")
    expect(calls).toHaveLength(1)
    expect(calls[0].session.device.deviceType).toBe("mobile")
    expect(calls[0].session.sessionId).toBe(SESSION)
    expect(calls[0].events).toHaveLength(1)
    expect(calls[0].now).toEqual(NOW)
  })

  it("limite estourado → 429, log.warn e nada gravado", async () => {
    const { handler, calls, log } = setup({ limiter: { hit: () => false } })
    const res = await handler(post(batchBody()))
    expect(res.status).toBe(429)
    expect(log.lines).toEqual([{ level: "warn", event: "events.rate_limited", fields: undefined }])
    expect(calls).toHaveLength(0)
  })

  it("corpo com 16 KB + 1 byte → 413", async () => {
    const { handler, calls, log } = setup()
    const res = await handler(post("x".repeat(EVENTS_MAX_BODY_BYTES + 1)))
    expect(res.status).toBe(413)
    expect(log.lines).toEqual([{ level: "warn", event: "events.bad_body", fields: { status: 413 } }])
    expect(calls).toHaveLength(0)
  })

  it("JSON quebrado → 400", async () => {
    const { handler, calls, log } = setup()
    const res = await handler(post("{nao e json"))
    expect(res.status).toBe(400)
    expect(log.lines).toEqual([{ level: "warn", event: "events.bad_body", fields: { status: 400 } }])
    expect(calls).toHaveLength(0)
  })

  it("lote inválido → 400 com issues e nenhum valor recebido nos logs", async () => {
    const { handler, calls, log } = setup()
    const bad = [{ event: "step_answer", ts: NOW.toISOString(), step: 999, stepSlug: "faixa_etaria", durationMs: 10, answer: "segredo-da-resposta" }]
    const res = await handler(post(batchBody(bad)))
    expect(res.status).toBe(400)
    expect(await res.text()).toBe("")
    expect(calls).toHaveLength(0)
    expect(log.lines).toHaveLength(1)
    expect(log.lines[0].event).toBe("events.invalid")
    expect(log.lines[0].fields).toHaveProperty("issues")
    const dump = JSON.stringify(log.lines)
    expect(dump).not.toContain(SESSION)
    expect(dump).not.toContain("segredo-da-resposta")
  })

  it("UA de bot → 204 sem gravar", async () => {
    const { handler, calls } = setup()
    const res = await handler(post(batchBody(), { "user-agent": "Googlebot/2.1 (+http://www.google.com/bot.html)" }))
    expect(res.status).toBe(204)
    expect(calls).toHaveLength(0)
  })

  it("falha na gravação → 204 e log.error com a mensagem", async () => {
    const { handler, log } = setup({ fail: new Error("banco fora do ar") })
    const res = await handler(post(batchBody()))
    expect(res.status).toBe(204)
    expect(log.lines).toEqual([{ level: "error", event: "events.record_failed", fields: { message: "banco fora do ar" } }])
  })

  describe("relógio do cliente", () => {
    async function clientTs(ts: string) {
      const { handler, calls } = setup()
      const res = await handler(post(batchBody([stepView(ts)])))
      expect(res.status).toBe(204)
      return calls[0].events[0].clientTs
    }

    it("ts que não é data → now", async () => {
      expect(await clientTs("não é data")).toEqual(NOW)
    })

    it("ts 25 h antes de now → now", async () => {
      expect(await clientTs(new Date(NOW.getTime() - 25 * 3_600_000).toISOString())).toEqual(NOW)
    })

    it("ts 25 h depois de now → now", async () => {
      expect(await clientTs(new Date(NOW.getTime() + 25 * 3_600_000).toISOString())).toEqual(NOW)
    })

    it("ts 1 h antes de now → mantido", async () => {
      const ts = new Date(NOW.getTime() - 3_600_000)
      expect(await clientTs(ts.toISOString())).toEqual(ts)
    })
  })

  it("o IP de x-forwarded-for vai para o limiter e não para a gravação", async () => {
    const { handler, calls, hits } = setup()
    await handler(post(batchBody(), { "x-forwarded-for": "203.0.113.7, 10.0.0.1" }))
    expect(hits).toEqual(["203.0.113.7"])
    expect(JSON.stringify(calls)).not.toContain("203.0.113.7")
  })
})
