import { describe, expect, it } from "vitest"
import { stepTransitionEvents } from "@/lib/quiz/step-events"

describe("stepTransitionEvents", () => {
  it("primeira etapa só emite step_view", () => {
    expect(stepTransitionEvents(null, 0, {}, 1000)).toEqual([
      { event: "step_view", step: 0, stepSlug: "faixa_etaria" },
    ])
  })

  it("avançar emite step_answer com a duração e step_view da próxima", () => {
    expect(
      stepTransitionEvents({ step: 0, enteredAtMs: 1000 }, 1, { faixa_etaria: "25-34 anos" }, 4000),
    ).toEqual([
      { event: "step_answer", step: 0, stepSlug: "faixa_etaria", durationMs: 3000, answer: "25-34 anos" },
      { event: "step_view", step: 1, stepSlug: "sexo_biologico" },
    ])
  })

  it("a etapa do IMC grava só a faixa, nunca o número", () => {
    const [answer] = stepTransitionEvents({ step: 21, enteredAtMs: 0 }, 22, { imc: "27.10" }, 500)
    expect(answer).toMatchObject({ event: "step_answer", step: 21, answer: "sobrepeso" })
  })

  it("etapa sem answerKey não leva a chave answer", () => {
    const [answer] = stepTransitionEvents(
      { step: 26, enteredAtMs: 0 },
      27,
      { cpf: "529.982.247-25" },
      500,
    )
    expect(answer.event).toBe("step_answer")
    expect("answer" in answer).toBe(false)
  })

  it("resposta rejeitada pelo filtro não leva a chave answer", () => {
    const [answer] = stepTransitionEvents({ step: 6, enteredAtMs: 0 }, 7, { breakfast_foods: [] }, 500)
    expect(answer.event).toBe("step_answer")
    expect("answer" in answer).toBe(false)
  })

  it("voltar emite step_back da etapa de origem e step_view do destino", () => {
    expect(stepTransitionEvents({ step: 5, enteredAtMs: 0 }, 4, {}, 500)).toEqual([
      { event: "step_back", step: 5, stepSlug: "info_prepare_se" },
      { event: "step_view", step: 4, stepSlug: "peso_comportamento" },
    ])
  })

  it("mesma etapa não emite nada", () => {
    expect(stepTransitionEvents({ step: 3, enteredAtMs: 0 }, 3, {}, 500)).toEqual([])
  })

  it("pular etapas conta como avanço", () => {
    expect(
      stepTransitionEvents({ step: 0, enteredAtMs: 0 }, 27, { faixa_etaria: "25-34 anos" }, 100),
    ).toEqual([
      { event: "step_answer", step: 0, stepSlug: "faixa_etaria", durationMs: 100, answer: "25-34 anos" },
      { event: "step_view", step: 27, stepSlug: "envio" },
    ])
  })
})
