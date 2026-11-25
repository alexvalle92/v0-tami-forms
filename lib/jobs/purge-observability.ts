import type { AnalyticsRepo, AppLogRepo, GoogleAdsAttributionRepo, MetaAttributionRepo } from "@/lib/db/repos/types"

export const FUNNEL_RETENTION_DAYS = 365
export const APP_LOG_RETENTION_DAYS = 90
/** IP e User-Agent do anúncio; depois disso a Meta já não aceita o Purchase mesmo. */
export const META_ATTRIBUTION_RETENTION_DAYS = 90
/** Identificador do clique no Google; o Google não aceita conversão de clique com mais de 90 dias. */
export const GOOGLE_ADS_ATTRIBUTION_RETENTION_DAYS = 90
/** Linhas apagadas por tabela a cada rodada do job (mantém a transação curta). */
export const PURGE_BATCH = 1000

const DAY_MS = 24 * 60 * 60 * 1000

/**
 * Limpeza por retenção: eventos e sessões do funil com mais de 365 dias, `app_logs` e atribuições da
 * Meta e do Google Ads com mais de 90, até `limit` linhas por tabela. Devolve o total apagado; todas são
 * tentadas e, se alguma falhar, rejeita depois (a rodada do job loga e conta em `errors`).
 */
export function createPurgeObservability(d: {
  analytics: Pick<AnalyticsRepo, "purgeOlderThan">
  appLogs: Pick<AppLogRepo, "purgeOlderThan">
  metaAttributions: Pick<MetaAttributionRepo, "purgeOlderThan">
  googleAdsAttributions: Pick<GoogleAdsAttributionRepo, "purgeOlderThan">
  now: () => Date
  limit?: number
}): () => Promise<number> {
  const limit = d.limit ?? PURGE_BATCH
  return async function purgeObservability() {
    const nowMs = d.now().getTime()
    const before = (days: number) => new Date(nowMs - days * DAY_MS)
    // As limpezas são tentadas mesmo que uma falhe; só depois a falha (a primeira) sobe.
    const results = await Promise.allSettled([
      d.analytics.purgeOlderThan(before(FUNNEL_RETENTION_DAYS), limit),
      d.appLogs.purgeOlderThan(before(APP_LOG_RETENTION_DAYS), limit),
      d.metaAttributions.purgeOlderThan(before(META_ATTRIBUTION_RETENTION_DAYS), limit),
      d.googleAdsAttributions.purgeOlderThan(before(GOOGLE_ADS_ATTRIBUTION_RETENTION_DAYS), limit),
    ])
    let total = 0
    for (const r of results) {
      if (r.status === "rejected") throw r.reason
      total += r.value
    }
    return total
  }
}
