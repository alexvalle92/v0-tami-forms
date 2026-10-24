import { describe, expect, it } from "vitest"
import { createMetaCapiClient, type CapiEvent } from "@/lib/meta/capi"
import { sha256Hex } from "@/lib/meta/user-data"

const TOKEN = "tok-secreto"

const EVENT: CapiEvent = {
  event_name: "Lead",
  event_time: 1_700_000_000,
  event_id: "lead:abc",
  action_source: "website",
  event_source_url: "https://quiz.example.com/",
  user_data: { country: [sha256Hex("br")] },
}

type Call = { url: string; init: RequestInit }

function fakeFetch(respond: () => Response | Promise<Response>) {
  const calls: Call[] = []
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({ url, init })
    return respond()
  }) as unknown as typeof fetch
  return { calls, fetchImpl }
}

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } })

function client(fetchImpl: typeof fetch, over: Partial<Parameters<typeof createMetaCapiClient>[0]> = {}) {
  return createMetaCapiClient({ pixelId: "123", token: TOKEN, apiVersion: "v24.0", fetchImpl, ...over })
}

describe("createMetaCapiClient", () => {
  it("envia POST para a Graph API com o corpo da CAPI e o test_event_code", async () => {
    const f = fakeFetch(() => json(200, { events_received: 1 }))
    const result = await client(f.fetchImpl, { testEventCode: "T1" }).send([EVENT])

    expect(result).toEqual({ kind: "ok" })
    expect(f.calls).toHaveLength(1)
    expect(f.calls[0].url).toBe("https://graph.facebook.com/v24.0/123/events")
    expect(f.calls[0].init.method).toBe("POST")
    expect((f.calls[0].init.headers as Record<string, string>)["content-type"]).toBe("application/json")
    expect(JSON.parse(f.calls[0].init.body as string)).toEqual({ data: [EVENT], access_token: TOKEN, test_event_code: "T1" })
  })

  it("sem testEventCode o corpo não tem a chave test_event_code", async () => {
    const f = fakeFetch(() => json(200, {}))
    await client(f.fetchImpl).send([EVENT])
    expect(JSON.parse(f.calls[0].init.body as string)).not.toHaveProperty("test_event_code")
  })

  it("400 é fatal e a mensagem leva o status e o erro da Meta", async () => {
    const f = fakeFetch(() => json(400, { error: { message: "Invalid parameter" } }))
    const result = await client(f.fetchImpl).send([EVENT])

    expect(result).toMatchObject({ kind: "fatal", status: 400 })
    if (result.kind === "ok") throw new Error("esperava falha")
    expect(result.message).toContain("400")
    expect(result.message).toContain("Invalid parameter")
  })

  it.each([500, 503, 429])("%s é retryable", async (status) => {
    const f = fakeFetch(() => json(status, { error: { message: "tente depois" } }))
    expect(await client(f.fetchImpl).send([EVENT])).toMatchObject({ kind: "retryable", status })
  })

  it("erro de rede é retryable e sem status", async () => {
    const fetchImpl = (async () => {
      throw new Error("ECONNRESET")
    }) as unknown as typeof fetch
    const result = await client(fetchImpl).send([EVENT])
    expect(result.kind).toBe("retryable")
    expect(result).not.toHaveProperty("status")
  })

  it("timeout é retryable mesmo se o fetch ignorar o sinal de cancelamento", async () => {
    const fetchImpl = (() => new Promise(() => {})) as unknown as typeof fetch
    const result = await client(fetchImpl, { timeoutMs: 20 }).send([EVENT])
    expect(result.kind).toBe("retryable")
  })

  it("o token nunca aparece no resultado, nem quando a Meta ou a rede o repetem", async () => {
    const cases: Array<() => Response | Promise<Response>> = [
      () => json(400, { error: { message: `Invalid OAuth access token ${TOKEN}` } }),
      () => json(500, { error: { message: `falha com ${TOKEN}` } }),
      () => {
        throw new Error(`socket fechado para ${TOKEN}`)
      },
    ]
    for (const respond of cases) {
      const result = await client(fakeFetch(respond).fetchImpl).send([EVENT])
      expect(JSON.stringify(result)).not.toContain(TOKEN)
    }
  })

  it("corta a mensagem de erro da Meta em 200 caracteres", async () => {
    const f = fakeFetch(() => json(400, { error: { message: "x".repeat(1000) } }))
    const result = await client(f.fetchImpl).send([EVENT])
    if (result.kind === "ok") throw new Error("esperava falha")
    expect(result.message).toContain("x".repeat(200))
    expect(result.message).not.toContain("x".repeat(201))
  })

  it("corpo de erro que não é JSON não muda a classificação pelo status", async () => {
    const f = fakeFetch(() => new Response("<html>Bad Gateway</html>", { status: 502 }))
    expect(await client(f.fetchImpl).send([EVENT])).toMatchObject({ kind: "retryable", status: 502 })
  })
})
