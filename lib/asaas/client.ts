import { HttpError, fetchWithRetry } from "@/lib/http/retry"

export type AsaasPayment = {
  id: string
  status: string
  invoiceUrl: string
  invoiceNumber: string | null
  billingType: string | null
  dueDate: string
}

export type CreateCustomerInput = {
  name: string
  cpfCnpj: string
  email: string
  mobilePhone: string
  externalReference: string
}

export type CreatePaymentInput = {
  customer: string
  billingType: "UNDEFINED"
  value: number
  dueDate: string
  description: string
  externalReference: string
  callback: { successUrl: string }
}

export type CallOpts = { deadline: number }

export interface AsaasClient {
  findCustomerByCpf(cpf: string, o: CallOpts): Promise<{ id: string } | null>
  createCustomer(i: CreateCustomerInput, o: CallOpts): Promise<{ id: string }>
  findPaymentByExternalReference(ref: string, o: CallOpts): Promise<AsaasPayment | null>
  createPayment(i: CreatePaymentInput, o: CallOpts): Promise<AsaasPayment>
}

const BASE_URLS = {
  sandbox: "https://api-sandbox.asaas.com/v3",
  production: "https://api.asaas.com/v3",
} as const

const BODY_TIMEOUT_MS = 8000
const POST_ATTEMPTS = 3
const BASE_DELAY_MS = 500

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

const invalidResponse = () => new HttpError("invalid asaas response", { transient: true })

/**
 * Lê e interpreta o JSON de uma resposta 2xx sob timeout: o fetchWithRetry já limpou o timer
 * da tentativa, então um servidor que trava o corpo ficaria pendurado. Lê pelo reader para
 * poder cancelar o stream de verdade (json() o trava e o cancel() de body falharia).
 */
async function readJson(response: Response, deadline: number, now: () => number): Promise<unknown> {
  const reader = response.body?.getReader()
  if (!reader) throw invalidResponse() // corpo vazio

  const limit = Math.max(0, Math.min(BODY_TIMEOUT_MS, deadline - now()))
  const decoder = new TextDecoder()
  const reading = (async () => {
    let text = ""
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      text += decoder.decode(value, { stream: true })
    }
    return text + decoder.decode()
  })()
  reading.catch(() => {}) // evita rejeição não tratada se o timeout vencer a corrida

  let timer: ReturnType<typeof setTimeout> | undefined
  let text: string
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new HttpError(`timeout reading body after ${limit}ms`, { transient: true })),
        limit,
      )
    })
    text = await Promise.race([reading, timeout])
  } catch (err) {
    reader.cancel().catch(() => {}) // não espera: a fonte pode demorar a responder
    if (err instanceof HttpError) throw err
    throw invalidResponse()
  } finally {
    clearTimeout(timer)
  }

  try {
    return JSON.parse(text)
  } catch {
    throw invalidResponse()
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null

function toCustomer(raw: unknown): { id: string } {
  if (!isRecord(raw) || typeof raw.id !== "string" || raw.id === "") throw invalidResponse()
  return { id: raw.id }
}

function toPayment(raw: unknown): AsaasPayment {
  if (
    !isRecord(raw) ||
    typeof raw.id !== "string" ||
    raw.id === "" ||
    typeof raw.invoiceUrl !== "string" ||
    raw.invoiceUrl === ""
  ) {
    throw invalidResponse()
  }
  return {
    id: raw.id,
    status: typeof raw.status === "string" ? raw.status : "",
    invoiceUrl: raw.invoiceUrl,
    invoiceNumber: typeof raw.invoiceNumber === "string" ? raw.invoiceNumber : null,
    billingType: typeof raw.billingType === "string" ? raw.billingType : null,
    dueDate: typeof raw.dueDate === "string" ? raw.dueDate : "",
  }
}

/** Lista vazia = "não encontrado" (null); um primeiro item nulo é resposta inválida, validada por quem converte. */
function firstOfList(raw: unknown): { item: unknown } | null {
  if (!isRecord(raw) || !Array.isArray(raw.data)) throw invalidResponse()
  return raw.data.length === 0 ? null : { item: raw.data[0] }
}

export function createAsaasClient(cfg: {
  env: "sandbox" | "production"
  apiKey: string
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  random?: () => number
  now?: () => number
}): AsaasClient {
  const baseUrl = BASE_URLS[cfg.env]
  const sleep = cfg.sleep ?? defaultSleep
  const random = cfg.random ?? Math.random
  const now = cfg.now ?? Date.now
  const headers = {
    access_token: cfg.apiKey,
    "Content-Type": "application/json",
    "User-Agent": "tami-forms",
  }

  async function request(
    path: string,
    init: { method: "GET" | "POST"; body?: string },
    o: CallOpts,
    attempts?: number,
  ): Promise<unknown> {
    const response = await fetchWithRetry(
      `${baseUrl}${path}`,
      { ...init, headers, redirect: "error" },
      { deadline: o.deadline, fetchImpl: cfg.fetchImpl, sleep, random, now, attempts },
    )
    return readJson(response, o.deadline, now)
  }

  async function findCustomerByCpf(cpf: string, o: CallOpts) {
    const qs = new URLSearchParams({ cpfCnpj: cpf })
    const first = firstOfList(await request(`/customers?${qs}`, { method: "GET" }, o))
    return first === null ? null : toCustomer(first.item)
  }

  async function findPaymentByExternalReference(ref: string, o: CallOpts) {
    const qs = new URLSearchParams({ externalReference: ref })
    const first = firstOfList(await request(`/payments?${qs}`, { method: "GET" }, o))
    return first === null ? null : toPayment(first.item)
  }

  /**
   * POST com recuperação: nunca é repetido às cegas. Depois de uma falha transiente espera o
   * backoff e consulta o recurso (a resposta pode ter se perdido):
   *  - achou: devolve, sem novo POST;
   *  - não achou (lista vazia): tenta o próximo POST;
   *  - a busca falhou (resultado desconhecido): para e lança o erro transiente original do POST,
   *    para que quem chamou resolva depois, sem arriscar duplicar a criação.
   */
  async function postWithRecovery<T>(
    post: () => Promise<T>,
    lookup: () => Promise<T | null>,
    o: CallOpts,
  ): Promise<T> {
    for (let i = 0; ; i++) {
      try {
        return await post()
      } catch (err) {
        if (!(err instanceof HttpError) || !err.transient || i === POST_ATTEMPTS - 1) throw err

        const delay = BASE_DELAY_MS * 2 ** i * (0.8 + 0.4 * random())
        if (now() + delay > o.deadline) throw new HttpError("deadline exceeded", { transient: true })
        await sleep(delay)

        let existing: T | null
        try {
          existing = await lookup()
        } catch {
          throw err
        }
        if (existing !== null) return existing
      }
    }
  }

  return {
    findCustomerByCpf,
    findPaymentByExternalReference,
    createCustomer: (i, o) =>
      postWithRecovery(
        async () => toCustomer(await request("/customers", { method: "POST", body: JSON.stringify(i) }, o, 1)),
        () => findCustomerByCpf(i.cpfCnpj, o),
        o,
      ),
    createPayment: (i, o) =>
      postWithRecovery(
        async () => toPayment(await request("/payments", { method: "POST", body: JSON.stringify(i) }, o, 1)),
        () => findPaymentByExternalReference(i.externalReference, o),
        o,
      ),
  }
}
