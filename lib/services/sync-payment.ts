import type { AsaasClient, AsaasPayment } from "@/lib/asaas/client"
import type { Channel, NotificationRepo, PaymentRepo, PaymentView } from "@/lib/db/repos/types"
import { HttpError } from "@/lib/http/retry"
import { MAX_PAYMENT_ATTEMPTS, jobBackoffMs } from "@/lib/jobs/backoff"
import type { Logger } from "@/lib/log"
import { addDaysISO, todayInSaoPaulo } from "@/lib/time"
import type { AlertAdmin } from "./alert-admin"
import { toLastError } from "./last-error"

export type SyncResult =
  | { status: "synced"; paymentUrl: string }
  | { status: "busy" | "retry_scheduled" | "failed" | "not_found" }

export type SyncPayment = (paymentId: string, opts: { deadline: number }) => Promise<SyncResult>

const LOCK_TTL_MS = 120_000

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err))

/** Resultado de uma cobrança que não está mais `PENDING_ASAAS`: sincronizada (com URL) ou falha. */
function settledResult(p: PaymentView): SyncResult {
  return p.paymentUrl ? { status: "synced", paymentUrl: p.paymentUrl } : { status: "failed" }
}

/**
 * Único lugar que cria coisas no Asaas. Idempotente: cada passo procura antes de criar,
 * então pode ser repetido (envio, job, reabertura) sem duplicar cliente nem cobrança.
 */
export function createSyncPayment(d: {
  payments: PaymentRepo
  notifications: NotificationRepo
  asaas: AsaasClient
  alertAdmin: AlertAdmin
  log: Logger
  now: () => Date
  config: { dueDays: number; successUrl: string; channels: Channel[] }
}): SyncPayment {
  async function recordFailure(
    payment: PaymentView,
    step: string,
    err: unknown,
  ): Promise<{ result: SyncResult; lockCleared: boolean }> {
    const attempts = payment.syncAttempts + 1
    const failed = (err instanceof HttpError && !err.transient) || attempts >= MAX_PAYMENT_ATTEMPTS
    const at = d.now()
    const error = toLastError(step, err, attempts, at)
    // Nunca logar `err.body` nem dados pessoais.
    const fields = {
      paymentId: payment.id,
      step,
      httpStatus: error.httpStatus,
      attempt: attempts,
      message: error.message,
    }

    try {
      await d.payments.markSyncFailure(payment.id, {
        attempts,
        nextSyncAt: failed ? null : new Date(at.getTime() + jobBackoffMs(attempts)),
        failed,
        error,
      })
    } catch (recordErr) {
      d.log.error("payment.sync.record_failure_failed", { ...fields, recordMessage: errorMessage(recordErr) })
      return { result: { status: "retry_scheduled" }, lockCleared: false }
    }

    if (!failed) {
      d.log.warn("payment.sync.retry_scheduled", fields)
      return { result: { status: "retry_scheduled" }, lockCleared: true }
    }

    d.log.error("payment.sync.failed", fields)
    try {
      await d.alertAdmin({ kind: "payment", id: payment.id, patientName: payment.patient.name, error })
    } catch (alertErr) {
      d.log.error("payment.sync.alert_failed", { paymentId: payment.id, message: errorMessage(alertErr) })
    }
    return { result: { status: "failed" }, lockCleared: true }
  }

  return async function syncPayment(paymentId, opts) {
    const first = await d.payments.get(paymentId)
    if (!first) return { status: "not_found" }
    if (first.status !== "PENDING_ASAAS") return settledResult(first)

    if (!(await d.payments.tryLock(paymentId, LOCK_TTL_MS))) return { status: "busy" }

    // `markSynced` e `markSyncFailure` soltam o lock; em qualquer outro caminho o `finally` o solta.
    let lockHeld = true
    try {
      // Outro processo pode ter terminado entre o `get` e o lock: relê para não repetir nem recontar tentativas.
      const payment = await d.payments.get(paymentId)
      if (!payment) return { status: "not_found" }
      if (payment.status !== "PENDING_ASAAS") return settledResult(payment)

      let step = "asaas.find_customer"
      try {
        const { patient } = payment
        let customerId = patient.asaasCustomerId
        if (!customerId) {
          let customer = await d.asaas.findCustomerByCpf(patient.cpf, opts)
          if (!customer) {
            step = "asaas.create_customer"
            customer = await d.asaas.createCustomer(
              {
                name: patient.name,
                cpfCnpj: patient.cpf,
                email: patient.email,
                mobilePhone: patient.phone,
                externalReference: patient.id,
              },
              opts,
            )
          }
          customerId = customer.id
          step = "db.set_customer"
          await d.payments.setPatientAsaasCustomer(patient.id, customerId)
        }

        const dueDate = addDaysISO(todayInSaoPaulo(d.now()), d.config.dueDays)
        step = "asaas.find_payment"
        let asaasPayment: AsaasPayment | null = await d.asaas.findPaymentByExternalReference(payment.id, opts)
        if (!asaasPayment) {
          step = "asaas.create_payment"
          asaasPayment = await d.asaas.createPayment(
            {
              customer: customerId,
              billingType: "UNDEFINED",
              value: Number(payment.amount),
              dueDate,
              description: `Plano Alimentar Personalizado - ${patient.name} - 30 dias`,
              externalReference: payment.id,
              callback: { successUrl: d.config.successUrl },
            },
            opts,
          )
        }

        // Enfileira antes de marcar: se falhar, a cobrança segue PENDING_ASAAS e o job a refaz
        // (tudo é idempotente). O contrário deixaria uma cobrança sincronizada sem notificações.
        step = "db.enqueue_notifications"
        await d.notifications.enqueuePaymentLink({ paymentId: payment.id }, d.config.channels)

        step = "db.mark_synced"
        await d.payments.markSynced(payment.id, {
          asaasId: asaasPayment.id,
          asaasCustomerId: customerId,
          status: asaasPayment.status || "PENDING",
          paymentUrl: asaasPayment.invoiceUrl,
          invoiceNumber: asaasPayment.invoiceNumber,
          billingType: asaasPayment.billingType,
          dueDate: asaasPayment.dueDate || dueDate,
        })
        lockHeld = false
        return { status: "synced", paymentUrl: asaasPayment.invoiceUrl }
      } catch (err) {
        const { result, lockCleared } = await recordFailure(payment, step, err)
        if (lockCleared) lockHeld = false
        return result
      }
    } finally {
      if (lockHeld) {
        try {
          await d.payments.unlock(paymentId)
        } catch (err) {
          d.log.error("payment.sync.unlock_failed", { paymentId, message: errorMessage(err) })
        }
      }
    }
  }
}
