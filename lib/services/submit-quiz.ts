import type {
  Channel,
  NotificationRepo,
  PaymentRepo,
  SubmissionRef,
  SubmissionRepo,
} from "@/lib/db/repos/types"
import type { Logger } from "@/lib/log"
import type { ParsedSubmission } from "@/lib/quiz/validation"
import { todayInSaoPaulo } from "@/lib/time"
import { safeErrorMessage } from "./last-error"
import type { SyncPayment } from "./sync-payment"

export type SubmitResult =
  | { kind: "link"; link: string; quizResponseId: string }
  | { kind: "pending"; quizResponseId: string }
  | { kind: "db_error" }

export type SubmitQuiz = (input: ParsedSubmission) => Promise<SubmitResult>

/**
 * Uma submissão do quiz: grava tudo no MySQL e tenta obter o link de pagamento dentro do pedido.
 * Idempotente por `submissionId`. Só uma falha ao achar/criar o envio vira `db_error`;
 * depois que os dados estão salvos, qualquer erro vira `pending` (o job conclui).
 */
export function createSubmitQuiz(d: {
  submissions: SubmissionRepo
  payments: PaymentRepo
  notifications: NotificationRepo
  syncPayment: SyncPayment
  log: Logger
  now: () => Date
  config: { amount: string; channels: Channel[]; requestBudgetMs: number }
}): SubmitQuiz {
  async function findOrCreateRef(input: ParsedSubmission): Promise<SubmissionRef | null> {
    const existing = await d.submissions.findBySubmissionId(input.submissionId)
    if (existing) return existing

    const created = await d.submissions.create({
      submissionId: input.submissionId,
      patient: input.patient,
      answers: input.answers,
      amount: d.config.amount,
      todaySP: todayInSaoPaulo(d.now()),
    })
    if (created !== "duplicate") return created

    // Outra chamada com o mesmo submissionId gravou primeiro: lê o que ela criou.
    return d.submissions.findBySubmissionId(input.submissionId)
  }

  return async function submitQuiz(input) {
    const startedAt = d.now().getTime()
    const elapsed = () => d.now().getTime() - startedAt

    let ref: SubmissionRef | null
    try {
      ref = await findOrCreateRef(input)
    } catch (err) {
      d.log.error("submit.db_error", {
        submissionId: input.submissionId,
        outcome: "db_error",
        durationMs: elapsed(),
        message: safeErrorMessage(err),
      })
      return { kind: "db_error" }
    }
    if (!ref) {
      d.log.error("submit.db_error", {
        submissionId: input.submissionId,
        outcome: "db_error",
        durationMs: elapsed(),
        message: "envio não encontrado após duplicate",
      })
      return { kind: "db_error" }
    }

    const { quizResponseId, paymentId } = ref
    const base = { submissionId: input.submissionId, quizResponseId, paymentId }
    const pending = (reason: string): SubmitResult => {
      d.log.info("submit.done", { ...base, outcome: "pending", reason, durationMs: elapsed() })
      return { kind: "pending", quizResponseId }
    }

    // Os dados já estão salvos: daqui em diante nada vira db_error.
    try {
      const payment = await d.payments.get(paymentId)
      if (!payment) {
        d.log.error("submit.payment_missing", { ...base, durationMs: elapsed() })
        return pending("payment_missing")
      }

      if (payment.paymentUrl) {
        // Cliente recorrente: a cobrança já tem link; só garante as notificações deste envio.
        try {
          await d.notifications.enqueuePaymentLink({ quizResponseId }, d.config.channels)
        } catch (err) {
          d.log.error("submit.enqueue_failed", { ...base, message: safeErrorMessage(err) })
        }
        d.log.info("submit.done", { ...base, outcome: "link", reused: true, durationMs: elapsed() })
        return { kind: "link", link: payment.paymentUrl, quizResponseId }
      }

      const result = await d.syncPayment(paymentId, { deadline: d.now().getTime() + d.config.requestBudgetMs })
      if (result.status === "synced") {
        d.log.info("submit.done", { ...base, outcome: "link", durationMs: elapsed() })
        return { kind: "link", link: result.paymentUrl, quizResponseId }
      }
      return pending(result.status)
    } catch (err) {
      d.log.error("submit.after_store_failed", {
        ...base,
        outcome: "pending",
        durationMs: elapsed(),
        message: safeErrorMessage(err),
      })
      return { kind: "pending", quizResponseId }
    }
  }
}
