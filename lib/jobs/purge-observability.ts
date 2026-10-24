import type { AnalyticsRepo, AppLogRepo } from "@/lib/db/repos/types"

export const FUNNEL_RETENTION_DAYS = 365
export const APP_LOG_RETENTION_DAYS = 90
/** Linhas apagadas por tabela a cada rodada do job (mantém a transação curta). */
export const PURGE_BATCH = 1000

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Limpeza por retenção: eventos e sessões do funil com mais de 365 dias e `app_logs` com mais de 90,
 * até `limit` linhas por tabela. Devolve o total apagado; se uma das limpezas falhar, rejeita (a rodada
 * do job loga e conta em `errors`).
 */
export function createPurgeObservability(d: {
  analytics: Pick<AnalyticsRepo, "purgeOlderThan">
  appLogs: Pick<AppLogRepo, "purgeOlderThan">
  now: () => Date
  limit?: number
}): () => Promise<number> {
  const limit = d.limit ?? PURGE_BATCH
  return async function purgeObservability() {
    const nowMs = d.now().getTime()
    const funnel = await d.analytics.purgeOlderThan(new Date(nowMs - FUNNEL_RETENTION_DAYS * DAY_MS), limit)
    const logs = await d.appLogs.purgeOlderThan(new Date(nowMs - APP_LOG_RETENTION_DAYS * DAY_MS), limit)
    return funnel + logs
  }
}
