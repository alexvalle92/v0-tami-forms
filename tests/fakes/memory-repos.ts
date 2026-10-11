import { randomUUID } from "node:crypto"
import type {
  Channel,
  LastError,
  NewSubmission,
  NotificationRepo,
  NotificationView,
  PaymentEventInput,
  PaymentEventResult,
  PaymentRepo,
  PaymentView,
  PlanData,
  Repos,
  SubmissionRef,
  SubmissionRepo,
  WebhookRepo,
} from "@/lib/db/repos/types"

// Fake em memória dos repositórios, com o relógio real. Um Map por tabela.
// As operações que precisam ser atômicas (create, applyPaymentEvent) não têm `await` no meio:
// o JavaScript só alterna entre chamadas concorrentes em um `await`, então o efeito é o do
// UNIQUE e da transação do MySQL.

export type PatientRow = {
  id: string
  name: string
  cpf: string
  email: string
  phone: string
  asaasCustomerId: string | null
  passwordHash: string | null
  mustChangePassword: boolean
  passwordSetAt: Date | null
}

export type PaymentRow = {
  id: string
  patientId: string
  amount: string
  dueDate: string | null
  status: string
  asaasId: string | null
  asaasCustomerId: string | null
  paymentUrl: string | null
  invoiceNumber: string | null
  billingType: string | null
  syncAttempts: number
  nextSyncAt: Date | null
  lockedUntil: Date | null
  lastError: LastError | null
  paidAt: Date | null
  /** YYYY-MM-DD */
  paymentDate: string | null
  lastEvent: string | null
}

type QuizResponseRow = {
  id: string
  submissionId: string
  patientId: string
  answers: Record<string, unknown>
  firstQuiz: boolean
  paymentId: string | null
}

export type NotificationRow = {
  id: string
  quizResponseId: string
  paymentId: string
  channel: Channel
  kind: "payment_link"
  recipient: string
  status: "pending" | "sent" | "failed"
  partsSent: number
  attempts: number
  nextAttemptAt: Date
  lockedUntil: Date | null
  lastError: LastError | null
  sentAt: Date | null
}

/** Ledger de idempotência do webhook (o corpo do evento não é guardado). */
export type WebhookEventRow = {
  id: string
  event: string
  asaasPaymentId: string | null
  paymentId: string | null
  outcome: "processed" | "ignored"
}

export type PlanGenerationRow = {
  id: string
  paymentId: string
  patientId: string
  quizResponseId: string
  status: "pending" | "done" | "failed"
  mealPlanId: string | null
  attempts: number
  nextAttemptAt: Date | null
  lockedUntil: Date | null
  lastError: LastError | null
  generation: Record<string, unknown> | null
}

export type MealPlanRow = {
  id: string
  patientId: string
  paymentId: string | null
  quizResponseId: string | null
  title: string
  description: string | null
  startDate: string
  endDate: string | null
  dueDateNewMealPlan: string | null
  paymentUrlNewMealPlan: string | null
  status: string
  planData: PlanData
}

type Processed = Extract<PaymentEventResult, { outcome: "processed" }>

const isLocked = (row: { lockedUntil: Date | null }, now: Date) =>
  row.lockedUntil !== null && row.lockedUntil.getTime() > now.getTime()

/** Visão somente leitura das linhas guardadas, só para testes (inclui `lastError`, `status` etc.). */
export type MemoryState = {
  patients: ReadonlyMap<string, Readonly<PatientRow>>
  payments: ReadonlyMap<string, Readonly<PaymentRow>>
  notifications: ReadonlyMap<string, Readonly<NotificationRow>>
  webhookEvents: ReadonlyMap<string, Readonly<WebhookEventRow>>
  planGenerations: ReadonlyMap<string, Readonly<PlanGenerationRow>>
  mealPlans: ReadonlyMap<string, Readonly<MealPlanRow>>
}

export function createMemoryRepos(): Repos & { state: MemoryState } {
  const patients = new Map<string, PatientRow>()
  const payments = new Map<string, PaymentRow>()
  const quizResponses = new Map<string, QuizResponseRow>()
  const notifications = new Map<string, NotificationRow>()
  const webhookEvents = new Map<string, WebhookEventRow>()
  const planGenerations = new Map<string, PlanGenerationRow>()
  const mealPlans = new Map<string, MealPlanRow>()

  const patientByCpf = (cpf: string) => [...patients.values()].find((p) => p.cpf === cpf)
  const quizResponseBySubmission = (submissionId: string) =>
    [...quizResponses.values()].find((q) => q.submissionId === submissionId)

  const submissions: SubmissionRepo = {
    async findBySubmissionId(id) {
      const q = quizResponseBySubmission(id)
      return q && q.paymentId ? { quizResponseId: q.id, paymentId: q.paymentId } : null
    },

    // Sem `await`: tudo acontece de forma atômica.
    async create(s: NewSubmission): Promise<SubmissionRef | "duplicate"> {
      if (quizResponseBySubmission(s.submissionId)) return "duplicate"
      const now = new Date()

      let patient = patientByCpf(s.patient.cpf)
      if (patient) {
        patient.name = s.patient.name
        patient.email = s.patient.email
        patient.phone = s.patient.phone
      } else {
        patient = {
          id: randomUUID(),
          asaasCustomerId: null,
          passwordHash: null,
          mustChangePassword: false,
          passwordSetAt: null,
          ...s.patient,
        }
        patients.set(patient.id, patient)
      }
      const patientId = patient.id

      const firstQuiz = ![...quizResponses.values()].some((q) => q.patientId === patientId)

      // Mais recente entre as reaproveitáveis (Map preserva a ordem de inserção).
      const reusable = [...payments.values()]
        .filter(
          (p) =>
            p.patientId === patientId &&
            (p.status === "PENDING_ASAAS" || p.status === "PENDING") &&
            (p.dueDate === null || p.dueDate >= s.todaySP),
        )
        .pop()

      let payment = reusable
      if (!payment) {
        payment = {
          id: randomUUID(),
          patientId,
          amount: s.amount,
          dueDate: null,
          status: "PENDING_ASAAS",
          asaasId: null,
          asaasCustomerId: null,
          paymentUrl: null,
          invoiceNumber: null,
          billingType: null,
          syncAttempts: 0,
          nextSyncAt: now,
          lockedUntil: null,
          lastError: null,
          paidAt: null,
          paymentDate: null,
          lastEvent: null,
        }
        payments.set(payment.id, payment)
      }

      const quizResponse: QuizResponseRow = {
        id: randomUUID(),
        submissionId: s.submissionId,
        patientId,
        answers: structuredClone(s.answers),
        firstQuiz,
        paymentId: payment.id,
      }
      quizResponses.set(quizResponse.id, quizResponse)
      return { quizResponseId: quizResponse.id, paymentId: payment.id }
    },
  }

  const paymentsRepo: PaymentRepo = {
    async get(id) {
      const p = payments.get(id)
      if (!p) return null
      const patient = patients.get(p.patientId)!
      const view: PaymentView = {
        id: p.id,
        patientId: p.patientId,
        status: p.status,
        amount: p.amount,
        asaasId: p.asaasId,
        paymentUrl: p.paymentUrl,
        syncAttempts: p.syncAttempts,
        paidAt: p.paidAt,
        patient: {
          id: patient.id,
          name: patient.name,
          cpf: patient.cpf,
          email: patient.email,
          phone: patient.phone,
          asaasCustomerId: patient.asaasCustomerId,
        },
      }
      return view
    },

    async tryLock(id, ttlMs) {
      const p = payments.get(id)
      const now = new Date()
      if (!p || isLocked(p, now)) return false
      p.lockedUntil = new Date(now.getTime() + ttlMs)
      return true
    },

    async unlock(id) {
      const p = payments.get(id)
      if (p) p.lockedUntil = null
    },

    async setPatientAsaasCustomer(patientId, customerId) {
      const patient = patients.get(patientId)
      if (patient) patient.asaasCustomerId = customerId
    },

    async markSynced(id, d) {
      const p = payments.get(id)
      if (!p) return
      p.asaasId = d.asaasId
      p.asaasCustomerId = d.asaasCustomerId
      p.status = d.status
      p.paymentUrl = d.paymentUrl
      p.invoiceNumber = d.invoiceNumber
      p.billingType = d.billingType
      p.dueDate = d.dueDate
      p.nextSyncAt = null
      p.lastError = null
      p.lockedUntil = null
    },

    async markSyncFailure(id, d) {
      const p = payments.get(id)
      if (!p) return
      p.syncAttempts = d.attempts
      p.lastError = structuredClone(d.error)
      if (d.failed) {
        p.status = "ASAAS_FAILED"
        p.nextSyncAt = null
      } else {
        p.nextSyncAt = d.nextSyncAt
      }
      p.lockedUntil = null
    },

    async listDue(now, limit) {
      return [...payments.values()]
        .filter(
          (p) =>
            p.status === "PENDING_ASAAS" &&
            p.nextSyncAt !== null &&
            p.nextSyncAt.getTime() <= now.getTime() &&
            !isLocked(p, now),
        )
        .sort((a, b) => a.nextSyncAt!.getTime() - b.nextSyncAt!.getTime())
        .slice(0, limit)
        .map((p) => p.id)
    },

    async reopen(id) {
      const p = payments.get(id)
      if (!p || p.status !== "ASAAS_FAILED") return false
      reopenPayment(p)
      return true
    },

    async reopenAllFailed() {
      let count = 0
      for (const p of payments.values()) {
        if (p.status !== "ASAAS_FAILED") continue
        reopenPayment(p)
        count++
      }
      return count
    },
  }

  function reopenPayment(p: PaymentRow) {
    p.status = "PENDING_ASAAS"
    p.syncAttempts = 0
    p.nextSyncAt = new Date()
    p.lastError = null
    p.lockedUntil = null
  }

  function reopenNotification(n: NotificationRow) {
    n.status = "pending"
    n.attempts = 0
    n.nextAttemptAt = new Date()
    n.lastError = null
    n.lockedUntil = null
  }

  const notificationsRepo: NotificationRepo = {
    async enqueuePaymentLink(filter, channels) {
      const targets = [...quizResponses.values()].filter((q) =>
        "paymentId" in filter ? q.paymentId === filter.paymentId : q.id === filter.quizResponseId,
      )
      const now = new Date()
      for (const q of targets) {
        if (!q.paymentId) continue
        const patient = patients.get(q.patientId)!
        for (const channel of channels) {
          const exists = [...notifications.values()].some(
            (n) => n.quizResponseId === q.id && n.channel === channel && n.kind === "payment_link",
          )
          if (exists) continue
          const row: NotificationRow = {
            id: randomUUID(),
            quizResponseId: q.id,
            paymentId: q.paymentId,
            channel,
            kind: "payment_link",
            recipient: channel === "email" ? patient.email : `55${patient.phone}`,
            status: "pending",
            partsSent: 0,
            attempts: 0,
            nextAttemptAt: now,
            lockedUntil: null,
            lastError: null,
            sentAt: null,
          }
          notifications.set(row.id, row)
        }
      }
    },

    async listPendingIdsForQuizResponse(quizResponseId) {
      return [...notifications.values()]
        .filter((n) => n.quizResponseId === quizResponseId && n.status === "pending")
        .map((n) => n.id)
    },

    async get(id) {
      const n = notifications.get(id)
      if (!n) return null
      const q = quizResponses.get(n.quizResponseId)!
      const view: NotificationView = {
        id: n.id,
        quizResponseId: n.quizResponseId,
        paymentId: n.paymentId,
        channel: n.channel,
        kind: n.kind,
        recipient: n.recipient,
        status: n.status,
        partsSent: n.partsSent,
        attempts: n.attempts,
        patientName: patients.get(q.patientId)!.name,
        paymentUrl: payments.get(n.paymentId)?.paymentUrl ?? null,
      }
      return view
    },

    async tryLock(id, ttlMs) {
      const n = notifications.get(id)
      const now = new Date()
      if (!n || isLocked(n, now)) return false
      n.lockedUntil = new Date(now.getTime() + ttlMs)
      return true
    },

    async unlock(id) {
      const n = notifications.get(id)
      if (n) n.lockedUntil = null
    },

    async markPartSent(id, partsSent) {
      const n = notifications.get(id)
      if (n) n.partsSent = partsSent
    },

    async markSent(id) {
      const n = notifications.get(id)
      if (!n) return
      n.status = "sent"
      n.sentAt = new Date()
      n.lockedUntil = null
    },

    async markFailure(id, d) {
      const n = notifications.get(id)
      if (!n) return
      n.attempts = d.attempts
      n.lastError = structuredClone(d.error)
      if (d.failed) {
        n.status = "failed"
      } else if (d.nextAttemptAt) {
        n.nextAttemptAt = d.nextAttemptAt
      }
      n.lockedUntil = null
    },

    async listDue(now, limit) {
      return [...notifications.values()]
        .filter(
          (n) =>
            n.status === "pending" &&
            n.nextAttemptAt.getTime() <= now.getTime() &&
            !isLocked(n, now),
        )
        .sort((a, b) => a.nextAttemptAt.getTime() - b.nextAttemptAt.getTime())
        .slice(0, limit)
        .map((n) => n.id)
    },

    async reopen(id) {
      const n = notifications.get(id)
      if (!n || n.status !== "failed") return false
      reopenNotification(n)
      return true
    },

    async reopenAllFailed() {
      let count = 0
      for (const n of notifications.values()) {
        if (n.status !== "failed") continue
        reopenNotification(n)
        count++
      }
      return count
    },
  }

  const webhooks: WebhookRepo = {
    // Sem `await`: tudo acontece de forma atômica, como a transação do MySQL.
    async applyPaymentEvent(e: PaymentEventInput, now: Date): Promise<PaymentEventResult> {
      // 1. Idempotência pelo id do evento.
      if (webhookEvents.has(e.eventId)) return { outcome: "duplicate" }
      const record = (outcome: WebhookEventRow["outcome"], paymentId: string | null) => {
        webhookEvents.set(e.eventId, {
          id: e.eventId,
          event: e.event,
          asaasPaymentId: e.asaasPaymentId,
          paymentId,
          outcome,
        })
      }

      // 2. Evento fora das regras.
      if (e.group === "other") {
        record("ignored", null)
        return { outcome: "ignored", reason: "event_not_handled" }
      }

      // 3. Cobrança pelo externalReference.
      const p = e.externalReference === null ? undefined : payments.get(e.externalReference)
      if (!p) {
        record("ignored", null)
        return { outcome: "ignored", reason: "unknown_payment" }
      }

      // 4. asaas_id: divergente é ignorado; nulo é preenchido, se nenhuma outra cobrança o usa.
      const asaasIdTaken =
        p.asaasId === null &&
        e.asaasPaymentId !== null &&
        [...payments.values()].some((o) => o.asaasId === e.asaasPaymentId)
      if ((p.asaasId !== null && p.asaasId !== e.asaasPaymentId) || asaasIdTaken) {
        record("ignored", null)
        return { outcome: "ignored", reason: "asaas_id_mismatch" }
      }

      // 7. Antes de pagar: não mexe em cobrança já paga.
      if (e.group === "pre_payment" && p.paidAt !== null) {
        record("ignored", p.id)
        return { outcome: "ignored", reason: "already_paid" }
      }

      if (p.asaasId === null) p.asaasId = e.asaasPaymentId
      p.lastEvent = e.event
      let pendingGeneration: Processed["pendingGeneration"] = null
      let missingQuizResponse = false

      if (e.group === "paid") {
        // 5. Pago.
        p.status = e.status ?? (e.event === "PAYMENT_CONFIRMED" ? "CONFIRMED" : "RECEIVED")
        if (p.paidAt === null) p.paidAt = now
        p.paymentDate = e.paymentDate ?? p.paymentDate
        p.billingType = e.billingType ?? p.billingType
        p.invoiceNumber = e.invoiceNumber ?? p.invoiceNumber

        let generation = [...planGenerations.values()].find((g) => g.paymentId === p.id)
        if (!generation) {
          // Envio mais recente da cobrança (Map preserva a ordem de inserção).
          const latest = [...quizResponses.values()].filter((q) => q.paymentId === p.id).pop()
          if (latest) {
            generation = {
              id: randomUUID(),
              paymentId: p.id,
              patientId: p.patientId,
              quizResponseId: latest.id,
              status: "pending",
              mealPlanId: null,
              attempts: 0,
              nextAttemptAt: now,
              lockedUntil: null,
              lastError: null,
              generation: null,
            }
            planGenerations.set(generation.id, generation)
          } else {
            missingQuizResponse = true
          }
        }
        if (generation?.status === "pending") {
          pendingGeneration = { id: generation.id, quizResponseId: generation.quizResponseId }
        }
      } else {
        // 6. Reversão e 7. antes de pagar: só o status (sem status no evento, mantém o atual).
        p.status = e.status ?? p.status
      }

      record("processed", p.id)
      return {
        outcome: "processed",
        paymentId: p.id,
        patientName: patients.get(p.patientId)!.name,
        pendingGeneration,
        missingQuizResponse,
      }
    },
  }

  return {
    submissions,
    payments: paymentsRepo,
    notifications: notificationsRepo,
    webhooks,
    state: { patients, payments, notifications, webhookEvents, planGenerations, mealPlans },
  }
}
