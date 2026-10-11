// Gerador de plano com o SDK da Anthropic (spec §6.3). É o único arquivo que conhece o SDK.
// O formato de saída é montado com `zodOutputFormat`, mas a resposta é lida e validada aqui mesmo: o `parse`
// do SDK lança antes de podermos olhar `stop_reason` e só enxerga o primeiro bloco de texto, o que perderia o
// plano do modelo de fallback. Raciocínio adaptativo é o padrão do modelo (não enviamos `thinking`), e
// `temperature`/`top_p`/`top_k` não são enviados.

import Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { PlanGenerationError, type GeneratorResult, type MealPlanGenerator } from "./generator"
import { generatedPlanSchema } from "./plan"

/** Parâmetros do pedido: os do `client.beta.messages.create` sem streaming. */
type CreateParams = Anthropic.Beta.Messages.MessageCreateParamsNonStreaming

/** O que o adaptador lê da resposta. O `BetaMessage` do SDK é atribuível a este formato. */
export type PlanResponse = {
  content: ReadonlyArray<{ type: string; text?: string }>
  stop_reason: string | null
  /** Modelo pedido; o que de fato respondeu vem de `usage.iterations` quando houve fallback. */
  model: string
  usage: {
    input_tokens: number
    output_tokens: number
    iterations?: ReadonlyArray<{ type: string; model?: string | null; input_tokens?: number; output_tokens?: number }> | null
  }
}

/** Chamada à API (injetável nos testes): pedido de mensagem sem streaming. */
export type CreateCall = (params: CreateParams) => Promise<PlanResponse>

const MAX_TOKENS = 16000
const EFFORT = "high"
const TIMEOUT_MS = 120_000
const MAX_RETRIES = 1
/** Se o modelo recusar por filtro de segurança, a própria API refaz o pedido em outro modelo. */
const FALLBACK_BETA = "server-side-fallback-2026-07-01"

/** Status que valem nova tentativa: 408, 409, 429 e 5xx. Qualquer outro status HTTP é definitivo. */
function isTransientStatus(status: number): boolean {
  return status === 408 || status === 409 || status === 429 || status >= 500
}

/** Converte qualquer exceção em erro de domínio, com mensagem fixa (sem corpo da resposta, prompt ou chave). */
function toGenerationError(error: unknown): PlanGenerationError {
  if (error instanceof PlanGenerationError) return error
  // Conexão e tempo limite (APIConnectionTimeoutError é subclasse) vêm antes: não têm status.
  if (error instanceof Anthropic.APIConnectionError) return new PlanGenerationError("anthropic connection error", true)
  if (error instanceof Anthropic.APIError && typeof error.status === "number") {
    return new PlanGenerationError(`anthropic HTTP ${error.status}`, isTransientStatus(error.status))
  }
  return new PlanGenerationError("anthropic error", true)
}

/** Chamada padrão: endpoint beta do SDK, que aceita `fallbacks` junto com a saída estruturada. */
function defaultCreate(apiKey: string): CreateCall {
  let client: Anthropic | undefined
  return (params) => {
    client ??= new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: MAX_RETRIES })
    return client.beta.messages.create(params)
  }
}

/**
 * Texto do plano: os blocos `text` depois do último bloco `fallback` (o que veio antes é do modelo que recusou,
 * possivelmente truncado), ou todos os blocos `text` quando não houve fallback.
 */
function planText(content: PlanResponse["content"]): string {
  let start = 0
  content.forEach((block, i) => {
    if (block.type === "fallback") start = i + 1
  })
  return content
    .slice(start)
    .map((block) => (block.type === "text" && typeof block.text === "string" ? block.text : ""))
    .join("")
}

/**
 * Modelo que de fato respondeu: o do último `fallback_message` em `usage.iterations` (é ele, não o bloco
 * `fallback`, o sinal de que um modelo de fallback serviu a resposta); sem fallback, o `model` da resposta.
 */
function servingModel(response: PlanResponse): string {
  const iterations = response.usage.iterations ?? []
  for (let i = iterations.length - 1; i >= 0; i--) {
    const entry = iterations[i]
    if (entry.type === "fallback_message" && entry.model) return entry.model
  }
  return response.model
}

export function createAnthropicGenerator(cfg: { apiKey: string; model: string; create?: CreateCall }): MealPlanGenerator {
  const create = cfg.create ?? defaultCreate(cfg.apiKey)

  return {
    async generate({ system, user }): Promise<GeneratorResult> {
      let response: PlanResponse
      try {
        response = await create({
          model: cfg.model,
          max_tokens: MAX_TOKENS,
          system,
          messages: [{ role: "user", content: user }],
          output_config: { effort: EFFORT, format: zodOutputFormat(generatedPlanSchema) },
          betas: [FALLBACK_BETA],
          fallbacks: "default",
        })
      } catch (error) {
        throw toGenerationError(error)
      }

      if (response.stop_reason === "refusal") throw new PlanGenerationError("anthropic refusal", true)
      if (response.stop_reason === "max_tokens") throw new PlanGenerationError("anthropic max_tokens", true)

      let raw: unknown
      try {
        raw = JSON.parse(planText(response.content))
      } catch {
        throw new PlanGenerationError("anthropic invalid output", true)
      }
      const parsed = generatedPlanSchema.safeParse(raw)
      if (!parsed.success) throw new PlanGenerationError("anthropic invalid output", true)

      // Tokens: os campos do nível superior de `usage`, como o SDK documenta ("input/output tokens which were used").
      return {
        plan: parsed.data,
        model: servingModel(response),
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      }
    },
  }
}
