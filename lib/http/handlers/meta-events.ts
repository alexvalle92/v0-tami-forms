import { parseUserAgent } from "@/lib/analytics/user-agent"
import { clientIp } from "@/lib/http/handlers/submit-quiz"
import { readJsonBody } from "@/lib/http/read-json"
import type { Logger } from "@/lib/log"
import type { CapiEvent, MetaCapiClient } from "@/lib/meta/capi"
import { parseBrowserMetaEvent } from "@/lib/meta/events"
import { buildUserData } from "@/lib/meta/user-data"
import { safeErrorMessage } from "@/lib/services/last-error"

export const META_EVENTS_MAX_BODY_BYTES = 4 * 1024

const noContent = () => new Response(null, { status: 204 })

/**
 * POST /api/meta/events (spec Meta §6): espelha na API de Conversões o evento que o Pixel disparou no
 * navegador, com o mesmo `event_id`, para a Meta deduplicar. Rastreamento ligado → limite por IP → corpo
 * (4 KB) → validação → 204 → envio adiado, em uma tentativa (o Pixel já cobre a perda). Responde 204 em
 * qualquer caso: o navegador não reage a erro de rastreamento e 4xx só faz ruído no console. O valor do
 * InitiateCheckout vem do servidor, nunca do corpo. Nada do que foi recebido (nem o IP) vai para o log.
 */
export function createMetaEventsHandler(d: {
  /** `null` = rastreamento desligado. */
  capi: MetaCapiClient | null
  /** `PAYMENT_AMOUNT`, ex.: "39.90". */
  amount: string
  rateLimiter: { hit(k: string): boolean }
  defer: (fn: () => Promise<void>) => void
  log: Logger
  now: () => Date
}): (req: Request) => Promise<Response> {
  const capi = d.capi
  return async function handleMetaEvents(req) {
    try {
      if (!capi) return noContent()

      const ip = clientIp(req)
      if (!d.rateLimiter.hit(ip)) {
        d.log.warn("meta.events.rate_limited")
        return noContent()
      }

      const body = await readJsonBody(req, META_EVENTS_MAX_BODY_BYTES)
      if (!body.ok) {
        d.log.warn("meta.events.invalid", { reason: body.status === 413 ? "too_large" : "bad_body" })
        return noContent()
      }

      const event = parseBrowserMetaEvent(body.value)
      if (!event) {
        d.log.warn("meta.events.invalid", { reason: "schema" })
        return noContent()
      }

      const userAgent = req.headers.get("user-agent")
      if (parseUserAgent(userAgent).isBot) return noContent()

      const capiEvent: CapiEvent = {
        event_name: event.eventName,
        event_time: Math.floor(d.now().getTime() / 1000),
        event_id: event.eventId,
        action_source: "website",
        event_source_url: event.eventSourceUrl,
        user_data: buildUserData({
          email: event.email,
          phone: event.phone,
          name: event.name,
          externalId: event.externalId,
          ip: ip === "unknown" ? null : ip,
          userAgent: userAgent?.slice(0, 500),
          fbp: event.fbp,
          fbc: event.fbc,
        }),
        ...(event.eventName === "InitiateCheckout"
          ? { custom_data: { value: Number(d.amount), currency: "BRL" as const } }
          : {}),
      }

      d.defer(async () => {
        try {
          const result = await capi.send([capiEvent])
          if (result.kind !== "ok") {
            d.log.warn("meta.events.send_failed", {
              eventName: event.eventName,
              kind: result.kind,
              ...(result.status !== undefined ? { status: result.status } : {}),
            })
          }
        } catch (err) {
          d.log.warn("meta.events.send_failed", {
            eventName: event.eventName,
            kind: "error",
            message: safeErrorMessage(err),
          })
        }
      })
      return noContent()
    } catch (err) {
      d.log.error("meta.events.unexpected_error", { message: safeErrorMessage(err) })
      return noContent()
    }
  }
}
