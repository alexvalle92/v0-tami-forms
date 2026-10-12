// Respostas do quiz que alimentam o plano alimentar (spec §6.1).
// As respostas são JSON não confiável: só texto de até 200 caracteres chega ao prompt,
// e nome, CPF, e-mail e telefone ficam de fora porque só os 17 campos abaixo são lidos.

export type AgeRange = "18-24 anos" | "25-34 anos" | "35-44 anos" | "45-59 anos"
export type Sex = "Masculino" | "Feminino"

export type PlanAnswers = {
  faixaEtaria: AgeRange
  sexo: Sex
  alturaCm: number
  pesoKg: number
  /** Os 17 campos, na ordem de ANSWER_FIELDS, prontos para o prompt. */
  fields: { label: string; value: string }[]
}

export const ANSWER_FIELDS: readonly { key: string; label: string }[] = [
  { key: "faixa_etaria", label: "Faixa etária" },
  { key: "sexo_biologico", label: "Sexo biológico" },
  { key: "tipo_fisico", label: "Tipo físico atual" },
  { key: "peso_comportamento", label: "Comportamento do peso ao longo do tempo" },
  { key: "breakfast_foods", label: "Café da manhã" },
  { key: "almoco", label: "Almoço" },
  { key: "lanche_tarde", label: "Lanche da tarde" },
  { key: "jantar", label: "Jantar" },
  { key: "sobremesa", label: "Sobremesa" },
  { key: "rotina_dia", label: "Rotina diária" },
  { key: "sono", label: "Horas de sono por dia" },
  { key: "agua", label: "Consumo médio de água por dia" },
  { key: "habitos", label: "Hábitos Alimentares" },
  { key: "altura_cm", label: "Altura em centímetros" },
  { key: "peso_kg", label: "Peso atual" },
  { key: "imc", label: "IMC atual" },
  { key: "meta_peso_30d", label: "Meta de peso" },
]

const AGE_RANGES: readonly AgeRange[] = ["18-24 anos", "25-34 anos", "35-44 anos", "45-59 anos"]
const SEXES: readonly Sex[] = ["Masculino", "Feminino"]

const NOT_INFORMED = "não informado"
const MAX_FIELD_LENGTH = 200
// Limita o trabalho feito com listas enormes; o corte de 200 caracteres já descartaria o resto.
const MAX_LIST_ITEMS = 50

const HEIGHT_RANGE_CM = { min: 120, max: 230 }
const WEIGHT_RANGE_KG = { min: 30, max: 300 }

/** Número a partir de texto ou número: aceita vírgula decimal e sufixo ("70,5", "165 cm"). */
function toNumber(value: unknown): number | null {
  if (typeof value !== "string" && typeof value !== "number") return null
  const n = Number.parseFloat(String(value).replace(",", "."))
  return Number.isFinite(n) ? n : null
}

function inRange(n: number | null, range: { min: number; max: number }): n is number {
  return n !== null && n >= range.min && n <= range.max
}

/** Colapsa espaços, quebras de linha e caracteres de controle e corta em 200 caracteres. */
function cleanText(text: string): string {
  let out = text.replace(/[\p{Cc}\s]+/gu, " ").trim()
  if (out.length > MAX_FIELD_LENGTH) {
    out = out.slice(0, MAX_FIELD_LENGTH)
    // não deixa meio par substituto (emoji) no fim do corte
    const last = out.charCodeAt(out.length - 1)
    if (last >= 0xd800 && last <= 0xdbff) out = out.slice(0, -1)
    out = out.trimEnd()
  }
  return out
}

/** Só string, número finito e lista de strings viram texto; todo o resto é "não informado". */
function toFieldText(value: unknown): string {
  let text = ""
  if (typeof value === "string") {
    text = value
  } else if (typeof value === "number") {
    text = Number.isFinite(value) ? String(value) : ""
  } else if (Array.isArray(value)) {
    text = value
      .slice(0, MAX_LIST_ITEMS)
      .filter((item): item is string => typeof item === "string")
      .map((item) => cleanText(item))
      .filter((item) => item.length > 0)
      .join(", ")
  }
  return cleanText(text) || NOT_INFORMED
}

/**
 * Valida os campos de cálculo e monta os 17 campos do prompt.
 * `issues` traz só nomes de campo, nunca o valor recebido (iria para logs).
 */
export function parsePlanAnswers(
  answers: Record<string, unknown>,
): { ok: true; value: PlanAnswers } | { ok: false; issues: string[] } {
  const issues: string[] = []

  const faixa = answers.faixa_etaria
  const faixaEtaria = AGE_RANGES.find((r) => r === faixa)
  if (!faixaEtaria) issues.push("faixa_etaria")

  const sexoRaw = answers.sexo_biologico
  const sexo = SEXES.find((s) => s === sexoRaw)
  if (!sexo) issues.push("sexo_biologico")

  const altura = toNumber(answers.altura_cm)
  if (!inRange(altura, HEIGHT_RANGE_CM)) issues.push("altura_cm")

  const peso = toNumber(answers.peso_kg)
  if (!inRange(peso, WEIGHT_RANGE_KG)) issues.push("peso_kg")

  if (!faixaEtaria || !sexo || altura === null || peso === null || issues.length > 0) {
    return { ok: false, issues }
  }

  // altura e peso saem já normalizados, para o prompt bater com o que o cálculo usou
  const normalized: Record<string, string> = { altura_cm: String(altura), peso_kg: String(peso) }
  const fields = ANSWER_FIELDS.map(({ key, label }) => ({
    label,
    value: normalized[key] ?? toFieldText(answers[key]),
  }))

  return { ok: true, value: { faixaEtaria, sexo, alturaCm: altura, pesoKg: peso, fields } }
}
