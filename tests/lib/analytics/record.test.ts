import { describe, expect, it } from "vitest"
import { buildRecord } from "@/lib/analytics/record"
import type { DeviceInfo } from "@/lib/analytics/user-agent"
import type { EventsBatch, FunnelEvent } from "@/lib/analytics/events"

const SESSION = "6f1c2b0e-8a4d-4e0b-9a55-3a1f6c1d7b10"
const NOW = new Date("2026-10-24T12:00:05.000Z")
const DEVICE: DeviceInfo = { deviceType: "mobile", os: "iOS", browser: "Safari", isBot: false }

const ts = (s: number) => `2026-10-24T12:00:0${s}.000Z`

function view(step: number, slug: string, t = 1): FunnelEvent {
  return { event: "step_view", ts: ts(t), step, stepSlug: slug }
}

function mk(events: FunnelEvent[]): EventsBatch {
  return { sessionId: SESSION, events }
}

describe("buildRecord", () => {
  it("monta sessão e linhas para um lote típico", () => {
    const batch = mk([
      {
        event: "session_start",
        ts: ts(0),
        utm: { source: "ig" },
        referrerHost: "l.instagram.com",
        viewport: { w: 390, h: 844 },
      },
      view(0, "faixa_etaria", 1),
      { event: "step_answer", ts: ts(2), step: 0, stepSlug: "faixa_etaria", durationMs: 900, answer: "25-34 anos" },
      view(1, "sexo_biologico", 3),
    ])
    const { session, events } = buildRecord(batch, DEVICE, NOW)
    expect(session).toEqual({
      sessionId: SESSION,
      device: { deviceType: "mobile", os: "iOS", browser: "Safari" },
      start: { utm: { source: "ig" }, referrerHost: "l.instagram.com", viewportW: 390, viewportH: 844 },
      lastStep: { step: 1, slug: "sexo_biologico" },
      maxStep: { step: 1, slug: "sexo_biologico" },
      checkoutClicked: false,
      answers: { faixa_etaria: "25-34 anos" },
    })
    expect(events).toHaveLength(4)
  })

  it("a resposta da etapa 21 vai para imc_faixa", () => {
    const { session } = buildRecord(
      mk([{ event: "step_answer", ts: ts(1), step: 21, stepSlug: "perfil_imc", durationMs: 5, answer: "sobrepeso" }]),
      DEVICE,
      NOW,
    )
    expect(session.answers).toEqual({ imc_faixa: "sobrepeso" })
  })

  it("lastStep é o último step_view e maxStep o maior", () => {
    const { session } = buildRecord(mk([view(5, "info_prepare_se", 1), view(3, "info_expectativa", 2)]), DEVICE, NOW)
    expect(session.lastStep).toEqual({ step: 3, slug: "info_expectativa" })
    expect(session.maxStep).toEqual({ step: 5, slug: "info_prepare_se" })
  })

  it("sem step_view e sem session_start, não há start, lastStep nem maxStep", () => {
    const { session } = buildRecord(
      mk([{ event: "step_back", ts: ts(1), step: 3, stepSlug: "info_expectativa" }]),
      DEVICE,
      NOW,
    )
    expect(session.start).toBeUndefined()
    expect(session.lastStep).toBeUndefined()
    expect(session.maxStep).toBeUndefined()
    expect(session.answers).toEqual({})
  })

  it("checkout_click marca checkoutClicked", () => {
    const { session } = buildRecord(
      mk([{ event: "checkout_click", ts: ts(1), step: 28, stepSlug: "checkout", hasPaymentLink: true }]),
      DEVICE,
      NOW,
    )
    expect(session.checkoutClicked).toBe(true)
  })

  it("session_start sem referrer nem viewport vira nulos", () => {
    const { session } = buildRecord(mk([{ event: "session_start", ts: ts(0), utm: {} }]), DEVICE, NOW)
    expect(session.start).toEqual({ utm: {}, referrerHost: null, viewportW: null, viewportH: null })
  })

  it("linhas de evento: props sem os campos comuns e sem answer", () => {
    const { events } = buildRecord(
      mk([
        {
          event: "session_start",
          ts: ts(0),
          utm: { source: "ig" },
          referrerHost: "l.instagram.com",
          viewport: { w: 390, h: 844 },
        },
        { event: "step_answer", ts: ts(2), step: 0, stepSlug: "faixa_etaria", durationMs: 900, answer: "25-34 anos" },
        { event: "submit_result", ts: ts(3), step: 27, stepSlug: "envio", outcome: "ok", durationMs: 7, attempt: 1 },
      ]),
      DEVICE,
      NOW,
    )
    expect(events[0]).toEqual({
      sessionId: SESSION,
      event: "session_start",
      step: null,
      stepSlug: null,
      props: { utm: { source: "ig" }, referrerHost: "l.instagram.com", viewport: { w: 390, h: 844 } },
      clientTs: new Date(ts(0)),
      createdAt: NOW,
    })
    expect(events[1]).toEqual({
      sessionId: SESSION,
      event: "step_answer",
      step: 0,
      stepSlug: "faixa_etaria",
      props: { durationMs: 900 },
      clientTs: new Date(ts(2)),
      createdAt: NOW,
    })
    expect(events[2].props).toEqual({ outcome: "ok", durationMs: 7, attempt: 1 })
    for (const e of events) {
      expect(e.createdAt).toBe(NOW)
      expect(e.props).not.toHaveProperty("event")
      expect(e.props).not.toHaveProperty("ts")
      expect(e.props).not.toHaveProperty("answer")
    }
  })
})
