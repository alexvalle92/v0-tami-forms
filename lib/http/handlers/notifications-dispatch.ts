import { z } from "zod"
import { isBearerAuthorized } from "@/lib/http/auth"
import { readJsonBody } from "@/lib/http/read-json"
import type { Logger } from "@/lib/log"
import type { DispatchNotification } from "@/lib/services/dispatch-notification"
import { safeErrorMessage } from "@/lib/services/last-error"

export const DISPATCH_MAX_BODY_BYTES = 4 * 1024
const DISPATCH_MAX_IDS = 10

const bodySchema = z
  .object({ notificationIds: z.array(z.string().min(1).max(64)).min(1).max(DISPATCH_MAX_IDS) })
  .strict()

const notOk = (status: number) => Response.json({ ok: false }, { status })

/**
 * POST /api/notifications/dispatch (§7.4 do spec do PlanA): o PlanA pede o envio imediato de
 * mensagens que gravou em `notifications` (hoje, `password_reset`). Responde 202 na hora e envia
 * depois da resposta, uma por vez, com o mesmo serviço do job (lock, tentativas, backoff e alerta).
 * Id inexistente ou que não está `pending` é ignorado pelo serviço. Nada do corpo vai para o log.
 */
export function createNotificationsDispatchHandler(d: {
  token: string
  dispatchNotification: DispatchNotification
  defer: (fn: () => Promise<void>) => void
  log: Logger
}): (req: Request) => Promise<Response> {
  return async function handleNotificationsDispatch(req) {
    if (!isBearerAuthorized(req.headers.get("authorization"), d.token)) return notOk(401)

    const body = await readJsonBody(req, DISPATCH_MAX_BODY_BYTES)
    if (!body.ok) return notOk(400)
    const parsed = bodySchema.safeParse(body.value)
    if (!parsed.success) return notOk(400)

    const { notificationIds } = parsed.data
    d.defer(async () => {
      for (const notificationId of notificationIds) {
        try {
          await d.dispatchNotification(notificationId)
        } catch (err) {
          d.log.error("notifications.dispatch.error", { notificationId, message: safeErrorMessage(err) })
        }
      }
    })
    return Response.json({ ok: true }, { status: 202 })
  }
}
