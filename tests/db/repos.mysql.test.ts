import { randomUUID } from "node:crypto"
import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { eq, sql } from "drizzle-orm"
import type mysql from "mysql2/promise"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { createDb, type Db } from "@/lib/db/client"
import { runMigrations } from "@/lib/db/migrate"
import { createMysqlRepos } from "@/lib/db/repos/mysql"
import { mealPlans, notifications, patients, payments, quizResponses } from "@/lib/db/schema"
import { defineRepoContract } from "./repos.contract"

// Roda o contrato contra um MySQL 8 real. Sem TEST_DATABASE_URL o arquivo é pulado.
const url = process.env.TEST_DATABASE_URL

const MIGRATIONS_DIR = path.join(process.cwd(), "lib/db/migrations")

async function dropAllTables(pool: mysql.Pool) {
  const connection = await pool.getConnection()
  try {
    await connection.query("SET FOREIGN_KEY_CHECKS=0")
    const [rows] = await connection.query<mysql.RowDataPacket[]>(
      "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE()",
    )
    for (const row of rows) await connection.query(`DROP TABLE \`${row.name}\``)
  } finally {
    await connection.query("SET FOREIGN_KEY_CHECKS=1")
    connection.release()
  }
}

async function applyMigrationFile(pool: mysql.Pool, prefix: string) {
  const file = readdirSync(MIGRATIONS_DIR).find((f) => f.startsWith(prefix) && f.endsWith(".sql"))
  if (!file) throw new Error(`migration ${prefix} não encontrada`)
  const text = readFileSync(path.join(MIGRATIONS_DIR, file), "utf8")
  for (const statement of text.split("--> statement-breakpoint")) {
    if (statement.trim()) await pool.query(statement)
  }
}

// Aplica à mão (e não pelo migrator) para parar entre a 0001 e a 0002 com dados gravados.
describe.skipIf(!url)("migration 0002 em banco com mensagens", () => {
  let pool: mysql.Pool

  const applyMigration = (prefix: string) => applyMigrationFile(pool, prefix)

  beforeAll(async () => {
    ;({ pool } = createDb(url!))
    await dropAllTables(pool)
  }, 60_000)

  afterAll(async () => {
    await dropAllTables(pool)
    await pool?.end()
  }, 60_000)

  it("preenche notifications.patient_id das linhas existentes e afrouxa os vínculos", async () => {
    await applyMigration("0000_")
    await applyMigration("0001_")

    const patientId = randomUUID()
    const paymentId = randomUUID()
    const quizResponseId = randomUUID()
    const notificationId = randomUUID()
    await pool.query("INSERT INTO patients (id, name, cpf, email, phone) VALUES (?, 'Ana', '52998224725', 'ana@example.com', '11987654321')", [patientId])
    await pool.query("INSERT INTO payments (id, patient_id, amount, status) VALUES (?, ?, '39.90', 'PENDING')", [paymentId, patientId])
    await pool.query("INSERT INTO quiz_responses (id, submission_id, patient_id, answers, first_quiz, payment_id) VALUES (?, ?, ?, '{}', true, ?)", [
      quizResponseId,
      randomUUID(),
      patientId,
      paymentId,
    ])
    await pool.query(
      "INSERT INTO notifications (id, quiz_response_id, payment_id, channel, kind, recipient, status, next_attempt_at) VALUES (?, ?, ?, 'email', 'payment_link', 'ana@example.com', 'pending', NOW(3))",
      [notificationId, quizResponseId, paymentId],
    )

    await applyMigration("0002_")

    const [rows] = await pool.query<mysql.RowDataPacket[]>("SELECT patient_id FROM notifications WHERE id = ?", [notificationId])
    expect(rows[0].patient_id).toBe(patientId)

    const [columns] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT column_name AS name, is_nullable AS nullable FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'notifications' AND column_name IN ('patient_id', 'quiz_response_id', 'payment_id')",
    )
    const nullable = Object.fromEntries(columns.map((c) => [c.name, c.nullable]))
    expect(nullable).toEqual({ patient_id: "NO", quiz_response_id: "YES", payment_id: "YES" })
  }, 60_000)
})

// Mesmo molde: para entre a 0002 e a 0003 com um plano que usa as colunas que saem.
describe.skipIf(!url)("migration 0003 em banco com dados", () => {
  let pool: mysql.Pool

  const applyMigration = (prefix: string) => applyMigrationFile(pool, prefix)

  beforeAll(async () => {
    ;({ pool } = createDb(url!))
    await dropAllTables(pool)
  }, 60_000)

  afterAll(async () => {
    await dropAllTables(pool)
    await pool?.end()
  }, 60_000)

  it("tira as colunas de renovação do plano e liga a notificação ao plano", async () => {
    await applyMigration("0000_")
    await applyMigration("0001_")
    await applyMigration("0002_")

    const patientId = randomUUID()
    const mealPlanId = randomUUID()
    const notificationId = randomUUID()
    await pool.query("INSERT INTO patients (id, name, cpf, email, phone) VALUES (?, 'Ana', '52998224725', 'ana@example.com', '11987654321')", [patientId])
    await pool.query(
      "INSERT INTO meal_plans (id, patient_id, title, start_date, end_date, due_date_new_meal_plan, payment_url_new_meal_plan, status, plan_data) VALUES (?, ?, 'Plano', '2026-09-12', '2026-10-12', '2026-10-14', 'https://asaas.example/i/1', 'active', '{}')",
      [mealPlanId, patientId],
    )
    await pool.query(
      "INSERT INTO notifications (id, patient_id, channel, kind, recipient, status, next_attempt_at) VALUES (?, ?, 'email', 'password_reset', 'ana@example.com', 'pending', NOW(3))",
      [notificationId, patientId],
    )

    await applyMigration("0003_")

    const [planColumns] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT column_name AS name FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'meal_plans' AND column_name IN ('due_date_new_meal_plan', 'payment_url_new_meal_plan')",
    )
    expect(planColumns).toEqual([])

    const [columns] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT is_nullable AS nullable FROM information_schema.columns WHERE table_schema = DATABASE() AND table_name = 'notifications' AND column_name = 'meal_plan_id'",
    )
    expect(columns.map((c) => c.nullable)).toEqual(["YES"])
    const [rows] = await pool.query<mysql.RowDataPacket[]>("SELECT meal_plan_id FROM notifications WHERE id = ?", [notificationId])
    expect(rows[0].meal_plan_id).toBeNull()

    const [indexes] = await pool.query<mysql.RowDataPacket[]>(
      "SELECT DISTINCT index_name AS name FROM information_schema.statistics WHERE table_schema = DATABASE() AND index_name IN ('notifications_plan_channel_kind_unique', 'meal_plans_status_end_date_idx') ORDER BY index_name",
    )
    expect(indexes.map((i) => i.name)).toEqual([
      "meal_plans_status_end_date_idx",
      "notifications_plan_channel_kind_unique",
    ])
  }, 60_000)
})

describe.skipIf(!url)("repositórios MySQL", () => {
  let db: Db
  let pool: mysql.Pool

  beforeAll(async () => {
    ;({ db, pool } = createDb(url!))
    // Duas vezes: prova que as migrations são idempotentes. O banco chega vazio (os testes de
    // migration acima apagam tudo), então a primeira aplica as quatro: daí o prazo maior.
    await runMigrations(db)
    await runMigrations(db)
  }, 60_000)

  beforeEach(async () => {
    // SET FOREIGN_KEY_CHECKS vale por conexão: o reset inteiro roda em UMA conexão dedicada.
    const connection = await pool.getConnection()
    try {
      await connection.query("SET FOREIGN_KEY_CHECKS=0")
      for (const table of [
        "notifications",
        "plan_generations",
        "meal_plans",
        "asaas_webhook_events",
        "quiz_responses",
        "payments",
        "allowed_meal_items",
        "meal_categories",
        "recipes",
        "app_settings",
        "password_reset_tokens",
        "admins",
        "patients",
      ]) {
        await connection.query(`TRUNCATE TABLE ${table}`)
      }
    } finally {
      await connection.query("SET FOREIGN_KEY_CHECKS=1")
      connection.release()
    }
  })

  afterAll(async () => {
    await pool?.end()
  })

  defineRepoContract("mysql", async () => createMysqlRepos(db))

  describe("linhas gravadas (o que a interface pública não mostra)", () => {
    const newSub = (over: { submissionId?: string; cpf?: string; name?: string } = {}) => ({
      submissionId: over.submissionId ?? randomUUID(),
      patient: {
        name: over.name ?? "Paciente Teste",
        cpf: over.cpf ?? "12345678909",
        email: "paciente@example.com",
        phone: "11999998888",
      },
      answers: { peso: 70 },
      amount: "39.90",
      todaySP: "2026-10-07",
    })

    const firstQuizOf = async (submissionId: string) => {
      const [row] = await db
        .select({ firstQuiz: quizResponses.firstQuiz })
        .from(quizResponses)
        .where(eq(quizResponses.submissionId, submissionId))
      return row.firstQuiz
    }

    it("first_quiz: true no primeiro envio do CPF, false nos seguintes", async () => {
      const repos = createMysqlRepos(db)
      const first = newSub()
      const second = newSub({ cpf: first.patient.cpf })
      expect(await repos.submissions.create(first)).not.toBe("duplicate")
      expect(await repos.submissions.create(second)).not.toBe("duplicate")

      expect(await firstQuizOf(first.submissionId)).toBe(true)
      expect(await firstQuizOf(second.submissionId)).toBe(false)
    })

    it("envios concorrentes do mesmo CPF são serializados: um paciente, uma cobrança, um first_quiz", async () => {
      const repos = createMysqlRepos(db)
      const cpf = "98765432100"
      const subs = Array.from({ length: 5 }, () => newSub({ cpf }))
      const results = await Promise.all(subs.map((s) => repos.submissions.create(s)))

      const refs = results.map((r) => {
        if (r === "duplicate") throw new Error("duplicate inesperado")
        return r
      })
      expect(new Set(refs.map((r) => r.paymentId)).size).toBe(1)
      expect(new Set(refs.map((r) => r.quizResponseId)).size).toBe(5)
      const flags = await Promise.all(subs.map((s) => firstQuizOf(s.submissionId)))
      expect(flags.filter(Boolean)).toHaveLength(1)
      const rows = await db.select({ id: patients.id }).from(patients).where(eq(patients.cpf, cpf))
      expect(rows).toHaveLength(1)
    })

    it("nome com emoji: os bytes gravados são utf8mb4 e voltam idênticos", async () => {
      const repos = createMysqlRepos(db)
      const name = "Ana Souza 💚"
      const s = newSub({ name })
      await repos.submissions.create(s)

      const [row] = await db
        .select({ name: patients.name, hex: sql<string>`HEX(${patients.name})` })
        .from(patients)
        .where(eq(patients.cpf, s.patient.cpf))
      expect(row.name).toBe(name)
      expect(row.hex).toBe(Buffer.from(name, "utf8").toString("hex").toUpperCase())
      expect(row.hex).toContain("F09F929A") // 💚 em UTF-8, 4 bytes
    })

    it("datas em UTC: o instante gravado em next_sync_at é exatamente o informado", async () => {
      const repos = createMysqlRepos(db)
      const ref = await repos.submissions.create(newSub())
      if (ref === "duplicate") throw new Error("duplicate inesperado")
      const x = new Date("2026-03-15T03:04:05.678Z")

      await repos.payments.markSyncFailure(ref.paymentId, {
        attempts: 1,
        nextSyncAt: x,
        failed: false,
        error: { step: "s", message: "m", attempt: 1, at: x.toISOString() },
      })

      const [row] = await db
        .select({
          nextSyncAt: payments.nextSyncAt,
          raw: sql<string>`DATE_FORMAT(${payments.nextSyncAt}, '%Y-%m-%d %H:%i:%s.%f')`,
        })
        .from(payments)
        .where(eq(payments.id, ref.paymentId))
      expect(row.nextSyncAt!.getTime()).toBe(x.getTime())
      expect(row.raw).toBe("2026-03-15 03:04:05.678000")
      // E o filtro do listDue usa o mesmo instante, sem deslocamento de fuso.
      expect(await repos.payments.listDue(x, 100)).toEqual([ref.paymentId])
      expect(await repos.payments.listDue(new Date(x.getTime() - 1), 100)).toEqual([])
    })

    it("runMigrations é idempotente: só as 13 tabelas dos dois apps + a de controle do drizzle", async () => {
      const [rows] = await pool.query<mysql.RowDataPacket[]>(
        "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name",
      )
      expect(rows.map((r) => r.name)).toEqual([
        "__drizzle_migrations",
        "admins",
        "allowed_meal_items",
        "app_settings",
        "asaas_webhook_events",
        "meal_categories",
        "meal_plans",
        "notifications",
        "password_reset_tokens",
        "patients",
        "payments",
        "plan_generations",
        "quiz_responses",
        "recipes",
      ])
      const [migrations] = await pool.query<mysql.RowDataPacket[]>(
        "SELECT COUNT(*) AS n FROM __drizzle_migrations",
      )
      expect(Number(migrations[0].n)).toBe(4)
    })

    it("aviso de vencimento: plano do admin e plano sem data de fim", async () => {
      const repos = createMysqlRepos(db)
      const today = "2026-10-12"
      const now = new Date()
      const patientId = randomUUID()
      await db.insert(patients).values({
        id: patientId,
        name: "Ana Souza",
        cpf: "52998224725",
        email: "ana@example.com",
        phone: "11987654321",
        createdAt: now,
        updatedAt: now,
      })
      // Como o admin do PlanA cria: sem cobrança nem envio do quiz.
      const adminPlan = (id: string, endDate: string | null) => ({
        id,
        patientId,
        title: "Plano do admin",
        startDate: "2026-09-12",
        endDate,
        status: "active",
        planData: { meals: [], calories: 0, observations: "" },
        createdAt: now,
        updatedAt: now,
      })
      const endsToday = randomUUID()
      const noEnd = randomUUID()
      await db.insert(mealPlans).values([adminPlan(endsToday, today), adminPlan(noEnd, null)])

      expect(
        await repos.notifications.enqueuePlanExpiring({ today, channels: ["email", "whatsapp"], now }),
      ).toBe(2)

      const rowsOf = (mealPlanId: string) =>
        db
          .select({
            kind: notifications.kind,
            channel: notifications.channel,
            recipient: notifications.recipient,
            paymentId: notifications.paymentId,
            quizResponseId: notifications.quizResponseId,
            patientId: notifications.patientId,
          })
          .from(notifications)
          .where(eq(notifications.mealPlanId, mealPlanId))
          .orderBy(notifications.channel)
      expect(await rowsOf(endsToday)).toEqual([
        { kind: "plan_expiring_d0", channel: "email", recipient: "ana@example.com", paymentId: null, quizResponseId: null, patientId },
        { kind: "plan_expiring_d0", channel: "whatsapp", recipient: "5511987654321", paymentId: null, quizResponseId: null, patientId },
      ])
      expect(await rowsOf(noEnd)).toEqual([])
    })

    describe("password_reset: mensagem sem quiz nem cobrança", () => {
      const insertPasswordReset = async (patientId: string, link: string | null) => {
        const id = randomUUID()
        const now = new Date()
        await db.insert(notifications).values({
          id,
          patientId,
          quizResponseId: null,
          paymentId: null,
          channel: "email",
          kind: "password_reset",
          recipient: "paciente@example.com",
          status: "pending",
          nextAttemptAt: now,
          payload: link ? { link } : null,
          createdAt: now,
          updatedAt: now,
        })
        return id
      }

      const patientIdOf = async (cpf: string) => {
        const [row] = await db.select({ id: patients.id }).from(patients).where(eq(patients.cpf, cpf))
        return row.id
      }

      it("get devolve vínculos nulos, o payload e o paciente; markSent apaga o payload", async () => {
        const repos = createMysqlRepos(db)
        const s = newSub({ name: "Ana Souza" })
        await repos.submissions.create(s)
        const patientId = await patientIdOf(s.patient.cpf)

        const id = await insertPasswordReset(patientId, "https://x/y")

        expect(await repos.notifications.get(id)).toMatchObject({
          kind: "password_reset",
          quizResponseId: null,
          paymentId: null,
          paymentUrl: null,
          payload: { link: "https://x/y" },
          patientId,
          patientName: "Ana Souza",
        })

        await repos.notifications.markSent(id)
        expect(await repos.notifications.get(id)).toMatchObject({ status: "sent", payload: null })
      })

      it("duas mensagens do mesmo paciente e canal coexistem (a chave única não as barra)", async () => {
        const repos = createMysqlRepos(db)
        const s = newSub()
        await repos.submissions.create(s)
        const patientId = await patientIdOf(s.patient.cpf)

        const first = await insertPasswordReset(patientId, "https://x/1")
        const second = await insertPasswordReset(patientId, "https://x/2")

        expect(first).not.toBe(second)
        expect((await repos.notifications.get(first))!.payload).toEqual({ link: "https://x/1" })
        expect((await repos.notifications.get(second))!.payload).toEqual({ link: "https://x/2" })
      })

      it("enqueuePaymentLink e complete passam a gravar patient_id", async () => {
        const repos = createMysqlRepos(db)
        const s = newSub()
        const ref = await repos.submissions.create(s)
        if (ref === "duplicate") throw new Error("duplicate inesperado")
        await repos.notifications.enqueuePaymentLink({ quizResponseId: ref.quizResponseId }, ["email", "whatsapp"])

        const rows = await db
          .select({ patientId: notifications.patientId })
          .from(notifications)
          .where(eq(notifications.quizResponseId, ref.quizResponseId))
        expect(rows).toHaveLength(2)
        expect(new Set(rows.map((r) => r.patientId))).toEqual(new Set([await patientIdOf(s.patient.cpf)]))
      })
    })
  })
})
