import { parseAsaasEvent } from "@/lib/asaas/webhook-event"
import type { PaymentEventInput } from "@/lib/db/repos/types"
import { isTokenAuthorized } from "@/lib/http/auth"
import { readJsonBody } from "@/lib/http/read-json"
import type { Logger } from "@/lib/log"
import type { NoticeAdmin } from "@/lib/services/alert-admin"
import type { HandledEvent } from "@/lib/services/handle-asaas-event"
import { safeErrorMessage } from "@/lib/services/last-error"

export const WEBHOOK_MAX_BODY_BYTES = 256 * 1024

const ok = () => Response.json({ ok: true })
const notOk = (status: number) => Response.json({ ok: false }, { status })

/**
 * POST /api/webhooks/asaas (spec §5): token → corpo (256 KB) → evento → tratamento → resposta → trabalho adiado.
 *  - Sem token válido: 401.
 *  - Corpo ilegível, grande demais ou fora do formato: 200 (reenviar não resolveria, e 15 falhas
 *    seguidas fazem o Asaas pausar a fila da conta).
 *  - Falha ao tratar o evento: 500, o único caso em que o app pede reenvio.
 * Depois da resposta: roda a geração do plano e envia o aviso ao admin. Nunca loga o token nem o corpo.
 */
export function createAsaasWebhookHandler(d: {
  token: string
  handleEvent: (e: PaymentEventInput) => Promise<HandledEvent>
  runPlanGeneration: (generationId: string) => Promise<void>
  noticeAdmin: NoticeAdmin
  defer: (fn: () => Promise<void>) => void
  log: Logger
}): (req: Request) => Promise<Response> {
  return async function handleAsaasWebhook(req) {
    if (!isTokenAuthorized(req.headers.get("asaas-access-token"), d.token)) {
      d.log.warn("webhook.asaas.unauthorized")
      return notOk(401)
    }

    const body = await readJsonBody(req, WEBHOOK_MAX_BODY_BYTES)
    if (!body.ok) {
      d.log.warn("webhook.asaas.unreadable", { reason: body.status === 413 ? "too_large" : "invalid_body" })
      return ok()
    }

    const event = parseAsaasEvent(body.value)
    if (!event) {
      d.log.warn("webhook.asaas.unreadable", { reason: "not_an_event" })
      return ok()
    }

    const ref = { eventId: event.eventId, event: event.event, paymentId: event.externalReference }

    let handled: HandledEvent
    try {
      handled = await d.handleEvent(event)
    } catch (err) {
      d.log.error("webhook.asaas.failed", { ...ref, message: safeErrorMessage(err) })
      return notOk(500)
    }

    const { pendingGeneration, notice } = handled
    if (pendingGeneration) {
      const generationId = pendingGeneration.id
      d.defer(async () => {
        try {
          await d.runPlanGeneration(generationId)
        } catch (err) {
          d.log.error("webhook.asaas.generation_failed", { ...ref, message: safeErrorMessage(err) })
        }
      })
    }
    if (notice) {
      d.defer(async () => {
        try {
          await d.noticeAdmin(notice)
        } catch (err) {
          d.log.error("webhook.asaas.notice_failed", { ...ref, message: safeErrorMessage(err) })
        }
      })
    }
    return ok()
  }
}
