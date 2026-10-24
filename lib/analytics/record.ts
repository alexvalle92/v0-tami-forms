// Converte um lote validado em atualização da sessão + linhas de evento para gravar.
// `clientTs` sai do `ts` como veio: a correção de relógio é do handler, que já entrega o `ts` normalizado.

import type { FunnelEventRow, FunnelSessionPatch } from "@/lib/db/repos/types"
import { answerKeyForSlug, sanitizeAnswer } from "@/lib/quiz/steps"
import type { EventsBatch } from "./events"
import type { DeviceInfo } from "./user-agent"

export function buildRecord(
  batch: EventsBatch,
  device: DeviceInfo,
  now: Date,
): { session: FunnelSessionPatch; events: FunnelEventRow[] } {
  const session: FunnelSessionPatch = {
    sessionId: batch.sessionId,
    device: { deviceType: device.deviceType, os: device.os, browser: device.browser },
    checkoutClicked: false,
    answers: {},
  }
  const events: FunnelEventRow[] = []

  for (const e of batch.events) {
    switch (e.event) {
      case "session_start":
        session.start ??= {
          utm: e.utm,
          referrerHost: e.referrerHost ?? null,
          viewportW: e.viewport?.w ?? null,
          viewportH: e.viewport?.h ?? null,
        }
        break
      case "step_view":
        session.lastStep = { step: e.step, slug: e.stepSlug }
        if (!session.maxStep || e.step > session.maxStep.step) session.maxStep = { step: e.step, slug: e.stepSlug }
        break
      case "step_answer": {
        const key = answerKeyForSlug(e.stepSlug)
        const answer = key ? sanitizeAnswer(e.answer) : undefined
        if (key && answer !== undefined) session.answers[key] = answer
        break
      }
      case "checkout_click":
        session.checkoutClicked = true
        break
    }

    const { event, ts, ...rest } = e
    const { step, stepSlug, answer: _answer, ...props } = rest as typeof rest & {
      step?: number
      stepSlug?: string
      answer?: unknown
    }
    events.push({
      sessionId: batch.sessionId,
      event,
      step: step ?? null,
      stepSlug: stepSlug ?? null,
      props,
      clientTs: new Date(ts),
      createdAt: now,
    })
  }

  return { session, events }
}
