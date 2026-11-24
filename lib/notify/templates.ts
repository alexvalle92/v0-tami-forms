import type { ExpiryStage } from "@/lib/renewal/rules"

export const PAYMENT_LINK_TITLE = "✅ Recebi suas respostas! Falta só um passo para o seu plano"
export const FIRST_ACCESS_TITLE = "Primeiro Acesso App PlanA"
export const PLAN_READY_TITLE = "Seu novo Plano Alimentar está pronto"
export const PASSWORD_RESET_TITLE = "Redefinição de senha do PlanA"
export const RENEWAL_PAYMENT_LINK_TITLE = "Recebemos sua atualização! Falta só o pagamento"

/** Assunto da condição especial; os valores chegam já formatados (`formatBRL`). */
export const PAYMENT_DISCOUNT_TITLE = (original: string, amount: string) =>
  `🎁 Condição especial: seu plano de ${original} por ${amount}`

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

/** Post do Instagram que apresenta a nutricionista; vai na cobrança (e-mail e WhatsApp). */
export const NUTRI_INSTAGRAM_URL = "https://www.instagram.com/p/DfRyVqQoKHV/"

/** Legenda do vídeo "como funciona", enviado no WhatsApp da cobrança. */
export const PAYMENT_VIDEO_CAPTION =
  "Gravei este vídeo para te explicar como funciona: quando eu começo seu plano, os 30 dias de acompanhamento e como tirar suas dúvidas. 🎥"

/** Uma mensagem (balão) do WhatsApp: texto puro, ou vídeo com legenda. */
export type WhatsAppPart = { kind: "text"; text: string } | { kind: "video"; url: string; caption: string }

/**
 * E-mail de link de pagamento para o 1º quiz. O plano só é montado depois do pagamento (por isso não diz "já está
 * pronto"), e o texto traz a garantia de 7 dias e o post do Instagram. `videoOnWhatsApp` acrescenta o convite para
 * ver o vídeo enviado no WhatsApp: só quando o vídeo de fato vai no WhatsApp.
 */
export function renderPaymentLink(d: { name: string; link: string; videoOnWhatsApp?: boolean }): {
  subject: string
  html: string
  text: string
} {
  const meet = d.videoOnWhatsApp
    ? "Também te mandei um vídeo curtinho no WhatsApp explicando como funciona. Vale assistir! E se quiser me conhecer melhor, veja este post no Instagram: <br>"
    : "Quer me conhecer melhor antes de começar? Veja este post no Instagram: <br>"
  const html =
    `Oi, ${escapeHtml(d.name)}! 👋 <br>Aqui é a Nutri Tâmili Valle. Recebi suas respostas do questionário e já tenho tudo o que preciso para montar seu <strong>Plano Alimentar Personalizado</strong>. <br><br>` +
    `Assim que o pagamento for confirmado, começo o seu plano e você recebe os dados de acesso ao aplicativo, com <strong>30 dias de acompanhamento</strong>. <br><br>` +
    `Para concluir o pagamento, acesse o link abaixo: <br>${escapeHtml(d.link)} <br><br>` +
    `🛡️ <strong>Garantia de 7 dias:</strong> se não gostar, é só me avisar em até 7 dias depois do pagamento que eu devolvo seu dinheiro. <br><br>` +
    `${meet}${NUTRI_INSTAGRAM_URL} <br><br>` +
    `Um abraço, <br>Nutri Tâmili Valle 💚`
  return { subject: PAYMENT_LINK_TITLE, html, text: htmlToText(html) }
}

/**
 * WhatsApp do link de pagamento para o 1º quiz, em balões: apresentação, vídeo (se houver `videoUrl`), Instagram e,
 * por último, o link com a garantia: o último balão é o que aparece na prévia da conversa. O Instagram vai num balão
 * só dele porque o WhatsApp só mostra a prévia do primeiro link de cada mensagem.
 */
export function renderPaymentLinkWhatsApp(d: { name: string; link: string; videoUrl?: string }): WhatsAppPart[] {
  const parts: WhatsAppPart[] = [
    {
      kind: "text",
      text:
        `*Recebi suas respostas! Falta só um passo para o seu plano*\n` +
        `Oi, ${d.name}! 👋 Aqui é a Nutri Tâmili Valle. Recebi suas respostas do questionário e já tenho tudo o que preciso para montar seu *Plano Alimentar Personalizado*.`,
    },
  ]
  if (d.videoUrl) parts.push({ kind: "video", url: d.videoUrl, caption: PAYMENT_VIDEO_CAPTION })
  parts.push(
    {
      kind: "text",
      text: `Quer me conhecer melhor antes de começar? Neste post eu conto um pouco sobre mim e meu trabalho como nutricionista:\n${NUTRI_INSTAGRAM_URL}`,
    },
    {
      kind: "text",
      text:
        `Para eu começar o seu plano, é só concluir o pagamento por aqui:\n${d.link}\n\n` +
        `🛡️ *Garantia de 7 dias:* se não gostar, é só me avisar aqui em até 7 dias depois do pagamento que eu devolvo seu dinheiro.\n\n` +
        `Assim que o pagamento for confirmado, você recebe aqui mesmo os dados de acesso ao aplicativo. 💚`,
    },
  )
  return parts
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

/** Decimal do banco (`"29.90"`, `"100"`) vira `R$ 29,90`: por regex sobre o texto, sem `Number`, para não arredondar. */
export function formatBRL(decimal: string): string {
  const m = /^(\d+)(?:\.(\d{1,2}))?$/.exec(decimal)
  if (!m) throw new Error("invalid amount")
  return `R$ ${m[1]},${(m[2] ?? "").padEnd(2, "0")}`
}

/**
 * Condição especial numa cobrança em aberto (spec do desconto, §8): o valor já está baixo no Asaas e o link é o
 * mesmo de antes. `returning` (paciente que já tem senha) troca só o último parágrafo, como no link de pagamento.
 * `dueDate` vem em YYYY-MM-DD e os valores como decimais do banco.
 */
export function renderPaymentDiscount(d: {
  name: string
  link: string
  originalAmount: string
  amount: string
  dueDate: string
  returning: boolean
}): { subject: string; html: string; text: string } {
  const original = formatBRL(d.originalAmount)
  const amount = formatBRL(d.amount)
  const closing = d.returning
    ? "Assim que o pagamento for confirmado, seu novo plano aparece no PlanA. É só entrar com seu CPF e a senha que você já usa. 💚"
    : "Assim que o pagamento for confirmado, você recebe os dados de acesso ao seu plano. 💚"
  const html =
    `Olá ${escapeHtml(d.name)}! 👋 <br>Seu <strong>Plano Alimentar Personalizado</strong> está a um passo: só falta o pagamento para eu começar a montar. <br><br>` +
    `Preparamos uma <strong>condição especial</strong> para você começar agora: o valor baixou de <strong>${original} para ${amount}</strong>. <br><br>` +
    `Essa condição vale até <strong>${formatDateBR(d.dueDate)}</strong>. O link de pagamento é o mesmo de antes: <br>${escapeHtml(d.link)} <br><br>` +
    `🛡️ <strong>E continua com garantia de 7 dias:</strong> se não gostar, eu devolvo seu dinheiro. <br><br>` +
    closing
  return { subject: PAYMENT_DISCOUNT_TITLE(original, amount), html, text: htmlToText(html) }
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
