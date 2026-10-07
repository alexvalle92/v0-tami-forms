import { randomUUID } from "node:crypto"
import type {
  Channel,
  LastError,
  NewSubmission,
  NotificationRepo,
  NotificationView,
  PaymentRepo,
  PaymentView,
  Repos,
  SubmissionRef,
  SubmissionRepo,
} from "@/lib/db/repos/types"

// Fake em memória dos repositórios, com o relógio real. Um Map por tabela.
// As operações que precisam ser atômicas (create) não têm `await` no meio: o JavaScript
// só alterna entre chamadas concorrentes em um `await`, então o efeito é o do UNIQUE do MySQL.

type PatientRow = {
  id: string
  name: string
  cpf: string
  email: string
  phone: string
  asaasCustomerId: string | null
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

const isLocked = (row: { lockedUntil: Date | null }, now: Date) =>
  row.lockedUntil !== null && row.lockedUntil.getTime() > now.getTime()

/** Visão somente leitura das linhas guardadas, só para testes (inclui `lastError`, `status` etc.). */
export type MemoryState = {
  payments: ReadonlyMap<string, Readonly<PaymentRow>>
  notifications: ReadonlyMap<string, Readonly<NotificationRow>>
}

export function createMemoryRepos(): Repos & { state: MemoryState } {
  const patients = new Map<string, PatientRow>()
  const payments = new Map<string, PaymentRow>()
  const quizResponses = new Map<string, QuizResponseRow>()
  const notifications = new Map<string, NotificationRow>()

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
        patient = { id: randomUUID(), asaasCustomerId: null, ...s.patient }
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
        patient: { ...patient },
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

  return {
    submissions,
    payments: paymentsRepo,
    notifications: notificationsRepo,
    state: { payments, notifications },
  }
}
