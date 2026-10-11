import Anthropic from "@anthropic-ai/sdk"
import { describe, expect, it } from "vitest"
import { createAnthropicGenerator, type ParseCall } from "@/lib/meal-plan/anthropic-generator"
import { PlanGenerationError } from "@/lib/meal-plan/generator"
import type { GeneratedPlan } from "@/lib/meal-plan/plan"

const plan: GeneratedPlan = {
  meals: [
    { name: "Café da manhã", time: "07:00", foods: "Ovo mexido — 100 g", calories: 400 },
    { name: "Almoço", time: "12:30", foods: "Arroz — 120 g\nFrango — 150 g", calories: 600 },
  ],
  calories: 1000,
  observations: "Beba água.",
}

type ParseResult = Awaited<ReturnType<ParseCall>>

function ok(patch: Partial<ParseResult> = {}): ParseResult {
  return {
    parsed_output: plan,
    stop_reason: "end_turn",
    model: "claude-opus-5-5",
    usage: { input_tokens: 2100, output_tokens: 5200 },
    ...patch,
  }
}

function generatorWith(parse: ParseCall) {
  return createAnthropicGenerator({ apiKey: "sk-ant-segredo", model: "claude-opus-5-5", parse })
}

const input = { system: "SYS", user: "USER" }

async function failureOf(parse: ParseCall): Promise<PlanGenerationError> {
  try {
    await generatorWith(parse).generate(input)
  } catch (e) {
    expect(e).toBeInstanceOf(PlanGenerationError)
    return e as PlanGenerationError
  }
  throw new Error("deveria ter falhado")
}

function httpError(status: number) {
  return Anthropic.APIError.generate(status, undefined, "x", new Headers())
}

describe("createAnthropicGenerator", () => {
  it("devolve o plano, o modelo que respondeu e os tokens", async () => {
    const result = await generatorWith(async () => ok({ model: "claude-outro" })).generate(input)
    expect(result).toEqual({ plan, model: "claude-outro", inputTokens: 2100, outputTokens: 5200 })
  })

  it("envia os parâmetros fixos", async () => {
    let params: Record<string, unknown> = {}
    await generatorWith(async (p) => {
      params = p
      return ok()
    }).generate(input)
    expect(params).toMatchObject({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      system: "SYS",
      messages: [{ role: "user", content: "USER" }],
      output_config: { effort: "high" },
    })
    expect((params.output_config as { format?: unknown }).format).toBeDefined()
    expect(params).not.toHaveProperty("thinking")
    expect(params).not.toHaveProperty("temperature")
    expect(params).not.toHaveProperty("top_p")
    expect(params).not.toHaveProperty("top_k")
  })

  it("o formato de saída é um JSON schema do plano", async () => {
    let params: Record<string, unknown> = {}
    await generatorWith(async (p) => {
      params = p
      return ok()
    }).generate(input)
    const format = (params.output_config as { format: { type: string; schema: { properties: object } } }).format
    expect(format.type).toBe("json_schema")
    expect(Object.keys(format.schema.properties).sort()).toEqual(["calories", "meals", "observations"])
  })

  it.each(["refusal", "max_tokens"])("stop_reason %s → erro temporário", async (stop) => {
    const error = await failureOf(async () => ok({ stop_reason: stop, parsed_output: null }))
    expect(error.transient).toBe(true)
    expect(error.message).toBe(`anthropic ${stop}`)
  })

  it("parsed_output nulo → erro temporário", async () => {
    const error = await failureOf(async () => ok({ parsed_output: null }))
    expect(error.transient).toBe(true)
    expect(error.message).toBe("anthropic invalid output")
  })

  it("parsed_output fora do schema → erro temporário", async () => {
    const error = await failureOf(async () => ok({ parsed_output: { ...plan, calories: "1000" } }))
    expect(error.transient).toBe(true)
    expect(error.message).toBe("anthropic invalid output")
  })

  it.each([400, 401, 403, 404])("HTTP %d → erro definitivo", async (status) => {
    const error = await failureOf(async () => {
      throw httpError(status)
    })
    expect(error.transient).toBe(false)
    expect(error.message).toBe(`anthropic HTTP ${status}`)
  })

  it.each([408, 409, 429, 500, 529])("HTTP %d → erro temporário", async (status) => {
    const error = await failureOf(async () => {
      throw httpError(status)
    })
    expect(error.transient).toBe(true)
    expect(error.message).toBe(`anthropic HTTP ${status}`)
  })

  it("erro de conexão ou tempo limite → erro temporário", async () => {
    for (const thrown of [
      new Anthropic.APIConnectionError({ message: "x" }),
      new Anthropic.APIConnectionTimeoutError(),
    ]) {
      const error = await failureOf(async () => {
        throw thrown
      })
      expect(error.transient).toBe(true)
      expect(error.message).toBe("anthropic connection error")
    }
  })

  it("erro desconhecido → erro temporário", async () => {
    const error = await failureOf(async () => {
      throw new TypeError("quebrou")
    })
    expect(error.transient).toBe(true)
    expect(error.message).toBe("anthropic error")
  })

  it("a mensagem do erro não traz o corpo da resposta nem o texto enviado", async () => {
    const leaky = Anthropic.APIError.generate(
      401,
      { type: "error", error: { type: "authentication_error", message: "invalid x-api-key sk-ant-segredo" } },
      "invalid x-api-key sk-ant-segredo USER SYS",
      new Headers(),
    )
    const error = await failureOf(async () => {
      throw leaky
    })
    expect(error.message).toBe("anthropic HTTP 401")
    expect(error.message).not.toMatch(/sk-ant|USER|SYS|x-api-key/)
    expect(error.name).toBe("PlanGenerationError")
    expect(error.cause).toBeUndefined()
  })
})
