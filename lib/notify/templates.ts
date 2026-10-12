import type { ExpiryStage } from "@/lib/renewal/rules"

export const PAYMENT_LINK_TITLE = "✅ Recebemos seu cadastro! Seu plano alimentar está pronto"
export const FIRST_ACCESS_TITLE = "Primeiro Acesso App PlanA"
export const PLAN_READY_TITLE = "Seu novo Plano Alimentar está pronto"
export const PASSWORD_RESET_TITLE = "Redefinição de senha do PlanA"
export const RENEWAL_PAYMENT_LINK_TITLE = "Recebemos sua atualização! Falta só o pagamento"

/** Título do aviso de vencimento de cada estágio (spec de vencimento e renovação, §6.2). */
export const PLAN_EXPIRING_TITLES: Record<ExpiryStage, string> = {
  d5: "Seu plano alimentar está acabando",
  d2: "Faltam poucos dias para o seu plano vencer",
  d0: "Seu plano alimentar vence hoje",
}

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

/** Texto puro do html: `<br>` vira quebra de linha, as demais tags somem e as entidades voltam a ser caracteres. */
const htmlToText = (html: string) => unescapeHtml(html.replaceAll("<br>", "\n").replace(/<[^>]*>/g, ""))

/** Mensagem de link de pagamento, com o mesmo texto do fluxo antigo (anterior à refatoração). */
export function renderPaymentLink(d: { name: string; link: string }): {
  subject: string
  html: string
  text: string
} {
  const html =
    `Olá ${escapeHtml(d.name)}! 👋 <br>Recebemos seu cadastro com sucesso! 🎉 Seu <strong>Plano Alimentar Personalizado já está pronto</strong> e aguardando apenas a confirmação do pagamento. <br><br>Para liberar seu acesso, basta efetuar o pagamento pelo link abaixo: <br>\n` +
    `${d.link} <br><br>\n` +
    `Assim que o pagamento for confirmado, você receberá as informações de acesso para fazer login e visualizar seu Plano Alimentar Personalizado. 💚`
  return { subject: PAYMENT_LINK_TITLE, html, text: htmlToText(html) }
}

/** Primeiro acesso ao PlanA (§9): link, usuário (CPF) e senha temporária. */
export function renderFirstAccess(d: { name: string; appUrl: string; tempPassword: string }): {
  subject: string
  html: string
  text: string
} {
  const html =
    `Olá ${escapeHtml(d.name)}! 👋 <br>Seu pagamento foi confirmado e seu <strong>Plano Alimentar Personalizado está pronto</strong>! 🎉 <br><br>` +
    `Utilize os dados abaixo para realizar seu <strong>primeiro login</strong>: <br>Link: ${escapeHtml(d.appUrl)} <br>` +
    `🔐 <strong>Usuário:</strong> seu CPF (somente números) <br>🔑 <strong>Senha temporária:</strong> ${escapeHtml(d.tempPassword)} <br><br>` +
    `Por segurança, recomendamos que você <strong>troque a senha</strong> após o primeiro acesso.`
  return { subject: FIRST_ACCESS_TITLE, html, text: htmlToText(html) }
}

/** Plano novo disponível (§9): para quem já tem senha (já trocada, ou em outro formato); não leva senha. */
export function renderPlanReady(d: { name: string; appUrl: string }): {
  subject: string
  html: string
  text: string
} {
  const html =
    `Olá ${escapeHtml(d.name)}! 👋 <br>Recebemos seu pagamento e seu <strong>novo Plano Alimentar Personalizado já está disponível</strong>. 🎉 <br><br>` +
    `Acesse com seu CPF e a senha que você já usa: <br>${escapeHtml(d.appUrl)}`
  return { subject: PLAN_READY_TITLE, html, text: htmlToText(html) }
}

/**
 * Redefinição de senha do PlanA (§7.3 do spec do PlanA): link de uso único, válido por 1 hora.
 * O link só existe no payload da mensagem e neste texto: nunca em log nem em erro.
 */
export function renderPasswordReset(d: { name: string; link: string }): {
  subject: string
  html: string
  text: string
} {
  const html =
    `Olá ${escapeHtml(d.name)}! 👋 <br>Recebemos um pedido para redefinir a senha do seu acesso ao <strong>PlanA</strong>. <br><br>` +
    `Para criar uma nova senha, acesse o link abaixo. Ele vale por 1 hora e só pode ser usado uma vez: <br>${escapeHtml(d.link)} <br><br>` +
    `Se você não fez esse pedido, ignore esta mensagem. Sua senha continua a mesma.`
  return { subject: PASSWORD_RESET_TITLE, html, text: htmlToText(html) }
}

/** `YYYY-MM-DD` vira `dd/mm/aaaa` por manipulação de texto: sem `Date`, a data não muda com o fuso. */
function formatDateBR(isoDate: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate)
  if (!m) throw new Error("invalid end date")
  return `${m[3]}/${m[2]}/${m[1]}`
}

/**
 * Aviso de vencimento do plano (spec de vencimento e renovação, §6.2). Em `d2` e `d0` há duas variantes:
 * `form` (link do formulário de renovação) e `payment` (link da cobrança). No `d5` não há link e
 * `variant` e `link` são ignorados. `endDate` vem em YYYY-MM-DD.
 */
export function renderPlanExpiring(d: {
  stage: ExpiryStage
  name: string
  endDate: string
  variant: "form" | "payment"
  link: string
}): { subject: string; html: string; text: string } {
  const greeting = `Olá ${escapeHtml(d.name)}! 👋 <br>`
  const when =
    d.stage === "d0"
      ? "Seu <strong>Plano Alimentar</strong> vence <strong>hoje</strong>. <br><br>"
      : `Seu <strong>Plano Alimentar</strong> vence em <strong>${formatDateBR(d.endDate)}</strong>. <br><br>`

  let body: string
  if (d.stage === "d5") {
    body =
      "Em breve vamos liberar um formulário rápido de atualização para ajustar seu próximo plano. Avisaremos assim que ele estiver disponível. 💚"
  } else if (d.variant === "payment") {
    body =
      "Você já preencheu o formulário de atualização. Para liberar seu novo plano, efetue o pagamento pelo link abaixo: <br>" +
      escapeHtml(d.link)
  } else if (d.stage === "d2") {
    body =
      "O formulário de atualização já está disponível e leva menos de 3 minutos. Depois de preencher, é só concluir o pagamento para liberar seu novo plano: <br>" +
      escapeHtml(d.link)
  } else {
    body =
      "Para receber um novo plano atualizado, preencha o formulário de atualização (leva menos de 3 minutos) e conclua o pagamento: <br>" +
      escapeHtml(d.link)
  }

  const html = greeting + when + body
  return { subject: PLAN_EXPIRING_TITLES[d.stage], html, text: htmlToText(html) }
}

/**
 * Link de pagamento para quem já é paciente (spec de vencimento e renovação, §6.3): sem "cadastro" nem
 * "informações de acesso", porque a pessoa já entra no PlanA com a senha que tem.
 */
export function renderRenewalPaymentLink(d: { name: string; link: string }): {
  subject: string
  html: string
  text: string
} {
  const html =
    `Olá ${escapeHtml(d.name)}! 👋 <br>Recebemos a atualização dos seus dados. 🎉 <br><br>` +
    `Para liberar seu <strong>novo Plano Alimentar Personalizado</strong>, efetue o pagamento pelo link abaixo: <br>` +
    `${escapeHtml(d.link)} <br><br>` +
    `Assim que o pagamento for confirmado, seu novo plano aparece no PlanA. É só entrar com seu CPF e a senha que você já usa. 💚`
  return { subject: RENEWAL_PAYMENT_LINK_TITLE, html, text: htmlToText(html) }
}

/** Porta o antigo `textoFormatado` do fluxo anterior: o html vira partes de texto no formato do WhatsApp. */
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
