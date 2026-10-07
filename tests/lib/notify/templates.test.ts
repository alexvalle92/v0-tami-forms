import { describe, expect, it } from "vitest"
import { PAYMENT_LINK_TITLE, renderPaymentLink, toWhatsAppParts } from "@/lib/notify/templates"

const ENTITIES = ["&#39;", "&amp;", "&quot;", "&lt;", "&gt;"]

describe("renderPaymentLink", () => {
  it("escapa o nome no html, mantém o link literal e o texto mostra o nome real", () => {
    const r = renderPaymentLink({ name: "Ana <b>", link: "https://asaas/i/1" })
    expect(r.html).toContain("Olá Ana &lt;b&gt;!")
    expect(r.html).toContain("https://asaas/i/1")
    expect(r.subject).toBe(PAYMENT_LINK_TITLE)
    expect(r.text).not.toMatch(/<\/?(br|strong)>/)
    expect(r.text).toContain("Olá Ana <b>!")
  })

  it("gera o html exatamente como no n8n", () => {
    const { html } = renderPaymentLink({ name: "Ana", link: "https://asaas/i/1" })
    expect(html).toBe(
      "Olá Ana! 👋 <br>Recebemos seu cadastro com sucesso! 🎉 Seu <strong>Plano Alimentar Personalizado já está pronto</strong> e aguardando apenas a confirmação do pagamento. <br><br>Para liberar seu acesso, basta efetuar o pagamento pelo link abaixo: <br>\n" +
        "https://asaas/i/1 <br><br>\n" +
        "Assim que o pagamento for confirmado, você receberá as informações de acesso para fazer login e visualizar seu Plano Alimentar Personalizado. 💚",
    )
  })

  it.each(["D'Ávila", "Maria & João", 'Ana "Nana" Souza'])(
    "não deixa entidades HTML no texto nem no WhatsApp para %s",
    (name) => {
      const r = renderPaymentLink({ name, link: "https://asaas/i/1" })
      const parts = toWhatsAppParts(PAYMENT_LINK_TITLE, r.html)
      expect(r.text).toContain(`Olá ${name}!`)
      expect(parts[0]).toContain(`Olá ${name}!`)
      for (const channel of [r.text, ...parts]) {
        for (const e of ENTITIES) expect(channel).not.toContain(e)
      }
    },
  )

  it("um nome com o texto literal &lt; volta como &lt; nos canais de texto", () => {
    const r = renderPaymentLink({ name: "A &lt; B", link: "https://asaas/i/1" })
    const parts = toWhatsAppParts(PAYMENT_LINK_TITLE, r.html)
    expect(r.html).toContain("Olá A &amp;lt; B!")
    expect(r.text).toContain("Olá A &lt; B!")
    expect(parts[0]).toContain("Olá A &lt; B!")
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
