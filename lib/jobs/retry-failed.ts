import type { MetaConversionRepo, NotificationRepo, PaymentRepo, PlanGenerationRepo } from "@/lib/db/repos/types"

export type RetryTarget =
  | { paymentId: string }
  | { notificationId: string }
  | { planGenerationId: string }
  | { metaConversionId: string }
  | { allFailed: true }

/**
 * Reabre cobranças `ASAAS_FAILED`, notificações `failed`, gerações de plano `failed` e conversões da
 * Meta `failed`; `reopened` é o número de linhas realmente reabertas.
 */
export function createRetryFailed(d: {
  payments: PaymentRepo
  notifications: NotificationRepo
  planGenerations: PlanGenerationRepo
  metaConversions: Pick<MetaConversionRepo, "reopen" | "reopenAllFailed">
}): (t: RetryTarget) => Promise<{ reopened: number }> {
  return async function retryFailed(t) {
    if ("paymentId" in t) return { reopened: (await d.payments.reopen(t.paymentId)) ? 1 : 0 }
    if ("notificationId" in t) return { reopened: (await d.notifications.reopen(t.notificationId)) ? 1 : 0 }
    if ("planGenerationId" in t) return { reopened: (await d.planGenerations.reopen(t.planGenerationId)) ? 1 : 0 }
    if ("metaConversionId" in t) return { reopened: (await d.metaConversions.reopen(t.metaConversionId)) ? 1 : 0 }
    const payments = await d.payments.reopenAllFailed()
    const notifications = await d.notifications.reopenAllFailed()
    const planGenerations = await d.planGenerations.reopenAllFailed()
    const metaConversions = await d.metaConversions.reopenAllFailed()
    return { reopened: payments + notifications + planGenerations + metaConversions }
  }
}
