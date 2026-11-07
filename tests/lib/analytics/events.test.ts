import { describe, expect, it } from "vitest"
import { EVENTS_MAX_BATCH, parseEventsBatch } from "@/lib/analytics/events"

const SESSION = "6f1c2b0e-8a4d-4e0b-9a55-3a1f6c1d7b10"
const TS = "2026-10-24T12:00:00.000Z"

function batch(events: unknown[], sessionId: unknown = SESSION) {
  return { sessionId, events }
}

function oneEvent(e: Record<string, unknown>) {
  return parseEventsBatch(batch([{ ts: TS, ...e }]))
}

describe("parseEventsBatch", () => {
  it("aceita um lote com um evento de cada tipo e mantém os campos", () => {
    const events = [
      {
        event: "session_start",
        ts: TS,
        utm: { source: "ig", medium: "cpc", campaign: "c1", content: "a", term: "t" },
        referrerHost: "l.instagram.com",
        viewport: { w: 390, h: 844 },
      },
      { event: "step_view", ts: TS, step: 0, stepSlug: "faixa_etaria" },
      { event: "step_answer", ts: TS, step: 0, stepSlug: "faixa_etaria", durationMs: 1200, answer: "25-34 anos" },
      { event: "validation_error", ts: TS, step: 23, stepSlug: "email", reason: "email_invalido" },
      { event: "step_back", ts: TS, step: 3, stepSlug: "info_expectativa" },
      { event: "submit_result", ts: TS, step: 27, stepSlug: "envio", outcome: "ok", durationMs: 800, attempt: 1 },
      { event: "checkout_click", ts: TS, step: 28, stepSlug: "checkout", hasPaymentLink: true },
      { event: "page_hide", ts: TS, step: 28, stepSlug: "checkout", msOnStep: 5000 },
    ]
    const r = parseEventsBatch(batch(events))
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.value.sessionId).toBe(SESSION)
      expect(r.value.events).toEqual(events)
    }
  })

  it("rejeita sessionId que não é UUID", () => {
    expect(parseEventsBatch(batch([{ event: "step_view", ts: TS, step: 0, stepSlug: "faixa_etaria" }], "abc")).ok).toBe(false)
  })

  it("rejeita lote vazio e lote com mais de 25 eventos", () => {
    expect(parseEventsBatch(batch([])).ok).toBe(false)
    const ev = { event: "step_view", ts: TS, step: 0, stepSlug: "faixa_etaria" }
    expect(parseEventsBatch(batch(Array.from({ length: EVENTS_MAX_BATCH }, () => ev))).ok).toBe(true)
    expect(parseEventsBatch(batch(Array.from({ length: EVENTS_MAX_BATCH + 1 }, () => ev))).ok).toBe(false)
  })

  it("rejeita corpo que não é objeto", () => {
    expect(parseEventsBatch(null).ok).toBe(false)
    expect(parseEventsBatch("x").ok).toBe(false)
  })

  it("valida step (inteiro de 0 a 28) e stepSlug (até 40)", () => {
    expect(oneEvent({ event: "step_view", step: 28, stepSlug: "checkout" }).ok).toBe(true)
    const v = { event: "step_view", stepSlug: "faixa_etaria" }
    expect(oneEvent({ ...v, step: 29 }).ok).toBe(false)
    expect(oneEvent({ ...v, step: -1 }).ok).toBe(false)
    expect(oneEvent({ ...v, step: 1.5 }).ok).toBe(false)
    expect(oneEvent({ event: "step_view", step: 0, stepSlug: "a".repeat(41) }).ok).toBe(false)
  })

  it("descarta o evento cujo stepSlug não é o slug canônico do step, e mantém o resto do lote", () => {
    const good = { event: "step_view", ts: TS, step: 0, stepSlug: "faixa_etaria" }
    const bad = { event: "step_view", ts: TS, step: 0, stepSlug: "email" }
    const start = { event: "session_start", ts: TS, utm: {} }
    const r = parseEventsBatch(batch([bad, good, start, { ...bad, event: "page_hide", msOnStep: 1 }]))
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.events).toEqual([good, start])
  })

  it("lote só com eventos de slug não canônico é rejeitado, sem ecoar o valor recebido", () => {
    const r = parseEventsBatch(
      batch([{ event: "step_view", ts: TS, step: 0, stepSlug: "segredo-xyz" }]),
    )
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.issues).toEqual([{ path: "events", message: expect.any(String) }])
      expect(JSON.stringify(r.issues)).not.toContain("segredo-xyz")
    }
  })

  it("rejeita event, reason e outcome desconhecidos", () => {
    expect(oneEvent({ event: "foo", step: 0, stepSlug: "faixa_etaria" }).ok).toBe(false)
    expect(oneEvent({ event: "validation_error", step: 0, stepSlug: "faixa_etaria", reason: "outro" }).ok).toBe(false)
    expect(
      oneEvent({ event: "submit_result", step: 27, stepSlug: "envio", outcome: "x", durationMs: 1, attempt: 1 }).ok,
    ).toBe(false)
  })

  it("step_answer em etapa sem answerKey passa sem o answer (cpf)", () => {
    const r = oneEvent({ event: "step_answer", step: 26, stepSlug: "cpf", durationMs: 10, answer: "52998224725" })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.events[0]).not.toHaveProperty("answer")
  })

  it("step_answer com valor fora do formato passa sem o answer", () => {
    const r = oneEvent({ event: "step_answer", step: 2, stepSlug: "tipo_fisico", durationMs: 10, answer: 42 })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.events[0]).not.toHaveProperty("answer")
  })

  it("step_answer com array válido mantém o answer", () => {
    const r = oneEvent({
      event: "step_answer",
      step: 6,
      stepSlug: "cafe_manha",
      durationMs: 10,
      answer: ["Pão", "Café"],
    })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.events[0]).toMatchObject({ answer: ["Pão", "Café"] })
  })

  it("remove campos desconhecidos", () => {
    const r = oneEvent({ event: "step_view", step: 0, stepSlug: "faixa_etaria", nome: "Ana" })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.events[0]).not.toHaveProperty("nome")
  })

  it("corta utm e referrerHost em 100 caracteres", () => {
    const r = oneEvent({
      event: "session_start",
      utm: { source: "x".repeat(300) },
      referrerHost: "h".repeat(300),
    })
    expect(r.ok).toBe(true)
    if (r.ok) {
      const e = r.value.events[0] as { utm: { source: string }; referrerHost: string }
      expect(e.utm.source).toHaveLength(100)
      expect(e.referrerHost).toHaveLength(100)
    }
  })

  it("limita durationMs, msOnStep e attempt", () => {
    const answer = { event: "step_answer", step: 0, stepSlug: "faixa_etaria" }
    expect(oneEvent({ ...answer, durationMs: 86_400_000 }).ok).toBe(true)
    expect(oneEvent({ ...answer, durationMs: 86_400_001 }).ok).toBe(false)
    expect(oneEvent({ ...answer, durationMs: -1 }).ok).toBe(false)
    const hide = { event: "page_hide", step: 0, stepSlug: "faixa_etaria" }
    expect(oneEvent({ ...hide, msOnStep: -1 }).ok).toBe(false)
    expect(oneEvent({ ...hide, msOnStep: 86_400_001 }).ok).toBe(false)
    const sub = { event: "submit_result", step: 27, stepSlug: "envio", outcome: "ok", durationMs: 1 }
    expect(oneEvent({ ...sub, attempt: 0 }).ok).toBe(false)
    expect(oneEvent({ ...sub, attempt: 2 }).ok).toBe(true)
  })

  it("ts é string de até 40 caracteres", () => {
    const v = { event: "step_view", step: 0, stepSlug: "faixa_etaria" }
    expect(parseEventsBatch(batch([{ ...v, ts: "a".repeat(40) }])).ok).toBe(true)
    expect(parseEventsBatch(batch([{ ...v, ts: "a".repeat(41) }])).ok).toBe(false)
    expect(parseEventsBatch(batch([{ ...v, ts: 123 }])).ok).toBe(false)
  })

  it("viewport aceita inteiros de 1 a 10000", () => {
    const s = { event: "session_start", utm: {} }
    expect(oneEvent({ ...s, viewport: { w: 0, h: 0 } }).ok).toBe(false)
    expect(oneEvent({ ...s, viewport: { w: 10_001, h: 10 } }).ok).toBe(false)
    expect(oneEvent({ ...s, viewport: { w: 10_000, h: 1 } }).ok).toBe(true)
  })

  it("issues trazem só caminho e mensagem, sem os valores recebidos", () => {
    const r = oneEvent({ event: "validation_error", step: 0, stepSlug: "faixa_etaria", reason: "segredo-123" })
    expect(r.ok).toBe(false)
    if (!r.ok) {
      expect(r.issues.length).toBeGreaterThan(0)
      expect(JSON.stringify(r.issues)).not.toContain("segredo-123")
      expect(r.issues[0]).toHaveProperty("path")
      expect(r.issues[0]).toHaveProperty("message")
    }
  })
})
