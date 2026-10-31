import { z } from "zod"

const required = z.string().min(1)

const booleanFlag = z
  .enum(["true", "false"])
  .default("true")
  .transform((value) => value === "true")

// Interruptores que começam desligados, ao contrário dos outros (rastreamento da Meta e desconto na cobrança).
// Nas variáveis META_* e PAYMENT_DISCOUNT_*, valor em branco conta como ausente e o formato só é conferido
// com a chave ligada: desligada, uma variável esquecida ou malformada no painel não impede o app de subir.
const blankAsMissing = (value: unknown) => (typeof value === "string" && value.trim() === "" ? undefined : value)

const offByDefaultFlag = z.preprocess(
  blankAsMissing,
  z
    .enum(["true", "false"])
    .default("false")
    .transform((value) => value === "true"),
)

const metaText = z.preprocess(blankAsMissing, z.string().optional())

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
  ASAAS_WEBHOOK_TOKEN: z.string().min(32),
  ANTHROPIC_API_KEY: required,
  ANTHROPIC_MODEL: z.string().min(1).default("claude-opus-5-5"),
  ACCESS_PASSWORD_SECRET: z.string().min(32),
  PLANA_APP_URL: z.string().url().default("https://plana.nutritamilivalle.com.br/"),
  META_TRACKING_ENABLED: offByDefaultFlag,
  META_PIXEL_ID: metaText,
  META_CAPI_TOKEN: metaText,
  META_API_VERSION: z.preprocess(blankAsMissing, z.string().default("v24.0")),
  META_TEST_EVENT_CODE: metaText,
  PAYMENT_DISCOUNT_ENABLED: offByDefaultFlag,
  PAYMENT_DISCOUNT_AMOUNT: z.preprocess(blankAsMissing, z.string().default("29.90")),
  PAYMENT_DISCOUNT_DUE_DAYS: z.preprocess(blankAsMissing, z.string().default("5")),
}).superRefine((env, ctx) => {
  const issue = (name: string, message: string) => ctx.addIssue({ code: z.ZodIssueCode.custom, path: [name], message })
  if (env.PAYMENT_DISCOUNT_ENABLED) {
    const amount = env.PAYMENT_DISCOUNT_AMOUNT
    if (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0) {
      issue("PAYMENT_DISCOUNT_AMOUNT", "valor maior que zero, com ponto e até 2 casas (ex.: 29.90)")
    }
    if (!/^\d+$/.test(env.PAYMENT_DISCOUNT_DUE_DAYS) || Number(env.PAYMENT_DISCOUNT_DUE_DAYS) <= 0) {
      issue("PAYMENT_DISCOUNT_DUE_DAYS", "inteiro positivo")
    }
  }
  if (!env.META_TRACKING_ENABLED) return
  if (!env.META_PIXEL_ID) issue("META_PIXEL_ID", "obrigatória com o rastreamento da Meta ligado")
  else if (!/^\d+$/.test(env.META_PIXEL_ID)) issue("META_PIXEL_ID", "só dígitos")
  if (!env.META_CAPI_TOKEN) issue("META_CAPI_TOKEN", "obrigatória com o rastreamento da Meta ligado")
  if (!/^v\d+\.\d+$/.test(env.META_API_VERSION)) issue("META_API_VERSION", "formato vNN.N")
}).transform((env) => {
  // Com a chave desligada o prazo pode ser lixo; nesse caso volta ao padrão em vez de virar NaN.
  const dueDays = Number(env.PAYMENT_DISCOUNT_DUE_DAYS)
  return { ...env, PAYMENT_DISCOUNT_DUE_DAYS: Number.isInteger(dueDays) && dueDays > 0 ? dueDays : 5 }
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
