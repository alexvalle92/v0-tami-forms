// Texto dos scripts que components/meta-pixel-head.tsx põe no <head>. Função pura, para testar sem React.

const DEFAULT_VALUE = "39.90"

export type MetaHeadScripts = {
  pixelId: string
  /** Define `window.__TF_META__`, que lib/client/meta.ts lê. */
  config: string
  /** Snippet base do Pixel (carrega o fbevents.js), `init` e `PageView`. */
  pixel: string
}

/**
 * Scripts do Pixel, ou `null` se o rastreamento está desligado ou o id não é só dígitos. O env entra por
 * parâmetro: o componente o lê a cada pedido, então ligar ou desligar a chave não pede novo build.
 */
export function metaHeadScripts(env: Record<string, string | undefined>): MetaHeadScripts | null {
  if (env.META_TRACKING_ENABLED !== "true") return null
  const pixelId = env.META_PIXEL_ID
  if (!pixelId || !/^\d+$/.test(pixelId)) return null

  const amount = env.PAYMENT_AMOUNT
  const value = amount && /^\d+(\.\d{1,2})?$/.test(amount) ? amount : DEFAULT_VALUE

  const config = `window.__TF_META__=${JSON.stringify({ pixelId, value }).replace(/</g, "\\u003c")};`
  const pixel =
    "!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};" +
    "if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;" +
    "s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');" +
    `fbq('init','${pixelId}');fbq('track','PageView');`

  return { pixelId, config, pixel }
}
