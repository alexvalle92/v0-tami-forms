// Contrato do gerador de plano (spec §6.3): a regra de negócio conhece só esta interface,
// o SDK da Anthropic fica isolado em `anthropic-generator.ts`.

import type { GeneratedPlan } from "./plan"

/**
 * Erro de domínio da geração. `transient` diz se vale tentar de novo (spec §6.3).
 * A mensagem é sempre um texto curto e fixo: nunca traz chave, prompt, respostas do quiz nem corpo da resposta.
 */
export class PlanGenerationError extends Error {
  constructor(
    message: string,
    readonly transient: boolean,
  ) {
    super(message)
    this.name = "PlanGenerationError"
  }
}

export type GeneratorResult = {
  plan: GeneratedPlan
  /** Modelo que de fato respondeu: o do `fallback_message` em `usage.iterations` quando a API refez o pedido por fallback; senão, o modelo da resposta. */
  model: string
  inputTokens: number
  outputTokens: number
}

export interface MealPlanGenerator {
  generate(i: { system: string; user: string }): Promise<GeneratorResult>
}
