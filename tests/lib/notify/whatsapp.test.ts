import { describe, expect, it } from "vitest"
import { createEvolutionWhatsAppSender } from "@/lib/notify/whatsapp"
import { HttpError } from "@/lib/http/retry"

type Call = { url: string; method?: string; headers: Record<string, string>; body?: string; redirect?: string }

function setup(responses: Response[]) {
  const queue = [...responses]
  const calls: Call[] = []
  const fetchImpl = (async (url: string, init: RequestInit) => {
    calls.push({
      url,
      method: init.method,
      headers: init.headers as Record<string, string>,
      body: init.body as string | undefined,
      redirect: init.redirect,
    })
    const next = queue.shift()
    if (!next) throw new Error("fila de respostas vazia")
    return next
  }) as unknown as typeof fetch
  const sender = createEvolutionWhatsAppSender({
    baseUrl: "https://evo.example",
    apiKey: "segredo",
    instance: "Suporte Nutri Tamili Valle",
    fetchImpl,
    sleep: async () => {},
  })
  return { sender, calls }
}

describe("createEvolutionWhatsAppSender", () => {
  it("faz POST com apikey e body { number, text }", async () => {
    const { sender, calls } = setup([new Response('{"ok":true}', { status: 201 })])
    await sender.sendText("5544991651250", "oi")

    expect(calls).toHaveLength(1)
    expect(calls[0].url).toBe("https://evo.example/message/sendText/Suporte%20Nutri%20Tamili%20Valle")
    expect(calls[0].method).toBe("POST")
    expect(calls[0].headers.apikey).toBe("segredo")
    expect(calls[0].redirect).toBe("error")
    expect(JSON.parse(calls[0].body as string)).toEqual({ number: "5544991651250", text: "oi" })
  })

  it("rejeita com HttpError não transiente em 400", async () => {
    const { sender, calls } = setup([new Response("bad", { status: 400 })])
    const err = await sender.sendText("5544991651250", "oi").catch((e) => e)
    expect(err).toBeInstanceOf(HttpError)
    expect(err.transient).toBe(false)
    expect(calls).toHaveLength(1)
  })

  it("repete em 5xx e entrega na tentativa seguinte", async () => {
    const { sender, calls } = setup([new Response("x", { status: 503 }), new Response("{}", { status: 200 })])
    await sender.sendText("5544991651250", "oi")
    expect(calls).toHaveLength(2)
  })
})
