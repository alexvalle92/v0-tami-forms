// Contrato dos eventos do funil enviados pelo navegador (POST /api/events).
// Os campos desconhecidos são removidos e `answer` só sobrevive se a etapa tiver `answerKey`
// e o valor passar no filtro; as issues trazem só caminho e mensagem, nunca os valores recebidos.

import { z } from "zod"
import { LAST_STEP, answerKeyForSlug, sanitizeAnswer } from "@/lib/quiz/steps"
import type { ValidationReason } from "@/lib/quiz/step-validation"

export const EVENTS_MAX_BATCH = 25

const MAX_TEXT = 100
const MAX_MS = 86_400_000
const MAX_VIEWPORT = 10_000

export type SubmitFailure = "http_4xx" | "http_5xx" | "timeout" | "rede" | "resposta_invalida"
export type SubmitOutcome = "ok" | SubmitFailure | "storage"

export type Utm = { source?: string; medium?: string; campaign?: string; content?: string; term?: string }

type WithStep = { ts: string; step: number; stepSlug: string }

export type FunnelEvent =
  | { event: "session_start"; ts: string; utm: Utm; referrerHost?: string; viewport?: { w: number; h: number } }
  | ({ event: "step_view" } & WithStep)
  | ({ event: "step_answer"; durationMs: number; answer?: string | string[] } & WithStep)
  | ({ event: "validation_error"; reason: ValidationReason } & WithStep)
  | ({ event: "step_back" } & WithStep)
  | ({ event: "submit_result"; outcome: SubmitOutcome; durationMs: number; attempt: number } & WithStep)
  | ({ event: "checkout_click"; hasPaymentLink: boolean } & WithStep)
  | ({ event: "page_hide"; msOnStep: number } & WithStep)

export type FunnelEventInput = FunnelEvent extends infer E ? (E extends unknown ? Omit<E, "ts"> : never) : never

export type EventsBatch = { sessionId: string; events: FunnelEvent[] }

const text = z
  .string()
  .transform((s) => s.slice(0, MAX_TEXT))
  .optional()

const ms = z.number().int().min(0).max(MAX_MS)

const base = {
  ts: z.string().min(1).max(40),
  step: z.number().int().min(0).max(LAST_STEP),
  stepSlug: z.string().min(1).max(40),
}

const REASONS = ["vazio", "email_invalido", "telefone_invalido", "cpf_invalido"] as const satisfies readonly ValidationReason[]
const OUTCOMES = [
  "ok",
  "http_4xx",
  "http_5xx",
  "timeout",
  "rede",
  "resposta_invalida",
  "storage",
] as const satisfies readonly SubmitOutcome[]

const eventSchema = z.discriminatedUnion("event", [
  z.object({
    event: z.literal("session_start"),
    ts: base.ts,
    utm: z.object({ source: text, medium: text, campaign: text, content: text, term: text }),
    referrerHost: text,
    viewport: z
      .object({
        w: z.number().int().min(1).max(MAX_VIEWPORT),
        h: z.number().int().min(1).max(MAX_VIEWPORT),
      })
      .optional(),
  }),
  z.object({ event: z.literal("step_view"), ...base }),
  z.object({
    event: z.literal("step_answer"),
    ...base,
    durationMs: ms,
    // Validado de verdade no transform do lote, que conhece o stepSlug.
    answer: z.unknown().optional(),
  }),
  z.object({ event: z.literal("validation_error"), ...base, reason: z.enum(REASONS) }),
  z.object({ event: z.literal("step_back"), ...base }),
  z.object({
    event: z.literal("submit_result"),
    ...base,
    outcome: z.enum(OUTCOMES),
    durationMs: ms,
    attempt: z.number().int().min(1).max(1000),
  }),
  z.object({ event: z.literal("checkout_click"), ...base, hasPaymentLink: z.boolean() }),
  z.object({ event: z.literal("page_hide"), ...base, msOnStep: ms }),
])

type ParsedEvent = z.infer<typeof eventSchema>

// Remove o `answer` quando a etapa não tem `answerKey` ou o valor não passa no filtro.
function cleanEvent(e: ParsedEvent): FunnelEvent {
  if (e.event !== "step_answer") return e as FunnelEvent
  const { answer, ...rest } = e
  if (!answerKeyForSlug(e.stepSlug)) return rest
  const clean = sanitizeAnswer(answer)
  return clean === undefined ? rest : { ...rest, answer: clean }
}

const batchSchema = z.object({
  sessionId: z.string().uuid(),
  events: z.array(eventSchema).min(1).max(EVENTS_MAX_BATCH),
})

export function parseEventsBatch(
  raw: unknown,
): { ok: true; value: EventsBatch } | { ok: false; issues: { path: string; message: string }[] } {
  const parsed = batchSchema.safeParse(raw)
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({
        path: i.path.join(".") || "body",
        // As mensagens de enum/literal do zod ecoam o valor recebido; aqui nunca.
        message: i.code === "invalid_enum_value" || i.code === "invalid_literal" ? "valor inválido" : i.message,
      })),
    }
  }
  return {
    ok: true,
    value: { sessionId: parsed.data.sessionId, events: parsed.data.events.map(cleanEvent) },
  }
}
