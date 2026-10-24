import { describe, expect, it, vi } from "vitest"
import { jobBackoffMs } from "@/lib/jobs/backoff"
import type { MetaConversionPayload, MetaConversionRepo } from "@/lib/db/repos/types"
import type { Logger } from "@/lib/log"
import type { CapiEvent, CapiResult, MetaCapiClient } from "@/lib/meta/capi"
import { sha256Hex } from "@/lib/meta/user-data"
import {
  createSendMetaConversion,
  MAX_META_CONVERSION_ATTEMPTS,
  META_MAX_EVENT_AGE_MS,
} from "@/lib/services/send-meta-conversion"

const NOW = new Date("2026-10-24T15:00:00.000Z")
const ID = "mc-1"

type LogLine = { level: string; event: string; fields?: Record<string, unknown> }

function fakeLog(): Logger & { lines: LogLine[] } {
  const lines: LogLine[] = []
  const at = (level: string) => (event: string, fields?: Record<string, unknown>) => {
    lines.push({ level, event, fields })
  }
  return { lines, info: at("info"), warn: at("warn"), error: at("error") }
}

function payload(over: Partial<MetaConversionPayload> = {}): MetaConversionPayload {
  return {
    id: ID,
    paymentId: "pay-1",
    eventId: "purchase:pay-1",
    eventTime: new Date(NOW.getTime() - 60_000),
    attempts: 0,
    amount: "39.90",
    patient: { email: "Ana@Gmail.com", phone: "44991651250", name: "Ana Souza" },
    attribution: {
      externalId: "123e4567-e89b-42d3-a456-426614174000",
      fbp: "fb.1.1700000000000.123",
      fbc: "fb.1.1700000000000.abc",
      clientIp: "1.2.3.4",
      userAgent: "UA-X",
      eventSourceUrl: "https://quiz.example.com/?utm_source=fb",
    },
    ...over,
  }
}

function setup(
  opts: {
    payload?: MetaConversionPayload | null
    claim?: boolean
    result?: CapiResult | (() => Promise<CapiResult>)
    enabled?: boolean
    capi?: boolean
  } = {},
) {
  const conversions = {
    claim: vi.fn(async () => opts.claim ?? true),
    loadPayload: vi.fn(async () => (opts.payload === undefined ? payload() : opts.payload)),
    markSent: vi.fn(async () => {}),
    markRetry: vi.fn(async () => {}),
    markFailed: vi.fn(async () => {}),
  }
  const sent: CapiEvent[][] = []
  const capi: MetaCapiClient = {
    send: async (events) => {
      sent.push(events)
      const r = opts.result ?? { kind: "ok" as const }
      return typeof r === "function" ? r() : r
    },
  }
  const alertAdmin = vi.fn(async () => {})
  const log = fakeLog()
  const send = createSendMetaConversion({
    conversions: conversions as unknown as MetaConversionRepo,
    capi: opts.capi === false ? null : capi,
    enabled: opts.enabled ?? true,
    alertAdmin,
    log,
    now: () => NOW,
  })
  return { send, conversions, sent, alertAdmin, log }
}

describe("createSendMetaConversion", () => {
  it("envia o Purchase com valor do banco e user_data com hash, e marca como enviado", async () => {
    const t = setup()
    await t.send(ID)

    expect(t.sent).toHaveLength(1)
    expect(t.sent[0]).toHaveLength(1)
    const event = t.sent[0][0]
    expect(event).toMatchObject({
      event_name: "Purchase",
      event_id: "purchase:pay-1",
      event_time: Math.floor((NOW.getTime() - 60_000) / 1000),
      action_source: "website",
      event_source_url: "https://quiz.example.com/?utm_source=fb",
      custom_data: { value: 39.9, currency: "BRL" },
      user_data: {
        em: [sha256Hex("ana@gmail.com")],
        client_ip_address: "1.2.3.4",
        client_user_agent: "UA-X",
        fbp: "fb.1.1700000000000.123",
        fbc: "fb.1.1700000000000.abc",
      },
    })
    expect(t.conversions.markSent).toHaveBeenCalledWith(ID, NOW)
    expect(t.conversions.markRetry).not.toHaveBeenCalled()
    expect(t.conversions.markFailed).not.toHaveBeenCalled()
    expect(t.alertAdmin).not.toHaveBeenCalled()
  })

  it("loga o sucesso só com os ids, sem dado pessoal", async () => {
    const t = setup()
    await t.send(ID)

    expect(t.log.lines).toEqual([
      { level: "info", event: "meta.purchase.sent", fields: { conversionId: ID, paymentId: "pay-1" } },
    ])
  })

  it("falha que pode repetir agenda a próxima tentativa pelo backoff do job, sem avisar o admin", async () => {
    const t = setup({ result: { kind: "retryable", status: 503, message: "Meta 503" } })
    await t.send(ID)

    expect(t.conversions.markRetry).toHaveBeenCalledWith(
      ID,
      new Date(NOW.getTime() + jobBackoffMs(1)),
      expect.objectContaining({ step: "meta_capi", httpStatus: 503, message: "Meta 503", attempt: 1 }),
    )
    expect(t.conversions.markFailed).not.toHaveBeenCalled()
    expect(t.alertAdmin).not.toHaveBeenCalled()
    expect(t.log.lines.map((l) => [l.level, l.event])).toEqual([["warn", "meta.purchase.retry"]])
  })

  it("na última tentativa vira failed e avisa o admin", async () => {
    const t = setup({
      payload: payload({ attempts: MAX_META_CONVERSION_ATTEMPTS - 1 }),
      result: { kind: "retryable", status: 500, message: "Meta 500" },
    })
    await t.send(ID)

    expect(t.conversions.markRetry).not.toHaveBeenCalled()
    expect(t.conversions.markFailed).toHaveBeenCalledWith(ID, expect.objectContaining({ attempt: 8 }))
    expect(t.alertAdmin).toHaveBeenCalledWith({
      kind: "meta_conversion",
      id: ID,
      patientName: "Ana Souza",
      error: expect.objectContaining({ step: "meta_capi", attempt: 8, message: "Meta 500" }),
    })
    expect(t.log.lines.map((l) => [l.level, l.event])).toEqual([["error", "meta.purchase.failed"]])
  })

  it("passados 7 dias do pagamento, não tenta mais", async () => {
    const t = setup({
      payload: payload({ eventTime: new Date(NOW.getTime() - META_MAX_EVENT_AGE_MS - 60_000) }),
      result: { kind: "retryable", message: "rede: ECONNRESET" },
    })
    await t.send(ID)

    expect(t.conversions.markRetry).not.toHaveBeenCalled()
    expect(t.conversions.markFailed).toHaveBeenCalledTimes(1)
    expect(t.alertAdmin).toHaveBeenCalledTimes(1)
  })

  it("erro definitivo da Meta vira failed na hora", async () => {
    const t = setup({ result: { kind: "fatal", status: 400, message: "Meta 400: Invalid parameter" } })
    await t.send(ID)

    expect(t.conversions.markFailed).toHaveBeenCalledWith(
      ID,
      expect.objectContaining({ httpStatus: 400, attempt: 1, message: "Meta 400: Invalid parameter" }),
    )
    expect(t.conversions.markRetry).not.toHaveBeenCalled()
    expect(t.alertAdmin).toHaveBeenCalledTimes(1)
  })

  it("se outro processo reservou a linha, não carrega nem envia", async () => {
    const t = setup({ claim: false })
    await t.send(ID)

    expect(t.conversions.loadPayload).not.toHaveBeenCalled()
    expect(t.sent).toEqual([])
  })

  it("atribuição já apagada pelo purge: vira failed com 'dados ausentes' e avisa o admin", async () => {
    const t = setup({ payload: null })
    await expect(t.send(ID)).resolves.toBeUndefined()

    expect(t.sent).toEqual([])
    expect(t.conversions.markFailed).toHaveBeenCalledWith(ID, expect.objectContaining({ message: "dados ausentes" }))
    expect(t.alertAdmin).toHaveBeenCalledWith(expect.objectContaining({ kind: "meta_conversion", id: ID, patientName: "-" }))
  })

  it.each([
    ["rastreamento desligado", { enabled: false }],
    ["sem cliente da CAPI", { capi: false }],
  ])("%s: não mexe em nada, a linha segue pending", async (_, opts) => {
    const t = setup(opts)
    await t.send(ID)

    expect(t.conversions.claim).not.toHaveBeenCalled()
    expect(t.conversions.markSent).not.toHaveBeenCalled()
    expect(t.conversions.markRetry).not.toHaveBeenCalled()
    expect(t.conversions.markFailed).not.toHaveBeenCalled()
    expect(t.sent).toEqual([])
  })

  it("exceção ao enviar solta a linha com nova tentativa e não escapa", async () => {
    const t = setup({
      result: async () => {
        throw new Error("boom")
      },
    })
    await expect(t.send(ID)).resolves.toBeUndefined()

    expect(t.conversions.markRetry).toHaveBeenCalledWith(
      ID,
      new Date(NOW.getTime() + jobBackoffMs(1)),
      expect.objectContaining({ step: "meta_capi", message: "boom", attempt: 1 }),
    )
    expect(t.log.lines.map((l) => [l.level, l.event])).toContainEqual(["error", "meta.purchase.error"])
  })

  it("se até soltar a linha falhar, a promessa ainda resolve", async () => {
    const t = setup({
      result: async () => {
        throw new Error("boom")
      },
    })
    t.conversions.markRetry.mockRejectedValue(new Error("banco fora"))
    await expect(t.send(ID)).resolves.toBeUndefined()
  })
})
