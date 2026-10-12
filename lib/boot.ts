import { getContainer } from "@/lib/container"
import { getDb } from "@/lib/db/client"
import { runMigrations } from "@/lib/db/migrate"
import { getEnv } from "@/lib/env"
import { startScheduler } from "@/lib/jobs/scheduler"
import { createLogger } from "@/lib/log"
import { safeErrorMessage } from "@/lib/services/last-error"

const JOB_INTERVAL_MS = 120_000

const globalForScheduler = globalThis as typeof globalThis & { __tamiFormsScheduler?: { stop(): void } }

/**
 * Boot do servidor (chamado pelo `instrumentation.ts`, só no runtime Node): valida a env, aplica as
 * migrations e, com `JOBS_ENABLED`, inicia o agendador uma única vez por processo. Qualquer erro
 * derruba o processo: melhor não subir do que subir sem banco ou com configuração inválida.
 */
export async function boot(): Promise<void> {
  const log = createLogger()
  try {
    const env = getEnv()
    await runMigrations(getDb())

    let schedulerStarted = false
    if (env.JOBS_ENABLED && !globalForScheduler.__tamiFormsScheduler) {
      const c = getContainer()
      globalForScheduler.__tamiFormsScheduler = startScheduler({ run: c.runner, intervalMs: JOB_INTERVAL_MS, log: c.log })
      schedulerStarted = true
    }

    log.info("boot.done", {
      asaasEnv: env.ASAAS_ENV,
      jobsEnabled: env.JOBS_ENABLED,
      schedulerStarted,
      channels: getContainer().channels,
    })
  } catch (err) {
    log.error("boot.failed", { message: safeErrorMessage(err) })
    process.exit(1)
  }
}
