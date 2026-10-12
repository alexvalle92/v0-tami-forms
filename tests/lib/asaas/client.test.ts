import { describe, expect, it } from "vitest"
import { createAsaasClient, type CreateCustomerInput, type CreatePaymentInput } from "@/lib/asaas/client"
import { HttpError } from "@/lib/http/retry"

type Call = { url: string; method: string; headers: Record<string, string>; body?: string; redirect?: string }
type Step = Response | Error | (() => Response)

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } })

type Extra = { now?: () => number; onSleep?: (ms: number) => void }

function setup(steps: Step[], env: "sandbox" | "production" = "sandbox", extra: Extra = {}) {
  const queue = [...steps]
  const calls: Call[] = []
  const sleeps: number[] = []
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      method: init.method ?? "GET",
      headers: init.headers as Record<string, string>,
      body: init.body as string | undefined,
      redirect: init.redirect,
    })
    const next = queue.shift()
    if (!next) throw new Error("fila de respostas vazia")
    if (next instanceof Error) throw next
    return typeof next === "function" ? next() : next
  }) as unknown as typeof fetch
  const sleep = async (ms: number) => {
    sleeps.push(ms)
    extra.onSleep?.(ms)
  }
  const client = createAsaasClient({ env, apiKey: "key-secret", fetchImpl, sleep, random: () => 0.5, now: extra.now })
  return { client, calls, sleeps }
}

const opts = () => ({ deadline: Date.now() + 60_000 })

async function catchError(promise: Promise<unknown>): Promise<HttpError> {
  try {
    await promise
  } catch (err) {
    expect(err).toBeInstanceOf(HttpError)
    return err as HttpError
  }
  throw new Error("esperava rejeição")
}

const paymentInput: CreatePaymentInput = {
  customer: "cus_1",
  billingType: "UNDEFINED",
  value: 39.9,
  dueDate: "2026-10-09",
  description: "Plano Alimentar Personalizado - Ana Souza - 30 dias",
  externalReference: "pay-uuid",
  callback: { successUrl: "https://forms.nutritamilivalle.com.br/confirmationPayment" },
}
const customerInput: CreateCustomerInput = {
  name: "Ana Souza",
  cpfCnpj: "52998224725",
  email: "ana@example.com",
  mobilePhone: "11999999999",
  externalReference: "cust-uuid",
}
const asaasPayment = {
  id: "pay_1",
  status: "PENDING",
  invoiceUrl: "https://asaas/i/1",
  invoiceNumber: "123",
  billingType: "UNDEFINED",
  dueDate: "2026-10-09",
}
const mappedPayment = { ...asaasPayment }

describe("asaas client: buscas", () => {
  it("sandbox: GET /customers?cpfCnpj com access_token", async () => {
    const t = setup([json({ data: [{ id: "cus_1" }] })])
    await expect(t.client.findCustomerByCpf("52998224725", opts())).resolves.toEqual({ id: "cus_1" })
    expect(t.calls).toHaveLength(1)
    expect(t.calls[0].url).toBe("https://api-sandbox.asaas.com/v3/customers?cpfCnpj=52998224725")
    expect(t.calls[0].method).toBe("GET")
    expect(t.calls[0].headers.access_token).toBe("key-secret")
    expect(t.calls[0].headers["Content-Type"]).toBe("application/json")
    expect(t.calls[0].headers["User-Agent"]).toBe("tami-forms")
  })

  it("devolve null quando data está vazio", async () => {
    const t = setup([json({ data: [] })])
    await expect(t.client.findCustomerByCpf("52998224725", opts())).resolves.toBeNull()
  })

  it("production usa https://api.asaas.com/v3/", async () => {
    const t = setup([json({ data: [] })], "production")
    await t.client.findCustomerByCpf("52998224725", opts())
    expect(t.calls[0].url.startsWith("https://api.asaas.com/v3/")).toBe(true)
  })

  it("findPaymentByExternalReference mapeia data[0] ou devolve null", async () => {
    const t = setup([json({ data: [asaasPayment] }), json({ data: [] })])
    await expect(t.client.findPaymentByExternalReference("pay-uuid", opts())).resolves.toEqual(mappedPayment)
    expect(t.calls[0].url).toBe("https://api-sandbox.asaas.com/v3/payments?externalReference=pay-uuid")
    await expect(t.client.findPaymentByExternalReference("pay-uuid", opts())).resolves.toBeNull()
  })

  it("codifica os parâmetros com URLSearchParams", async () => {
    const t = setup([json({ data: [] })])
    await t.client.findPaymentByExternalReference("a b&c=d", opts())
    expect(t.calls[0].url).toBe("https://api-sandbox.asaas.com/v3/payments?externalReference=a+b%26c%3Dd")
  })

  it("GET usa o retry padrão: 503 e depois 200", async () => {
    const t = setup([json({}, 503), json({ data: [{ id: "cus_1" }] })])
    await expect(t.client.findCustomerByCpf("1", opts())).resolves.toEqual({ id: "cus_1" })
    expect(t.calls).toHaveLength(2)
  })
})

describe("asaas client: createPayment", () => {
  it("envia o body exato e mapeia a resposta", async () => {
    const t = setup([json(asaasPayment)])
    await expect(t.client.createPayment(paymentInput, opts())).resolves.toEqual(mappedPayment)
    expect(t.calls[0].url).toBe("https://api-sandbox.asaas.com/v3/payments")
    expect(t.calls[0].method).toBe("POST")
    expect(JSON.parse(t.calls[0].body!)).toEqual(paymentInput)
  })

  it("resposta sem invoiceUrl rejeita como transiente (invalid asaas response)", async () => {
    const bad = () => json({ id: "pay_1", status: "PENDING" })
    const t = setup([bad(), json({ data: [] }), bad(), json({ data: [] }), bad()])
    const err = await catchError(t.client.createPayment(paymentInput, opts()))
    expect(err.transient).toBe(true)
    expect(err.message).toBe("invalid asaas response")
  })

  it("400 rejeita como permanente, com um único POST e sem busca", async () => {
    const t = setup([json({ errors: [] }, 400)])
    const err = await catchError(t.client.createPayment(paymentInput, opts()))
    expect(err.transient).toBe(false)
    expect(err.status).toBe(400)
    expect(t.calls).toHaveLength(1)
    expect(t.calls[0].method).toBe("POST")
  })

  it("POST 503 e a busca por externalReference acha a cobrança: um único POST", async () => {
    const t = setup([json({}, 503), json({ data: [asaasPayment] })])
    await expect(t.client.createPayment(paymentInput, opts())).resolves.toEqual(mappedPayment)
    expect(t.calls.map((c) => c.method)).toEqual(["POST", "GET"])
    expect(t.calls[1].url).toBe("https://api-sandbox.asaas.com/v3/payments?externalReference=pay-uuid")
  })

  it("POST com erro de rede e a busca acha a cobrança: um único POST", async () => {
    const t = setup([new Error("boom"), json({ data: [asaasPayment] })])
    await expect(t.client.createPayment(paymentInput, opts())).resolves.toEqual(mappedPayment)
    expect(t.calls.filter((c) => c.method === "POST")).toHaveLength(1)
  })

  it("POST 503, busca vazia e segundo POST ok: dois POSTs, busca antes do segundo", async () => {
    const t = setup([json({}, 503), json({ data: [] }), json(asaasPayment)])
    await expect(t.client.createPayment(paymentInput, opts())).resolves.toEqual(mappedPayment)
    expect(t.calls.map((c) => c.method)).toEqual(["POST", "GET", "POST"])
    expect(t.sleeps).toEqual([500])
  })

  it("POST 503 três vezes com buscas vazias: rejeita transiente após exatamente 3 POSTs", async () => {
    const t = setup([json({}, 503), json({ data: [] }), json({}, 503), json({ data: [] }), json({}, 503)])
    const err = await catchError(t.client.createPayment(paymentInput, opts()))
    expect(err.transient).toBe(true)
    expect(err.status).toBe(503)
    expect(t.calls.map((c) => c.method)).toEqual(["POST", "GET", "POST", "GET", "POST"])
    expect(t.sleeps).toEqual([500, 1000])
  })

  describe("busca que falha depois de POST transiente (resultado desconhecido): nunca reenvia o POST", () => {
    const cases: Array<[string, Step[], number]> = [
      ["503 na busca (3 GETs)", [json({}, 503), json({}, 503), json({}, 503)], 3],
      ["erro de rede na busca (3 GETs)", [new Error("a"), new Error("b"), new Error("c")], 3],
      ["404 permanente na busca", [json({}, 404)], 1],
      ["data[0] malformado (sem id e sem invoiceUrl)", [json({ data: [{ status: "PENDING" }] })], 1],
      ["data[0] nulo", [json({ data: [null] })], 1],
    ]
    for (const [name, lookupSteps, gets] of cases) {
      it(name + ": um único POST e rejeita com o erro original transiente", async () => {
        const t = setup([json({ errors: ["x"] }, 503), ...lookupSteps, json(asaasPayment)])
        const err = await catchError(t.client.createPayment(paymentInput, opts()))
        expect(err.transient).toBe(true)
        expect(err.status).toBe(503)
        expect(err.message).toBe("HTTP 503")
        expect(t.calls.filter((c) => c.method === "POST")).toHaveLength(1)
        expect(t.calls.filter((c) => c.method === "GET")).toHaveLength(gets)
      })
    }
  })

  it("busca retorna { data: [] }: faz o segundo POST", async () => {
    const t = setup([json({}, 503), json({ data: [] }), json(asaasPayment)])
    await expect(t.client.createPayment(paymentInput, opts())).resolves.toEqual(mappedPayment)
    expect(t.calls.filter((c) => c.method === "POST")).toHaveLength(2)
  })

  it("deadline já vencido antes da busca: nenhuma busca nem novo POST, rejeita com o erro original", async () => {
    let clock = 1_000_000
    const t = setup([json({}, 503), json({ data: [] }), json(asaasPayment)], "sandbox", {
      now: () => clock,
      onSleep: () => {
        clock += 10_000
      },
    })
    const err = await catchError(t.client.createPayment(paymentInput, { deadline: clock + 1000 }))
    expect(err.transient).toBe(true)
    expect(err.status).toBe(503)
    expect(t.calls.map((c) => c.method)).toEqual(["POST"])
  })

  it("não passa do deadline: sem tempo para esperar, rejeita sem novo POST", async () => {
    const t = setup([json({}, 503)])
    const err = await catchError(t.client.createPayment(paymentInput, { deadline: Date.now() + 100 }))
    expect(err.transient).toBe(true)
    expect(t.calls).toHaveLength(1)
    expect(t.sleeps).toHaveLength(0)
  })
})

describe("asaas client: createCustomer", () => {
  it("envia o body e devolve { id }", async () => {
    const t = setup([json({ id: "cus_9", name: "x" })])
    await expect(t.client.createCustomer(customerInput, opts())).resolves.toEqual({ id: "cus_9" })
    expect(t.calls[0].url).toBe("https://api-sandbox.asaas.com/v3/customers")
    expect(t.calls[0].method).toBe("POST")
    expect(JSON.parse(t.calls[0].body!)).toEqual(customerInput)
  })

  it("resposta sem id rejeita como transiente", async () => {
    const t = setup([json({}), json({ data: [] }), json({}), json({ data: [] }), json({})])
    const err = await catchError(t.client.createCustomer(customerInput, opts()))
    expect(err.transient).toBe(true)
    expect(err.message).toBe("invalid asaas response")
  })

  it("POST 503 e a busca por cpfCnpj acha o cliente: um único POST", async () => {
    const t = setup([json({}, 503), json({ data: [{ id: "cus_1" }] })])
    await expect(t.client.createCustomer(customerInput, opts())).resolves.toEqual({ id: "cus_1" })
    expect(t.calls.map((c) => c.method)).toEqual(["POST", "GET"])
    expect(t.calls[1].url).toBe("https://api-sandbox.asaas.com/v3/customers?cpfCnpj=52998224725")
  })

  it("busca falha (404) depois de POST transiente: um único POST e erro original transiente", async () => {
    const t = setup([json({}, 503), json({}, 404), json({ id: "cus_9" })])
    const err = await catchError(t.client.createCustomer(customerInput, opts()))
    expect(err.transient).toBe(true)
    expect(err.status).toBe(503)
    expect(t.calls.map((c) => c.method)).toEqual(["POST", "GET"])
  })

  it("busca retorna { data: [] }: faz o segundo POST", async () => {
    const t = setup([json({}, 503), json({ data: [] }), json({ id: "cus_9" })])
    await expect(t.client.createCustomer(customerInput, opts())).resolves.toEqual({ id: "cus_9" })
    expect(t.calls.map((c) => c.method)).toEqual(["POST", "GET", "POST"])
  })

  it("400 rejeita como permanente, com um único POST e sem busca", async () => {
    const t = setup([json({ errors: [] }, 400)])
    const err = await catchError(t.client.createCustomer(customerInput, opts()))
    expect(err.transient).toBe(false)
    expect(t.calls).toHaveLength(1)
  })
})

describe("asaas client: requisições", () => {
  it("toda chamada usa redirect: error", async () => {
    const t = setup([json({ data: [] }), json({ data: [] }), json({ id: "cus_1" }), json(asaasPayment)])
    await t.client.findCustomerByCpf("1", opts())
    await t.client.findPaymentByExternalReference("r", opts())
    await t.client.createCustomer(customerInput, opts())
    await t.client.createPayment(paymentInput, opts())
    expect(t.calls).toHaveLength(4)
    expect(t.calls.every((c) => c.redirect === "error")).toBe(true)
  })

  it("corpo 200 que nunca resolve rejeita com timeout transiente e cancela o stream de verdade", async () => {
    let cancelled = false
    const stalled = new Response(
      new ReadableStream({
        start() {},
        cancel() {
          cancelled = true
        },
      }),
      { status: 200 },
    )
    const t = setup([() => stalled])
    const err = await catchError(t.client.findCustomerByCpf("1", { deadline: Date.now() + 50 }))
    expect(err.transient).toBe(true)
    expect(err.message).toContain("timeout")
    expect(cancelled).toBe(true)
  })

  it("corpo vazio ou não JSON rejeita como invalid asaas response transiente", async () => {
    for (const body of ["", "<html>oops</html>"]) {
      const t = setup([new Response(body, { status: 200 })])
      const err = await catchError(t.client.findCustomerByCpf("1", opts()))
      expect(err.transient).toBe(true)
      expect(err.message).toBe("invalid asaas response")
    }
  })

  it("lê corpo em vários chunks (UTF-8 partido entre chunks)", async () => {
    const bytes = new TextEncoder().encode(JSON.stringify({ data: [{ id: "cus_ã" }] }))
    const cut = bytes.indexOf(0xc3) + 1 // no meio do caractere "ã"
    const body = new ReadableStream<Uint8Array>({
      start(c) {
        c.enqueue(bytes.slice(0, cut))
        c.enqueue(bytes.slice(cut))
        c.close()
      },
    })
    const t = setup([new Response(body, { status: 200 })])
    await expect(t.client.findCustomerByCpf("1", opts())).resolves.toEqual({ id: "cus_ã" })
  })

  it("busca com data: [null] é resposta inválida, não 'não encontrado'", async () => {
    const t = setup([json({ data: [null] })])
    const err = await catchError(t.client.findCustomerByCpf("1", opts()))
    expect(err.message).toBe("invalid asaas response")
  })
})
