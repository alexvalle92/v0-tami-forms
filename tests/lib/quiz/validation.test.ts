import { describe, expect, it } from "vitest"
import { isValidCpf, normalizePhone, parseSubmitRequest } from "@/lib/quiz/validation"

const submissionId = "3f1c2d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f"

const validAnswers = {
  nome_completo: "  Ana Souza 💚 ",
  email: " Ana@Gmail.COM ",
  whatsapp: "(44) 9 9165-1250",
  cpf: "529.982.247-25",
  faixa_etaria: "25-34 anos",
}

describe("isValidCpf", () => {
  it("aceita CPF válido com ou sem máscara", () => {
    expect(isValidCpf("529.982.247-25")).toBe(true)
    expect(isValidCpf("52998224725")).toBe(true)
    expect(isValidCpf("123.456.789-09")).toBe(true)
  })

  it("rejeita dígito verificador errado, dígitos repetidos e tamanho errado", () => {
    expect(isValidCpf("529.982.247-24")).toBe(false)
    expect(isValidCpf("111.111.111-11")).toBe(false)
    expect(isValidCpf("123")).toBe(false)
  })
})

describe("normalizePhone", () => {
  it("normaliza celular com máscara", () => {
    expect(normalizePhone("(44) 9 9165-1250")).toBe("44991651250")
  })

  it("remove o DDI 55", () => {
    expect(normalizePhone("+55 44 99165-1250")).toBe("44991651250")
  })

  it("aceita telefone fixo de 10 dígitos", () => {
    expect(normalizePhone("(44) 3025-1234")).toBe("4430251234")
  })

  it("rejeita número sem DDD", () => {
    expect(normalizePhone("9165-1250")).toBeNull()
  })
})

describe("parseSubmitRequest", () => {
  it("normaliza o paciente e preserva as respostas originais", () => {
    const result = parseSubmitRequest({ submissionId, answers: validAnswers })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.submissionId).toBe(submissionId)
    expect(result.value.patient).toEqual({
      name: "Ana Souza 💚",
      email: "ana@gmail.com",
      phone: "44991651250",
      cpf: "52998224725",
    })
    expect(result.value.answers.faixa_etaria).toBe("25-34 anos")
    expect(result.value.answers.nome_completo).toBe("  Ana Souza 💚 ")
  })

  it("rejeita sem submissionId", () => {
    expect(parseSubmitRequest({ answers: validAnswers }).ok).toBe(false)
  })

  it("rejeita submissionId que não é UUID", () => {
    expect(parseSubmitRequest({ submissionId: "abc", answers: validAnswers }).ok).toBe(false)
  })

  it("rejeita CPF inválido", () => {
    const body = { submissionId, answers: { ...validAnswers, cpf: "529.982.247-24" } }
    expect(parseSubmitRequest(body).ok).toBe(false)
  })

  it("rejeita e-mail inválido", () => {
    const body = { submissionId, answers: { ...validAnswers, email: "ana@" } }
    expect(parseSubmitRequest(body).ok).toBe(false)
  })

  it("rejeita nome só com espaços", () => {
    const body = { submissionId, answers: { ...validAnswers, nome_completo: "   " } }
    expect(parseSubmitRequest(body).ok).toBe(false)
  })

  it("rejeita telefone inválido", () => {
    const body = { submissionId, answers: { ...validAnswers, whatsapp: "9165-1250" } }
    expect(parseSubmitRequest(body).ok).toBe(false)
  })

  it("limita o nome a 200 caracteres (VARCHAR(200)), depois do trim", () => {
    const ok = { submissionId, answers: { ...validAnswers, nome_completo: `  ${"a".repeat(200)}  ` } }
    const result = parseSubmitRequest(ok)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value.patient.name).toHaveLength(200)

    const tooLong = { submissionId, answers: { ...validAnswers, nome_completo: "a".repeat(201) } }
    const bad = parseSubmitRequest(tooLong)
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.issues.join(" ")).toContain("nome_completo")
  })

  it("limita o e-mail a 254 caracteres (VARCHAR(254))", () => {
    const domain = `${"b".repeat(63)}.${"c".repeat(63)}.${"d".repeat(63)}.com`
    const local = "a".repeat(254 - domain.length - 1)
    const email254 = `${local}@${domain}`
    expect(email254).toHaveLength(254)
    const ok = parseSubmitRequest({ submissionId, answers: { ...validAnswers, email: email254 } })
    expect(ok.ok).toBe(true)

    const email255 = `a${email254}`
    expect(email255).toHaveLength(255)
    const bad = parseSubmitRequest({ submissionId, answers: { ...validAnswers, email: email255 } })
    expect(bad.ok).toBe(false)
    if (!bad.ok) expect(bad.issues.join(" ")).toContain("email")
  })

  it("rejeita body nulo", () => {
    const result = parseSubmitRequest(null)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.issues.length).toBeGreaterThan(0)
  })
})
