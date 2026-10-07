export const PAYMENT_LINK_TITLE = "✅ Recebemos seu cadastro! Seu plano alimentar está pronto"

const escapeHtml = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")

// Inverso exato de escapeHtml; &amp; por último, para que "&amp;lt;" vire "&lt;" e não "<".
const unescapeHtml = (s: string) =>
  s
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&")

/** Mensagem de link de pagamento, com o mesmo texto do fluxo antigo do n8n. */
export function renderPaymentLink(d: { name: string; link: string }): {
  subject: string
  html: string
  text: string
} {
  const html =
    `Olá ${escapeHtml(d.name)}! 👋 <br>Recebemos seu cadastro com sucesso! 🎉 Seu <strong>Plano Alimentar Personalizado já está pronto</strong> e aguardando apenas a confirmação do pagamento. <br><br>Para liberar seu acesso, basta efetuar o pagamento pelo link abaixo: <br>\n` +
    `${d.link} <br><br>\n` +
    `Assim que o pagamento for confirmado, você receberá as informações de acesso para fazer login e visualizar seu Plano Alimentar Personalizado. 💚`
  const text = unescapeHtml(html.replaceAll("<br>", "\n").replace(/<[^>]*>/g, ""))
  return { subject: PAYMENT_LINK_TITLE, html, text }
}

/** Porta o node `textoFormatado` do n8n: o html vira partes de texto no formato do WhatsApp. */
export function toWhatsAppParts(title: string, html: string): string[] {
  const parts = html
    .replaceAll("<strong>", "*")
    .replaceAll("</strong>", "*")
    .split("<br><br>")
    .map((p) => unescapeHtml(p.replaceAll("<br>", "\n")).trim())
    .filter((p) => p !== "")
  if (parts.length > 0) parts[0] = `*${title}*\n${parts[0]}`
  return parts
}
