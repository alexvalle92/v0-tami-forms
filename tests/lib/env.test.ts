import { describe, expect, it } from "vitest"
import { parseEnv } from "@/lib/env"

const valid: Record<string, string | undefined> = {
  DATABASE_URL: "mysql://u:p@localhost:3306/db",
  ASAAS_ENV: "sandbox",
  ASAAS_API_KEY: "key",
  PAYMENT_SUCCESS_URL: "https://example.com/confirmationPayment",
  SMTP_HOST: "smtp.example.com",
  SMTP_PORT: "587",
  SMTP_USER: "user",
  SMTP_PASS: "pass",
  SMTP_FROM: "Nutri <no-reply@example.com>",
  EVOLUTION_API_URL: "https://evolution.example.com",
  EVOLUTION_API_KEY: "evo-key",
  EVOLUTION_INSTANCE: "instancia",
  ADMIN_ALERT_EMAIL: "admin@example.com",
  JOBS_TOKEN: "x".repeat(32),
  ASAAS_WEBHOOK_TOKEN: "w".repeat(32),
  ANTHROPIC_API_KEY: "sk-ant-test",
  ACCESS_PASSWORD_SECRET: "p".repeat(32),
}

describe("parseEnv", () => {
  it("aplica os defaults das variáveis opcionais", () => {
    const env = parseEnv(valid)
    expect(env.PAYMENT_AMOUNT).toBe("39.90")
    expect(env.PAYMENT_DUE_DAYS).toBe(2)
    expect(env.SMTP_PORT).toBe(587)
    expect(env.JOBS_ENABLED).toBe(true)
    expect(env.NOTIFY_EMAIL_ENABLED).toBe(true)
    expect(env.NOTIFY_WHATSAPP_ENABLED).toBe(true)
  })

  it('converte "false" em boolean false', () => {
    expect(parseEnv({ ...valid, JOBS_ENABLED: "false" }).JOBS_ENABLED).toBe(false)
  })

  it("lista o nome de cada variável ausente na mensagem de erro", () => {
    const call = () => parseEnv({ ...valid, DATABASE_URL: undefined, JOBS_TOKEN: undefined })
    expect(call).toThrow("DATABASE_URL")
    expect(call).toThrow("JOBS_TOKEN")
  })

  it("rejeita ASAAS_ENV inválido", () => {
    expect(() => parseEnv({ ...valid, ASAAS_ENV: "prod" })).toThrow(/ASAAS_ENV/)
  })

  it("rejeita JOBS_TOKEN curto", () => {
    expect(() => parseEnv({ ...valid, JOBS_TOKEN: "curto" })).toThrow(/JOBS_TOKEN/)
  })

  it("rejeita PAYMENT_AMOUNT com vírgula", () => {
    expect(() => parseEnv({ ...valid, PAYMENT_AMOUNT: "39,90" })).toThrow(/PAYMENT_AMOUNT/)
  })

  it("aplica os defaults das variáveis novas", () => {
    const env = parseEnv(valid)
    expect(env.ANTHROPIC_MODEL).toBe("claude-opus-5-5")
    expect(env.PLANA_APP_URL).toBe("https://plana.nutritamilivalle.com.br/")
  })

  it.each(["ASAAS_WEBHOOK_TOKEN", "ACCESS_PASSWORD_SECRET"])("%s com menos de 32 caracteres é inválida", (name) => {
    expect(() => parseEnv({ ...valid, [name]: "x".repeat(31) })).toThrow(name)
  })

  it("ANTHROPIC_API_KEY ausente é inválida", () => {
    expect(() => parseEnv({ ...valid, ANTHROPIC_API_KEY: undefined })).toThrow("ANTHROPIC_API_KEY")
  })

  it("PLANA_APP_URL precisa ser URL", () => {
    expect(() => parseEnv({ ...valid, PLANA_APP_URL: "nao-e-url" })).toThrow("PLANA_APP_URL")
  })
})
