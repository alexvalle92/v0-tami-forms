import { parseEventsBatch, type EventsBatch } from "@/lib/analytics/events"
import { buildRecord } from "@/lib/analytics/record"
import { parseUserAgent } from "@/lib/analytics/user-agent"
import type { AnalyticsRepo } from "@/lib/db/repos/types"
import { clientIp } from "@/lib/http/handlers/submit-quiz"
import { readJsonBody } from "@/lib/http/read-json"
import type { Logger } from "@/lib/log"
import { safeErrorMessage } from "@/lib/services/last-error"

export const EVENTS_MAX_BODY_BYTES = 16 * 1024

const MAX_CLOCK_SKEW_MS = 24 * 60 * 60 * 1000

const noContent = () => new Response(null, { status: 204 })
const failure = (status: number) => new Response(null, { status })

/** `ts` inválido, ou a mais de 24 h de `now`, vira `now` (relógio do aparelho errado). */
function normalizeTs(ts: string, now: Date): string {
  const t = new Date(ts).getTime()
  if (Number.isNaN(t) || Math.abs(t - now.getTime()) > MAX_CLOCK_SKEW_MS) return now.toISOString()
  return ts
}

function withNormalizedTs(batch: EventsBatch, now: Date): EventsBatch {
  return { ...batch, events: batch.events.map((e) => ({ ...e, ts: normalizeTs(e.ts, now) })) }
}

/**
 * POST /api/events (spec §6): rate limit → corpo (16 KB) → validação → User-Agent → gravação.
 * Responde sempre sem corpo; erro de gravação vira 204 porque o navegador não reage a erro de
 * rastreamento. Nada do que foi recebido (nem o IP) é logado ou gravado.
 */
export function createEventsHandler(d: {
  analytics: Pick<AnalyticsRepo, "recordBatch">
  rateLimiter: { hit(k: string): boolean }
  log: Logger
  now: () => Date
}): (req: Request) => Promise<Response> {
  return async function handleEvents(req) {
    try {
      if (!d.rateLimiter.hit(clientIp(req))) {
        d.log.warn("events.rate_limited")
        return failure(429)
      }

      const body = await readJsonBody(req, EVENTS_MAX_BODY_BYTES)
      if (!body.ok) {
        d.log.warn("events.bad_body", { status: body.status })
        return failure(body.status)
      }

      const parsed = parseEventsBatch(body.value)
      if (!parsed.ok) {
        // `issues` só tem caminho e mensagem, nunca os valores recebidos.
        d.log.warn("events.invalid", { issues: parsed.issues })
        return failure(400)
      }

      const device = parseUserAgent(req.headers.get("user-agent"))
      if (device.isBot) return noContent()

      const now = d.now()
      const { session, events } = buildRecord(withNormalizedTs(parsed.value, now), device, now)
      try {
        await d.analytics.recordBatch(session, events, now)
      } catch (err) {
        d.log.error("events.record_failed", { message: safeErrorMessage(err) })
      }
      return noContent()
    } catch (err) {
      d.log.error("events.unexpected_error", { message: safeErrorMessage(err) })
      return noContent()
    }
  }
}
