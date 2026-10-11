import { describe, expect, it } from "vitest"
import { generatedPlanSchema, toPlanData, validatePlan, type GeneratedPlan } from "@/lib/meal-plan/plan"

const targets = { calories: 1650, calorieFloor: 1500 }

const valid: GeneratedPlan = {
  meals: [
    { name: "Café da manhã", time: "07:00", foods: "Ovo mexido — 100 g (2 un)\nPão integral — 50 g (2 fatias)", calories: 400 },
    { name: "Almoço", time: "12:30", foods: "Arroz integral — 120 g (4 col. sopa)\nFrango grelhado — 150 g (1 filé)\nSalada à vontade", calories: 600 },
    { name: "Lanche da tarde", time: "16:00", foods: "Iogurte natural — 170 g (1 pote)\nBanana — 100 g (1 un)", calories: 250 },
    { name: "Jantar", time: "19:30", foods: "Omelete — 120 g (2 ovos)\nLegume sem amido a vontade", calories: 400 },
  ],
  calories: 1650,
  observations: "Beba bastante água ao longo do dia.",
}

/** Plano com o total indicado e a soma das refeições igual a ele (só o Almoço absorve a diferença). */
function withTotal(total: number): GeneratedPlan {
  return {
    ...valid,
    calories: total,
    meals: valid.meals.map((m, i) => (i === 1 ? { ...m, calories: total - 1050 } : m)),
  }
}

/** Plano com a soma das refeições diferente do total, que continua 1650 (dentro da faixa). */
function withMealsSum(sum: number): GeneratedPlan {
  return {
    ...valid,
    meals: valid.meals.map((m, i) => (i === 1 ? { ...m, calories: sum - 1050 } : m)),
  }
}

function withMeal(index: number, patch: Partial<GeneratedPlan["meals"][number]>): GeneratedPlan {
  return { ...valid, meals: valid.meals.map((m, i) => (i === index ? { ...m, ...patch } : m)) }
}

describe("validatePlan", () => {
  it("plano válido não tem problemas", () => {
    expect(validatePlan(valid, targets)).toEqual([])
  })

  it.each([1, 7])("%d refeições → meals_count", (count) => {
    const each = Math.floor(1650 / count)
    const meals = Array.from({ length: count }, (_, i) => ({
      name: `Refeição ${i + 1}`,
      time: "08:00",
      foods: "Ovo — 50 g (1 un)",
      calories: i === count - 1 ? 1650 - each * (count - 1) : each,
    }))
    expect(validatePlan({ ...valid, meals }, targets)).toEqual(["meals_count"])
  })

  it("2 e 6 refeições são aceitas", () => {
    const mealsOf = (kcals: number[]) =>
      kcals.map((calories, i) => ({ name: `Refeição ${i + 1}`, time: "08:00", foods: "Ovo — 50 g (1 un)", calories }))
    expect(validatePlan({ ...valid, meals: mealsOf([800, 850]) }, targets)).toEqual([])
    expect(validatePlan({ ...valid, meals: mealsOf([300, 300, 300, 300, 225, 225]) }, targets)).toEqual([])
  })

  it.each([
    ["sem nome", { name: "" }],
    ["sem horário", { time: "   " }],
    ["sem alimentos", { foods: "" }],
  ])("refeição %s → meal_fields", (_label, patch) => {
    expect(validatePlan(withMeal(0, patch), targets)).toEqual(["meal_fields"])
  })

  it.each([0, -10])("refeição com calorias %d → meal_fields", (kcal) => {
    // a diferença vai para o almoço, para a soma continuar em 1650
    const plan: GeneratedPlan = {
      ...valid,
      meals: valid.meals.map((m, i) => (i === 0 ? { ...m, calories: kcal } : i === 1 ? { ...m, calories: 1000 - kcal } : m)),
    }
    expect(validatePlan(plan, targets)).toEqual(["meal_fields"])
  })

  it("linha de alimento sem quantidade → food_without_quantity", () => {
    const plan = withMeal(0, { foods: "Ovos mexidos\nPão integral — 50 g (2 fatias)" })
    expect(validatePlan(plan, targets)).toEqual(["food_without_quantity"])
  })

  it("linhas vazias em foods são ignoradas", () => {
    const plan = withMeal(0, { foods: "Ovo mexido — 100 g (2 un)\n\n   \nPão integral — 50 g (2 fatias)\n" })
    expect(validatePlan(plan, targets)).toEqual([])
  })

  it.each(["Salada à vontade", "Legume sem amido a vontade", "SALADA À VONTADE"])("%s é aceita sem dígito", (line) => {
    const plan = withMeal(0, { foods: `Ovo mexido — 100 g (2 un)\n${line}` })
    expect(validatePlan(plan, targets)).toEqual([])
  })

  it("soma das refeições a mais de 10% do total → meals_sum_mismatch", () => {
    expect(validatePlan(withMealsSum(1400), targets)).toEqual(["meals_sum_mismatch"])
    expect(validatePlan(withMealsSum(1484), targets)).toEqual(["meals_sum_mismatch"])
    expect(validatePlan(withMealsSum(1900), targets)).toEqual(["meals_sum_mismatch"])
  })

  it("soma a exatamente 10% do total passa", () => {
    expect(validatePlan(withMealsSum(1485), targets)).toEqual([])
    expect(validatePlan(withMealsSum(1815), targets)).toEqual([])
  })

  it.each([
    [1400, ["calories_out_of_range"]],
    [1500, []],
    [1897, []],
    [1900, ["calories_out_of_range"]],
  ])("meta 1650 e piso 1500: total %d → %j", (total, expected) => {
    expect(validatePlan(withTotal(total), targets)).toEqual(expected)
  })

  it("meta igual ao piso (1200): 1199 falha, 1380 passa, 1381 falha", () => {
    const floorTargets = { calories: 1200, calorieFloor: 1200 }
    expect(validatePlan(withTotal(1199), floorTargets)).toEqual(["calories_out_of_range"])
    expect(validatePlan(withTotal(1200), floorTargets)).toEqual([])
    expect(validatePlan(withTotal(1380), floorTargets)).toEqual([])
    expect(validatePlan(withTotal(1381), floorTargets)).toEqual(["calories_out_of_range"])
  })

  it("meta acima do piso: o limite inferior é 85% da meta quando maior que o piso", () => {
    // meta 2000, piso 1200: faixa [1700, 2300]
    const t = { calories: 2000, calorieFloor: 1200 }
    expect(validatePlan(withTotal(1699), t)).toEqual(["calories_out_of_range"])
    expect(validatePlan(withTotal(1700), t)).toEqual([])
    expect(validatePlan(withTotal(2300), t)).toEqual([])
    expect(validatePlan(withTotal(2301), t)).toEqual(["calories_out_of_range"])
  })

  it.each(["", "   \n "])("observations vazio ou só espaços (%j) → observations_empty", (observations) => {
    expect(validatePlan({ ...valid, observations }, targets)).toEqual(["observations_empty"])
  })

  it("reporta vários problemas de uma vez", () => {
    const plan = { ...withMeal(0, { foods: "Ovos mexidos" }), observations: "" }
    expect(validatePlan(plan, targets)).toEqual(["food_without_quantity", "observations_empty"])
  })
})

describe("toPlanData", () => {
  it("calorias da refeição viram texto inteiro e o total vira inteiro", () => {
    expect(
      toPlanData({
        ...valid,
        meals: [{ name: " Café ", time: "07:00", foods: "Ovo — 50 g (1 un)\n", calories: 349.6 }],
        calories: 349.6,
      }),
    ).toEqual({
      meals: [{ name: "Café", time: "07:00", foods: "Ovo — 50 g (1 un)", calories: "350" }],
      calories: 350,
      observations: valid.observations.trim(),
    })
  })

  it("remove linhas vazias e espaços das linhas de alimentos", () => {
    const data = toPlanData(withMeal(0, { foods: "  Ovo — 50 g (1 un)  \n\n Pão — 50 g (2 fatias)\n" }))
    expect(data.meals[0].foods).toBe("Ovo — 50 g (1 un)\nPão — 50 g (2 fatias)")
  })
})

describe("generatedPlanSchema", () => {
  it("aceita o plano válido e rejeita campo ausente ou de tipo errado", () => {
    expect(generatedPlanSchema.safeParse(valid).success).toBe(true)
    expect(generatedPlanSchema.safeParse({ ...valid, observations: undefined }).success).toBe(false)
    expect(
      generatedPlanSchema.safeParse({ ...valid, meals: [{ ...valid.meals[0], calories: "400" }] }).success,
    ).toBe(false)
  })
})
