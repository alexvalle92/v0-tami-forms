import { describe, expect, it } from "vitest"
import { PAYMENT_LINK_TITLE, renderPaymentLink, toWhatsAppParts } from "@/lib/notify/templates"

describe("renderPaymentLink", () => {
  it("escapa o nome, mantém o link literal e gera texto sem tags", () => {
    const r = renderPaymentLink({ name: "Ana <b>", link: "https://asaas/i/1" })
    expect(r.html).toContain("Olá Ana &lt;b&gt;!")
    expect(r.html).toContain("https://asaas/i/1")
    expect(r.subject).toBe(PAYMENT_LINK_TITLE)
    expect(r.text).not.toContain("<")
  })
})

describe("toWhatsAppParts", () => {
  it("divide o html em 3 partes no formato do WhatsApp", () => {
    const { html } = renderPaymentLink({ name: "Ana", link: "https://asaas/i/1" })
    const parts = toWhatsAppParts(PAYMENT_LINK_TITLE, html)

    expect(parts).toHaveLength(3)
    expect(parts[0].startsWith("*✅ Recebemos seu cadastro! Seu plano alimentar está pronto*\nOlá Ana! 👋")).toBe(true)
    expect(parts[0]).toContain("*Plano Alimentar Personalizado já está pronto*")
    expect(parts[1]).toContain("https://asaas/i/1")
    expect(parts[2].endsWith("💚")).toBe(true)
    for (const p of parts) expect(p).not.toContain("<")
  })
})
