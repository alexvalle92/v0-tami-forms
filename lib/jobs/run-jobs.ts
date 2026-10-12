import type { NotificationRepo, PaymentRepo, PlanGenerationRepo } from "@/lib/db/repos/types"
import type { Logger } from "@/lib/log"
import type { DispatchNotification } from "@/lib/services/dispatch-notification"
import type { GeneratePlan } from "@/lib/services/generate-plan"
import { safeErrorMessage } from "@/lib/services/last-error"
import type { SyncPayment } from "@/lib/services/sync-payment"

/**
 * `payments`, `plans` e `notifications` contam os itens tentados (qualquer desfecho); `reminders`, os
 * avisos de vencimento enfileirados na rodada; `errors`, as exceções.
 */
export type RunSummary = { payments: number; plans: number; reminders: number; notifications: number; errors: number }

/**
 * Uma rodada do job: primeiro as cobranças vencidas (para que um link criado agora já seja enviado
 * na mesma rodada), depois as gerações de plano vencidas, em seguida o enfileiramento dos avisos de
 * vencimento do plano (só dentro da janela de horário) e por fim as notificações vencidas (as
 * `plan_ready` de uma geração concluída agora e os avisos enfileirados agora saem na mesma rodada).
 * Itens em sequência; a exceção de um item é logada (mensagem segura, sem dados pessoais), conta em
 * `errors` e não interrompe os demais.
 */
export function createRunJobs(d: {
  payments: PaymentRepo
  planGenerations: PlanGenerationRepo
  notifications: NotificationRepo
  syncPayment: SyncPayment
  generatePlan: GeneratePlan
  dispatchNotification: DispatchNotification
  enqueueExpiryReminders: () => Promise<number>
  log: Logger
  now: () => Date
  paymentDeadlineMs: number
  limits: { payments: number; plans: number; notifications: number }
}): () => Promise<RunSummary> {
  return async function runJobs() {
    const startedAt = d.now().getTime()
    const summary: RunSummary = { payments: 0, plans: 0, reminders: 0, notifications: 0, errors: 0 }

    const repos = { payments: d.payments, plans: d.planGenerations, notifications: d.notifications }

    async function list(kind: "payments" | "plans" | "notifications"): Promise<string[]> {
      try {
        return await repos[kind].listDue(d.now(), d.limits[kind])
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

    for (const generationId of await list("plans")) {
      summary.plans++
      try {
        await d.generatePlan(generationId)
      } catch (err) {
        summary.errors++
        d.log.error("job.plan.error", { generationId, message: safeErrorMessage(err) })
      }
    }

    try {
      summary.reminders = await d.enqueueExpiryReminders()
    } catch (err) {
      summary.errors++
      d.log.error("job.reminders.error", { message: safeErrorMessage(err) })
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
