import { describe, expect, it } from "vitest"
import {
  FIRST_ACCESS_TITLE,
  PASSWORD_RESET_TITLE,
  PAYMENT_LINK_TITLE,
  PLAN_EXPIRING_TITLES,
  PLAN_READY_TITLE,
  RENEWAL_PAYMENT_LINK_TITLE,
  renderFirstAccess,
  renderPasswordReset,
  renderPaymentLink,
  renderPlanExpiring,
  renderPlanReady,
  renderRenewalPaymentLink,
  toWhatsAppParts,
} from "@/lib/notify/templates"

const ENTITIES = ["&#39;", "&amp;", "&quot;", "&lt;", "&gt;"]
const APP_URL = "https://plana.nutritamilivalle.com.br/"
const TEMP_PASSWORD = "SWSC8VWD8T"

describe("renderPaymentLink", () => {
  it("escapa o nome no html, mantém o link literal e o texto mostra o nome real", () => {
    const r = renderPaymentLink({ name: "Ana <b>", link: "https://asaas/i/1" })
    expect(r.html).toContain("Olá Ana &lt;b&gt;!")
    expect(r.html).toContain("https://asaas/i/1")
    expect(r.subject).toBe(PAYMENT_LINK_TITLE)
    expect(r.text).not.toMatch(/<\/?(br|strong)>/)
    expect(r.text).toContain("Olá Ana <b>!")
  })

  it("gera o html exatamente como no fluxo antigo", () => {
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

describe("renderFirstAccess", () => {
  it("primeiro acesso: html exato, em uma linha", () => {
    expect(renderFirstAccess({ name: "Ana Souza", appUrl: APP_URL, tempPassword: TEMP_PASSWORD }).html).toBe(
      "Olá Ana Souza! 👋 <br>Seu pagamento foi confirmado e seu <strong>Plano Alimentar Personalizado está pronto</strong>! 🎉 <br><br>" +
        "Utilize os dados abaixo para realizar seu <strong>primeiro login</strong>: <br>Link: https://plana.nutritamilivalle.com.br/ <br>" +
        "🔐 <strong>Usuário:</strong> seu CPF (somente números) <br>🔑 <strong>Senha temporária:</strong> SWSC8VWD8T <br><br>" +
        "Por segurança, recomendamos que você <strong>troque a senha</strong> após o primeiro acesso.",
    )
  })

  it("o assunto é o título do primeiro acesso", () => {
    expect(FIRST_ACCESS_TITLE).toBe("Primeiro Acesso App PlanA")
    const r = renderFirstAccess({ name: "Ana", appUrl: APP_URL, tempPassword: TEMP_PASSWORD })
    expect(r.subject).toBe(FIRST_ACCESS_TITLE)
  })

  it("o nome é escapado no HTML e volta legível no texto", () => {
    const r = renderFirstAccess({ name: "Ana <b> & Cia", appUrl: APP_URL, tempPassword: TEMP_PASSWORD })
    expect(r.html).toContain("Olá Ana &lt;b&gt; &amp; Cia!")
    expect(r.text).toContain("Olá Ana <b> & Cia!")
    expect(r.text).not.toContain("&amp;")
  })

  it("o texto puro não tem tags e mantém as quebras de linha", () => {
    const r = renderFirstAccess({ name: "Ana Souza", appUrl: APP_URL, tempPassword: TEMP_PASSWORD })
    expect(r.text).not.toMatch(/<[^>]*>/)
    expect(r.text).toContain("Senha temporária: SWSC8VWD8T")
    expect(r.text.split("\n").length).toBeGreaterThan(5)
    expect(r.text).toContain("Link: https://plana.nutritamilivalle.com.br/ \n")
  })

  it("WhatsApp: 3 partes, título em negrito na primeira, senha na segunda", () => {
    const { html } = renderFirstAccess({ name: "Ana Souza", appUrl: APP_URL, tempPassword: TEMP_PASSWORD })
    const parts = toWhatsAppParts(FIRST_ACCESS_TITLE, html)

    expect(parts).toHaveLength(3)
    expect(parts[0].startsWith("*Primeiro Acesso App PlanA*\nOlá Ana Souza! 👋")).toBe(true)
    expect(parts[1]).toContain("*Senha temporária:* SWSC8VWD8T")
    expect(parts[1]).toContain("Link: https://plana.nutritamilivalle.com.br/")
    expect(parts[2]).toContain("*troque a senha*")
    for (const p of parts) expect(p).not.toContain("<")
  })
})

describe("renderPlanReady", () => {
  it("plano novo disponível: html exato, em uma linha", () => {
    expect(renderPlanReady({ name: "Ana Souza", appUrl: APP_URL }).html).toBe(
      "Olá Ana Souza! 👋 <br>Recebemos seu pagamento e seu <strong>novo Plano Alimentar Personalizado já está disponível</strong>. 🎉 <br><br>" +
        "Acesse com seu CPF e a senha que você já usa: <br>https://plana.nutritamilivalle.com.br/",
    )
  })

  it("o assunto é o título do plano novo", () => {
    expect(PLAN_READY_TITLE).toBe("Seu novo Plano Alimentar está pronto")
    expect(renderPlanReady({ name: "Ana", appUrl: APP_URL }).subject).toBe(PLAN_READY_TITLE)
  })

  it("o nome é escapado no HTML e volta legível no texto", () => {
    const r = renderPlanReady({ name: "Ana <b> & Cia", appUrl: APP_URL })
    expect(r.html).toContain("Olá Ana &lt;b&gt; &amp; Cia!")
    expect(r.text).toContain("Olá Ana <b> & Cia!")
    expect(r.text).not.toContain("&amp;")
  })

  it("o texto puro não tem tags, mantém as quebras de linha e não tem senha", () => {
    const r = renderPlanReady({ name: "Ana Souza", appUrl: APP_URL })
    expect(r.text).not.toMatch(/<[^>]*>/)
    expect(r.text).toContain("\n\nAcesse com seu CPF e a senha que você já usa: \nhttps://plana.nutritamilivalle.com.br/")
    expect(r.text).not.toMatch(/senha temporária/i)
  })

  it("WhatsApp: 2 partes, título em negrito na primeira", () => {
    const { html } = renderPlanReady({ name: "Ana Souza", appUrl: APP_URL })
    const parts = toWhatsAppParts(PLAN_READY_TITLE, html)

    expect(parts).toHaveLength(2)
    expect(parts[0].startsWith("*Seu novo Plano Alimentar está pronto*\nOlá Ana Souza! 👋")).toBe(true)
    expect(parts[0]).toContain("*novo Plano Alimentar Personalizado já está disponível*")
    expect(parts[1]).toBe("Acesse com seu CPF e a senha que você já usa: \nhttps://plana.nutritamilivalle.com.br/")
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

describe("renderPasswordReset", () => {
  const LINK = "https://plana.test/cliente/redefinir-senha/abc"

  it("gera o texto de §7.3 do spec do PlanA", () => {
    const r = renderPasswordReset({ name: "Ana", link: LINK })
    expect(r.subject).toBe(PASSWORD_RESET_TITLE)
    expect(PASSWORD_RESET_TITLE).toBe("Redefinição de senha do PlanA")
    expect(r.html).toBe(
      "Olá Ana! 👋 <br>Recebemos um pedido para redefinir a senha do seu acesso ao <strong>PlanA</strong>. <br><br>" +
        "Para criar uma nova senha, acesse o link abaixo. Ele vale por 1 hora e só pode ser usado uma vez: <br>" +
        `${LINK} <br><br>` +
        "Se você não fez esse pedido, ignore esta mensagem. Sua senha continua a mesma.",
    )
    expect(r.text).not.toMatch(/<\/?(br|strong)>/)
    expect(r.text).toContain(LINK)
  })

  it("escapa o nome no html e mantém o nome real no texto", () => {
    const r = renderPasswordReset({ name: "<b>Ana</b>", link: LINK })
    expect(r.html).toContain("Olá &lt;b&gt;Ana&lt;/b&gt;!")
    expect(r.text).toContain("Olá <b>Ana</b>!")
  })

  it("vira 3 partes de WhatsApp, a primeira com o título em negrito", () => {
    const r = renderPasswordReset({ name: "Ana", link: LINK })
    const parts = toWhatsAppParts(PASSWORD_RESET_TITLE, r.html)
    expect(parts).toHaveLength(3)
    expect(parts[0].startsWith(`*${PASSWORD_RESET_TITLE}*\n`)).toBe(true)
    expect(parts[1]).toContain(LINK)
    for (const p of parts) expect(p).not.toContain("<")
  })
})

describe("renderPlanExpiring", () => {
  const FORM_LINK = "https://plana.nutritamilivalle.com.br/cliente/planos/abc/renovar"
  const PAY_LINK = "https://asaas.test/i/abc123"
  const base = { name: "Ana", endDate: "2026-10-17" }

  it("os títulos de cada estágio", () => {
    expect(PLAN_EXPIRING_TITLES.d5).toBe("Seu plano alimentar está acabando")
    expect(PLAN_EXPIRING_TITLES.d2).toBe("Faltam poucos dias para o seu plano vencer")
    expect(PLAN_EXPIRING_TITLES.d0).toBe("Seu plano alimentar vence hoje")
  })

  it("d5: html exato, em uma linha, e variante e link são ignorados", () => {
    const expected =
      "Olá Ana! 👋 <br>Seu <strong>Plano Alimentar</strong> vence em <strong>17/10/2026</strong>. <br><br>" +
      "Em breve vamos liberar um formulário rápido de atualização para ajustar seu próximo plano. Avisaremos assim que ele estiver disponível. 💚"
    const form = renderPlanExpiring({ ...base, stage: "d5", variant: "form", link: FORM_LINK })
    const payment = renderPlanExpiring({ ...base, stage: "d5", variant: "payment", link: PAY_LINK })

    expect(form.html).toBe(expected)
    expect(payment.html).toBe(expected)
    expect(form.subject).toBe(PLAN_EXPIRING_TITLES.d5)
  })

  it("d2 formulário: html exato, em uma linha", () => {
    expect(renderPlanExpiring({ ...base, stage: "d2", variant: "form", link: FORM_LINK }).html).toBe(
      "Olá Ana! 👋 <br>Seu <strong>Plano Alimentar</strong> vence em <strong>17/10/2026</strong>. <br><br>" +
        "O formulário de atualização já está disponível e leva menos de 3 minutos. Depois de preencher, é só concluir o pagamento para liberar seu novo plano: <br>" +
        FORM_LINK,
    )
  })

  it("d2 pagamento: html exato, em uma linha", () => {
    expect(renderPlanExpiring({ ...base, stage: "d2", variant: "payment", link: PAY_LINK }).html).toBe(
      "Olá Ana! 👋 <br>Seu <strong>Plano Alimentar</strong> vence em <strong>17/10/2026</strong>. <br><br>" +
        "Você já preencheu o formulário de atualização. Para liberar seu novo plano, efetue o pagamento pelo link abaixo: <br>" +
        PAY_LINK,
    )
  })

  it("d0 formulário: html exato, em uma linha", () => {
    expect(renderPlanExpiring({ ...base, stage: "d0", variant: "form", link: FORM_LINK }).html).toBe(
      "Olá Ana! 👋 <br>Seu <strong>Plano Alimentar</strong> vence <strong>hoje</strong>. <br><br>" +
        "Para receber um novo plano atualizado, preencha o formulário de atualização (leva menos de 3 minutos) e conclua o pagamento: <br>" +
        FORM_LINK,
    )
  })

  it("d0 pagamento: html exato, em uma linha", () => {
    expect(renderPlanExpiring({ ...base, stage: "d0", variant: "payment", link: PAY_LINK }).html).toBe(
      "Olá Ana! 👋 <br>Seu <strong>Plano Alimentar</strong> vence <strong>hoje</strong>. <br><br>" +
        "Você já preencheu o formulário de atualização. Para liberar seu novo plano, efetue o pagamento pelo link abaixo: <br>" +
        PAY_LINK,
    )
  })

  it.each([
    ["d2", "form", "leva menos de 3 minutos", FORM_LINK],
    ["d2", "payment", "Você já preencheu o formulário de atualização", PAY_LINK],
    ["d0", "form", "leva menos de 3 minutos", FORM_LINK],
    ["d0", "payment", "Você já preencheu o formulário de atualização", PAY_LINK],
  ] as const)("%s, variante %s: leva o link, o texto da variante e o assunto do estágio", (stage, variant, phrase, link) => {
    const r = renderPlanExpiring({ ...base, stage, variant, link })
    expect(r.html).toContain(link)
    expect(r.text).toContain(link)
    expect(r.html).toContain(phrase)
    expect(r.subject).toBe(PLAN_EXPIRING_TITLES[stage])
  })

  it("d2 mostra a data e d0 diz hoje", () => {
    const d2 = renderPlanExpiring({ ...base, stage: "d2", variant: "form", link: FORM_LINK })
    const d0 = renderPlanExpiring({ ...base, stage: "d0", variant: "form", link: FORM_LINK })
    expect(d2.html).toContain("<strong>17/10/2026</strong>")
    expect(d0.html).toContain("vence <strong>hoje</strong>")
    expect(d0.html).not.toContain("17/10/2026")
  })

  it("escapa o link no html e o texto o devolve como veio", () => {
    const link = "https://asaas.test/i/1?a=1&b=2"
    const r = renderPlanExpiring({ ...base, stage: "d2", variant: "payment", link })
    expect(r.html).toContain("https://asaas.test/i/1?a=1&amp;b=2")
    expect(r.text).toContain(link)
  })

  it.each([
    ["d5", "form"],
    ["d2", "form"],
    ["d2", "payment"],
    ["d0", "form"],
    ["d0", "payment"],
  ] as const)("%s, variante %s: nome escapado, texto sem tag e 2 partes de WhatsApp", (stage, variant) => {
    const r = renderPlanExpiring({
      name: "<b>Ana</b>",
      endDate: "2026-10-17",
      stage,
      variant,
      link: variant === "form" ? FORM_LINK : PAY_LINK,
    })
    expect(r.html).toContain("Olá &lt;b&gt;Ana&lt;/b&gt;!")
    expect(r.html).not.toContain("<b>")
    expect(r.text).toContain("Olá <b>Ana</b>!")
    expect(r.text).not.toMatch(/<\/?(br|strong)>/)

    const parts = toWhatsAppParts(r.subject, r.html)
    expect(parts).toHaveLength(2)
    expect(parts[0].startsWith(`*${PLAN_EXPIRING_TITLES[stage]}*\n`)).toBe(true)
    for (const p of parts) expect(p).not.toMatch(/<\/?(br|strong)>|&lt;|&gt;/)
  })
})

describe("renderRenewalPaymentLink", () => {
  const LINK = "https://asaas.test/i/abc123"

  it("o assunto é o título da renovação", () => {
    expect(RENEWAL_PAYMENT_LINK_TITLE).toBe("Recebemos sua atualização! Falta só o pagamento")
    expect(renderRenewalPaymentLink({ name: "Ana", link: LINK }).subject).toBe(RENEWAL_PAYMENT_LINK_TITLE)
  })

  it("html exato, em uma linha", () => {
    expect(renderRenewalPaymentLink({ name: "Ana", link: LINK }).html).toBe(
      "Olá Ana! 👋 <br>Recebemos a atualização dos seus dados. 🎉 <br><br>" +
        "Para liberar seu <strong>novo Plano Alimentar Personalizado</strong>, efetue o pagamento pelo link abaixo: <br>" +
        `${LINK} <br><br>` +
        "Assim que o pagamento for confirmado, seu novo plano aparece no PlanA. É só entrar com seu CPF e a senha que você já usa. 💚",
    )
  })

  it("leva o link e a senha que o paciente já usa, sem falar em cadastro nem em informações de acesso", () => {
    const r = renderRenewalPaymentLink({ name: "Ana", link: LINK })
    expect(r.html).toContain(LINK)
    expect(r.html).toContain("a senha que você já usa")
    for (const channel of [r.html, r.text]) {
      expect(channel).not.toContain("cadastro")
      expect(channel).not.toContain("informações de acesso")
    }
  })

  it("nome escapado, texto sem tag e 3 partes de WhatsApp", () => {
    const r = renderRenewalPaymentLink({ name: "<b>Ana</b>", link: LINK })
    expect(r.html).toContain("Olá &lt;b&gt;Ana&lt;/b&gt;!")
    expect(r.text).toContain("Olá <b>Ana</b>!")
    expect(r.text).not.toMatch(/<\/?(br|strong)>/)

    const parts = toWhatsAppParts(r.subject, r.html)
    expect(parts).toHaveLength(3)
    expect(parts[0].startsWith(`*${RENEWAL_PAYMENT_LINK_TITLE}*\n`)).toBe(true)
    expect(parts[1]).toContain(LINK)
    for (const p of parts) expect(p).not.toMatch(/<\/?(br|strong)>|&lt;|&gt;/)
  })
})
