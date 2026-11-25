import { jobBackoffMs } from "@/lib/jobs/backoff"
import type { GoogleAdsConversionPayload, GoogleAdsConversionRepo, LastError } from "@/lib/db/repos/types"
import type { DataManagerClient, DataManagerEvent } from "@/lib/google-ads/data-manager"
import { buildGoogleUserIdentifiers } from "@/lib/google-ads/user-data"
import type { Logger } from "@/lib/log"
import type { AlertAdmin } from "./alert-admin"
import { safeErrorMessage } from "./last-error"

export const MAX_GOOGLE_ADS_CONVERSION_ATTEMPTS = 8
/** O Google descarta conversão de clique com mais de 90 dias; passado isso, nem tenta. */
export const GOOGLE_ADS_MAX_EVENT_AGE_MS = 90 * 24 * 60 * 60 * 1000

const STEP = "google_ads_ingest"

export type SendGoogleAdsConversion = (id: string) => Promise<void>

type Context = { attempts: number; eventTime: Date | null; paymentId: string | null; patientName: string }
type Failure = { retryable: boolean; status?: number; message: string }

/**
 * Evento da Data Manager API, ou `null` sem identificador de clique. Vai um identificador só, na ordem
 * gclid > gbraid > wbraid. E-mail e telefone (com hash) só vão com o gclid e com as conversões otimizadas
 * ligadas: elas pedem os termos de dados do cliente aceitos na conta, e o Google não documenta a mistura
 * com gbraid/wbraid.
 */
export function purchaseEvent(p: GoogleAdsConversionPayload, enhancedConversions: boolean): DataManagerEvent | null {
  const { gclid, gbraid, wbraid } = p.click
  const adIdentifiers = gclid ? { gclid } : gbraid ? { gbraid } : wbraid ? { wbraid } : null
  if (!adIdentifiers) return null

  const event: DataManagerEvent = {
    transactionId: p.transactionId,
    eventTimestamp: p.eventTime.toISOString(),
    eventSource: "WEB",
    conversionValue: Number(p.amount),
    currency: "BRL",
    adIdentifiers,
  }
  if (enhancedConversions && gclid) {
    const userIdentifiers = buildGoogleUserIdentifiers({ email: p.patient.email, phone: p.patient.phone })
    if (userIdentifiers.length > 0) event.userData = { userIdentifiers }
  }
  return event
}

/**
 * Envia ao Google Ads o Purchase de uma cobrança paga (spec Google Ads §8). Reserva a linha, monta o evento de
 * `payments`, `patients` e `google_ads_attributions` e registra o resultado: aceito (com o `requestId`), nova
 * tentativa pelo backoff do job, ou falha definitiva com aviso ao admin. Nunca lança. Desligado, não toca na
 * linha: ela segue `pending` e sai quando o envio for ligado, se ainda estiver na janela de 90 dias.
 * Com `validateOnly`, o Google só valida: a linha vira `failed` com essa explicação (sem aviso ao admin),
 * para ser reaberta por `POST /api/jobs/retry` quando o envio de verdade for ligado.
 * Só ids e mensagens seguras vão para o log.
 */
export function createSendGoogleAdsConversion(d: {
  conversions: GoogleAdsConversionRepo
  client: DataManagerClient | null
  enabled: boolean
  enhancedConversions: boolean
  validateOnly: boolean
  alertAdmin: AlertAdmin
  log: Logger
  now: () => Date
}): SendGoogleAdsConversion {
  async function settle(id: string, ctx: Context, failure: Failure): Promise<void> {
    const now = d.now()
    const attempt = ctx.attempts + 1
    const lastError: LastError = {
      step: STEP,
      ...(failure.status !== undefined ? { httpStatus: failure.status } : {}),
      message: failure.message,
      attempt,
      at: now.toISOString(),
    }
    const ref = {
      conversionId: id,
      ...(ctx.paymentId ? { paymentId: ctx.paymentId } : {}),
      attempt,
      ...(failure.status !== undefined ? { status: failure.status } : {}),
      message: failure.message,
    }
    const nextAttemptAt = new Date(now.getTime() + jobBackoffMs(attempt))
    const expired =
      ctx.eventTime !== null && nextAttemptAt.getTime() - ctx.eventTime.getTime() > GOOGLE_ADS_MAX_EVENT_AGE_MS

    if (failure.retryable && attempt < MAX_GOOGLE_ADS_CONVERSION_ATTEMPTS && !expired) {
      await d.conversions.markRetry(id, nextAttemptAt, lastError)
      d.log.warn("google_ads.purchase.retry", ref)
      return
    }
    await d.conversions.markFailed(id, lastError)
    d.log.error("google_ads.purchase.failed", ref)
    await d.alertAdmin({ kind: "google_ads_conversion", id, patientName: ctx.patientName, error: lastError })
  }

  return async function sendGoogleAdsConversion(id) {
    if (!d.enabled || !d.client) return

    let ctx: Context = { attempts: 0, eventTime: null, paymentId: null, patientName: "-" }
    try {
      if (!(await d.conversions.claim(id, d.now()))) return

      const payload = await d.conversions.loadPayload(id)
      const event = payload ? purchaseEvent(payload, d.enhancedConversions) : null
      if (payload) {
        ctx = {
          attempts: payload.attempts,
          eventTime: payload.eventTime,
          paymentId: payload.paymentId,
          patientName: payload.patient.name,
        }
      }
      if (!payload || !event) {
        await settle(id, ctx, { retryable: false, message: "dados ausentes" })
        return
      }

      // Fora da janela de 90 dias (reabertura em lote, ou envio ligado tarde): o Google só rejeitaria.
      if (d.now().getTime() - payload.eventTime.getTime() > GOOGLE_ADS_MAX_EVENT_AGE_MS) {
        await d.conversions.markFailed(id, {
          step: STEP,
          message: "fora da janela de 90 dias do Google Ads",
          attempt: payload.attempts + 1,
          at: d.now().toISOString(),
        })
        d.log.warn("google_ads.purchase.expired", { conversionId: id, paymentId: payload.paymentId })
        return
      }

      const result = await d.client.ingest([event])
      if (result.kind === "ok") {
        if (d.validateOnly) {
          await d.conversions.markFailed(id, {
            step: STEP,
            message: "validateOnly: aceito na validação, não importado; reabra com /api/jobs/retry",
            attempt: payload.attempts + 1,
            at: d.now().toISOString(),
          })
          d.log.info("google_ads.purchase.validated", { conversionId: id, paymentId: payload.paymentId })
          return
        }
        await d.conversions.markSent(id, d.now(), result.requestId)
        d.log.info("google_ads.purchase.sent", {
          conversionId: id,
          paymentId: payload.paymentId,
          ...(result.requestId ? { requestId: result.requestId } : {}),
        })
        return
      }
      await settle(id, ctx, { retryable: result.kind === "retryable", status: result.status, message: result.message })
    } catch (err) {
      const message = safeErrorMessage(err)
      d.log.error("google_ads.purchase.error", { conversionId: id, message })
      try {
        await settle(id, ctx, { retryable: true, message })
      } catch (inner) {
        d.log.error("google_ads.purchase.settle_failed", { conversionId: id, message: safeErrorMessage(inner) })
      }
    }
  }
}
