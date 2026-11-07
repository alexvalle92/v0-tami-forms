import { describe, expect, it } from "vitest"
import { stepValidation, validateCPF } from "@/lib/quiz/step-validation"

describe("stepValidation", () => {
  it("pergunta de escolha sem resposta fica vazia", () => {
    expect(stepValidation(0, {})).toEqual({
      reason: "vazio",
      message: "Por favor, selecione uma opção antes de continuar.",
    })
    expect(stepValidation(0, { faixa_etaria: "25-34 anos" })).toBeNull()
  })

  it("etapas informativas e de envio sempre avançam", () => {
    for (const step of [3, 5, 11, 16, 17, 21, 22, 27, 28]) {
      expect(stepValidation(step, {})).toBeNull()
    }
  })

  it("seleção múltipla vazia usa a mensagem da refeição", () => {
    expect(stepValidation(6, { breakfast_foods: [] })?.message).toBe(
      "Por favor, selecione pelo menos uma opção para o seu café da manhã.",
    )
    expect(stepValidation(7, { almoco: [] })?.message).toBe(
      "Por favor, selecione pelo menos uma opção para o seu almoço.",
    )
    expect(stepValidation(9, { jantar: [] })?.message).toBe(
      "Por favor, selecione pelo menos uma opção para o seu jantar.",
    )
    expect(stepValidation(15, { habitos: [] })?.message).toBe(
      "Por favor, selecione pelo menos uma opção de hábito alimentar.",
    )
    expect(stepValidation(6, { breakfast_foods: [] })?.reason).toBe("vazio")
  })

  it("e-mail", () => {
    expect(stepValidation(23, {})).toEqual({
      reason: "vazio",
      message: "Por favor, informe seu e-mail para continuar.",
    })
    expect(stepValidation(23, { email: "a@b" })).toEqual({
      reason: "email_invalido",
      message: "Por favor, insira um e-mail válido (exemplo: seuemail@exemplo.com)",
    })
    expect(stepValidation(23, { email: "a@b.co" })).toBeNull()
  })

  it("WhatsApp", () => {
    expect(stepValidation(24, {})).toEqual({
      reason: "vazio",
      message: "Por favor, informe seu número de WhatsApp.",
    })
    expect(stepValidation(24, { whatsapp: "(11) 9876" })).toEqual({
      reason: "telefone_invalido",
      message: "Por favor, insira um telefone válido com DDD (exemplo: (11) 98765-4321)",
    })
    expect(stepValidation(24, { whatsapp: "(11) 98765-4321" })).toBeNull()
  })

  it("nome em branco fica vazio", () => {
    expect(stepValidation(25, { nome_completo: "   " })).toEqual({
      reason: "vazio",
      message: "Por favor, informe seu nome completo para continuar.",
    })
    expect(stepValidation(25, { nome_completo: "Ana Souza" })).toBeNull()
  })

  it("CPF", () => {
    expect(stepValidation(26, {})).toEqual({
      reason: "vazio",
      message: "Por favor, informe seu CPF para continuar.",
    })
    expect(stepValidation(26, { cpf: "123" })).toEqual({
      reason: "cpf_invalido",
      message: "Por favor, insira um CPF válido com 11 dígitos.",
    })
    expect(stepValidation(26, { cpf: "111.111.111-11" })).toEqual({
      reason: "cpf_invalido",
      message: "CPF inválido. Por favor, verifique os dados e tente novamente.",
    })
    expect(stepValidation(26, { cpf: "529.982.247-25" })).toBeNull()
  })

  it("altura, peso e meta", () => {
    expect(stepValidation(18, {})?.message).toBe("Por favor, selecione sua altura antes de continuar.")
    expect(stepValidation(19, {})?.message).toBe("Por favor, informe seu peso atual para continuar.")
    expect(stepValidation(20, {})?.message).toBe("Por favor, defina sua meta de peso para continuar.")
  })
})

describe("validateCPF", () => {
  it("valida dígitos verificadores", () => {
    expect(validateCPF("529.982.247-25")).toBe(true)
    expect(validateCPF("111.111.111-11")).toBe(false)
    expect(validateCPF("529.982.247-24")).toBe(false)
  })
})
