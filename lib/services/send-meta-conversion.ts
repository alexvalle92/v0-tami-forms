import { jobBackoffMs } from "@/lib/jobs/backoff"
import type { LastError, MetaConversionPayload, MetaConversionRepo } from "@/lib/db/repos/types"
import type { Logger } from "@/lib/log"
import type { CapiEvent, MetaCapiClient } from "@/lib/meta/capi"
import { buildUserData } from "@/lib/meta/user-data"
import type { AlertAdmin } from "./alert-admin"
import { safeErrorMessage } from "./last-error"

export const MAX_META_CONVERSION_ATTEMPTS = 8
/** A Meta só aceita evento de até 7 dias atrás. */
export const META_MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000

export type SendMetaConversion = (id: string) => Promise<void>

type Context = { attempts: number; eventTime: Date | null; paymentId: string | null; patientName: string }
type Failure = { retryable: boolean; status?: number; message: string }

function purchaseEvent(p: MetaConversionPayload): CapiEvent {
  const a = p.attribution
  return {
    event_name: "Purchase",
    event_time: Math.floor(p.eventTime.getTime() / 1000),
    event_id: p.eventId,
    action_source: "website",
    ...(a.eventSourceUrl ? { event_source_url: a.eventSourceUrl } : {}),
    user_data: buildUserData({
      email: p.patient.email,
      phone: p.patient.phone,
      name: p.patient.name,
      externalId: a.externalId,
      ip: a.clientIp,
      userAgent: a.userAgent,
      fbp: a.fbp,
      fbc: a.fbc,
    }),
    custom_data: { value: Number(p.amount), currency: "BRL" },
  }
}

/**
 * Envia à Meta o Purchase de uma cobrança paga (spec Meta §7.2). Reserva a linha, monta o evento de
 * `payments`, `patients` e `meta_attributions` e registra o resultado: enviado, nova tentativa pelo
 * backoff do job, ou falha definitiva com aviso ao admin (erro que não adianta repetir, 8 tentativas ou
 * mais de 7 dias do pagamento). Nunca lança. Desligado, não toca na linha: ela segue `pending` e sai
 * quando o rastreamento for religado, se ainda estiver na janela da Meta. Só ids e mensagens seguras vão
 * para o log.
 */
export function createSendMetaConversion(d: {
  conversions: MetaConversionRepo
  capi: MetaCapiClient | null
  enabled: boolean
  alertAdmin: AlertAdmin
  log: Logger
  now: () => Date
}): SendMetaConversion {
  async function settle(id: string, ctx: Context, failure: Failure): Promise<void> {
    const now = d.now()
    const attempt = ctx.attempts + 1
    const lastError: LastError = {
      step: "meta_capi",
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
    const expired = ctx.eventTime !== null && now.getTime() - ctx.eventTime.getTime() > META_MAX_EVENT_AGE_MS

    if (failure.retryable && attempt < MAX_META_CONVERSION_ATTEMPTS && !expired) {
      await d.conversions.markRetry(id, new Date(now.getTime() + jobBackoffMs(attempt)), lastError)
      d.log.warn("meta.purchase.retry", ref)
      return
    }
    await d.conversions.markFailed(id, lastError)
    d.log.error("meta.purchase.failed", ref)
    await d.alertAdmin({ kind: "meta_conversion", id, patientName: ctx.patientName, error: lastError })
  }

  return async function sendMetaConversion(id) {
    if (!d.enabled || !d.capi) return

    let ctx: Context = { attempts: 0, eventTime: null, paymentId: null, patientName: "-" }
    try {
      if (!(await d.conversions.claim(id, d.now()))) return

      const payload = await d.conversions.loadPayload(id)
      if (!payload) {
        await settle(id, ctx, { retryable: false, message: "dados ausentes" })
        return
      }
      ctx = {
        attempts: payload.attempts,
        eventTime: payload.eventTime,
        paymentId: payload.paymentId,
        patientName: payload.patient.name,
      }

      const result = await d.capi.send([purchaseEvent(payload)])
      if (result.kind === "ok") {
        await d.conversions.markSent(id, d.now())
        d.log.info("meta.purchase.sent", { conversionId: id, paymentId: payload.paymentId })
        return
      }
      await settle(id, ctx, { retryable: result.kind === "retryable", status: result.status, message: result.message })
    } catch (err) {
      const message = safeErrorMessage(err)
      d.log.error("meta.purchase.error", { conversionId: id, message })
      try {
        await settle(id, ctx, { retryable: true, message })
      } catch (inner) {
        d.log.error("meta.purchase.settle_failed", { conversionId: id, message: safeErrorMessage(inner) })
      }
    }
  }
}
