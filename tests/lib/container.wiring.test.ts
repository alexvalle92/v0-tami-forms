import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { getContainer } from "@/lib/container"

// Monta o container de verdade com um env completo e inválido para a rede: o pool do mysql2 só conecta na
// primeira consulta e o cliente da Anthropic só nasce na primeira geração, então nada aqui sai da máquina.
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

describe("getContainer (ligação das dependências do pós-pagamento)", () => {
  let saved: NodeJS.ProcessEnv

  beforeEach(() => {
    saved = { ...process.env }
    delete process.env.ANTHROPIC_MODEL
    Object.assign(process.env, VALID_ENV)
    delete globals.__tamiFormsContainer
  })

  afterEach(() => {
    for (const key of Object.keys(process.env)) delete process.env[key]
    Object.assign(process.env, saved)
    delete globals.__tamiFormsContainer
    delete globals.__tamiDb
  })

  it("expõe o tratamento de evento, a geração do plano e o aviso ao admin", () => {
    const c = getContainer()
    expect(c.handleAsaasEvent).toBeTypeOf("function")
    expect(c.runPlanGeneration).toBeTypeOf("function")
    expect(c.noticeAdmin).toBeTypeOf("function")
    expect(c.runner).toBeTypeOf("function")
    expect(c.retryFailed).toBeTypeOf("function")
    expect(c.env.ASAAS_WEBHOOK_TOKEN).toBe("w".repeat(32))
    expect(c.env.ANTHROPIC_MODEL).toBe("claude-opus-5-5")
  })

  it("expõe um limite próprio para os eventos do funil, separado do limite do envio", () => {
    const c = getContainer()
    expect(c.eventsRateLimiter).toBeDefined()
    expect(c.eventsRateLimiter).not.toBe(c.rateLimiter)
    expect(c.repos.analytics.recordBatch).toBeTypeOf("function")
  })
})
