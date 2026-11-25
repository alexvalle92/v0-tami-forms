// Leitura dos identificadores de clique do Google Ads que o navegador manda no envio do quiz.
// Vem da internet: nunca lança. Identificador inválido vira ausente, e sem nenhum válido não há atribuição.

import { CLICK_ID_RE, GOOGLE_ADS_CLICK_PARAMS, type SubmitGoogleAdsInput } from "./shared"

export * from "./shared"

export function parseSubmitGoogleAds(raw: unknown): SubmitGoogleAdsInput | undefined {
  try {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined
    const out: SubmitGoogleAdsInput = {}
    for (const key of GOOGLE_ADS_CLICK_PARAMS) {
      const value = (raw as Record<string, unknown>)[key]
      if (typeof value === "string" && CLICK_ID_RE.test(value)) out[key] = value
    }
    return Object.keys(out).length > 0 ? out : undefined
  } catch {
    return undefined
  }
}
