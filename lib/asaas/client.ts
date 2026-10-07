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
 * Lê e interpreta o JSON de uma resposta 2xx sob timeout: o fetchWithRetry já
 * limpou o timer da tentativa, então um servidor que trava o corpo ficaria pendurado.
 */
async function readJson(response: Response, deadline: number): Promise<unknown> {
  const limit = Math.max(0, Math.min(BODY_TIMEOUT_MS, deadline - Date.now()))
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new HttpError(`timeout reading body after ${limit}ms`, { transient: true })), limit)
  })
  const parsing = response.json() as Promise<unknown>
  parsing.catch(() => {}) // evita rejeição não tratada se o timeout vencer a corrida
  try {
    return await Promise.race([parsing, timeout])
  } catch (err) {
    if (err instanceof HttpError) {
      try {
        await response.body?.cancel()
      } catch {
        // ignorado
      }
      throw err
    }
    throw invalidResponse()
  } finally {
    clearTimeout(timer)
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

function firstOfList(raw: unknown): unknown | null {
  if (!isRecord(raw) || !Array.isArray(raw.data)) throw invalidResponse()
  return raw.data[0] ?? null
}

export function createAsaasClient(cfg: {
  env: "sandbox" | "production"
  apiKey: string
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}): AsaasClient {
  const baseUrl = BASE_URLS[cfg.env]
  const sleep = cfg.sleep ?? defaultSleep
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
      { deadline: o.deadline, fetchImpl: cfg.fetchImpl, sleep, attempts },
    )
    return readJson(response, o.deadline)
  }

  async function findCustomerByCpf(cpf: string, o: CallOpts) {
    const qs = new URLSearchParams({ cpfCnpj: cpf })
    const first = firstOfList(await request(`/customers?${qs}`, { method: "GET" }, o))
    return first === null ? null : toCustomer(first)
  }

  async function findPaymentByExternalReference(ref: string, o: CallOpts) {
    const qs = new URLSearchParams({ externalReference: ref })
    const first = firstOfList(await request(`/payments?${qs}`, { method: "GET" }, o))
    return first === null ? null : toPayment(first)
  }

  /**
   * POST não é repetido às cegas: depois de uma falha transiente, a busca diz se o recurso
   * já foi criado (a resposta pode ter se perdido) antes de enviar o POST de novo.
   */
  async function createOnce<T>(
    post: () => Promise<T>,
    lookup: () => Promise<T | null>,
    o: CallOpts,
  ): Promise<T> {
    let lastError: HttpError | undefined
    for (let i = 0; i < POST_ATTEMPTS; i++) {
      try {
        return await post()
      } catch (err) {
        if (!(err instanceof HttpError) || !err.transient) throw err
        lastError = err
      }
      if (i === POST_ATTEMPTS - 1) break

      const delay = BASE_DELAY_MS * 2 ** i * (0.8 + 0.4 * Math.random())
      if (Date.now() + delay > o.deadline) throw new HttpError("deadline exceeded", { transient: true })
      await sleep(delay)

      try {
        const existing = await lookup()
        if (existing !== null) return existing
      } catch (err) {
        // falha transiente na busca não mascara o erro original: segue para o próximo POST
        if (!(err instanceof HttpError) || !err.transient) throw err
      }
    }
    throw lastError ?? new HttpError("no attempts made", { transient: true })
  }

  return {
    findCustomerByCpf,
    findPaymentByExternalReference,
    createCustomer: (i, o) =>
      createOnce(
        async () => toCustomer(await request("/customers", { method: "POST", body: JSON.stringify(i) }, o, 1)),
        () => findCustomerByCpf(i.cpfCnpj, o),
        o,
      ),
    createPayment: (i, o) =>
      createOnce(
        async () => toPayment(await request("/payments", { method: "POST", body: JSON.stringify(i) }, o, 1)),
        () => findPaymentByExternalReference(i.externalReference, o),
        o,
      ),
  }
}
