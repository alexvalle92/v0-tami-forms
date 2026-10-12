import type { NotificationRepo } from "@/lib/db/repos/types"
import type { Logger } from "@/lib/log"
import type { DispatchNotification } from "./dispatch-notification"
import { safeErrorMessage } from "./last-error"

/**
 * Despacha, em sequência, as notificações pendentes de um envio (usado após a resposta do submit).
 * Nunca lança: a falha ao listar ou a exceção de um item é logada (mensagem segura) e não
 * interrompe os demais; o que ficar pendente o job conclui.
 */
export function createDispatchForQuizResponse(d: {
  notifications: NotificationRepo
  dispatchNotification: DispatchNotification
  log: Logger
}): (quizResponseId: string) => Promise<void> {
  return async function dispatchForQuizResponse(quizResponseId) {
    let ids: string[]
    try {
      ids = await d.notifications.listPendingIdsForQuizResponse(quizResponseId)
    } catch (err) {
      d.log.error("submit.dispatch.list_failed", { quizResponseId, message: safeErrorMessage(err) })
      return
    }

    for (const notificationId of ids) {
      try {
        await d.dispatchNotification(notificationId)
      } catch (err) {
        d.log.error("submit.dispatch.error", { quizResponseId, notificationId, message: safeErrorMessage(err) })
      }
    }
  }
}
