import { describe, expect, it, vi } from "vitest"
import type { PaymentEventInput } from "@/lib/db/repos/types"
import { createAsaasWebhookHandler, WEBHOOK_MAX_BODY_BYTES } from "@/lib/http/handlers/asaas-webhook"
import type { Logger } from "@/lib/log"
import type { AdminNotice } from "@/lib/services/alert-admin"
import type { HandledEvent } from "@/lib/services/handle-asaas-event"

const URL_WEBHOOK = "http://localhost/api/webhooks/asaas"
const TOKEN = "w".repeat(40)

type LogLine = { level: string; event: string; fields?: Record<string, unknown> }

function fakeLog(): Logger & { lines: LogLine[] } {
  const lines: LogLine[] = []
  const at = (level: string) => (event: string, fields?: Record<string, unknown>) => {
    lines.push({ level, event, fields })
  }
  return { lines, info: at("info"), warn: at("warn"), error: at("error") }
}

const PAID_BODY = {
  id: "evt_1",
  event: "PAYMENT_RECEIVED",
  payment: { id: "pay_1", externalReference: "pay-local-1", status: "RECEIVED" },
}

function post(body: string, headers: Record<string, string> = { "asaas-access-token": TOKEN }): Request {
  return new Request(URL_WEBHOOK, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body,
  })
}

const processedPaid: HandledEvent = {
  outcome: "processed",
  pendingGeneration: { id: "gen-1", quizResponseId: "qr-1" },
  notice: null,
  pendingConversion: null,
}

function setup(
  handled: HandledEvent | (() => Promise<HandledEvent>) = processedPaid,
  sendMetaConversion?: (id: string) => Promise<void>,
) {
  const calls = {
    handled: [] as PaymentEventInput[],
    generations: [] as string[],
    notices: [] as AdminNotice[],
    conversions: [] as string[],
    deferred: [] as (() => Promise<void>)[],
  }
  const log = fakeLog()
  const handler = createAsaasWebhookHandler({
    token: TOKEN,
    handleEvent: async (e) => {
      calls.handled.push(e)
      return typeof handled === "function" ? handled() : handled
    },
    runPlanGeneration: async (id) => {
      calls.generations.push(id)
    },
    noticeAdmin: async (n) => {
      calls.notices.push(n)
    },
    sendMetaConversion:
      sendMetaConversion ??
      (async (id) => {
        calls.conversions.push(id)
      }),
    defer: (fn) => {
      calls.deferred.push(fn)
    },
    log,
  })
  return { handler, calls, log }
}

describe("webhook do Asaas: autenticação", () => {
  it("sem o header asaas-access-token → 401 e o evento não é tratado", async () => {
    const { handler, calls, log } = setup()
    const res = await handler(post(JSON.stringify(PAID_BODY), {}))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ ok: false })
    expect(calls.handled).toEqual([])
    expect(calls.deferred).toEqual([])
    expect(log.lines.map((l) => l.event)).toEqual(["webhook.asaas.unauthorized"])
  })

  it("token errado → 401, sem registrar o valor recebido", async () => {
    const { handler, calls, log } = setup()
    const res = await handler(post(JSON.stringify(PAID_BODY), { "asaas-access-token": "token-errado-123" }))
    expect(res.status).toBe(401)
    expect(await res.json()).toEqual({ ok: false })
    expect(calls.handled).toEqual([])
    expect(JSON.stringify(log.lines)).not.toContain("token-errado-123")
    expect(JSON.stringify(log.lines)).not.toContain(TOKEN)
  })

  it("token esperado vazio nunca autoriza", async () => {
    const handler = createAsaasWebhookHandler({
      token: "",
      handleEvent: vi.fn(),
      runPlanGeneration: vi.fn(),
      noticeAdmin: vi.fn(),
      sendMetaConversion: vi.fn(),
      defer: vi.fn(),
      log: fakeLog(),
    })
    const res = await handler(post(JSON.stringify(PAID_BODY), { "asaas-access-token": "" }))
    expect(res.status).toBe(401)
  })
})

describe("webhook do Asaas: leitura do corpo", () => {
  it.each(["{", "", "[]", '{"id":"evt_1"}'])(
    "corpo ilegível %j → 200, log unreadable, evento não tratado",
    async (raw) => {
      const { handler, calls, log } = setup()
      const res = await handler(post(raw))
      expect(res.status).toBe(200)
      expect(await res.json()).toEqual({ ok: true })
      expect(calls.handled).toEqual([])
      expect(calls.deferred).toEqual([])
      expect(log.lines.map((l) => l.event)).toEqual(["webhook.asaas.unreadable"])
    },
  )

  it("corpo acima de 256 KB → 200 e evento não tratado", async () => {
    const { handler, calls, log } = setup()
    const big = JSON.stringify({ ...PAID_BODY, junk: "x".repeat(WEBHOOK_MAX_BODY_BYTES + 1) })
    const res = await handler(post(big))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(calls.handled).toEqual([])
    expect(log.lines.map((l) => l.event)).toEqual(["webhook.asaas.unreadable"])
  })

  it("evento de cobrança sem o id da cobrança → 200 e evento não tratado", async () => {
    const { handler, calls } = setup()
    const res = await handler(post(JSON.stringify({ id: "evt_1", event: "PAYMENT_RECEIVED" })))
    expect(res.status).toBe(200)
    expect(calls.handled).toEqual([])
  })
})

describe("webhook do Asaas: tratamento e trabalho adiado", () => {
  it("evento pago → 200 { ok: true } e a geração roda depois da resposta", async () => {
    const { handler, calls } = setup()

    const res = await handler(post(JSON.stringify(PAID_BODY)))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(calls.handled).toEqual([expect.objectContaining({ eventId: "evt_1", event: "PAYMENT_RECEIVED", group: "paid" })])
    expect(calls.generations).toEqual([])
    expect(calls.deferred).toHaveLength(1)

    await calls.deferred[0]()
    expect(calls.generations).toEqual(["gen-1"])
    expect(calls.notices).toEqual([])
  })

  it("reversão → 200 e o aviso ao admin sai depois da resposta", async () => {
    const notice: AdminNotice = {
      kind: "payment_reversal",
      paymentId: "pay-local-1",
      patientName: "Ana",
      event: "PAYMENT_REFUNDED",
      asaasPaymentId: "pay_1",
    }
    const { handler, calls } = setup({ outcome: "processed", pendingGeneration: null, notice, pendingConversion: null })

    const res = await handler(post(JSON.stringify({ ...PAID_BODY, event: "PAYMENT_REFUNDED" })))

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(calls.notices).toEqual([])
    expect(calls.deferred).toHaveLength(1)

    await calls.deferred[0]()
    expect(calls.notices).toEqual([notice])
    expect(calls.generations).toEqual([])
  })

  it("duplicado → 200 e nada é adiado", async () => {
    const { handler, calls } = setup({ outcome: "duplicate", pendingGeneration: null, notice: null, pendingConversion: null })
    const res = await handler(post(JSON.stringify(PAID_BODY)))
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ ok: true })
    expect(calls.deferred).toEqual([])
  })

  it("ignorado → 200 e nada é adiado", async () => {
    const { handler, calls } = setup({ outcome: "ignored", pendingGeneration: null, notice: null, pendingConversion: null })
    const res = await handler(post(JSON.stringify(PAID_BODY)))
    expect(res.status).toBe(200)
    expect(calls.deferred).toEqual([])
  })

  it("falha ao tratar o evento → 500 { ok: false }, nada é adiado e o log não vaza o corpo", async () => {
    const { handler, calls, log } = setup(async () => {
      throw new Error("db down")
    })

    const res = await handler(post(JSON.stringify(PAID_BODY)))

    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ ok: false })
    expect(calls.deferred).toEqual([])
    expect(log.lines).toEqual([
      {
        level: "error",
        event: "webhook.asaas.failed",
        fields: { eventId: "evt_1", event: "PAYMENT_RECEIVED", paymentId: "pay-local-1", message: "db down" },
      },
    ])
  })

  it("erro dentro da tarefa adiada não vaza", async () => {
    const notice: AdminNotice = {
      kind: "payment_without_quiz",
      paymentId: "pay-local-1",
      patientName: "Ana",
      event: "PAYMENT_RECEIVED",
      asaasPaymentId: "pay_1",
    }
    const log = fakeLog()
    const deferred: (() => Promise<void>)[] = []
    const handler = createAsaasWebhookHandler({
      token: TOKEN,
      handleEvent: async () => ({
        outcome: "processed",
        pendingGeneration: { id: "gen-1", quizResponseId: "qr-1" },
        notice,
        pendingConversion: null,
      }),
      runPlanGeneration: async () => {
        throw new Error("ia fora do ar")
      },
      noticeAdmin: async () => {
        throw new Error("smtp down")
      },
      sendMetaConversion: async () => {},
      defer: (fn) => {
        deferred.push(fn)
      },
      log,
    })

    const res = await handler(post(JSON.stringify(PAID_BODY)))
    expect(res.status).toBe(200)
    expect(deferred).toHaveLength(2)

    for (const fn of deferred) await expect(fn()).resolves.toBeUndefined()
    expect(log.lines.map((l) => l.event)).toEqual(["webhook.asaas.generation_failed", "webhook.asaas.notice_failed"])
  })

  it("o log nunca leva o token nem o corpo do evento", async () => {
    const { handler, log } = setup()
    const body = { ...PAID_BODY, payment: { ...PAID_BODY.payment, customerName: "Nome Secreto" } }
    await handler(post(JSON.stringify(body)))
    await handler(post("{"))
    const text = JSON.stringify(log.lines)
    expect(text).not.toContain(TOKEN)
    expect(text).not.toContain("Nome Secreto")
  })
})

describe("webhook do Asaas: Purchase da Meta", () => {
  const conversionOnly: HandledEvent = {
    outcome: "processed",
    pendingGeneration: null,
    notice: null,
    pendingConversion: { id: "mc-1" },
  }

  it("com conversão pendente responde 200 e envia o Purchase depois da resposta", async () => {
    const { handler, calls } = setup(conversionOnly)

    const res = await handler(post(JSON.stringify(PAID_BODY)))

    expect(res.status).toBe(200)
    expect(calls.deferred).toHaveLength(1)
    expect(calls.conversions).toEqual([]) // só roda depois da resposta
    await calls.deferred[0]()
    expect(calls.conversions).toEqual(["mc-1"])
  })

  it("sem conversão pendente não envia nada à Meta", async () => {
    const { handler, calls } = setup(processedPaid)

    await handler(post(JSON.stringify(PAID_BODY)))
    for (const fn of calls.deferred) await fn()

    expect(calls.conversions).toEqual([])
  })

  it("falha no envio à Meta não muda a resposta e vira log sem dado pessoal", async () => {
    const { handler, calls, log } = setup(conversionOnly, async () => {
      throw new Error("meta fora do ar")
    })

    const res = await handler(post(JSON.stringify(PAID_BODY)))
    expect(res.status).toBe(200)
    await expect(calls.deferred[0]()).resolves.toBeUndefined()

    expect(log.lines).toContainEqual({
      level: "error",
      event: "webhook.asaas.conversion_failed",
      fields: { eventId: "evt_1", event: "PAYMENT_RECEIVED", paymentId: "pay-local-1", message: "meta fora do ar" },
    })
  })
})
