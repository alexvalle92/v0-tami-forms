import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"
import { ALLOWED_ANSWER_KEYS, QUIZ_STEPS } from "@/lib/quiz/steps"

// As views do Metabase repetem as etapas e as chaves de resposta em SQL. Este teste pega a deriva entre
// QUIZ_STEPS / ALLOWED_ANSWER_KEYS e a migration das views, sem precisar de banco.
const MIGRATIONS_DIR = path.join(process.cwd(), "lib/db/migrations")

function viewsMigration(): string {
  const file = readdirSync(MIGRATIONS_DIR).find((f) => /^0005_.*\.sql$/.test(f))
  if (!file) throw new Error("migration 0005_*.sql (views do Metabase) não encontrada em lib/db/migrations")
  return readFileSync(path.join(MIGRATIONS_DIR, file), "utf8")
}

const HINT =
  "Quando entrar uma etapa nova (ou uma chave de resposta nova), é preciso criar uma migration que recria as views (DROP VIEW + CREATE VIEW) com a lista atualizada."

describe("migration das views x QUIZ_STEPS", () => {
  it("vw_funnel_steps lista as mesmas etapas e slugs de QUIZ_STEPS", () => {
    const sql = viewsMigration()
    const pairs = [...sql.matchAll(/SELECT (\d+)(?: AS step)?, '([a-z_]+)'(?: AS step_slug)?/g)].map((m) => [Number(m[1]), m[2]])
    expect(pairs, HINT).toEqual(QUIZ_STEPS.map((s, i) => [i, s.slug]))
  })

  it("vw_session_answers tem uma coluna por chave de ALLOWED_ANSWER_KEYS, na mesma ordem", () => {
    const sql = viewsMigration()
    const start = sql.indexOf("CREATE VIEW `vw_session_answers`")
    expect(start, "CREATE VIEW `vw_session_answers` não encontrado").toBeGreaterThanOrEqual(0)
    const end = sql.indexOf("--> statement-breakpoint", start)
    const statement = sql.slice(start, end === -1 ? undefined : end)
    const keys = [...statement.matchAll(/'\$\.([a-z_]+)'/g)].map((m) => m[1])
    expect(keys, HINT).toEqual([...ALLOWED_ANSWER_KEYS])
  })
})
