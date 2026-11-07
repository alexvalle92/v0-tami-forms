import type {
  Channel,
  MetaAttributionRepo,
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

/** O que só o pedido HTTP sabe; o PlanA (`/api/renewals`) não manda e, por isso, não gera atribuição. */
export type SubmitContext = { clientIp?: string; userAgent?: string }

export type SubmitQuiz = (input: ParsedSubmission, ctx?: SubmitContext) => Promise<SubmitResult>

// Tamanho das colunas de meta_attributions.
const MAX_CLIENT_IP = 45
const MAX_USER_AGENT = 500

/**
 * Uma submissão do quiz: grava tudo no MySQL e tenta obter o link de pagamento dentro do pedido.
 * Idempotente por `submissionId`. Só uma falha ao achar/criar o envio vira `db_error`;
 * depois que os dados estão salvos, qualquer erro vira `pending` (o job conclui).
 * Com o rastreamento da Meta ligado e `meta` no envio, grava a atribuição do anúncio; essa gravação
 * nunca muda o resultado.
 */
export function createSubmitQuiz(d: {
  submissions: SubmissionRepo
  payments: PaymentRepo
  notifications: NotificationRepo
  syncPayment: SyncPayment
  metaAttributions: Pick<MetaAttributionRepo, "save">
  log: Logger
  now: () => Date
  config: { amount: string; channels: Channel[]; requestBudgetMs: number; metaEnabled: boolean }
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

  async function saveMetaAttribution(input: ParsedSubmission, quizResponseId: string, ctx: SubmitContext | undefined) {
    if (!d.config.metaEnabled || !input.meta) return
    try {
      await d.metaAttributions.save(
        quizResponseId,
        {
          externalId: input.meta.externalId ?? null,
          fbp: input.meta.fbp ?? null,
          fbc: input.meta.fbc ?? null,
          clientIp: ctx?.clientIp && ctx.clientIp !== "unknown" ? ctx.clientIp.slice(0, MAX_CLIENT_IP) : null,
          userAgent: ctx?.userAgent ? ctx.userAgent.slice(0, MAX_USER_AGENT) : null,
          eventSourceUrl: input.meta.eventSourceUrl ?? null,
        },
        d.now(),
      )
    } catch (err) {
      d.log.warn("submit.meta_attribution_failed", {
        submissionId: input.submissionId,
        quizResponseId,
        message: safeErrorMessage(err),
      })
    }
  }

  return async function submitQuiz(input, ctx) {
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
    await saveMetaAttribution(input, quizResponseId, ctx)
    const base ={ submissionId: input.submissionId, quizResponseId, paymentId }
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
