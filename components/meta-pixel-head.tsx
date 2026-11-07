import { connection } from "next/server"
import { metaHeadScripts } from "@/lib/meta/head-scripts"

// Pixel da Meta no <head>. Componente de servidor que lê o env a cada pedido (connection() tira a página
// da geração estática), então ligar ou desligar META_TRACKING_ENABLED vale com um reinício, sem build.
// Desligado, não renderiza nada.
export async function MetaPixelHead() {
  await connection()
  const scripts = metaHeadScripts(process.env)
  if (!scripts) return null

  return (
    <>
      <script id="tf-meta-config" dangerouslySetInnerHTML={{ __html: scripts.config }} />
      <script id="meta-pixel" dangerouslySetInnerHTML={{ __html: scripts.pixel }} />
      <noscript>
        <img
          height="1"
          width="1"
          style={{ display: "none" }}
          alt=""
          src={`https://www.facebook.com/tr?id=${scripts.pixelId}&ev=PageView&noscript=1`}
        />
      </noscript>
    </>
  )
}
