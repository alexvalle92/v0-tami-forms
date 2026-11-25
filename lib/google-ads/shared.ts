// Nomes, formatos e tipos do rastreamento do Google Ads compartilhados entre o navegador e o servidor.
// Sem zod e sem módulos do Node: o bundle do quiz importa este arquivo.

/** Conversões que o navegador dispara pelo gtag (o Purchase sai só do servidor). */
export const GOOGLE_ADS_BROWSER_CONVERSIONS = ["Lead", "InitiateCheckout"] as const
export type GoogleAdsBrowserConversion = (typeof GOOGLE_ADS_BROWSER_CONVERSIONS)[number]

/** Prefixo do `transaction_id` de cada conversão do navegador: `<prefixo>:<sessionId>`. */
export const GOOGLE_ADS_TRANSACTION_PREFIX: Record<GoogleAdsBrowserConversion, "lead" | "ic"> = {
  Lead: "lead",
  InitiateCheckout: "ic",
}

/** Parâmetros de clique que o Google Ads põe na URL do anúncio (gbraid/wbraid: iOS, sem gclid). */
export const GOOGLE_ADS_CLICK_PARAMS = ["gclid", "gbraid", "wbraid"] as const
export type GoogleAdsClickParam = (typeof GOOGLE_ADS_CLICK_PARAMS)[number]

/**
 * Formato aceito de um identificador de clique. O Google não documenta o formato; os valores reais são
 * base64url (letras, dígitos, `_` e `-`). Limite de 255 = tamanho das colunas.
 */
export const CLICK_ID_RE = /^[A-Za-z0-9_-]{1,255}$/

/** Tag do Google Ads (`AW-` + número) e rótulo de conversão (o que vem depois da barra no `send_to`). */
export const GOOGLE_ADS_TAG_ID_RE = /^AW-\d+$/
export const GOOGLE_ADS_LABEL_RE = /^[A-Za-z0-9_-]{1,100}$/

/** Identificadores de clique que o navegador manda junto com o envio do quiz. */
export type SubmitGoogleAdsInput = Partial<Record<GoogleAdsClickParam, string>>
