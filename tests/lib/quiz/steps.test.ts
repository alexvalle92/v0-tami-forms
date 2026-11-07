import { describe, expect, it } from "vitest"
import {
  ALLOWED_ANSWER_KEYS,
  LAST_STEP,
  QUIZ_STEPS,
  answerKeyForSlug,
  bmiBand,
  sanitizeAnswer,
  stepSlug,
} from "@/lib/quiz/steps"

describe("QUIZ_STEPS", () => {
  it("tem 29 etapas com slugs únicos", () => {
    expect(QUIZ_STEPS).toHaveLength(29)
    expect(new Set(QUIZ_STEPS.map((s) => s.slug)).size).toBe(29)
    expect(LAST_STEP).toBe(28)
  })

  it("resolve o slug pelo índice", () => {
    expect(stepSlug(18)).toBe("altura")
    expect(stepSlug(26)).toBe("cpf")
    expect(stepSlug(28)).toBe("checkout")
    expect(stepSlug(29)).toBeUndefined()
  })
})

describe("ALLOWED_ANSWER_KEYS", () => {
  it("lista exatamente as chaves permitidas, na ordem das etapas", () => {
    expect([...ALLOWED_ANSWER_KEYS]).toEqual([
      "faixa_etaria",
      "sexo_biologico",
      "tipo_fisico",
      "peso_comportamento",
      "breakfast_foods",
      "almoco",
      "lanche_tarde",
      "jantar",
      "sobremesa",
      "rotina_dia",
      "sono",
      "agua",
      "habitos",
      "imc_faixa",
    ])
  })

  it("não registra resposta nas etapas de altura, peso, meta e contato", () => {
    for (const step of [18, 19, 20, 23, 24, 25, 26]) {
      expect(QUIZ_STEPS[step].answerKey).toBeUndefined()
    }
  })
})

describe("answerKeyForSlug", () => {
  it("devolve a chave de resposta do slug", () => {
    expect(answerKeyForSlug("cafe_manha")).toBe("breakfast_foods")
    expect(answerKeyForSlug("perfil_imc")).toBe("imc_faixa")
    expect(answerKeyForSlug("cpf")).toBeUndefined()
  })
})

describe("bmiBand", () => {
  it("classifica pelas faixas", () => {
    expect(bmiBand(18.49)).toBe("abaixo")
    expect(bmiBand(18.5)).toBe("normal")
    expect(bmiBand(24.99)).toBe("normal")
    expect(bmiBand("24.99")).toBe("normal")
    expect(bmiBand(25)).toBe("sobrepeso")
    expect(bmiBand(29.99)).toBe("sobrepeso")
    expect(bmiBand(30)).toBe("obesidade")
  })

  it("descarta valor ausente ou inválido", () => {
    expect(bmiBand("abc")).toBeUndefined()
    expect(bmiBand(Number.NaN)).toBeUndefined()
    expect(bmiBand(0)).toBeUndefined()
    expect(bmiBand(-1)).toBeUndefined()
    expect(bmiBand(undefined)).toBeUndefined()
  })
})

describe("sanitizeAnswer", () => {
  it("aceita string e array de strings dentro dos limites", () => {
    expect(sanitizeAnswer("Sim")).toBe("Sim")
    expect(sanitizeAnswer(["a", "b"])).toEqual(["a", "b"])
  })

  it("descarta o que estiver fora dos limites ou do tipo", () => {
    expect(sanitizeAnswer("")).toBeUndefined()
    expect(sanitizeAnswer("x".repeat(81))).toBeUndefined()
    expect(sanitizeAnswer(Array.from({ length: 16 }, () => "a"))).toBeUndefined()
    expect(sanitizeAnswer(["a", 1])).toBeUndefined()
    expect(sanitizeAnswer([])).toBeUndefined()
    expect(sanitizeAnswer({})).toBeUndefined()
    expect(sanitizeAnswer(42)).toBeUndefined()
  })
})
