// Gerador de plano com o SDK da Anthropic (spec §6.3). É o único arquivo que conhece o SDK.
// Saída estruturada via `zodOutputFormat`; raciocínio adaptativo é o padrão do modelo (não enviamos `thinking`),
// e `temperature`/`top_p`/`top_k` não são enviados.

import Anthropic from "@anthropic-ai/sdk"
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod"
import { PlanGenerationError, type GeneratorResult, type MealPlanGenerator } from "./generator"
import { generatedPlanSchema } from "./plan"

export type ParseCall = (params: Record<string, unknown>) => Promise<{
  parsed_output: unknown
  stop_reason: string | null
  model: string
  usage: { input_tokens: number; output_tokens: number }
}>

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

/** `parse` padrão: endpoint beta do SDK, que aceita `fallbacks` junto com a saída estruturada. */
function defaultParse(apiKey: string): ParseCall {
  let client: Anthropic | undefined
  return (params) => {
    client ??= new Anthropic({ apiKey, timeout: TIMEOUT_MS, maxRetries: MAX_RETRIES })
    // Os parâmetros são montados abaixo com o tipo exato; aqui só atravessam a fronteira do `ParseCall`.
    return client.beta.messages.parse({
      ...params,
      betas: [FALLBACK_BETA],
      fallbacks: "default",
    } as unknown as Parameters<typeof client.beta.messages.parse>[0]) as unknown as ReturnType<ParseCall>
  }
}

export function createAnthropicGenerator(cfg: { apiKey: string; model: string; parse?: ParseCall }): MealPlanGenerator {
  const parse = cfg.parse ?? defaultParse(cfg.apiKey)

  return {
    async generate({ system, user }): Promise<GeneratorResult> {
      let response: Awaited<ReturnType<ParseCall>>
      try {
        response = await parse({
          model: cfg.model,
          max_tokens: MAX_TOKENS,
          system,
          messages: [{ role: "user", content: user }],
          output_config: { effort: EFFORT, format: zodOutputFormat(generatedPlanSchema) },
        })
      } catch (error) {
        throw toGenerationError(error)
      }

      if (response.stop_reason === "refusal") throw new PlanGenerationError("anthropic refusal", true)
      if (response.stop_reason === "max_tokens") throw new PlanGenerationError("anthropic max_tokens", true)

      const parsed = generatedPlanSchema.safeParse(response.parsed_output)
      if (!parsed.success) throw new PlanGenerationError("anthropic invalid output", true)

      return {
        plan: parsed.data,
        model: response.model,
        inputTokens: response.usage.input_tokens,
        outputTokens: response.usage.output_tokens,
      }
    },
  }
}
