import type { NotificationRepo, PaymentRepo } from "@/lib/db/repos/types"

export type RetryTarget = { paymentId: string } | { notificationId: string } | { allFailed: true }

/** Reabre cobranças `ASAAS_FAILED` e notificações `failed`; `reopened` é o número de linhas realmente reabertas. */
export function createRetryFailed(d: {
  payments: PaymentRepo
  notifications: NotificationRepo
}): (t: RetryTarget) => Promise<{ reopened: number }> {
  return async function retryFailed(t) {
    if ("paymentId" in t) return { reopened: (await d.payments.reopen(t.paymentId)) ? 1 : 0 }
    if ("notificationId" in t) return { reopened: (await d.notifications.reopen(t.notificationId)) ? 1 : 0 }
    const payments = await d.payments.reopenAllFailed()
    const notifications = await d.notifications.reopenAllFailed()
    return { reopened: payments + notifications }
  }
}
