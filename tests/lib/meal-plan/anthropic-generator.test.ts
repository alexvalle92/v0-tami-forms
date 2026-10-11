import Anthropic from "@anthropic-ai/sdk"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { createAnthropicGenerator, type CreateCall } from "@/lib/meal-plan/anthropic-generator"
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

type CreateResult = Awaited<ReturnType<CreateCall>>
type Params = Parameters<CreateCall>[0]

const planJson = JSON.stringify(plan)
const text = (value: string) => ({ type: "text", text: value })
const thinkingBlock = { type: "thinking", thinking: "..." }
const fallbackBlock = {
  type: "fallback",
  from: { model: "claude-opus-5-5" },
  to: { model: "claude-fallback" },
  trigger: { type: "refusal" },
}

function ok(patch: Partial<CreateResult> = {}): CreateResult {
  return {
    content: [text(planJson)],
    stop_reason: "end_turn",
    model: "claude-opus-5-5",
    usage: { input_tokens: 2100, output_tokens: 5200, iterations: null },
    ...patch,
  }
}

function generatorWith(create: CreateCall) {
  return createAnthropicGenerator({ apiKey: "sk-ant-segredo", model: "claude-opus-5-5", create })
}

const input = { system: "SYS", user: "USER" }

async function failureOf(create: CreateCall): Promise<PlanGenerationError> {
  try {
    await generatorWith(create).generate(input)
  } catch (e) {
    expect(e).toBeInstanceOf(PlanGenerationError)
    return e as PlanGenerationError
  }
  throw new Error("deveria ter falhado")
}

function httpError(status: number) {
  return Anthropic.APIError.generate(status, undefined, "x", new Headers())
}

// Nenhum teste deste arquivo chama a API: o `fetch` global é trocado por um que falha.
beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("rede bloqueada nos testes")
    }),
  )
})
afterEach(() => {
  vi.unstubAllGlobals()
})

describe("createAnthropicGenerator", () => {
  it("devolve o plano, o modelo que respondeu e os tokens", async () => {
    const result = await generatorWith(async () => ok({ model: "claude-outro" })).generate(input)
    expect(result).toEqual({ plan, model: "claude-outro", inputTokens: 2100, outputTokens: 5200 })
  })

  it("envia os parâmetros fixos", async () => {
    let params: Params | undefined
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
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
    })
    expect(params?.output_config?.format).toBeDefined()
    expect(params).not.toHaveProperty("stream")
    expect(params).not.toHaveProperty("thinking")
    expect(params).not.toHaveProperty("temperature")
    expect(params).not.toHaveProperty("top_p")
    expect(params).not.toHaveProperty("top_k")
  })

  it("o formato de saída é um JSON schema do plano", async () => {
    let params: Params | undefined
    await generatorWith(async (p) => {
      params = p
      return ok()
    }).generate(input)
    const format = params?.output_config?.format as { type: string; schema: { properties: object } }
    expect(format.type).toBe("json_schema")
    expect(Object.keys(format.schema.properties).sort()).toEqual(["calories", "meals", "observations"])
  })

  describe("leitura da resposta", () => {
    it("max_tokens com JSON truncado → erro temporário próprio, não o genérico", async () => {
      const error = await failureOf(async () =>
        ok({ stop_reason: "max_tokens", content: [text(planJson.slice(0, 40))] }),
      )
      expect(error.transient).toBe(true)
      expect(error.message).toBe("anthropic max_tokens")
    })

    it("refusal com JSON parcial → erro temporário próprio", async () => {
      const error = await failureOf(async () => ok({ stop_reason: "refusal", content: [text('{"meals": [{"na')] }))
      expect(error.transient).toBe(true)
      expect(error.message).toBe("anthropic refusal")
    })

    it.each(["refusal", "max_tokens"])("stop_reason %s sem conteúdo → erro temporário próprio", async (stop) => {
      const error = await failureOf(async () => ok({ stop_reason: stop, content: [] }))
      expect(error.transient).toBe(true)
      expect(error.message).toBe(`anthropic ${stop}`)
    })

    it("lê o texto depois do bloco fallback e ignora o truncado que veio antes", async () => {
      const result = await generatorWith(async () =>
        ok({ content: [text(planJson.slice(0, 30)), fallbackBlock, text(planJson)] }),
      ).generate(input)
      expect(result.plan).toEqual(plan)
    })

    it("com mais de um fallback usa só o texto depois do último", async () => {
      const result = await generatorWith(async () =>
        ok({
          content: [
            text("lixo"),
            fallbackBlock,
            text(JSON.stringify({ ...plan, observations: "do segundo" })),
            fallbackBlock,
            text(planJson),
          ],
        }),
      ).generate(input)
      expect(result.plan).toEqual(plan)
    })

    it("junta os blocos de texto depois do fallback e ignora blocos que não são texto", async () => {
      const half = Math.floor(planJson.length / 2)
      const result = await generatorWith(async () =>
        ok({
          content: [
            thinkingBlock,
            text("{ nao e json"),
            fallbackBlock,
            thinkingBlock,
            text(planJson.slice(0, half)),
            text(planJson.slice(half)),
          ],
        }),
      ).generate(input)
      expect(result.plan).toEqual(plan)
    })

    it("sem fallback, junta todos os blocos de texto", async () => {
      const half = Math.floor(planJson.length / 2)
      const result = await generatorWith(async () =>
        ok({ content: [text(planJson.slice(0, half)), text(planJson.slice(half))] }),
      ).generate(input)
      expect(result.plan).toEqual(plan)
    })

    it("fallback sem texto depois dele → saída inválida", async () => {
      const error = await failureOf(async () => ok({ content: [text(planJson), fallbackBlock] }))
      expect(error.transient).toBe(true)
      expect(error.message).toBe("anthropic invalid output")
    })

    it.each([
      ["texto que não é JSON", [text("Desculpe, não posso ajudar.")]],
      ["JSON truncado com end_turn", [text(planJson.slice(0, 50))]],
      ["JSON fora do schema", [text(JSON.stringify({ ...plan, calories: "1000" }))]],
      ["JSON nulo", [text("null")]],
      ["sem blocos de texto", [{ type: "thinking", thinking: "..." }]],
      ["conteúdo vazio", []],
    ])("%s → saída inválida, erro temporário", async (_nome, content) => {
      const error = await failureOf(async () => ok({ content }))
      expect(error.transient).toBe(true)
      expect(error.message).toBe("anthropic invalid output")
    })

    it("a mensagem de saída inválida não traz o texto recebido", async () => {
      const error = await failureOf(async () => ok({ content: [text("segredo do paciente {")] }))
      expect(error.message).toBe("anthropic invalid output")
      expect(error.cause).toBeUndefined()
    })
  })

  describe("modelo e tokens", () => {
    it("o modelo é o do último fallback_message em usage.iterations", async () => {
      const result = await generatorWith(async () =>
        ok({
          model: "claude-opus-5-5",
          usage: {
            input_tokens: 2100,
            output_tokens: 5200,
            iterations: [
              { type: "message", input_tokens: 10, output_tokens: 1 },
              { type: "fallback_message", model: "claude-outro-a", input_tokens: 1, output_tokens: 1 },
              { type: "fallback_message", model: "claude-outro-b", input_tokens: 2100, output_tokens: 5200 },
              { type: "message", input_tokens: 1, output_tokens: 1 },
            ],
          },
        }),
      ).generate(input)
      expect(result.model).toBe("claude-outro-b")
      // Tokens continuam sendo os do nível superior de `usage`.
      expect(result.inputTokens).toBe(2100)
      expect(result.outputTokens).toBe(5200)
    })

    it.each([
      ["null", null],
      ["ausente", undefined],
      ["vazio", []],
      ["só message", [{ type: "message", input_tokens: 1, output_tokens: 1 }]],
    ])("sem fallback_message em usage.iterations (%s) o modelo é o de response.model", async (_nome, iterations) => {
      const result = await generatorWith(async () =>
        ok({ model: "claude-do-response", usage: { input_tokens: 1, output_tokens: 2, iterations } }),
      ).generate(input)
      expect(result.model).toBe("claude-do-response")
      expect(result.inputTokens).toBe(1)
      expect(result.outputTokens).toBe(2)
    })

    it("fallback_message sem modelo cai no de response.model", async () => {
      const result = await generatorWith(async () =>
        ok({
          model: "claude-do-response",
          usage: { input_tokens: 1, output_tokens: 2, iterations: [{ type: "fallback_message", model: "" }] },
        }),
      ).generate(input)
      expect(result.model).toBe("claude-do-response")
    })
  })

  describe("classificação de erros", () => {
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

  describe("cliente padrão (fetch simulado, sem rede)", () => {
    function stubFetch(body: unknown, status = 200) {
      const fetchMock = vi.fn(
        async (_url: string | URL | Request, _init?: RequestInit) =>
          new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }),
      )
      vi.stubGlobal("fetch", fetchMock)
      return fetchMock
    }

    const message = {
      id: "msg_1",
      type: "message",
      role: "assistant",
      model: "claude-opus-5-5",
      content: [{ type: "text", text: planJson }],
      stop_reason: "end_turn",
      stop_sequence: null,
      usage: { input_tokens: 2100, output_tokens: 5200 },
    }

    it("manda o pedido do endpoint beta com fallback, esforço e limite de tokens", async () => {
      const fetchMock = stubFetch(message)
      const result = await createAnthropicGenerator({ apiKey: "sk-ant-segredo", model: "claude-opus-5-5" }).generate(
        input,
      )

      expect(result).toEqual({ plan, model: "claude-opus-5-5", inputTokens: 2100, outputTokens: 5200 })
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const [url, init] = fetchMock.mock.calls[0]
      const parsedUrl = new URL(String(url))
      expect(parsedUrl.origin).toBe("https://api.anthropic.com")
      expect(parsedUrl.pathname).toBe("/v1/messages")
      expect(new Headers(init?.headers).get("anthropic-beta")).toContain("server-side-fallback-2026-07-01")
      const body = JSON.parse(String(init?.body))
      expect(body).toMatchObject({
        model: "claude-opus-5-5",
        max_tokens: 16000,
        system: "SYS",
        messages: [{ role: "user", content: "USER" }],
        fallbacks: "default",
        output_config: { effort: "high", format: { type: "json_schema" } },
      })
      expect(body).not.toHaveProperty("betas")
      expect(body).not.toHaveProperty("stream")
      expect(body).not.toHaveProperty("thinking")
    })

    it("resposta real com bloco fallback: lê o plano do modelo que respondeu", async () => {
      stubFetch({
        ...message,
        model: "claude-opus-5-5",
        content: [
          { type: "text", text: planJson.slice(0, 25) },
          { type: "fallback", from: { model: "claude-opus-5-5" }, to: { model: "claude-fallback" }, trigger: {} },
          { type: "text", text: planJson },
        ],
        usage: {
          input_tokens: 2100,
          output_tokens: 5200,
          iterations: [{ type: "fallback_message", model: "claude-fallback", input_tokens: 2100, output_tokens: 5200 }],
        },
      })
      const result = await createAnthropicGenerator({ apiKey: "sk-ant-segredo", model: "claude-opus-5-5" }).generate(
        input,
      )
      expect(result.plan).toEqual(plan)
      expect(result.model).toBe("claude-fallback")
    })

    it("resposta truncada por max_tokens chega como erro temporário próprio", async () => {
      stubFetch({
        ...message,
        stop_reason: "max_tokens",
        content: [{ type: "text", text: planJson.slice(0, 60) }],
      })
      const error = await createAnthropicGenerator({ apiKey: "sk-ant-segredo", model: "claude-opus-5-5" })
        .generate(input)
        .catch((e: unknown) => e)
      expect(error).toBeInstanceOf(PlanGenerationError)
      expect((error as PlanGenerationError).transient).toBe(true)
      expect((error as PlanGenerationError).message).toBe("anthropic max_tokens")
    })

    it("HTTP 401 do servidor vira erro definitivo sem corpo", async () => {
      stubFetch({ type: "error", error: { type: "authentication_error", message: "invalid x-api-key" } }, 401)
      try {
        await createAnthropicGenerator({ apiKey: "sk-ant-segredo", model: "claude-opus-5-5" }).generate(input)
        throw new Error("deveria ter falhado")
      } catch (e) {
        expect(e).toBeInstanceOf(PlanGenerationError)
        expect((e as PlanGenerationError).transient).toBe(false)
        expect((e as PlanGenerationError).message).toBe("anthropic HTTP 401")
      }
    })
  })
})
