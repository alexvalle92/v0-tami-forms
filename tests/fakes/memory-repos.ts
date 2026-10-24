import { randomUUID } from "node:crypto"
import type {
  AnalyticsRepo,
  AppLogRepo,
  AppLogRow,
  Channel,
  FunnelEventRow,
  FunnelSessionView,
  LastError,
  MealPlanRepo,
  MealPlanView,
  NewSubmission,
  NotificationKind,
  NotificationRepo,
  NotificationView,
  PaymentEventInput,
  PaymentEventResult,
  PaymentRepo,
  PaymentView,
  PlanData,
  PlanGenerationRepo,
  PlanGenerationView,
  Repos,
  SubmissionRef,
  SubmissionRepo,
  WebhookRepo,
} from "@/lib/db/repos/types"
import { daysLeft, expiryStage, renewalState, type RenewalCharge } from "@/lib/renewal/rules"

// Fake em memória dos repositórios, com o relógio real. Um Map por tabela.
// As operações que precisam ser atômicas (create, applyPaymentEvent, complete) não têm `await` no meio:
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
  /** Decide a cobrança de renovação de um plano (a criada depois dele, §4). */
  createdAt: Date
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
  patientId: string
  /** Nulo em `password_reset`. */
  quizResponseId: string | null
  /** Nulo em `password_reset`. */
  paymentId: string | null
  /** Só nos avisos de vencimento (`plan_expiring_*`). */
  mealPlanId: string | null
  payload: { link?: string } | null
  channel: Channel
  kind: NotificationKind
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
  status: string
  planData: PlanData
  createdAt: Date
}

/** Sessão do funil, como em `funnel_sessions`. */
export type FunnelSessionRow = FunnelSessionView

type Processed = Extract<PaymentEventResult, { outcome: "processed" }>

const isLocked = (row: { lockedUntil: Date | null }, now: Date) =>
  row.lockedUntil !== null && row.lockedUntil.getTime() > now.getTime()

/** Destinatário, como no repositório MySQL; nulo no WhatsApp de paciente sem telefone. */
const recipientFor = (channel: Channel, p: { email: string; phone: string }): string | null =>
  channel === "email" ? p.email : p.phone === "" ? null : `55${p.phone}`

/** Visão somente leitura das linhas guardadas, só para testes (inclui `lastError`, `status` etc.). */
export type MemoryState = {
  patients: ReadonlyMap<string, Readonly<PatientRow>>
  payments: ReadonlyMap<string, Readonly<PaymentRow>>
  notifications: ReadonlyMap<string, Readonly<NotificationRow>>
  webhookEvents: ReadonlyMap<string, Readonly<WebhookEventRow>>
  planGenerations: ReadonlyMap<string, Readonly<PlanGenerationRow>>
  mealPlans: ReadonlyMap<string, Readonly<MealPlanRow>>
  funnelSessions: ReadonlyMap<string, Readonly<FunnelSessionRow>>
  funnelEvents: readonly Readonly<FunnelEventRow>[]
  appLogs: readonly Readonly<AppLogRow>[]
}

/** Atalhos de teste para estados que nenhuma interface pública do `v0-tami-forms` cria (o PlanA os cria no banco). */
export type MemorySeed = {
  /** Mensagem `password_reset` pendente, sem quiz nem cobrança; devolve o id. Sem `link`, o payload fica nulo. */
  passwordReset(d: { patientId: string; channel: Channel; link?: string }): string
  /** Plano como o admin do PlanA cria: sem cobrança nem envio do quiz, `active` por padrão; devolve o id. */
  mealPlan(d: { patientId: string; endDate: string | null; status?: string }): string
}

export function createMemoryRepos(): Repos & { state: MemoryState; seed: MemorySeed } {
  const patients = new Map<string, PatientRow>()
  const payments = new Map<string, PaymentRow>()
  const quizResponses = new Map<string, QuizResponseRow>()
  const notifications = new Map<string, NotificationRow>()
  const webhookEvents = new Map<string, WebhookEventRow>()
  const planGenerations = new Map<string, PlanGenerationRow>()
  const mealPlans = new Map<string, MealPlanRow>()
  const funnelSessions = new Map<string, FunnelSessionRow>()
  const funnelEvents: FunnelEventRow[] = []
  const appLogRows: AppLogRow[] = []

  const patientByCpf = (cpf: string) => [...patients.values()].find((p) => p.cpf === cpf)

  /** Cobrança de renovação do plano (§4): a mais recente do paciente criada depois dele, ou nula. */
  function renewalChargeOf(plan: MealPlanRow): RenewalCharge | null {
    const p =
      [...payments.values()]
        .filter((p) => p.patientId === plan.patientId && p.createdAt.getTime() > plan.createdAt.getTime())
        .sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime())
        .pop() ?? null
    if (!p) return null
    return { id: p.id, status: p.status, dueDate: p.dueDate, paymentUrl: p.paymentUrl, paidAt: p.paidAt }
  }
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
          createdAt: now,
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

  /**
   * Linha `pending` nova; como o INSERT IGNORE na UNIQUE (quiz_response_id, channel, kind).
   * Sem destinatário (WhatsApp de paciente sem telefone), nenhuma linha.
   */
  function enqueueNotification(
    q: { id: string; paymentId: string },
    patient: PatientRow,
    channel: Channel,
    kind: NotificationKind,
    now: Date,
  ) {
    const recipient = recipientFor(channel, patient)
    if (recipient === null) return
    const exists = [...notifications.values()].some(
      (n) => n.quizResponseId === q.id && n.channel === channel && n.kind === kind,
    )
    if (exists) return
    const row: NotificationRow = {
      id: randomUUID(),
      patientId: patient.id,
      quizResponseId: q.id,
      paymentId: q.paymentId,
      mealPlanId: null,
      payload: null,
      channel,
      kind,
      recipient,
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
          enqueueNotification({ id: q.id, paymentId: q.paymentId }, patient, channel, "payment_link", now)
        }
      }
    },

    // Sem `await`: a rodada inteira é atômica, como os INSERT IGNORE do MySQL na chave única.
    async enqueuePlanExpiring(d) {
      let created = 0
      for (const plan of mealPlans.values()) {
        if (plan.status !== "active") continue
        const stage = expiryStage(daysLeft(plan.endDate, d.today))
        if (stage === null || stage === "expired") continue

        const state = renewalState(renewalChargeOf(plan), d.today)
        if (state.status === "paid") continue

        // A cobrança entra no aviso só em d2 e d0, e só quando já tem link.
        const paymentId =
          (stage === "d2" || stage === "d0") &&
          state.status === "awaiting_payment" &&
          state.paymentUrl !== null
            ? state.paymentId
            : null
        const kind: NotificationKind = `plan_expiring_${stage}`
        const patient = patients.get(plan.patientId)!
        for (const channel of d.channels) {
          const recipient = recipientFor(channel, patient)
          if (recipient === null) continue
          // UNIQUE (meal_plan_id, channel, kind).
          const exists = [...notifications.values()].some(
            (n) => n.mealPlanId === plan.id && n.channel === channel && n.kind === kind,
          )
          if (exists) continue
          const row: NotificationRow = {
            id: randomUUID(),
            patientId: plan.patientId,
            quizResponseId: null,
            paymentId,
            mealPlanId: plan.id,
            payload: null,
            channel,
            kind,
            recipient,
            status: "pending",
            partsSent: 0,
            attempts: 0,
            nextAttemptAt: d.now,
            lockedUntil: null,
            lastError: null,
            sentAt: null,
          }
          notifications.set(row.id, row)
          created++
        }
      }
      return created
    },

    async listPendingIdsForQuizResponse(quizResponseId) {
      return [...notifications.values()]
        .filter((n) => n.quizResponseId === quizResponseId && n.status === "pending")
        .map((n) => n.id)
    },

    async get(id) {
      const n = notifications.get(id)
      if (!n) return null
      const patient = patients.get(n.patientId)!
      const plan = n.mealPlanId === null ? undefined : mealPlans.get(n.mealPlanId)
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
        patientId: patient.id,
        patientName: patient.name,
        patientPasswordHash: patient.passwordHash,
        paymentUrl: (n.paymentId && payments.get(n.paymentId)?.paymentUrl) || null,
        payload: n.payload ? structuredClone(n.payload) : null,
        mealPlan: plan
          ? { id: plan.id, endDate: plan.endDate, status: plan.status, renewalCharge: renewalChargeOf(plan) }
          : null,
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
      n.payload = null
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

  function reopenGeneration(g: PlanGenerationRow) {
    g.status = "pending"
    g.attempts = 0
    g.nextAttemptAt = new Date()
    g.lastError = null
    g.lockedUntil = null
  }

  const planGenerationsRepo: PlanGenerationRepo = {
    async get(id) {
      const g = planGenerations.get(id)
      if (!g) return null
      const patient = patients.get(g.patientId)!
      const view: PlanGenerationView = {
        id: g.id,
        paymentId: g.paymentId,
        quizResponseId: g.quizResponseId,
        status: g.status,
        attempts: g.attempts,
        answers: structuredClone(quizResponses.get(g.quizResponseId)!.answers),
        patient: { id: patient.id, name: patient.name, hasPassword: patient.passwordHash !== null },
      }
      return view
    },

    async tryLock(id, ttlMs) {
      const g = planGenerations.get(id)
      const now = new Date()
      if (!g || isLocked(g, now)) return false
      g.lockedUntil = new Date(now.getTime() + ttlMs)
      return true
    },

    async unlock(id) {
      const g = planGenerations.get(id)
      if (g) g.lockedUntil = null
    },

    // Sem `await`: tudo acontece de forma atômica, como a transação do MySQL.
    async complete(id, d) {
      const g = planGenerations.get(id)
      if (!g) throw new Error("plan_generations: geração não encontrada")
      if (g.status !== "pending") throw new Error("plan_generations: geração não está pending")
      // UNIQUE (meal_plans.payment_id): o MySQL lançaria 1062 antes de gravar qualquer coisa.
      if ([...mealPlans.values()].some((m) => m.paymentId === g.paymentId)) {
        throw new Error("meal_plans: já existe plano para a cobrança")
      }
      const now = new Date()
      const patient = patients.get(g.patientId)!

      // 1. Plano novo, ativo.
      const plan: MealPlanRow = {
        id: randomUUID(),
        patientId: g.patientId,
        paymentId: g.paymentId,
        quizResponseId: g.quizResponseId,
        title: d.title,
        description: null,
        startDate: d.startDate,
        endDate: d.endDate,
        status: "active",
        planData: structuredClone(d.planData),
        createdAt: now,
      }
      mealPlans.set(plan.id, plan)

      // 2. Os outros planos ativos do paciente passam a `completed`.
      for (const m of mealPlans.values()) {
        if (m.patientId === g.patientId && m.status === "active" && m.id !== plan.id) {
          m.status = "completed"
        }
      }

      // 3. Credencial, só se o paciente ainda não tem.
      if (d.passwordHash !== null && patient.passwordHash === null) {
        patient.passwordHash = d.passwordHash
        patient.mustChangePassword = true
        patient.passwordSetAt = now
      }

      // 4. Notificações `plan_ready` do envio, uma por canal.
      for (const channel of d.channels) {
        enqueueNotification({ id: g.quizResponseId, paymentId: g.paymentId }, patient, channel, "plan_ready", now)
      }

      // 5. Geração concluída; lock solto.
      g.status = "done"
      g.mealPlanId = plan.id
      g.generation = structuredClone(d.generation)
      g.nextAttemptAt = null
      g.lastError = null
      g.lockedUntil = null
      return { mealPlanId: plan.id }
    },

    async markFailure(id, d) {
      const g = planGenerations.get(id)
      if (!g || g.status !== "pending") return
      g.attempts = d.attempts
      g.lastError = structuredClone(d.error)
      if (d.failed) {
        g.status = "failed"
        g.nextAttemptAt = null
      } else {
        g.nextAttemptAt = d.nextAttemptAt
      }
      g.lockedUntil = null
    },

    async listDue(now, limit) {
      return [...planGenerations.values()]
        .filter(
          (g) =>
            g.status === "pending" &&
            g.nextAttemptAt !== null &&
            g.nextAttemptAt.getTime() <= now.getTime() &&
            !isLocked(g, now),
        )
        .sort((a, b) => a.nextAttemptAt!.getTime() - b.nextAttemptAt!.getTime())
        .slice(0, limit)
        .map((g) => g.id)
    },

    async reopen(id) {
      const g = planGenerations.get(id)
      if (!g || g.status !== "failed") return false
      reopenGeneration(g)
      return true
    },

    async reopenAllFailed() {
      let count = 0
      for (const g of planGenerations.values()) {
        if (g.status !== "failed") continue
        reopenGeneration(g)
        count++
      }
      return count
    },
  }

  const mealPlansRepo: MealPlanRepo = {
    // Map preserva a ordem de inserção: do mais antigo ao mais novo.
    async listByPatient(patientId) {
      return [...mealPlans.values()]
        .filter((m) => m.patientId === patientId)
        .map(
          (m): MealPlanView => ({
            id: m.id,
            patientId: m.patientId,
            paymentId: m.paymentId,
            title: m.title,
            startDate: m.startDate,
            endDate: m.endDate,
            status: m.status,
            planData: structuredClone(m.planData),
          }),
        )
    },
  }

  const cloneEvent = (e: FunnelEventRow): FunnelEventRow => ({
    ...e,
    props: structuredClone(e.props),
    clientTs: new Date(e.clientTs),
    createdAt: new Date(e.createdAt),
  })

  // Sem `await` em recordBatch e purgeOlderThan: cada chamada é atômica, como a transação do MySQL.
  const analyticsRepo: AnalyticsRepo = {
    async recordBatch(patch, events, now) {
      const existing = funnelSessions.get(patch.sessionId)
      if (!existing) {
        funnelSessions.set(patch.sessionId, {
          sessionId: patch.sessionId,
          startedAt: new Date(now),
          lastEventAt: new Date(now),
          lastStep: patch.lastStep?.step ?? null,
          lastStepSlug: patch.lastStep?.slug ?? null,
          maxStep: patch.maxStep?.step ?? null,
          maxStepSlug: patch.maxStep?.slug ?? null,
          checkoutClicked: patch.checkoutClicked,
          utm: { ...patch.start?.utm },
          referrerHost: patch.start?.referrerHost ?? null,
          deviceType: patch.device.deviceType,
          os: patch.device.os,
          browser: patch.device.browser,
          viewportW: patch.start?.viewportW ?? null,
          viewportH: patch.start?.viewportH ?? null,
          answers: structuredClone(patch.answers),
        })
      } else {
        if (now.getTime() > existing.lastEventAt.getTime()) existing.lastEventAt = new Date(now)
        if (patch.lastStep) {
          existing.lastStep = patch.lastStep.step
          existing.lastStepSlug = patch.lastStep.slug
        }
        if (patch.maxStep && patch.maxStep.step > (existing.maxStep ?? -1)) {
          existing.maxStep = patch.maxStep.step
          existing.maxStepSlug = patch.maxStep.slug
        }
        existing.checkoutClicked = existing.checkoutClicked || patch.checkoutClicked
        existing.answers = { ...existing.answers, ...structuredClone(patch.answers) }
        // UTMs, referrer e viewport só entram se ainda estão nulos; o aparelho nunca muda.
        existing.utm = { ...patch.start?.utm, ...existing.utm }
        existing.referrerHost = existing.referrerHost ?? patch.start?.referrerHost ?? null
        existing.viewportW = existing.viewportW ?? patch.start?.viewportW ?? null
        existing.viewportH = existing.viewportH ?? patch.start?.viewportH ?? null
      }
      for (const e of events) funnelEvents.push(cloneEvent(e))
    },

    async purgeOlderThan(cutoff, limit) {
      const byAge = (a: { at: Date }, b: { at: Date }) => a.at.getTime() - b.at.getTime()
      const oldEvents = funnelEvents
        .map((e, i) => ({ e, i, at: e.createdAt }))
        .filter((x) => x.at.getTime() < cutoff.getTime())
        .sort(byAge)
        .slice(0, limit)
      const drop = new Set(oldEvents.map((x) => x.e))
      for (let i = funnelEvents.length - 1; i >= 0; i--) if (drop.has(funnelEvents[i])) funnelEvents.splice(i, 1)

      const oldSessions = [...funnelSessions.values()]
        .map((s) => ({ s, at: s.lastEventAt }))
        .filter((x) => x.at.getTime() < cutoff.getTime())
        .sort(byAge)
        .slice(0, limit)
      for (const { s } of oldSessions) funnelSessions.delete(s.sessionId)
      return oldEvents.length + oldSessions.length
    },

    async getSession(sessionId) {
      const s = funnelSessions.get(sessionId)
      return s
        ? {
            ...s,
            startedAt: new Date(s.startedAt),
            lastEventAt: new Date(s.lastEventAt),
            utm: { ...s.utm },
            answers: structuredClone(s.answers),
          }
        : null
    },

    async listEvents(sessionId) {
      return funnelEvents.filter((e) => e.sessionId === sessionId).map(cloneEvent)
    },
  }

  const appLogsRepo: AppLogRepo = {
    async insertMany(rows) {
      for (const r of rows) appLogRows.push({ ...r, ts: new Date(r.ts), fields: structuredClone(r.fields) })
    },

    async purgeOlderThan(cutoff, limit) {
      const old = appLogRows
        .filter((r) => r.ts.getTime() < cutoff.getTime())
        .sort((a, b) => a.ts.getTime() - b.ts.getTime())
        .slice(0, limit)
      const drop = new Set(old)
      for (let i = appLogRows.length - 1; i >= 0; i--) if (drop.has(appLogRows[i])) appLogRows.splice(i, 1)
      return old.length
    },

    async listByEvent(event) {
      return appLogRows
        .filter((r) => r.event === event)
        .sort((a, b) => a.ts.getTime() - b.ts.getTime())
        .map((r) => ({ ...r, ts: new Date(r.ts), fields: structuredClone(r.fields) }))
    },
  }

  return {
    submissions,
    payments: paymentsRepo,
    notifications: notificationsRepo,
    webhooks,
    planGenerations: planGenerationsRepo,
    mealPlans: mealPlansRepo,
    analytics: analyticsRepo,
    appLogs: appLogsRepo,
    state: {
      patients,
      payments,
      notifications,
      webhookEvents,
      planGenerations,
      mealPlans,
      funnelSessions,
      funnelEvents,
      appLogs: appLogRows,
    },
    seed: {
      passwordReset({ patientId, channel, link }) {
        const patient = patients.get(patientId)
        if (!patient) throw new Error(`paciente ${patientId} não existe`)
        const row: NotificationRow = {
          id: randomUUID(),
          patientId,
          quizResponseId: null,
          paymentId: null,
          mealPlanId: null,
          payload: link ? { link } : null,
          channel,
          kind: "password_reset",
          recipient: channel === "email" ? patient.email : `55${patient.phone}`,
          status: "pending",
          partsSent: 0,
          attempts: 0,
          nextAttemptAt: new Date(),
          lockedUntil: null,
          lastError: null,
          sentAt: null,
        }
        notifications.set(row.id, row)
        return row.id
      },

      mealPlan({ patientId, endDate, status = "active" }) {
        if (!patients.has(patientId)) throw new Error(`paciente ${patientId} não existe`)
        const plan: MealPlanRow = {
          id: randomUUID(),
          patientId,
          paymentId: null,
          quizResponseId: null,
          title: "Plano Alimentar",
          description: null,
          startDate: "2026-01-01",
          endDate,
          status,
          planData: { meals: [], calories: 0, observations: "" },
          createdAt: new Date(),
        }
        mealPlans.set(plan.id, plan)
        return plan.id
      },
    },
  }
}
