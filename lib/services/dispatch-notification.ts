import type { NotificationRepo, NotificationView } from "@/lib/db/repos/types"
import { HttpError } from "@/lib/http/retry"
import { MAX_NOTIFICATION_ATTEMPTS, jobBackoffMs } from "@/lib/jobs/backoff"
import type { Logger } from "@/lib/log"
import type { EmailSender } from "@/lib/notify/email"
import { PAYMENT_LINK_TITLE, renderPaymentLink, toWhatsAppParts } from "@/lib/notify/templates"
import type { WhatsAppSender } from "@/lib/notify/whatsapp"
import type { AlertAdmin } from "./alert-admin"
import { safeErrorMessage, toLastError } from "./last-error"

export type DispatchResult = "sent" | "retry_scheduled" | "failed" | "busy" | "skipped"

export type DispatchNotification = (id: string) => Promise<DispatchResult>

const LOCK_TTL_MS = 120_000
const WHATSAPP_PART_GAP_MS = 3000

/**
 * Envia uma notificação enfileirada (e-mail ou WhatsApp). O WhatsApp é retomável: cada parte enviada
 * é gravada (`parts_sent`), então uma nova tentativa continua da próxima parte e não reenvia as anteriores.
 * Falhas viram nova tentativa com backoff; a definitiva (erro permanente ou 5ª tentativa) alerta o admin.
 */
export function createDispatchNotification(d: {
  notifications: NotificationRepo
  email: EmailSender
  whatsapp: WhatsAppSender
  alertAdmin: AlertAdmin
  log: Logger
  now: () => Date
  sleep: (ms: number) => Promise<void>
}): DispatchNotification {
  async function recordFailure(
    n: NotificationView,
    partsSent: number,
    step: string,
    err: unknown,
  ): Promise<{ result: DispatchResult; lockCleared: boolean }> {
    const attempts = n.attempts + 1
    const failed = (err instanceof HttpError && !err.transient) || attempts >= MAX_NOTIFICATION_ATTEMPTS
    const at = d.now()
    const error = toLastError(step, err, attempts, at)
    // Nunca logar `err.body`, destinatário, nome do paciente nem o texto da mensagem.
    const fields = {
      notificationId: n.id,
      channel: n.channel,
      step,
      httpStatus: error.httpStatus,
      attempt: attempts,
      partsSent,
      message: error.message,
    }

    try {
      await d.notifications.markFailure(n.id, {
        attempts,
        nextAttemptAt: failed ? null : new Date(at.getTime() + jobBackoffMs(attempts)),
        failed,
        error,
      })
    } catch (recordErr) {
      d.log.error("notification.dispatch.record_failure_failed", {
        ...fields,
        recordMessage: safeErrorMessage(recordErr),
      })
      return { result: "retry_scheduled", lockCleared: false }
    }

    if (!failed) {
      d.log.warn("notification.dispatch.retry_scheduled", fields)
      return { result: "retry_scheduled", lockCleared: true }
    }

    d.log.error("notification.dispatch.failed", fields)
    try {
      await d.alertAdmin({ kind: "notification", id: n.id, patientName: n.patientName, error })
    } catch (alertErr) {
      d.log.error("notification.dispatch.alert_failed", {
        notificationId: n.id,
        message: safeErrorMessage(alertErr),
      })
    }
    return { result: "failed", lockCleared: true }
  }

  return async function dispatchNotification(id) {
    const first = await d.notifications.get(id)
    if (!first || first.status !== "pending") return "skipped"

    if (!(await d.notifications.tryLock(id, LOCK_TTL_MS))) return "busy"

    // `markSent` e `markFailure` soltam o lock; em qualquer outro caminho o `finally` o solta.
    let lockHeld = true
    try {
      // Outro processo pode ter terminado entre o `get` e o lock: relê para não reenviar partes nem recontar tentativas.
      const n = await d.notifications.get(id)
      if (!n || n.status !== "pending") return "skipped"

      let step = `notify.${n.channel}`
      let partsSent = n.partsSent
      try {
        if (!n.paymentUrl) throw new Error("payment without url")
        const message = renderPaymentLink({ name: n.patientName, link: n.paymentUrl })

        if (n.channel === "email") {
          await d.email.send({
            to: n.recipient,
            subject: message.subject,
            html: message.html,
            text: message.text,
          })
        } else {
          const parts = toWhatsAppParts(PAYMENT_LINK_TITLE, message.html)
          const start = n.partsSent
          for (let i = start; i < parts.length; i++) {
            if (i > start) await d.sleep(WHATSAPP_PART_GAP_MS)
            step = "notify.whatsapp"
            await d.whatsapp.sendText(n.recipient, parts[i])
            step = "db.mark_part_sent"
            await d.notifications.markPartSent(id, i + 1)
            partsSent = i + 1
          }
        }

        step = "db.mark_sent"
        await d.notifications.markSent(id)
        lockHeld = false
        d.log.info("notification.dispatch.sent", { notificationId: id, channel: n.channel, partsSent })
        return "sent"
      } catch (err) {
        const { result, lockCleared } = await recordFailure(n, partsSent, step, err)
        if (lockCleared) lockHeld = false
        return result
      }
    } finally {
      if (lockHeld) {
        try {
          await d.notifications.unlock(id)
        } catch (err) {
          d.log.error("notification.dispatch.unlock_failed", { notificationId: id, message: safeErrorMessage(err) })
        }
      }
    }
  }
}
