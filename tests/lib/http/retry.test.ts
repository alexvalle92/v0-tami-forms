import { describe, expect, it } from "vitest"
import { HttpError, fetchWithRetry } from "@/lib/http/retry"

type Step = Response | Error

function setup(steps: Step[]) {
  const queue = [...steps]
  const sleeps: number[] = []
  let calls = 0
  const fetchImpl = (async () => {
    calls++
    const next = queue.shift()
    if (!next) throw new Error("fila de respostas vazia")
    if (next instanceof Error) throw next
    return next
  }) as typeof fetch
  const sleep = async (ms: number) => {
    sleeps.push(ms)
  }
  return {
    sleeps,
    calls: () => calls,
    opts: { fetchImpl, sleep, random: () => 0.5 },
  }
}

const res = (status: number, body = "") => new Response(body, { status })

async function catchError(promise: Promise<unknown>): Promise<HttpError> {
  try {
    await promise
  } catch (err) {
    expect(err).toBeInstanceOf(HttpError)
    return err as HttpError
  }
  throw new Error("esperava rejeição")
}

describe("fetchWithRetry", () => {
  it("repete 503 e resolve no 200, esperando 500 e 1000 ms", async () => {
    const t = setup([res(503), res(503), res(200, "ok")])
    const response = await fetchWithRetry("https://x.test", {}, t.opts)
    expect(response.status).toBe(200)
    expect(await response.text()).toBe("ok")
    expect(t.calls()).toBe(3)
    expect(t.sleeps).toEqual([500, 1000])
  })

  it("não repete 4xx: lança HttpError permanente com o corpo", async () => {
    const t = setup([res(400, '{"errors":[{"code":"invalid_cpfCnpj"}]}')])
    const err = await catchError(fetchWithRetry("https://x.test", {}, t.opts))
    expect(err.transient).toBe(false)
    expect(err.status).toBe(400)
    expect(err.body).toContain("invalid_cpfCnpj")
    expect(t.calls()).toBe(1)
    expect(t.sleeps).toEqual([])
  })

  it("trunca o corpo do erro em 2048 caracteres", async () => {
    const t = setup([res(422, "a".repeat(5000))])
    const err = await catchError(fetchWithRetry("https://x.test", {}, t.opts))
    expect(err.body).toHaveLength(2048)
  })

  it("esgota as tentativas em 429 e lança erro transitório", async () => {
    const t = setup([res(429), res(429), res(429)])
    const err = await catchError(fetchWithRetry("https://x.test", {}, t.opts))
    expect(err.transient).toBe(true)
    expect(err.status).toBe(429)
    expect(t.calls()).toBe(3)
    expect(t.sleeps).toEqual([500, 1000])
  })

  it("repete após erro de rede", async () => {
    const t = setup([new TypeError("fetch failed"), res(200)])
    const response = await fetchWithRetry("https://x.test", {}, t.opts)
    expect(response.status).toBe(200)
    expect(t.calls()).toBe(2)
  })

  it("esgota as tentativas em erro de rede com HttpError transitório", async () => {
    const t = setup([new TypeError("fetch failed"), new TypeError("fetch failed"), new TypeError("fetch failed")])
    const err = await catchError(fetchWithRetry("https://x.test", {}, t.opts))
    expect(err.transient).toBe(true)
    expect(err.status).toBeUndefined()
    expect(t.calls()).toBe(3)
  })

  it("aborta por timeout com HttpError transitório", async () => {
    let calls = 0
    const fetchImpl = ((_url: string, init?: RequestInit) => {
      calls++
      return new Promise((_resolve, reject) => {
        init?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")))
      })
    }) as unknown as typeof fetch
    const err = await catchError(
      fetchWithRetry("https://x.test", {}, { fetchImpl, timeoutMs: 20, attempts: 1 }),
    )
    expect(err.transient).toBe(true)
    expect(err.message).toContain("timeout")
    expect(calls).toBe(1)
  })

  it("lança 'deadline exceeded' sem chamar o fetch quando o deadline já passou", async () => {
    const t = setup([res(200)])
    const err = await catchError(
      fetchWithRetry("https://x.test", {}, { ...t.opts, deadline: Date.now() - 1 }),
    )
    expect(err.transient).toBe(true)
    expect(err.message).toContain("deadline exceeded")
    expect(t.calls()).toBe(0)
  })

  it("não espera além do deadline: lança 'deadline exceeded' sem nova chamada", async () => {
    const t = setup([res(503), res(200)])
    const err = await catchError(
      fetchWithRetry("https://x.test", {}, { ...t.opts, now: () => 1000, deadline: 1300 }),
    )
    expect(err.message).toContain("deadline exceeded")
    expect(err.transient).toBe(true)
    expect(t.calls()).toBe(1)
    expect(t.sleeps).toEqual([])
  })
})
