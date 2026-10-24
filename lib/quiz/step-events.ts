// Eventos de transição entre etapas. Função pura: quem chama decide quando enviar.
import { answerKeyForSlug, bmiBand, sanitizeAnswer, stepSlug } from "./steps"

export type StepTrackEvent =
  | { event: "step_view" | "step_back"; step: number; stepSlug: string }
  | { event: "step_answer"; step: number; stepSlug: string; durationMs: number; answer?: string | string[] }

function answerFor(slug: string, answers: Record<string, unknown>): string | string[] | undefined {
  const key = answerKeyForSlug(slug)
  if (!key) return undefined
  // A etapa do IMC grava só a faixa; o número nunca sai do navegador.
  if (key === "imc_faixa") return bmiBand(answers.imc)
  return sanitizeAnswer(answers[key])
}

export function stepTransitionEvents(
  prev: { step: number; enteredAtMs: number } | null,
  next: number,
  answers: Record<string, unknown>,
  nowMs: number,
): StepTrackEvent[] {
  const nextSlug = stepSlug(next)
  if (nextSlug === undefined) return []
  if (prev && prev.step === next) return []

  const events: StepTrackEvent[] = []
  if (prev) {
    const prevSlug = stepSlug(prev.step)
    if (prevSlug !== undefined) {
      if (next < prev.step) {
        events.push({ event: "step_back", step: prev.step, stepSlug: prevSlug })
      } else {
        const answer = answerFor(prevSlug, answers)
        events.push({
          event: "step_answer",
          step: prev.step,
          stepSlug: prevSlug,
          durationMs: Math.max(0, nowMs - prev.enteredAtMs),
          ...(answer !== undefined ? { answer } : {}),
        })
      }
    }
  }
  events.push({ event: "step_view", step: next, stepSlug: nextSlug })
  return events
}
