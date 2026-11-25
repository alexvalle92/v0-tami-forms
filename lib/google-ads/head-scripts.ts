// Texto dos scripts que components/google-ads-tag-head.tsx põe no <head>. Função pura, para testar sem React.

import { paymentAmount } from "@/lib/payment-amount"
import { GOOGLE_ADS_LABEL_RE, GOOGLE_ADS_TAG_ID_RE } from "./shared"

export type GoogleAdsBrowserConfig = {
  tagId: string
  /** `PAYMENT_AMOUNT`, valor do InitiateCheckout. */
  value: string
  /** Rótulo da conversão de Lead; ausente = o Lead não é enviado ao Google. */
  leadLabel?: string
  /** Rótulo da conversão de InitiateCheckout; ausente = não é enviada. */
  checkoutLabel?: string
}

export type GoogleAdsHeadScripts = {
  tagId: string
  /** URL do gtag.js, carregado com `async`. */
  src: string
  /** Define `window.__TF_GADS__`, que lib/client/google-ads.ts lê. */
  config: string
  /** Fila do gtag, `js` e `config` da tag (que dispara o page_view e grava o cookie `_gcl_aw`). */
  gtag: string
}

/**
 * Scripts do Google Ads, ou `null` se o rastreamento está desligado ou a tag não tem o formato `AW-<número>`.
 * O env entra por parâmetro: o componente o lê a cada pedido, então ligar ou desligar não pede novo build.
 * Rótulo fora do formato é ignorado (a conversão correspondente não sai), sem derrubar a tag.
 */
export function googleAdsHeadScripts(env: Record<string, string | undefined>): GoogleAdsHeadScripts | null {
  if (env.GOOGLE_ADS_TRACKING_ENABLED !== "true") return null
  const tagId = env.GOOGLE_ADS_TAG_ID?.trim()
  if (!tagId || !GOOGLE_ADS_TAG_ID_RE.test(tagId)) return null

  const label = (raw: string | undefined) => {
    const v = raw?.trim()
    return v && GOOGLE_ADS_LABEL_RE.test(v) ? v : undefined
  }
  const config: GoogleAdsBrowserConfig = { tagId, value: paymentAmount(env) }
  const leadLabel = label(env.GOOGLE_ADS_LEAD_LABEL)
  const checkoutLabel = label(env.GOOGLE_ADS_CHECKOUT_LABEL)
  if (leadLabel) config.leadLabel = leadLabel
  if (checkoutLabel) config.checkoutLabel = checkoutLabel

  return {
    tagId,
    src: `https://www.googletagmanager.com/gtag/js?id=${tagId}`,
    config: `window.__TF_GADS__=${JSON.stringify(config).replace(/</g, "\\u003c")};`,
    // O GTM da página usa o mesmo `dataLayer`; o Google suporta os dois juntos.
    gtag:
      "window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}window.gtag=gtag;" +
      `gtag('js',new Date());gtag('config','${tagId}');`,
  }
}
