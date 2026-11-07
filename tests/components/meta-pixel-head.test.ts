import { renderToStaticMarkup } from "react-dom/server"
import { afterEach, describe, expect, it, vi } from "vitest"

// `connection()` só existe dentro de um pedido do Next: aqui ele resolve na hora.
vi.mock("next/server", () => ({ connection: async () => {} }))

import { MetaPixelHead } from "@/components/meta-pixel-head"

const saved = { ...process.env }

afterEach(() => {
  for (const key of Object.keys(process.env)) delete process.env[key]
  Object.assign(process.env, saved)
})

async function render(): Promise<string> {
  const tree = await MetaPixelHead()
  return tree ? renderToStaticMarkup(tree) : ""
}

describe("MetaPixelHead", () => {
  it("desligado, não renderiza nada", async () => {
    delete process.env.META_TRACKING_ENABLED
    process.env.META_PIXEL_ID = "1234567890"
    expect(await render()).toBe("")
  })

  it("ligado, renderiza o config, o snippet do Pixel e o noscript", async () => {
    process.env.META_TRACKING_ENABLED = "true"
    process.env.META_PIXEL_ID = "1234567890"
    process.env.PAYMENT_AMOUNT = "39.90"

    const html = await render()

    expect(html).toContain('window.__TF_META__={"pixelId":"1234567890","value":"39.90"};')
    expect(html).toContain("https://connect.facebook.net/en_US/fbevents.js")
    expect(html).toContain("fbq(&#x27;init&#x27;,&#x27;1234567890&#x27;)".replaceAll("&#x27;", "'"))
    expect(html).toContain("https://www.facebook.com/tr?id=1234567890&amp;ev=PageView&amp;noscript=1")
    // O config vem antes do snippet: o Pixel e o rastreador leem o mesmo id.
    expect(html.indexOf("tf-meta-config")).toBeLessThan(html.indexOf('id="meta-pixel"'))
  })

  it("lê o env a cada chamada, sem rebuild", async () => {
    process.env.META_TRACKING_ENABLED = "true"
    process.env.META_PIXEL_ID = "111"
    expect(await render()).toContain('"pixelId":"111"')

    process.env.META_PIXEL_ID = "222"
    expect(await render()).toContain('"pixelId":"222"')

    process.env.META_TRACKING_ENABLED = "false"
    expect(await render()).toBe("")
  })
})
