import type { AnalyticsRepo, AppLogRepo, MetaAttributionRepo } from "@/lib/db/repos/types"

export const FUNNEL_RETENTION_DAYS = 365
export const APP_LOG_RETENTION_DAYS = 90
/** IP e User-Agent do anúncio; depois disso a Meta já não aceita o Purchase mesmo. */
export const META_ATTRIBUTION_RETENTION_DAYS = 90
/** Linhas apagadas por tabela a cada rodada do job (mantém a transação curta). */
export const PURGE_BATCH = 1000

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Limpeza por retenção: eventos e sessões do funil com mais de 365 dias, `app_logs` e atribuições da
 * Meta com mais de 90, até `limit` linhas por tabela. Devolve o total apagado; todas são tentadas e, se
 * alguma falhar, rejeita depois (a rodada do job loga e conta em `errors`).
 */
export function createPurgeObservability(d: {
  analytics: Pick<AnalyticsRepo, "purgeOlderThan">
  appLogs: Pick<AppLogRepo, "purgeOlderThan">
  metaAttributions: Pick<MetaAttributionRepo, "purgeOlderThan">
  now: () => Date
  limit?: number
}): () => Promise<number> {
  const limit = d.limit ?? PURGE_BATCH
  return async function purgeObservability() {
    const nowMs = d.now().getTime()
    // As limpezas são tentadas mesmo que uma falhe; só depois a falha (a primeira) sobe.
    const [funnel, logs, meta] = await Promise.allSettled([
      d.analytics.purgeOlderThan(new Date(nowMs - FUNNEL_RETENTION_DAYS * DAY_MS), limit),
      d.appLogs.purgeOlderThan(new Date(nowMs - APP_LOG_RETENTION_DAYS * DAY_MS), limit),
      d.metaAttributions.purgeOlderThan(new Date(nowMs - META_ATTRIBUTION_RETENTION_DAYS * DAY_MS), limit),
    ])
    if (funnel.status === "rejected") throw funnel.reason
    if (logs.status === "rejected") throw logs.reason
    if (meta.status === "rejected") throw meta.reason
    return funnel.value + logs.value + meta.value
  }
}
