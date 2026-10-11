// Metas nutricionais calculadas no código (spec §6.2), nunca pela IA.
// A equação (Harris-Benedict original, 1919) e os pisos estão a confirmar com a nutricionista:
// trocar é mudar as constantes abaixo.

import type { AgeRange, PlanAnswers } from "./answers"

export const CALORIE_FLOOR = { Feminino: 1200, Masculino: 1500 } as const
export const DAILY_DEFICIT_KCAL = 770
/** Sedentário. */
export const ACTIVITY_FACTOR = 1.2

const PROTEIN_G_PER_KG = { min: 1.5, max: 2.0 }
const CALORIE_STEP = 50

/** Idade usada no cálculo: ponto médio de cada faixa do quiz. */
const AGE_BY_RANGE: Record<AgeRange, number> = {
  "18-24 anos": 21,
  "25-34 anos": 30,
  "35-44 anos": 40,
  "45-59 anos": 52,
}

export type Targets = {
  age: number
  /** Taxa metabólica basal, kcal/dia. */
  tmb: number
  /** Gasto energético total, kcal/dia. */
  get: number
  /** Meta calórica diária: GET menos o déficit, múltiplo de 50, nunca abaixo do piso. */
  calories: number
  calorieFloor: number
  proteinMinG: number
  proteinMaxG: number
}

export function computeTargets(a: Pick<PlanAnswers, "faixaEtaria" | "sexo" | "alturaCm" | "pesoKg">): Targets {
  const age = AGE_BY_RANGE[a.faixaEtaria]
  const tmbExact =
    a.sexo === "Masculino"
      ? 66.47 + 13.75 * a.pesoKg + 5.003 * a.alturaCm - 6.755 * age
      : 655.1 + 9.563 * a.pesoKg + 1.85 * a.alturaCm - 4.676 * age
  const getExact = tmbExact * ACTIVITY_FACTOR
  const calorieFloor = CALORIE_FLOOR[a.sexo]
  const calories = Math.max(calorieFloor, Math.round((getExact - DAILY_DEFICIT_KCAL) / CALORIE_STEP) * CALORIE_STEP)

  return {
    age,
    tmb: Math.round(tmbExact),
    get: Math.round(getExact),
    calories,
    calorieFloor,
    proteinMinG: Math.round(PROTEIN_G_PER_KG.min * a.pesoKg),
    proteinMaxG: Math.round(PROTEIN_G_PER_KG.max * a.pesoKg),
  }
}
