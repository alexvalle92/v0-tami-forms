import type { Channel, NotificationRepo } from "@/lib/db/repos/types"
import type { Logger } from "@/lib/log"
import { hourInSaoPaulo, todayInSaoPaulo } from "@/lib/time"

/** Janela dos avisos, em horas de São Paulo: de `from` (inclusive) até `to` (exclusivo). */
export const REMINDER_HOURS = { from: 9, to: 20 }

/**
 * Enfileira os avisos de vencimento do plano, só dentro da janela (ninguém recebe aviso de madrugada).
 * Fora do horário devolve 0 sem tocar no banco; a rodada seguinte dentro da janela cria as linhas
 * (idempotente: o repositório não duplica o aviso do mesmo dia).
 */
export function createEnqueueExpiryReminders(d: {
  notifications: Pick<NotificationRepo, "enqueuePlanExpiring">
  channels: Channel[]
  now: () => Date
  log: Logger
}): () => Promise<number> {
  return async function enqueueExpiryReminders() {
    const now = d.now()
    const hour = hourInSaoPaulo(now)
    if (hour < REMINDER_HOURS.from || hour >= REMINDER_HOURS.to) return 0

    const count = await d.notifications.enqueuePlanExpiring({
      today: todayInSaoPaulo(now),
      channels: d.channels,
      now,
    })
    if (count > 0) d.log.info("job.reminders.enqueued", { count })
    return count
  }
}
