// Plano gerado pela IA: schema da saída estruturada, validação e conversão para `plan_data` (spec §6.4).
// O plano é conteúdo de saúde que vai direto ao paciente: `validatePlan` é a rede de segurança
// (piso calórico, quantidade em toda linha de alimento) e roda em código, nunca na IA.

import { z } from "zod/v4"
import type { PlanData } from "@/lib/db/repos/types"
import type { Targets } from "./targets"

export type GeneratedPlan = {
  meals: {
    name: string
    time: string
    foods: string
    calories: number
    /** Opções que o paciente come no lugar da principal: nenhuma no almoço, exatamente 1 nas demais. */
    substitutes: { foods: string; calories: number }[]
  }[]
  calories: number
  observations: string
}

// Só tipos simples: o SDK converte este schema para JSON Schema, que não aceita min/max nem tamanho de texto.
// Toda checagem de faixa fica em `validatePlan`.
export const generatedPlanSchema: z.ZodType<GeneratedPlan> = z.object({
  meals: z.array(
    z.object({
      name: z.string(),
      time: z.string(),
      foods: z.string(),
      calories: z.number(),
      substitutes: z.array(z.object({ foods: z.string(), calories: z.number() })),
    }),
  ),
  calories: z.number(),
  observations: z.string(),
})

export type PlanIssue =
  | "meals_count"
  | "meal_fields"
  | "food_without_quantity"
  | "substitutes_count"
  | "substitute_calories_mismatch"
  | "meals_sum_mismatch"
  | "calories_out_of_range"
  | "observations_empty"

const MIN_MEALS = 2
const MAX_MEALS = 6
/** Soma das refeições a até 10% do total (aritmética inteira: |soma − total| · 10 <= total). */
const SUM_TOLERANCE_DIVISOR = 10
/** Substituta a até 10% das calorias da principal (mesma aritmética: |sub − principal| · 10 <= principal). */
const SUBSTITUTE_TOLERANCE_DIVISOR = 10
/** Total entre max(piso, 85% da meta) e 115% da meta, em centésimos para evitar erro de ponto flutuante. */
const LOWER_PERCENT = 85
const UPPER_PERCENT = 115

/** "à vontade" ou "a vontade", sem diferenciar maiúsculas, como expressão separada (não parte de outra palavra). */
const AT_WILL = /(^|[^\p{L}])(à|a)\s+vontade($|[^\p{L}])/iu

/** Linhas de `foods`: trechos separados por quebra de linha, sem as vazias. */
function foodLines(foods: string): string[] {
  return foods
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line !== "")
}

function hasQuantity(line: string): boolean {
  return /\d/.test(line) || AT_WILL.test(line.normalize("NFC"))
}

/** Almoço: o nome, sem acentos e em minúsculas, contém "almoco". É a única refeição sem substituta. */
export function isLunch(name: string): boolean {
  return name.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().includes("almoco")
}

const hasCalories = (calories: number) => Number.isFinite(calories) && calories > 0

export function validatePlan(plan: GeneratedPlan, targets: Pick<Targets, "calories" | "calorieFloor">): PlanIssue[] {
  const issues = new Set<PlanIssue>()

  if (plan.meals.length < MIN_MEALS || plan.meals.length > MAX_MEALS) issues.add("meals_count")

  for (const meal of plan.meals) {
    const complete =
      meal.name.trim() !== "" &&
      meal.time.trim() !== "" &&
      meal.foods.trim() !== "" &&
      hasCalories(meal.calories)
    if (!complete) issues.add("meal_fields")

    if (foodLines(meal.foods).some((line) => !hasQuantity(line))) issues.add("food_without_quantity")

    if (meal.substitutes.length !== (isLunch(meal.name) ? 0 : 1)) issues.add("substitutes_count")

    for (const sub of meal.substitutes) {
      if (sub.foods.trim() === "" || !hasCalories(sub.calories)) issues.add("meal_fields")
      if (foodLines(sub.foods).some((line) => !hasQuantity(line))) issues.add("food_without_quantity")
      // Negado de propósito, como a soma: calorias não finitas (NaN) também contam como divergência.
      if (!(Math.abs(sub.calories - meal.calories) * SUBSTITUTE_TOLERANCE_DIVISOR <= meal.calories)) {
        issues.add("substitute_calories_mismatch")
      }
    }
  }

  const total = plan.calories
  const sum = plan.meals.reduce((acc, meal) => acc + meal.calories, 0)
  // Negado de propósito: soma ou total não finitos (NaN) também contam como divergência.
  if (!(Math.abs(sum - total) * SUM_TOLERANCE_DIVISOR <= total)) issues.add("meals_sum_mismatch")

  const lowerBound = Math.max(targets.calorieFloor * 100, targets.calories * LOWER_PERCENT)
  const upperBound = targets.calories * UPPER_PERCENT
  const scaledTotal = total * 100
  if (!(Number.isFinite(total) && scaledTotal >= lowerBound && scaledTotal <= upperBound)) {
    issues.add("calories_out_of_range")
  }

  if (plan.observations.trim() === "") issues.add("observations_empty")

  return [...issues]
}

/**
 * Formato de `meal_plans.plan_data`: calorias da refeição viram texto inteiro, total vira inteiro. As
 * substitutas seguem o mesmo formato; sem substituta (almoço), a chave `substitutes` não é gravada.
 */
export function toPlanData(plan: GeneratedPlan): PlanData {
  return {
    meals: plan.meals.map((meal) => {
      const base = {
        name: meal.name.trim(),
        time: meal.time.trim(),
        foods: foodLines(meal.foods).join("\n"),
        calories: String(Math.round(meal.calories)),
      }
      if (meal.substitutes.length === 0) return base
      return {
        ...base,
        substitutes: meal.substitutes.map((sub) => ({
          foods: foodLines(sub.foods).join("\n"),
          calories: String(Math.round(sub.calories)),
        })),
      }
    }),
    calories: Math.round(plan.calories),
    observations: plan.observations.trim(),
  }
}
