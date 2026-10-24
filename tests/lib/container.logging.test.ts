import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { getContainer } from "@/lib/container"

// O logger do container está ligado ao persister de app_logs. O pool do mysql2 só conecta na primeira
// consulta, e `insertMany` é trocado por um espião antes do primeiro log: nada aqui toca em banco.
const VALID_ENV: Record<string, string> = {
  DATABASE_URL: "mysql://u:p@127.0.0.1:3306/x",
  ASAAS_ENV: "sandbox",
  ASAAS_API_KEY: "asaas-key",
  PAYMENT_SUCCESS_URL: "https://example.com/obrigado",
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: "587",
  SMTP_USER: "user",
  SMTP_PASS: "pass",
  SMTP_FROM: "tami@example.com",
  EVOLUTION_API_URL: "https://evolution.example.com",
  EVOLUTION_API_KEY: "evolution-key",
  EVOLUTION_INSTANCE: "instance",
  ADMIN_ALERT_EMAIL: "admin@example.com",
  JOBS_TOKEN: "j".repeat(32),
  ASAAS_WEBHOOK_TOKEN: "w".repeat(32),
  ANTHROPIC_API_KEY: "anthropic-key",
  ACCESS_PASSWORD_SECRET: "s".repeat(32),
}

const globals = globalThis as typeof globalThis & { __tamiFormsContainer?: unknown; __tamiDb?: unknown }

describe("getContainer: logger ligado ao persister de app_logs", () => {
  let saved: NodeJS.ProcessEnv

  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, "log").mockImplementation(() => {})
    saved = { ...process.env }
    delete process.env.ANTHROPIC_MODEL
    Object.assign(process.env, VALID_ENV)
    delete globals.__tamiFormsContainer
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    for (const key of Object.keys(process.env)) delete process.env[key]
    Object.assign(process.env, saved)
    delete globals.__tamiFormsContainer
    delete globals.__tamiDb
  })

  it("um warn do container chega a repos.appLogs.insertMany, mascarado, depois do intervalo do persister", async () => {
    const c = getContainer()
    const insertMany = vi.spyOn(c.repos.appLogs, "insertMany").mockResolvedValue(undefined)

    c.log.warn("x.test", { cpf: "05687104950", n: 1 })
    expect(insertMany).not.toHaveBeenCalled()

    await vi.advanceTimersByTimeAsync(2000)

    expect(insertMany).toHaveBeenCalledTimes(1)
    expect(insertMany.mock.calls[0][0]).toEqual([
      { ts: expect.any(Date), level: "warn", event: "x.test", area: "x", fields: { cpf: "***.***.*49-50", n: 1 } },
    ])
  })

  it("rate limit não é gravado e info fora da lista também não", async () => {
    const c = getContainer()
    const insertMany = vi.spyOn(c.repos.appLogs, "insertMany").mockResolvedValue(undefined)

    c.log.warn("events.rate_limited")
    c.log.info("job.round.done")
    await vi.advanceTimersByTimeAsync(5000)

    expect(insertMany).not.toHaveBeenCalled()
  })
})
