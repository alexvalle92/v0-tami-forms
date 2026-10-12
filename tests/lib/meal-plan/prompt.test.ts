import { describe, expect, it } from "vitest"
import { ANSWER_FIELDS, parsePlanAnswers } from "@/lib/meal-plan/answers"
import { SYSTEM_PROMPT, buildUserMessage } from "@/lib/meal-plan/prompt"
import { computeTargets } from "@/lib/meal-plan/targets"

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

function build(answers: Record<string, unknown> = raw): string {
  const parsed = parsePlanAnswers(answers)
  if (!parsed.ok) throw new Error(`esperava ok, veio issues: ${parsed.issues.join(",")}`)
  return buildUserMessage(parsed.value, computeTargets(parsed.value))
}

describe("SYSTEM_PROMPT", () => {
  it("o prompt de sistema é o da nutricionista", () => {
    expect(SYSTEM_PROMPT.startsWith("# Agent — Nutricionista Especialista em Emagrecimento")).toBe(true)
    expect(SYSTEM_PROMPT).toContain("Equação de Harris-Benedict")
    expect(SYSTEM_PROMPT).toContain("- Rap10 com proteína (carne)")
    expect(SYSTEM_PROMPT).toContain("e sim pular linha (\\n)") // barra invertida + n, literais
    expect(SYSTEM_PROMPT.trimEnd().endsWith("Café sem açúcar — 200 ml")).toBe(true)
  })
})

describe("buildUserMessage", () => {
  it("a mensagem traz os 17 campos, um por linha, na ordem", () => {
    const lines = build().split("\n")
    expect(lines[0]).toBe("Parâmetros fornecidos do paciente:")
    const fieldLines = lines.slice(1, 1 + ANSWER_FIELDS.length)
    expect(fieldLines.map((l) => l.slice(0, l.indexOf(":")))).toEqual(ANSWER_FIELDS.map((f) => f.label))
    expect(lines[1 + ANSWER_FIELDS.length]).toBe("")
    expect(build()).toContain("Café da manhã: Pão francês, Café com leite")
    expect(build()).toContain("Faixa etária: 25-34 anos")
    expect(build()).toContain("Sexo biológico: Feminino")
    expect(build()).toContain("Altura em centímetros: 165")
    expect(build()).toContain("Peso atual: 75")
    expect(build()).toContain("Almoço: não informado")
  })

  it("a mensagem traz as metas calculadas", () => {
    const msg = build()
    expect(msg).toContain("Metas calculadas (use estes valores; não recalcule):")
    expect(msg).toContain("Taxa Metabólica Basal (TMB): 1537 kcal")
    expect(msg).toContain("Gasto Energético Total (GET, sedentário): 1845 kcal")
    expect(msg).toContain("Meta calórica diária do plano: 1200 kcal")
    expect(msg).toContain("Proteína diária: de 113 g a 150 g")
  })

  it("termina pedindo que o total seja a soma das refeições, próximo da meta", () => {
    expect(
      build().endsWith(
        "O total de calorias do plano deve ser a soma das refeições e ficar próximo da meta calórica diária.",
      ),
    ).toBe(true)
  })

  it("a mensagem não contém nome, CPF, e-mail nem telefone do paciente", () => {
    const msg = build()
    expect(msg).not.toContain(raw.nome_completo)
    expect(msg).not.toContain(raw.cpf)
    expect(msg).not.toContain(raw.email)
    expect(msg).not.toContain(raw.whatsapp)
  })
})
