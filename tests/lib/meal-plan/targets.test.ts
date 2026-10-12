import { describe, expect, it } from "vitest"
import { ACTIVITY_FACTOR, CALORIE_FLOOR, DAILY_DEFICIT_KCAL, computeTargets } from "@/lib/meal-plan/targets"

describe("computeTargets", () => {
  it("mulher, 25-34, 165 cm, 75 kg: meta cai no piso", () => {
    expect(computeTargets({ faixaEtaria: "25-34 anos", sexo: "Feminino", alturaCm: 165, pesoKg: 75 })).toEqual({
      age: 30,
      tmb: 1537,
      get: 1845,
      calories: 1200,
      calorieFloor: 1200,
      proteinMinG: 113,
      proteinMaxG: 150,
    })
  })

  it("homem, 35-44, 180 cm, 95 kg: meta arredondada para múltiplo de 50", () => {
    expect(computeTargets({ faixaEtaria: "35-44 anos", sexo: "Masculino", alturaCm: 180, pesoKg: 95 })).toEqual({
      age: 40,
      tmb: 2003,
      get: 2404,
      calories: 1650,
      calorieFloor: 1500,
      proteinMinG: 143,
      proteinMaxG: 190,
    })
  })

  it.each([
    ["18-24 anos", 21],
    ["25-34 anos", 30],
    ["35-44 anos", 40],
    ["45-59 anos", 52],
  ] as const)("%s → idade %d", (faixaEtaria, age) => {
    expect(computeTargets({ faixaEtaria, sexo: "Feminino", alturaCm: 165, pesoKg: 75 }).age).toBe(age)
  })

  it("constantes nomeadas", () => {
    expect(CALORIE_FLOOR).toEqual({ Feminino: 1200, Masculino: 1500 })
    expect(DAILY_DEFICIT_KCAL).toBe(770)
    expect(ACTIVITY_FACTOR).toBe(1.2)
  })
})
