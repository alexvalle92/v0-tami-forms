import { z } from "zod"

const required = z.string().min(1)

const booleanFlag = z
  .enum(["true", "false"])
  .default("true")
  .transform((value) => value === "true")

const envSchema = z.object({
  DATABASE_URL: required,
  ASAAS_ENV: z.enum(["sandbox", "production"]),
  ASAAS_API_KEY: required,
  PAYMENT_AMOUNT: z
    .string()
    .regex(/^\d+(\.\d{1,2})?$/)
    .default("39.90"),
  PAYMENT_DUE_DAYS: z.coerce.number().int().positive().default(2),
  PAYMENT_SUCCESS_URL: z.string().url(),
  SMTP_HOST: required,
  SMTP_PORT: z.coerce.number().int().positive(),
  SMTP_USER: required,
  SMTP_PASS: required,
  SMTP_FROM: required,
  EVOLUTION_API_URL: z.string().url(),
  EVOLUTION_API_KEY: required,
  EVOLUTION_INSTANCE: required,
  ADMIN_ALERT_EMAIL: z.string().email(),
  JOBS_TOKEN: z.string().min(32),
  JOBS_ENABLED: booleanFlag,
  NOTIFY_EMAIL_ENABLED: booleanFlag,
  NOTIFY_WHATSAPP_ENABLED: booleanFlag,
})

export type Env = z.infer<typeof envSchema>

export function parseEnv(raw: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(raw)
  if (result.success) return result.data

  const invalid = [...new Set(result.error.issues.map((issue) => issue.path.join(".")))]
  throw new Error(`Variáveis de ambiente inválidas ou ausentes: ${invalid.join(", ")}`)
}

let cached: Env | undefined

export function getEnv(): Env {
  cached ??= parseEnv(process.env)
  return cached
}
