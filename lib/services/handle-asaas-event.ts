import type { PaymentEventInput, WebhookRepo } from "@/lib/db/repos/types"
import type { Logger } from "@/lib/log"
import type { AdminNotice } from "./alert-admin"

export type HandledEvent = {
  outcome: "duplicate" | "ignored" | "processed"
  /** Geração a executar depois da resposta. Só em evento pago com a geração ainda `pending`. */
  pendingGeneration: { id: string; quizResponseId: string } | null
  /** Aviso ao admin a enviar depois da resposta (reversão, ou pagamento sem envio do quiz). */
  notice: AdminNotice | null
}

/**
 * Trata um evento de cobrança já lido (spec §5, passo 3): delega ao repositório a transação
 * (idempotência, localização da cobrança e regra do grupo) e traduz o resultado no que o
 * handler deve fazer depois da resposta. Erro do repositório é propagado (vira 500 e o Asaas reenvia).
 * O log leva só `eventId`, `event` e `paymentId` (mais o `reason` de ignorado).
 */
export function createHandleAsaasEvent(d: {
  webhooks: WebhookRepo
  log: Logger
  now: () => Date
}): (e: PaymentEventInput) => Promise<HandledEvent> {
  return async function handleAsaasEvent(e) {
    const result = await d.webhooks.applyPaymentEvent(e, d.now())
    const fields = { eventId: e.eventId, event: e.event, paymentId: e.externalReference }

    switch (result.outcome) {
      case "duplicate":
        d.log.info("webhook.asaas.duplicate", fields)
        return { outcome: "duplicate", pendingGeneration: null, notice: null }

      case "ignored": {
        const level = result.reason === "asaas_id_mismatch" ? "warn" : "info"
        d.log[level]("webhook.asaas.ignored", { ...fields, reason: result.reason })
        return { outcome: "ignored", pendingGeneration: null, notice: null }
      }

      case "processed": {
        d.log.info("webhook.asaas.received", { ...fields, paymentId: result.paymentId })

        const base = {
          paymentId: result.paymentId,
          patientName: result.patientName,
          event: e.event,
          asaasPaymentId: e.asaasPaymentId,
        }
        let notice: AdminNotice | null = null
        if (e.group === "reversal") {
          notice = { kind: "payment_reversal", ...base }
        } else if (e.group === "paid" && result.missingQuizResponse) {
          notice = { kind: "payment_without_quiz", ...base }
        }
        return { outcome: "processed", pendingGeneration: result.pendingGeneration, notice }
      }
    }
  }
}
