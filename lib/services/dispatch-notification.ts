import type { NotificationRepo, NotificationView } from "@/lib/db/repos/types"
import { HttpError } from "@/lib/http/retry"
import { MAX_NOTIFICATION_ATTEMPTS, jobBackoffMs } from "@/lib/jobs/backoff"
import type { Logger } from "@/lib/log"
import type { EmailSender } from "@/lib/notify/email"
import {
  renderFirstAccess,
  renderPasswordReset,
  renderPaymentLink,
  renderPlanReady,
  toWhatsAppParts,
} from "@/lib/notify/templates"
import type { WhatsAppSender } from "@/lib/notify/whatsapp"
import type { AlertAdmin } from "./alert-admin"
import { safeErrorMessage, toLastError } from "./last-error"

export type DispatchResult = "sent" | "retry_scheduled" | "failed" | "busy" | "skipped"

export type DispatchNotification = (id: string) => Promise<DispatchResult>

const LOCK_TTL_MS = 120_000
const WHATSAPP_PART_GAP_MS = 3000

/** Mensagem que não adianta repetir (ex.: `password_reset` sem link): falha definitiva na primeira tentativa. */
export class PermanentNotificationError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "PermanentNotificationError"
  }
}

/**
 * Envia uma notificação enfileirada (e-mail ou WhatsApp; `payment_link`, `plan_ready` ou `password_reset`). O WhatsApp é retomável: cada parte enviada
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
  /** Senha temporária do paciente (derivada) e conferência contra o `password_hash` gravado (§8). */
  access: {
    tempPassword: (patientId: string) => string
    verifyPassword: (password: string, stored: string) => Promise<boolean>
  }
  /** Endereço do PlanA, o `PLANA_APP_URL`. */
  appUrl: string
}): DispatchNotification {
  async function recordFailure(
    n: NotificationView,
    partsSent: number,
    step: string,
    err: unknown,
  ): Promise<{ result: DispatchResult; lockCleared: boolean }> {
    const attempts = n.attempts + 1
    const failed =
      (err instanceof HttpError && !err.transient) ||
      err instanceof PermanentNotificationError ||
      attempts >= MAX_NOTIFICATION_ATTEMPTS
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

  /**
   * Conteúdo conforme o `kind`. No `plan_ready` a escolha é feita agora, contra a credencial atual do paciente (§9):
   * a senha ainda é a temporária derivada → primeiro acesso; qualquer outra coisa (já trocada, ou hash em outro
   * formato, que `verifyPassword` recusa) → plano novo disponível. Sem credencial é erro (vira nova tentativa).
   * A senha temporária só existe nesta função e no corpo da mensagem: nunca em log nem em erro.
   */
  async function renderMessage(n: NotificationView): Promise<{ subject: string; html: string; text: string }> {
    if (n.kind === "payment_link") {
      if (!n.paymentUrl) throw new Error("payment without url")
      return renderPaymentLink({ name: n.patientName, link: n.paymentUrl })
    }

    // O link vive no payload da mensagem até ela sair (`markSent` o apaga); sem ele não há o que enviar.
    if (n.kind === "password_reset") {
      const link = n.payload?.link
      if (!link) throw new PermanentNotificationError("password_reset without link")
      return renderPasswordReset({ name: n.patientName, link })
    }

    if (!n.patientPasswordHash) throw new Error("patient without password hash")
    const tempPassword = d.access.tempPassword(n.patientId)
    if (await d.access.verifyPassword(tempPassword, n.patientPasswordHash)) {
      return renderFirstAccess({ name: n.patientName, appUrl: d.appUrl, tempPassword })
    }
    return renderPlanReady({ name: n.patientName, appUrl: d.appUrl })
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
        const message = await renderMessage(n)

        if (n.channel === "email") {
          await d.email.send({
            to: n.recipient,
            subject: message.subject,
            html: message.html,
            text: message.text,
          })
        } else {
          const parts = toWhatsAppParts(message.subject, message.html)
          const start = n.partsSent
          for (let i = start; i < parts.length; i++) {
            if (i > start) await d.sleep(WHATSAPP_PART_GAP_MS)
            step = "notify.whatsapp"
            await d.whatsapp.sendText(n.recipient, parts[i])
            // Se a gravação falhar depois que a parte saiu, a nova tentativa a reenvia (parte duplicada):
            // aceito, é o custo de não perder nenhuma parte sem transação com o provedor.
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
