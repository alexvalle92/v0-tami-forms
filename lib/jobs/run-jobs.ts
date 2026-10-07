import type { NotificationRepo, PaymentRepo } from "@/lib/db/repos/types"
import type { Logger } from "@/lib/log"
import type { DispatchNotification } from "@/lib/services/dispatch-notification"
import { safeErrorMessage } from "@/lib/services/last-error"
import type { SyncPayment } from "@/lib/services/sync-payment"

/** `payments` e `notifications` contam os itens tentados (qualquer desfecho); `errors`, as exceções. */
export type RunSummary = { payments: number; notifications: number; errors: number }

/**
 * Uma rodada do job: primeiro as cobranças vencidas (para que um link criado agora já seja enviado
 * na mesma rodada) e depois as notificações vencidas. Itens em sequência; a exceção de um item é
 * logada (mensagem segura, sem dados pessoais), conta em `errors` e não interrompe os demais.
 */
export function createRunJobs(d: {
  payments: PaymentRepo
  notifications: NotificationRepo
  syncPayment: SyncPayment
  dispatchNotification: DispatchNotification
  log: Logger
  now: () => Date
  paymentDeadlineMs: number
  limits: { payments: number; notifications: number }
}): () => Promise<RunSummary> {
  return async function runJobs() {
    const startedAt = d.now().getTime()
    const summary: RunSummary = { payments: 0, notifications: 0, errors: 0 }

    async function list(kind: "payments" | "notifications"): Promise<string[]> {
      try {
        return await d[kind].listDue(d.now(), d.limits[kind])
      } catch (err) {
        summary.errors++
        d.log.error(`job.${kind}.list_failed`, { message: safeErrorMessage(err) })
        return []
      }
    }

    for (const paymentId of await list("payments")) {
      summary.payments++
      try {
        await d.syncPayment(paymentId, { deadline: d.now().getTime() + d.paymentDeadlineMs })
      } catch (err) {
        summary.errors++
        d.log.error("job.payment.error", { paymentId, message: safeErrorMessage(err) })
      }
    }

    for (const notificationId of await list("notifications")) {
      summary.notifications++
      try {
        await d.dispatchNotification(notificationId)
      } catch (err) {
        summary.errors++
        d.log.error("job.notification.error", { notificationId, message: safeErrorMessage(err) })
      }
    }

    d.log.info("job.round.done", { ...summary, durationMs: d.now().getTime() - startedAt })
    return summary
  }
}
