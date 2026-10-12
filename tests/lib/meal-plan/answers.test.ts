import { describe, expect, it } from "vitest"
import { ANSWER_FIELDS, parsePlanAnswers } from "@/lib/meal-plan/answers"

const raw = {
  faixa_etaria: "25-34 anos",
  sexo_biologico: "Feminino",
  tipo_fisico: "Gordinho(a)",
  breakfast_foods: ["Pão francês", "Café com leite"],
  altura_cm: "165",
  peso_kg: "75",
  imc: "27.55",
  nome_completo: "Ana Souza",
  cpf: "52998224725",
  email: "ana@example.com",
  whatsapp: "44991651250",
}

const LABELS = [
  "Faixa etária",
  "Sexo biológico",
  "Tipo físico atual",
  "Comportamento do peso ao longo do tempo",
  "Café da manhã",
  "Almoço",
  "Lanche da tarde",
  "Jantar",
  "Sobremesa",
  "Rotina diária",
  "Horas de sono por dia",
  "Consumo médio de água por dia",
  "Hábitos Alimentares",
  "Altura em centímetros",
  "Peso atual",
  "IMC atual",
  "Meta de peso",
]

function parseOk(answers: Record<string, unknown>) {
  const r = parsePlanAnswers(answers)
  if (!r.ok) throw new Error(`esperava ok, veio issues: ${r.issues.join(",")}`)
  return r.value
}

function fieldValue(answers: Record<string, unknown>, label: string): string | undefined {
  return parseOk(answers).fields.find((f) => f.label === label)?.value
}

describe("parsePlanAnswers", () => {
  it("normaliza os campos de cálculo", () => {
    const v = parseOk(raw)
    expect(v.alturaCm).toBe(165)
    expect(v.pesoKg).toBe(75)
    expect(v.faixaEtaria).toBe("25-34 anos")
    expect(v.sexo).toBe("Feminino")
  })

  it("devolve os 17 campos na ordem de ANSWER_FIELDS", () => {
    const v = parseOk(raw)
    expect(v.fields).toHaveLength(17)
    expect(v.fields.map((f) => f.label)).toEqual(LABELS)
    expect(ANSWER_FIELDS.map((f) => f.label)).toEqual(LABELS)
  })

  it("lista vira texto separado por vírgula", () => {
    expect(fieldValue(raw, "Café da manhã")).toBe("Pão francês, Café com leite")
  })

  it("campo ausente, vazio, objeto ou lista vazia vira 'não informado'", () => {
    const v = parseOk({
      ...raw,
      almoco: undefined,
      lanche_tarde: "   ",
      jantar: { a: "b" },
      sobremesa: [],
      rotina_dia: null,
      sono: true,
      agua: [{ x: 1 }, "  "],
    })
    const byLabel = Object.fromEntries(v.fields.map((f) => [f.label, f.value]))
    expect(byLabel["Almoço"]).toBe("não informado")
    expect(byLabel["Lanche da tarde"]).toBe("não informado")
    expect(byLabel["Jantar"]).toBe("não informado")
    expect(byLabel["Sobremesa"]).toBe("não informado")
    expect(byLabel["Rotina diária"]).toBe("não informado")
    expect(byLabel["Horas de sono por dia"]).toBe("não informado")
    expect(byLabel["Consumo médio de água por dia"]).toBe("não informado")
    expect(byLabel["Hábitos Alimentares"]).toBe("não informado")
  })

  it("objetos aninhados em listas nunca chegam ao texto", () => {
    const v = fieldValue({ ...raw, habitos: ["Doce", { evil: "x" }, ["a"]] }, "Hábitos Alimentares")
    expect(v).toBe("Doce")
  })

  it("texto longo é cortado em 200 caracteres e quebras de linha viram espaço", () => {
    const v = fieldValue({ ...raw, rotina_dia: "a".repeat(500) }, "Rotina diária")
    expect(v).toHaveLength(200)
    expect(fieldValue({ ...raw, rotina_dia: "linha 1\n\nlinha  2\r\n\tlinha 3" }, "Rotina diária")).toBe(
      "linha 1 linha 2 linha 3",
    )
    const joined = fieldValue({ ...raw, habitos: Array.from({ length: 100 }, () => "abcdefghij") }, "Hábitos Alimentares")
    expect(joined?.length).toBeLessThanOrEqual(200)
  })

  it("nenhum valor de fields contém nome, CPF, e-mail ou telefone", () => {
    const text = JSON.stringify(parseOk(raw).fields)
    for (const secret of ["Ana Souza", "52998224725", "ana@example.com", "44991651250"]) {
      expect(text).not.toContain(secret)
    }
  })

  it.each([
    ["70,5", 70.5],
    ["165 cm", 165],
    [80, 80],
  ])("número %j → %d", (input, expected) => {
    expect(parseOk({ ...raw, peso_kg: input }).pesoKg).toBe(expected)
  })

  it.each([
    [{ faixa_etaria: "60+ anos" }, "faixa_etaria"],
    [{ sexo_biologico: "Outro" }, "sexo_biologico"],
    [{ altura_cm: "abc" }, "altura_cm"],
    [{ altura_cm: "119" }, "altura_cm"],
    [{ altura_cm: "231" }, "altura_cm"],
    [{ peso_kg: "" }, "peso_kg"],
    [{ peso_kg: "29" }, "peso_kg"],
    [{ peso_kg: "301" }, "peso_kg"],
  ])("inválido %j → issue %s, sem ecoar o valor", (patch, field) => {
    const r = parsePlanAnswers({ ...raw, ...patch })
    expect(r.ok).toBe(false)
    if (r.ok) return
    expect(r.issues).toEqual([field])
    const received = String(Object.values(patch)[0])
    if (received.length > 0) {
      for (const issue of r.issues) expect(issue).not.toContain(received)
    }
  })

  it("campos de cálculo ausentes ou de tipo errado são inválidos", () => {
    const r = parsePlanAnswers({ altura_cm: { x: 1 }, peso_kg: ["70"] })
    expect(r).toEqual({ ok: false, issues: ["faixa_etaria", "sexo_biologico", "altura_cm", "peso_kg"] })
  })
})
