import { connection } from "next/server"
import { googleAdsHeadScripts } from "@/lib/google-ads/head-scripts"

// Tag do Google Ads (gtag.js) no <head>. Componente de servidor que lê o env a cada pedido (connection() tira
// a página da geração estática), então ligar ou desligar GOOGLE_ADS_TRACKING_ENABLED vale com um reinício,
// sem build. Desligado, não renderiza nada.
export async function GoogleAdsTagHead() {
  await connection()
  const scripts = googleAdsHeadScripts(process.env)
  if (!scripts) return null

  return (
    <>
      <script id="tf-gads-config" dangerouslySetInnerHTML={{ __html: scripts.config }} />
      <script id="google-ads-gtag-src" async src={scripts.src} />
      <script id="google-ads-gtag" dangerouslySetInnerHTML={{ __html: scripts.gtag }} />
    </>
  )
}
