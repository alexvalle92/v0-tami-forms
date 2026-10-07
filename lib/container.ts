import { sql } from "drizzle-orm"
import { createAsaasClient, type AsaasClient } from "@/lib/asaas/client"
import { getDb } from "@/lib/db/client"
import { createMysqlRepos } from "@/lib/db/repos/mysql"
import type { Channel, Repos } from "@/lib/db/repos/types"
import { getEnv, type Env } from "@/lib/env"
import { createRateLimiter, type RateLimiter } from "@/lib/http/rate-limit"
import { createRetryFailed, type RetryTarget } from "@/lib/jobs/retry-failed"
import { createRunJobs } from "@/lib/jobs/run-jobs"
import { createExclusiveRunner } from "@/lib/jobs/scheduler"
import { createLogger, type Logger } from "@/lib/log"
import { createSmtpEmailSender, type EmailSender } from "@/lib/notify/email"
import { createEvolutionWhatsAppSender, type WhatsAppSender } from "@/lib/notify/whatsapp"
import { createAlertAdmin } from "@/lib/services/alert-admin"
import { createDispatchForQuizResponse } from "@/lib/services/dispatch-for-quiz-response"
import { createDispatchNotification, type DispatchNotification } from "@/lib/services/dispatch-notification"
import { createSubmitQuiz, type SubmitQuiz } from "@/lib/services/submit-quiz"
import { createSyncPayment, type SyncPayment } from "@/lib/services/sync-payment"

const SUBMIT_REQUEST_BUDGET_MS = 20_000
const JOB_PAYMENT_DEADLINE_MS = 30_000
const JOB_LIMITS = { payments: 20, notifications: 50 }
const SUBMIT_RATE_LIMIT = { limit: 5, windowMs: 60_000 }

export type Container = {
  env: Env
  log: Logger
  repos: Repos
  asaas: AsaasClient
  email: EmailSender
  whatsapp: WhatsAppSender
  channels: Channel[]
  submitQuiz: SubmitQuiz
  syncPayment: SyncPayment
  dispatchNotification: DispatchNotification
  dispatchForQuizResponse: (quizResponseId: string) => Promise<void>
  /** Rodada exclusiva do job: o agendador e `POST /api/jobs/run` usam este mesmo runner. */
  runner: () => Promise<"ran" | "skipped">
  retryFailed: (t: RetryTarget) => Promise<{ reopened: number }>
  rateLimiter: RateLimiter
  ping: () => Promise<void>
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

/** Canais ativos, na ordem e-mail → WhatsApp, conforme `NOTIFY_*_ENABLED`. */
export function enabledChannels(env: Pick<Env, "NOTIFY_EMAIL_ENABLED" | "NOTIFY_WHATSAPP_ENABLED">): Channel[] {
  const all: [Channel, boolean][] = [
    ["email", env.NOTIFY_EMAIL_ENABLED],
    ["whatsapp", env.NOTIFY_WHATSAPP_ENABLED],
  ]
  return all.filter(([, enabled]) => enabled).map(([channel]) => channel)
}

function buildContainer(): Container {
  const env = getEnv()
  const log = createLogger()
  const db = getDb()
  const repos = createMysqlRepos(db)
  const { payments, notifications, submissions } = repos
  const now = () => new Date()
  const channels = enabledChannels(env)

  const asaas = createAsaasClient({ env: env.ASAAS_ENV, apiKey: env.ASAAS_API_KEY })
  const email = createSmtpEmailSender({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    user: env.SMTP_USER,
    pass: env.SMTP_PASS,
    from: env.SMTP_FROM,
  })
  const whatsapp = createEvolutionWhatsAppSender({
    baseUrl: env.EVOLUTION_API_URL,
    apiKey: env.EVOLUTION_API_KEY,
    instance: env.EVOLUTION_INSTANCE,
  })
  const alertAdmin = createAlertAdmin({ email, to: env.ADMIN_ALERT_EMAIL, log })

  const syncPayment = createSyncPayment({
    payments,
    notifications,
    asaas,
    alertAdmin,
    log,
    now,
    config: { dueDays: env.PAYMENT_DUE_DAYS, successUrl: env.PAYMENT_SUCCESS_URL, channels },
  })
  const dispatchNotification = createDispatchNotification({
    notifications,
    email,
    whatsapp,
    alertAdmin,
    log,
    now,
    sleep,
  })
  const submitQuiz = createSubmitQuiz({
    submissions,
    payments,
    notifications,
    syncPayment,
    log,
    now,
    config: { amount: env.PAYMENT_AMOUNT, channels, requestBudgetMs: SUBMIT_REQUEST_BUDGET_MS },
  })
  const dispatchForQuizResponse = createDispatchForQuizResponse({ notifications, dispatchNotification, log })

  const runJobs = createRunJobs({
    payments,
    notifications,
    syncPayment,
    dispatchNotification,
    log,
    now,
    paymentDeadlineMs: JOB_PAYMENT_DEADLINE_MS,
    limits: JOB_LIMITS,
  })
  const runner = createExclusiveRunner(runJobs, { log })

  return {
    env,
    log,
    repos,
    asaas,
    email,
    whatsapp,
    channels,
    submitQuiz,
    syncPayment,
    dispatchNotification,
    dispatchForQuizResponse,
    runner,
    retryFailed: createRetryFailed({ payments, notifications }),
    rateLimiter: createRateLimiter(SUBMIT_RATE_LIMIT),
    ping: async () => {
      await db.execute(sql`SELECT 1`)
    },
  }
}

// Em globalThis: o Next pode carregar este módulo em mais de um bundle (instrumentation e rotas)
// e recarregá-lo em dev; o runner exclusivo e o rate limit precisam ser um só por processo.
const globalForContainer = globalThis as typeof globalThis & { __tamiFormsContainer?: Container }

/** Monta as dependências na primeira chamada (nunca na importação: o `next build` roda sem env). */
export function getContainer(): Container {
  globalForContainer.__tamiFormsContainer ??= buildContainer()
  return globalForContainer.__tamiFormsContainer
}
