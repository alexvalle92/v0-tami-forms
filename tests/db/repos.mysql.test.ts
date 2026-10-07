import { randomUUID } from "node:crypto"
import { eq, sql } from "drizzle-orm"
import type mysql from "mysql2/promise"
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest"
import { createDb, type Db } from "@/lib/db/client"
import { runMigrations } from "@/lib/db/migrate"
import { createMysqlRepos } from "@/lib/db/repos/mysql"
import { patients, payments, quizResponses } from "@/lib/db/schema"
import { defineRepoContract } from "./repos.contract"

// Roda o contrato contra um MySQL 8 real. Sem TEST_DATABASE_URL o arquivo é pulado.
const url = process.env.TEST_DATABASE_URL

describe.skipIf(!url)("repositórios MySQL", () => {
  let db: Db
  let pool: mysql.Pool

  beforeAll(async () => {
    ;({ db, pool } = createDb(url!))
    // Duas vezes: prova que as migrations são idempotentes.
    await runMigrations(db)
    await runMigrations(db)
  })

  beforeEach(async () => {
    // SET FOREIGN_KEY_CHECKS vale por conexão: o reset inteiro roda em UMA conexão dedicada.
    const connection = await pool.getConnection()
    try {
      await connection.query("SET FOREIGN_KEY_CHECKS=0")
      for (const table of ["notifications", "quiz_responses", "payments", "patients"]) {
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

    it("runMigrations é idempotente: só as 4 tabelas + a de controle do drizzle", async () => {
      const [rows] = await pool.query<mysql.RowDataPacket[]>(
        "SELECT table_name AS name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name",
      )
      expect(rows.map((r) => r.name)).toEqual([
        "__drizzle_migrations",
        "notifications",
        "patients",
        "payments",
        "quiz_responses",
      ])
      const [migrations] = await pool.query<mysql.RowDataPacket[]>(
        "SELECT COUNT(*) AS n FROM __drizzle_migrations",
      )
      expect(Number(migrations[0].n)).toBe(1)
    })
  })
})
