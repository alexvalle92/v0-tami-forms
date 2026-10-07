import { randomUUID } from "node:crypto"
import { and, asc, desc, eq, gte, inArray, isNull, lt, lte, or } from "drizzle-orm"
import type { Db } from "@/lib/db/client"
import { notifications, patients, payments, quizResponses } from "@/lib/db/schema"
import type {
  Channel,
  NewSubmission,
  NotificationRepo,
  NotificationView,
  PaymentRepo,
  PaymentView,
  Repos,
  SubmissionRef,
  SubmissionRepo,
} from "./types"

// Repositórios MySQL (Drizzle). Relógio único: o da aplicação. Cada operação calcula
// `now = new Date()` em JS e o passa como parâmetro; nenhuma consulta usa o relógio do banco.
// `updated_at` não tem ON UPDATE no schema: TODO UPDATE abaixo o define explicitamente.

const MYSQL_DEADLOCK = 1213
const MYSQL_LOCK_WAIT_TIMEOUT = 1205
const MYSQL_DUPLICATE_ENTRY = 1062
const SUBMISSION_UNIQUE_KEY = "quiz_responses_submission_id_unique"
const CREATE_MAX_ATTEMPTS = 3

type MysqlErrorLike = { errno: number; sqlMessage?: string; message?: string }

/** O Drizzle embrulha o erro do mysql2 em `cause`; percorre a cadeia até achar o `errno`. */
function findMysqlError(error: unknown): MysqlErrorLike | null {
  let current: unknown = error
  for (let depth = 0; depth < 5 && current && typeof current === "object"; depth++) {
    if (typeof (current as { errno?: unknown }).errno === "number") return current as MysqlErrorLike
    current = (current as { cause?: unknown }).cause
  }
  return null
}

function isRetryable(error: unknown): boolean {
  const e = findMysqlError(error)
  return e !== null && (e.errno === MYSQL_DEADLOCK || e.errno === MYSQL_LOCK_WAIT_TIMEOUT)
}

/** 1062 somente na chave UNIQUE de quiz_responses.submission_id. */
function isDuplicateSubmission(error: unknown): boolean {
  const e = findMysqlError(error)
  if (!e || e.errno !== MYSQL_DUPLICATE_ENTRY) return false
  return (e.sqlMessage ?? e.message ?? "").includes(SUBMISSION_UNIQUE_KEY)
}

const affected = (result: unknown): number => (result as [{ affectedRows: number }])[0].affectedRows

const paymentUnlockedAt = (now: Date) =>
  or(isNull(payments.lockedUntil), lt(payments.lockedUntil, now))
const notificationUnlockedAt = (now: Date) =>
  or(isNull(notifications.lockedUntil), lt(notifications.lockedUntil, now))

export function createMysqlRepos(db: Db): Repos {
  async function createOnce(s: NewSubmission): Promise<SubmissionRef> {
    return db.transaction(async (tx) => {
      const now = new Date()

      // 1. Upsert do paciente pelo CPF. O id definitivo é lido de volta no passo 2.
      await tx
        .insert(patients)
        .values({
          id: randomUUID(),
          name: s.patient.name,
          cpf: s.patient.cpf,
          email: s.patient.email,
          phone: s.patient.phone,
          createdAt: now,
          updatedAt: now,
        })
        .onDuplicateKeyUpdate({
          set: {
            name: s.patient.name,
            email: s.patient.email,
            phone: s.patient.phone,
            updatedAt: now,
          },
        })

      // 2. Trava a linha do paciente: serializa envios concorrentes do mesmo CPF.
      const [patient] = await tx
        .select({ id: patients.id })
        .from(patients)
        .where(eq(patients.cpf, s.patient.cpf))
        .for("update")
      const patientId = patient.id

      // 3. first_quiz: o paciente ainda não tem resposta (calculado ANTES do insert).
      const [earlier] = await tx
        .select({ id: quizResponses.id })
        .from(quizResponses)
        .where(eq(quizResponses.patientId, patientId))
        .limit(1)
      const firstQuiz = earlier === undefined

      // 4. Insert do envio. Falha com 1062 se o submission_id já existe (rollback total).
      const quizResponseId = randomUUID()
      await tx.insert(quizResponses).values({
        id: quizResponseId,
        submissionId: s.submissionId,
        patientId,
        answers: s.answers,
        firstQuiz,
        paymentId: null,
        createdAt: now,
        updatedAt: now,
      })

      // 5. Cobrança reaproveitável (a mais recente) ou nova.
      const [reusable] = await tx
        .select({ id: payments.id })
        .from(payments)
        .where(
          and(
            eq(payments.patientId, patientId),
            inArray(payments.status, ["PENDING_ASAAS", "PENDING"]),
            or(isNull(payments.dueDate), gte(payments.dueDate, s.todaySP)),
          ),
        )
        .orderBy(desc(payments.createdAt), desc(payments.id))
        .limit(1)

      let paymentId: string
      if (reusable) {
        paymentId = reusable.id
      } else {
        paymentId = randomUUID()
        await tx.insert(payments).values({
          id: paymentId,
          patientId,
          amount: s.amount,
          status: "PENDING_ASAAS",
          syncAttempts: 0,
          nextSyncAt: now,
          createdAt: now,
          updatedAt: now,
        })
      }

      // 6. Vínculo envio -> cobrança.
      await tx
        .update(quizResponses)
        .set({ paymentId, updatedAt: now })
        .where(eq(quizResponses.id, quizResponseId))

      return { quizResponseId, paymentId }
    })
  }

  const submissions: SubmissionRepo = {
    async findBySubmissionId(id) {
      const [row] = await db
        .select({ quizResponseId: quizResponses.id, paymentId: quizResponses.paymentId })
        .from(quizResponses)
        .where(eq(quizResponses.submissionId, id))
        .limit(1)
      return row && row.paymentId
        ? { quizResponseId: row.quizResponseId, paymentId: row.paymentId }
        : null
    },

    async create(s) {
      for (let attempt = 1; ; attempt++) {
        try {
          return await createOnce(s)
        } catch (error) {
          // A transação já fez rollback; "duplicate" é devolvido aqui, fora dela.
          if (isDuplicateSubmission(error)) return "duplicate"
          if (isRetryable(error) && attempt < CREATE_MAX_ATTEMPTS) continue
          throw error
        }
      }
    },
  }

  const reopenPaymentSet = (now: Date) => ({
    status: "PENDING_ASAAS",
    syncAttempts: 0,
    nextSyncAt: now,
    lastError: null,
    lockedUntil: null,
    updatedAt: now,
  })

  const paymentsRepo: PaymentRepo = {
    async get(id) {
      const [row] = await db
        .select({
          id: payments.id,
          patientId: payments.patientId,
          status: payments.status,
          amount: payments.amount,
          asaasId: payments.asaasId,
          paymentUrl: payments.paymentUrl,
          syncAttempts: payments.syncAttempts,
          patient: {
            id: patients.id,
            name: patients.name,
            cpf: patients.cpf,
            email: patients.email,
            phone: patients.phone,
            asaasCustomerId: patients.asaasCustomerId,
          },
        })
        .from(payments)
        .innerJoin(patients, eq(patients.id, payments.patientId))
        .where(eq(payments.id, id))
        .limit(1)
      const view: PaymentView | null = row ?? null
      return view
    },

    async tryLock(id, ttlMs) {
      const now = new Date()
      const result = await db
        .update(payments)
        .set({ lockedUntil: new Date(now.getTime() + ttlMs), updatedAt: now })
        .where(and(eq(payments.id, id), paymentUnlockedAt(now)))
      return affected(result) === 1
    },

    async unlock(id) {
      await db
        .update(payments)
        .set({ lockedUntil: null, updatedAt: new Date() })
        .where(eq(payments.id, id))
    },

    async setPatientAsaasCustomer(patientId, customerId) {
      await db
        .update(patients)
        .set({ asaasCustomerId: customerId, updatedAt: new Date() })
        .where(eq(patients.id, patientId))
    },

    async markSynced(id, d) {
      await db
        .update(payments)
        .set({
          asaasId: d.asaasId,
          asaasCustomerId: d.asaasCustomerId,
          status: d.status,
          paymentUrl: d.paymentUrl,
          invoiceNumber: d.invoiceNumber,
          billingType: d.billingType,
          dueDate: d.dueDate,
          nextSyncAt: null,
          lastError: null,
          lockedUntil: null,
          updatedAt: new Date(),
        })
        .where(eq(payments.id, id))
    },

    async markSyncFailure(id, d) {
      await db
        .update(payments)
        .set({
          syncAttempts: d.attempts,
          lastError: d.error,
          ...(d.failed
            ? { status: "ASAAS_FAILED", nextSyncAt: null }
            : { nextSyncAt: d.nextSyncAt }),
          lockedUntil: null,
          updatedAt: new Date(),
        })
        .where(eq(payments.id, id))
    },

    async listDue(now, limit) {
      const rows = await db
        .select({ id: payments.id })
        .from(payments)
        .where(
          and(
            eq(payments.status, "PENDING_ASAAS"),
            lte(payments.nextSyncAt, now),
            paymentUnlockedAt(now),
          ),
        )
        .orderBy(asc(payments.nextSyncAt), asc(payments.id))
        .limit(limit)
      return rows.map((r) => r.id)
    },

    async reopen(id) {
      const result = await db
        .update(payments)
        .set(reopenPaymentSet(new Date()))
        .where(and(eq(payments.id, id), eq(payments.status, "ASAAS_FAILED")))
      return affected(result) === 1
    },

    async reopenAllFailed() {
      const result = await db
        .update(payments)
        .set(reopenPaymentSet(new Date()))
        .where(eq(payments.status, "ASAAS_FAILED"))
      return affected(result)
    },
  }

  const reopenNotificationSet = (now: Date) => ({
    status: "pending" as const,
    attempts: 0,
    nextAttemptAt: now,
    lastError: null,
    lockedUntil: null,
    updatedAt: now,
  })

  const notificationsRepo: NotificationRepo = {
    async enqueuePaymentLink(filter, channels) {
      const now = new Date()
      const targets = await db
        .select({
          quizResponseId: quizResponses.id,
          paymentId: quizResponses.paymentId,
          email: patients.email,
          phone: patients.phone,
        })
        .from(quizResponses)
        .innerJoin(patients, eq(patients.id, quizResponses.patientId))
        .where(
          "paymentId" in filter
            ? eq(quizResponses.paymentId, filter.paymentId)
            : eq(quizResponses.id, filter.quizResponseId),
        )

      const rows = targets.flatMap((t) => {
        const paymentId = t.paymentId
        if (paymentId === null) return []
        return channels.map((channel: Channel) => ({
          id: randomUUID(),
          quizResponseId: t.quizResponseId,
          paymentId,
          channel,
          kind: "payment_link",
          recipient: channel === "email" ? t.email : `55${t.phone}`,
          status: "pending" as const,
          partsSent: 0,
          attempts: 0,
          nextAttemptAt: now,
          createdAt: now,
          updatedAt: now,
        }))
      })
      if (rows.length === 0) return
      // UNIQUE (quiz_response_id, channel, kind): linhas já existentes são ignoradas.
      await db.insert(notifications).ignore().values(rows)
    },

    async listPendingIdsForQuizResponse(quizResponseId) {
      const rows = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(eq(notifications.quizResponseId, quizResponseId), eq(notifications.status, "pending")),
        )
        .orderBy(asc(notifications.createdAt), asc(notifications.id))
      return rows.map((r) => r.id)
    },

    async get(id) {
      const [row] = await db
        .select({
          id: notifications.id,
          quizResponseId: notifications.quizResponseId,
          paymentId: notifications.paymentId,
          channel: notifications.channel,
          kind: notifications.kind,
          recipient: notifications.recipient,
          status: notifications.status,
          partsSent: notifications.partsSent,
          attempts: notifications.attempts,
          patientName: patients.name,
          paymentUrl: payments.paymentUrl,
        })
        .from(notifications)
        .innerJoin(quizResponses, eq(quizResponses.id, notifications.quizResponseId))
        .innerJoin(patients, eq(patients.id, quizResponses.patientId))
        .innerJoin(payments, eq(payments.id, notifications.paymentId))
        .where(eq(notifications.id, id))
        .limit(1)
      if (!row) return null
      const view: NotificationView = { ...row, kind: "payment_link" }
      return view
    },

    async tryLock(id, ttlMs) {
      const now = new Date()
      const result = await db
        .update(notifications)
        .set({ lockedUntil: new Date(now.getTime() + ttlMs), updatedAt: now })
        .where(and(eq(notifications.id, id), notificationUnlockedAt(now)))
      return affected(result) === 1
    },

    async markPartSent(id, partsSent) {
      await db
        .update(notifications)
        .set({ partsSent, updatedAt: new Date() })
        .where(eq(notifications.id, id))
    },

    async markSent(id) {
      const now = new Date()
      await db
        .update(notifications)
        .set({ status: "sent", sentAt: now, lockedUntil: null, updatedAt: now })
        .where(eq(notifications.id, id))
    },

    async markFailure(id, d) {
      await db
        .update(notifications)
        .set({
          attempts: d.attempts,
          lastError: d.error,
          ...(d.failed
            ? { status: "failed" as const }
            : d.nextAttemptAt
              ? { nextAttemptAt: d.nextAttemptAt }
              : {}),
          lockedUntil: null,
          updatedAt: new Date(),
        })
        .where(eq(notifications.id, id))
    },

    async listDue(now, limit) {
      const rows = await db
        .select({ id: notifications.id })
        .from(notifications)
        .where(
          and(
            eq(notifications.status, "pending"),
            lte(notifications.nextAttemptAt, now),
            notificationUnlockedAt(now),
          ),
        )
        .orderBy(asc(notifications.nextAttemptAt), asc(notifications.id))
        .limit(limit)
      return rows.map((r) => r.id)
    },

    async reopen(id) {
      const result = await db
        .update(notifications)
        .set(reopenNotificationSet(new Date()))
        .where(and(eq(notifications.id, id), eq(notifications.status, "failed")))
      return affected(result) === 1
    },

    async reopenAllFailed() {
      const result = await db
        .update(notifications)
        .set(reopenNotificationSet(new Date()))
        .where(eq(notifications.status, "failed"))
      return affected(result)
    },
  }

  return { submissions, payments: paymentsRepo, notifications: notificationsRepo }
}
