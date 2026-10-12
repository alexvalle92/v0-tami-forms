import { describe, expect, it } from "vitest"
import { createNotificationsDispatchHandler } from "@/lib/http/handlers/notifications-dispatch"
import type { Logger } from "@/lib/log"

const URL_DISPATCH = "http://localhost/api/notifications/dispatch"
const TOKEN = "t".repeat(40)

type LogLine = { level: string; event: string; fields?: Record<string, unknown> }

function fakeLog(): Logger & { lines: LogLine[] } {
  const lines: LogLine[] = []
  const at = (level: string) => (event: string, fields?: Record<string, unknown>) => {
    lines.push({ level, event, fields })
  }
  return { lines, info: at("info"), warn: at("warn"), error: at("error") }
}

function setup(opts: { failOn?: string } = {}) {
  const dispatched: string[] = []
  const deferred: (() => Promise<void>)[] = []
  const log = fakeLog()
  const handler = createNotificationsDispatchHandler({
    token: TOKEN,
    dispatchNotification: async (id) => {
      dispatched.push(id)
      if (id === opts.failOn) throw new Error("boom")
      return "sent"
    },
    defer: (fn) => {
      deferred.push(fn)
    },
    log,
  })
  return { handler, dispatched, deferred, log }
}

function post(body: string, token: string | null = TOKEN): Request {
  const headers: Record<string, string> = { "content-type": "application/json" }
  if (token !== null) headers.authorization = `Bearer ${token}`
  return new Request(URL_DISPATCH, { method: "POST", headers, body })
}

describe("POST /api/notifications/dispatch", () => {
  it("sem Authorization → 401 e nada é adiado", async () => {
    const s = setup()
    const res = await s.handler(post('{"notificationIds":["a"]}', null))
    expect(res.status).toBe(401)
    expect(s.deferred).toHaveLength(0)
  })

  it("token errado → 401 e nada é adiado", async () => {
    const s = setup()
    const res = await s.handler(post('{"notificationIds":["a"]}', "x".repeat(40)))
    expect(res.status).toBe(401)
    expect(s.deferred).toHaveLength(0)
  })

  it.each([
    ["corpo ilegível", "{nao e json"],
    ["objeto vazio", "{}"],
    ["lista vazia", '{"notificationIds":[]}'],
    ["11 ids", JSON.stringify({ notificationIds: Array.from({ length: 11 }, (_, i) => `id-${i}`) })],
    ["id que não é texto", '{"notificationIds":[1]}'],
    ["chave extra", '{"notificationIds":["a"],"x":1}'],
    ["corpo acima de 4 KB", JSON.stringify({ notificationIds: ["a"], pad: "p".repeat(5000) })],
  ])("%s → 400 e nada é adiado", async (_name, body) => {
    const s = setup()
    const res = await s.handler(post(body))
    expect(res.status).toBe(400)
    expect(s.deferred).toHaveLength(0)
  })

  it("corpo válido → 202 na hora; o envio só acontece depois, em ordem", async () => {
    const s = setup()
    const res = await s.handler(post('{"notificationIds":["a","b"]}'))

    expect(res.status).toBe(202)
    expect(await res.json()).toEqual({ ok: true })
    expect(s.dispatched).toEqual([])
    expect(s.deferred).toHaveLength(1)

    await s.deferred[0]()
    expect(s.dispatched).toEqual(["a", "b"])
  })

  it("a falha de uma mensagem não impede as seguintes e vira log sem o corpo", async () => {
    const s = setup({ failOn: "a" })
    await s.handler(post('{"notificationIds":["a","b"]}'))

    await s.deferred[0]()

    expect(s.dispatched).toEqual(["a", "b"])
    const line = s.log.lines.find((l) => l.event === "notifications.dispatch.error")
    expect(line?.fields).toMatchObject({ notificationId: "a", message: "boom" })
  })
})
