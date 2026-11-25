import { describe, expect, it, vi } from "vitest"
import { jobBackoffMs } from "@/lib/jobs/backoff"
import type { GoogleAdsConversionPayload, GoogleAdsConversionRepo } from "@/lib/db/repos/types"
import type { DataManagerClient, DataManagerEvent, IngestResult } from "@/lib/google-ads/data-manager"
import type { Logger } from "@/lib/log"
import { sha256Hex } from "@/lib/meta/user-data"
import {
  createSendGoogleAdsConversion,
  GOOGLE_ADS_MAX_EVENT_AGE_MS,
  MAX_GOOGLE_ADS_CONVERSION_ATTEMPTS,
  purchaseEvent,
} from "@/lib/services/send-google-ads-conversion"

const NOW = new Date("2026-11-25T15:00:00.000Z")
const ID = "gc-1"
const EMAIL = "Ana.Souza@Gmail.com"
const PHONE = "44991651250"

type LogLine = { level: string; event: string; fields?: Record<string, unknown> }

function fakeLog(): Logger & { lines: LogLine[] } {
  const lines: LogLine[] = []
  const at = (level: string) => (event: string, fields?: Record<string, unknown>) => {
    lines.push({ level, event, fields })
  }
  return { lines, info: at("info"), warn: at("warn"), error: at("error") }
}

function payload(over: Partial<GoogleAdsConversionPayload> = {}): GoogleAdsConversionPayload {
  return {
    id: ID,
    paymentId: "pay-1",
    transactionId: "purchase:pay-1",
    eventTime: new Date(NOW.getTime() - 60_000),
    attempts: 0,
    amount: "39.90",
    patient: { email: EMAIL, phone: PHONE, name: "Ana Souza" },
    click: { gclid: "Cj0KCQ-abc", gbraid: null, wbraid: null },
    ...over,
  }
}

function setup(
  opts: {
    payload?: GoogleAdsConversionPayload | null
    claim?: boolean
    result?: IngestResult | (() => Promise<IngestResult>)
    enabled?: boolean
    client?: boolean
    enhancedConversions?: boolean
    validateOnly?: boolean
  } = {},
) {
  const conversions = {
    claim: vi.fn(async () => opts.claim ?? true),
    loadPayload: vi.fn(async () => (opts.payload === undefined ? payload() : opts.payload)),
    markSent: vi.fn(async () => {}),
    markRetry: vi.fn(async () => {}),
    markFailed: vi.fn(async () => {}),
  }
  const sent: DataManagerEvent[][] = []
  const client: DataManagerClient = {
    ingest: async (events) => {
      sent.push(events)
      const r = opts.result ?? { kind: "ok" as const, requestId: "req-1" }
      return typeof r === "function" ? r() : r
    },
  }
  const alertAdmin = vi.fn(async () => {})
  const log = fakeLog()
  const send = createSendGoogleAdsConversion({
    conversions: conversions as unknown as GoogleAdsConversionRepo,
    client: opts.client === false ? null : client,
    enabled: opts.enabled ?? true,
    enhancedConversions: opts.enhancedConversions ?? false,
    validateOnly: opts.validateOnly ?? false,
    alertAdmin,
    log,
    now: () => NOW,
  })
  return { send, conversions, sent, alertAdmin, log }
}

describe("purchaseEvent", () => {
  it("usa um identificador só, na ordem gclid > gbraid > wbraid", () => {
    const click = (c: Partial<GoogleAdsConversionPayload["click"]>) =>
      purchaseEvent(payload({ click: { gclid: null, gbraid: null, wbraid: null, ...c } }), false)?.adIdentifiers

    expect(click({ gclid: "g", gbraid: "b", wbraid: "w" })).toEqual({ gclid: "g" })
    expect(click({ gbraid: "b", wbraid: "w" })).toEqual({ gbraid: "b" })
    expect(click({ wbraid: "w" })).toEqual({ wbraid: "w" })
    expect(click({})).toBeUndefined()
  })

  it("com conversões otimizadas, leva e-mail e telefone com hash, só junto do gclid", () => {
    const withGclid = purchaseEvent(payload(), true)!
    expect(withGclid.userData).toEqual({
      userIdentifiers: [{ emailAddress: sha256Hex("anasouza@gmail.com") }, { phoneNumber: sha256Hex("+5544991651250") }],
    })
    expect(purchaseEvent(payload(), false)!.userData).toBeUndefined()
    expect(
      purchaseEvent(payload({ click: { gclid: null, gbraid: "b", wbraid: null } }), true)!.userData,
    ).toBeUndefined()
  })
})

describe("createSendGoogleAdsConversion", () => {
  it("envia o Purchase com valor do banco e horário do pagamento, e marca como enviado com o requestId", async () => {
    const t = setup()
    await t.send(ID)

    expect(t.sent).toEqual([
      [
        {
          transactionId: "purchase:pay-1",
          eventTimestamp: new Date(NOW.getTime() - 60_000).toISOString(),
          eventSource: "WEB",
          conversionValue: 39.9,
          currency: "BRL",
          adIdentifiers: { gclid: "Cj0KCQ-abc" },
        },
      ],
    ])
    expect(t.conversions.markSent).toHaveBeenCalledWith(ID, NOW, "req-1")
    expect(t.alertAdmin).not.toHaveBeenCalled()
    expect(t.log.lines).toEqual([
      {
        level: "info",
        event: "google_ads.purchase.sent",
        fields: { conversionId: ID, paymentId: "pay-1", requestId: "req-1" },
      },
    ])
  })

  it("desligado ou sem cliente: não toca na linha", async () => {
    for (const t of [setup({ enabled: false }), setup({ client: false })]) {
      await t.send(ID)
      expect(t.conversions.claim).not.toHaveBeenCalled()
      expect(t.sent).toEqual([])
    }
  })

  it("claim falso (outro processo tem a linha): não envia", async () => {
    const t = setup({ claim: false })
    await t.send(ID)
    expect(t.conversions.loadPayload).not.toHaveBeenCalled()
    expect(t.sent).toEqual([])
  })

  it("retryable agenda a próxima tentativa pelo backoff do job", async () => {
    const t = setup({ result: { kind: "retryable", status: 503, message: "Google 503" } })
    await t.send(ID)

    expect(t.conversions.markRetry).toHaveBeenCalledWith(
      ID,
      new Date(NOW.getTime() + jobBackoffMs(1)),
      expect.objectContaining({ step: "google_ads_ingest", httpStatus: 503, message: "Google 503", attempt: 1 }),
    )
    expect(t.conversions.markFailed).not.toHaveBeenCalled()
    expect(t.alertAdmin).not.toHaveBeenCalled()
  })

  it("fatal vira failed na hora, com aviso ao admin", async () => {
    const t = setup({ result: { kind: "fatal", status: 400, message: "Google 400: INVALID_ARGUMENT" } })
    await t.send(ID)

    expect(t.conversions.markFailed).toHaveBeenCalledWith(ID, expect.objectContaining({ httpStatus: 400 }))
    expect(t.alertAdmin).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "google_ads_conversion", id: ID, patientName: "Ana Souza" }),
    )
  })

  it("a última tentativa retryable vira failed com aviso", async () => {
    const t = setup({
      payload: payload({ attempts: MAX_GOOGLE_ADS_CONVERSION_ATTEMPTS - 1 }),
      result: { kind: "retryable", message: "rede: x" },
    })
    await t.send(ID)
    expect(t.conversions.markRetry).not.toHaveBeenCalled()
    expect(t.conversions.markFailed).toHaveBeenCalledTimes(1)
    expect(t.alertAdmin).toHaveBeenCalledTimes(1)
  })

  it("pagamento com mais de 90 dias: fecha a linha sem chamar o Google e sem e-mail", async () => {
    const t = setup({ payload: payload({ eventTime: new Date(NOW.getTime() - GOOGLE_ADS_MAX_EVENT_AGE_MS - 1) }) })
    await t.send(ID)
    expect(t.sent).toEqual([])
    expect(t.conversions.markFailed).toHaveBeenCalledWith(
      ID,
      expect.objectContaining({ message: "fora da janela de 90 dias do Google Ads" }),
    )
    expect(t.alertAdmin).not.toHaveBeenCalled()
  })

  it("dados ausentes (atribuição apagada) ou sem clique: failed com aviso, sem chamar o Google", async () => {
    for (const t of [
      setup({ payload: null }),
      setup({ payload: payload({ click: { gclid: null, gbraid: null, wbraid: null } }) }),
    ]) {
      await t.send(ID)
      expect(t.sent).toEqual([])
      expect(t.conversions.markFailed).toHaveBeenCalledWith(ID, expect.objectContaining({ message: "dados ausentes" }))
      expect(t.alertAdmin).toHaveBeenCalledTimes(1)
    }
  })

  it("validateOnly: aceito na validação vira failed explicado, sem aviso, para reabrir depois", async () => {
    const t = setup({ validateOnly: true })
    await t.send(ID)

    expect(t.conversions.markSent).not.toHaveBeenCalled()
    expect(t.conversions.markFailed).toHaveBeenCalledWith(
      ID,
      expect.objectContaining({ message: expect.stringContaining("validateOnly") }),
    )
    expect(t.alertAdmin).not.toHaveBeenCalled()
    expect(t.log.lines.map((l) => l.event)).toEqual(["google_ads.purchase.validated"])
  })

  it("exceção inesperada não escapa e solta a linha para nova tentativa", async () => {
    const t = setup({
      result: async () => {
        throw new Error(`falhou para ${EMAIL}`)
      },
    })
    await expect(t.send(ID)).resolves.toBeUndefined()
    expect(t.conversions.markRetry).toHaveBeenCalledTimes(1)
    expect(JSON.stringify(t.log.lines)).not.toContain(EMAIL)
  })

  it("o log nunca leva e-mail, telefone, nome nem o gclid", async () => {
    const t = setup({ enhancedConversions: true, result: { kind: "fatal", status: 400, message: "Google 400" } })
    await t.send(ID)
    const text = JSON.stringify(t.log.lines)
    for (const secret of [EMAIL, PHONE, "Ana Souza", "Cj0KCQ-abc"]) expect(text).not.toContain(secret)
  })
})
