import { sql } from "drizzle-orm"
import {
  boolean,
  char,
  datetime,
  date,
  decimal,
  index,
  int,
  json,
  mysqlEnum,
  mysqlTable,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core"

// Datas em DATETIME(3), sempre UTC (a conexão fixa time_zone = '+00:00').
const dateTime = (name: string) => datetime(name, { fsp: 3, mode: "date" })

const createdAt = () =>
  dateTime("created_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`)

const updatedAt = () =>
  dateTime("updated_at")
    .notNull()
    .default(sql`CURRENT_TIMESTAMP(3)`)

export const patients = mysqlTable(
  "patients",
  {
    id: char("id", { length: 36 }).primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    cpf: char("cpf", { length: 11 }).notNull(),
    email: varchar("email", { length: 254 }).notNull(),
    phone: varchar("phone", { length: 13 }).notNull(),
    asaasCustomerId: varchar("asaas_customer_id", { length: 64 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("patients_cpf_unique").on(t.cpf), index("patients_email_idx").on(t.email)],
)

export const payments = mysqlTable(
  "payments",
  {
    id: char("id", { length: 36 }).primaryKey(),
    patientId: char("patient_id", { length: 36 })
      .notNull()
      .references(() => patients.id),
    amount: decimal("amount", { precision: 10, scale: 2 }).notNull(),
    dueDate: date("due_date", { mode: "string" }),
    status: varchar("status", { length: 32 }).notNull(),
    asaasId: varchar("asaas_id", { length: 64 }),
    asaasCustomerId: varchar("asaas_customer_id", { length: 64 }),
    paymentUrl: varchar("payment_url", { length: 500 }),
    invoiceNumber: varchar("invoice_number", { length: 32 }),
    billingType: varchar("billing_type", { length: 32 }),
    syncAttempts: int("sync_attempts").notNull().default(0),
    nextSyncAt: dateTime("next_sync_at"),
    lockedUntil: dateTime("locked_until"),
    lastError: json("last_error"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("payments_asaas_id_unique").on(t.asaasId),
    index("payments_status_next_sync_at_idx").on(t.status, t.nextSyncAt),
    index("payments_patient_id_idx").on(t.patientId),
  ],
)

export const quizResponses = mysqlTable(
  "quiz_responses",
  {
    id: char("id", { length: 36 }).primaryKey(),
    submissionId: char("submission_id", { length: 36 }).notNull(),
    patientId: char("patient_id", { length: 36 })
      .notNull()
      .references(() => patients.id),
    answers: json("answers").notNull(),
    firstQuiz: boolean("first_quiz").notNull(),
    paymentId: char("payment_id", { length: 36 }).references(() => payments.id),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("quiz_responses_submission_id_unique").on(t.submissionId),
    index("quiz_responses_patient_id_idx").on(t.patientId),
  ],
)

export const notifications = mysqlTable(
  "notifications",
  {
    id: char("id", { length: 36 }).primaryKey(),
    quizResponseId: char("quiz_response_id", { length: 36 })
      .notNull()
      .references(() => quizResponses.id),
    paymentId: char("payment_id", { length: 36 })
      .notNull()
      .references(() => payments.id),
    channel: mysqlEnum("channel", ["email", "whatsapp"]).notNull(),
    kind: varchar("kind", { length: 32 }).notNull(),
    recipient: varchar("recipient", { length: 254 }).notNull(),
    status: mysqlEnum("status", ["pending", "sent", "failed"]).notNull(),
    partsSent: int("parts_sent").notNull().default(0),
    attempts: int("attempts").notNull().default(0),
    nextAttemptAt: dateTime("next_attempt_at").notNull(),
    lockedUntil: dateTime("locked_until"),
    lastError: json("last_error"),
    sentAt: dateTime("sent_at"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("notifications_response_channel_kind_unique").on(
      t.quizResponseId,
      t.channel,
      t.kind,
    ),
    index("notifications_status_next_attempt_at_idx").on(t.status, t.nextAttemptAt),
  ],
)
