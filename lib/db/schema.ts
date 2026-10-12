// Fonte única do schema. O PlanA (dieta-app) mantém uma cópia idêntica em lib/db/schema.ts,
// atualizada com "pnpm db:sync-schema" (que copia este arquivo).
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
  text,
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
    // Hash scrypt da senha de acesso (formato da seção 8 do spec); nulo até a primeira geração.
    passwordHash: varchar("password_hash", { length: 255 }),
    mustChangePassword: boolean("must_change_password").notNull().default(false),
    passwordSetAt: dateTime("password_set_at"),
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
    // Preenchido uma única vez, no primeiro evento de pagamento do Asaas.
    paidAt: dateTime("paid_at"),
    paymentDate: date("payment_date", { mode: "string" }),
    lastEvent: varchar("last_event", { length: 64 }),
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

// Fila de mensagens. `quiz_response_id` e `payment_id` são nulos nas mensagens que não nascem de um
// envio do quiz (ex.: `password_reset`, pedida pelo PlanA); `patient_id` é sempre preenchido.
export const notifications = mysqlTable(
  "notifications",
  {
    id: char("id", { length: 36 }).primaryKey(),
    patientId: char("patient_id", { length: 36 })
      .notNull()
      .references(() => patients.id),
    quizResponseId: char("quiz_response_id", { length: 36 }).references(() => quizResponses.id),
    paymentId: char("payment_id", { length: 36 }).references(() => payments.id),
    // Só nos avisos de vencimento (plan_expiring_*): um aviso por plano, canal e estágio.
    mealPlanId: char("meal_plan_id", { length: 36 }).references(() => mealPlans.id),
    channel: mysqlEnum("channel", ["email", "whatsapp"]).notNull(),
    kind: varchar("kind", { length: 32 }).notNull(),
    recipient: varchar("recipient", { length: 254 }).notNull(),
    status: mysqlEnum("status", ["pending", "sent", "failed"]).notNull(),
    partsSent: int("parts_sent").notNull().default(0),
    attempts: int("attempts").notNull().default(0),
    nextAttemptAt: dateTime("next_attempt_at").notNull(),
    lockedUntil: dateTime("locked_until"),
    lastError: json("last_error"),
    // Dados que só a mensagem usa (ex.: o link de redefinição de senha); apagado quando a mensagem sai.
    payload: json("payload").$type<{ link?: string }>(),
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
    uniqueIndex("notifications_plan_channel_kind_unique").on(t.mealPlanId, t.channel, t.kind),
    index("notifications_status_next_attempt_at_idx").on(t.status, t.nextAttemptAt),
    index("notifications_patient_id_idx").on(t.patientId),
  ],
)

// Ledger de idempotência do webhook do Asaas: o corpo do evento NÃO é gravado
// (traz o token e o final do cartão). A linha nunca muda, por isso sem updated_at.
export const asaasWebhookEvents = mysqlTable("asaas_webhook_events", {
  id: varchar("id", { length: 128 }).primaryKey(),
  event: varchar("event", { length: 64 }).notNull(),
  asaasPaymentId: varchar("asaas_payment_id", { length: 64 }),
  paymentId: char("payment_id", { length: 36 }).references(() => payments.id),
  outcome: mysqlEnum("outcome", ["processed", "ignored"]).notNull(),
  createdAt: createdAt(),
})

// Plano alimentar pronto, no formato que o PlanA lê. Só recebe plano concluído.
export const mealPlans = mysqlTable(
  "meal_plans",
  {
    id: char("id", { length: 36 }).primaryKey(),
    patientId: char("patient_id", { length: 36 })
      .notNull()
      .references(() => patients.id),
    // Nulo em planos criados à mão pelo admin do PlanA.
    paymentId: char("payment_id", { length: 36 }).references(() => payments.id),
    quizResponseId: char("quiz_response_id", { length: 36 }).references(() => quizResponses.id),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    startDate: date("start_date", { mode: "string" }).notNull(),
    endDate: date("end_date", { mode: "string" }),
    status: varchar("status", { length: 32 }).notNull().default("active"),
    planData: json("plan_data").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("meal_plans_payment_id_unique").on(t.paymentId),
    index("meal_plans_patient_id_status_idx").on(t.patientId, t.status),
    index("meal_plans_status_end_date_idx").on(t.status, t.endDate),
  ],
)

// Fila de trabalho da geração do plano por IA: uma geração por cobrança paga.
export const planGenerations = mysqlTable(
  "plan_generations",
  {
    id: char("id", { length: 36 }).primaryKey(),
    paymentId: char("payment_id", { length: 36 })
      .notNull()
      .references(() => payments.id),
    patientId: char("patient_id", { length: 36 })
      .notNull()
      .references(() => patients.id),
    quizResponseId: char("quiz_response_id", { length: 36 })
      .notNull()
      .references(() => quizResponses.id),
    status: mysqlEnum("status", ["pending", "done", "failed"]).notNull(),
    mealPlanId: char("meal_plan_id", { length: 36 }).references(() => mealPlans.id),
    attempts: int("attempts").notNull().default(0),
    nextAttemptAt: dateTime("next_attempt_at"),
    lockedUntil: dateTime("locked_until"),
    lastError: json("last_error"),
    generation: json("generation"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("plan_generations_payment_id_unique").on(t.paymentId),
    index("plan_generations_status_next_attempt_at_idx").on(t.status, t.nextAttemptAt),
  ],
)

// ---------------------------------------------------------------------------
// Tabelas do PlanA (dieta-app). Criadas aqui para que um único app, este, seja dono de todas as
// migrations; o PlanA só lê e grava.
// ---------------------------------------------------------------------------

export const admins = mysqlTable(
  "admins",
  {
    id: char("id", { length: 36 }).primaryKey(),
    name: varchar("name", { length: 200 }).notNull(),
    // Sempre em minúsculas.
    email: varchar("email", { length: 254 }).notNull(),
    // Hash scrypt, mesmo formato de `patients.password_hash`.
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    // O primeiro admin nasce só com nome, e-mail e senha; os demais campos são opcionais.
    cpf: char("cpf", { length: 11 }),
    phone: varchar("phone", { length: 13 }),
    crn: varchar("crn", { length: 32 }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("admins_email_unique").on(t.email)],
)

export const passwordResetTokens = mysqlTable(
  "password_reset_tokens",
  {
    id: char("id", { length: 36 }).primaryKey(),
    patientId: char("patient_id", { length: 36 })
      .notNull()
      .references(() => patients.id),
    // SHA-256 do token em hexadecimal; o token em texto puro nunca é gravado aqui.
    tokenHash: char("token_hash", { length: 64 }).notNull(),
    expiresAt: dateTime("expires_at").notNull(),
    used: boolean("used").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("password_reset_tokens_token_hash_unique").on(t.tokenHash),
    index("password_reset_tokens_patient_id_idx").on(t.patientId),
  ],
)

export const recipes = mysqlTable(
  "recipes",
  {
    id: char("id", { length: 36 }).primaryKey(),
    title: varchar("title", { length: 200 }).notNull(),
    description: text("description"),
    ingredients: json("ingredients").$type<string[]>().notNull(),
    preparation: text("preparation").notNull(),
    tips: text("tips"),
    prepTime: int("prep_time"),
    servings: int("servings"),
    calories: int("calories"),
    category: varchar("category", { length: 100 }),
    imageUrl: text("image_url"),
    portionQuantity: decimal("portion_quantity", { precision: 10, scale: 2, mode: "number" }),
    proteins: decimal("proteins", { precision: 10, scale: 2, mode: "number" }),
    lipids: decimal("lipids", { precision: 10, scale: 2, mode: "number" }),
    carbohydrates: decimal("carbohydrates", { precision: 10, scale: 2, mode: "number" }),
    fiber: decimal("fiber", { precision: 10, scale: 2, mode: "number" }),
    activeCustomer: boolean("active_customer").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("recipes_category_idx").on(t.category)],
)

export const mealCategories = mysqlTable(
  "meal_categories",
  {
    id: char("id", { length: 36 }).primaryKey(),
    name: varchar("name", { length: 100 }).notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("meal_categories_name_unique").on(t.name)],
)

// Configuração do admin: apagar a categoria ou a receita apaga os itens ligados. Única tabela do
// banco com cascata.
export const allowedMealItems = mysqlTable("allowed_meal_items", {
  id: char("id", { length: 36 }).primaryKey(),
  mealCategoryId: char("meal_category_id", { length: 36 })
    .notNull()
    .references(() => mealCategories.id, { onDelete: "cascade" }),
  // "food" ou "recipe".
  itemType: varchar("item_type", { length: 16 }).notNull(),
  foodName: varchar("food_name", { length: 200 }),
  recipeId: char("recipe_id", { length: 36 }).references(() => recipes.id, { onDelete: "cascade" }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})

// Uma única linha, id "global".
export const appSettings = mysqlTable("app_settings", {
  id: varchar("id", { length: 32 }).primaryKey(),
  dietTechnicalDefinition: text("diet_technical_definition").notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
})
