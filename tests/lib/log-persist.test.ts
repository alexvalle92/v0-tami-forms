import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import type { AppLogRow } from "@/lib/db/repos/types"
import type { LogEntry } from "@/lib/log"
import { createLogPersister, NOT_PERSISTED_EVENTS, PERSISTED_INFO_EVENTS } from "@/lib/log-persist"

const entry = (level: LogEntry["level"], event: string, fields: Record<string, unknown> = {}): LogEntry => ({
  ts: new Date("2026-10-24T12:00:00.000Z"),
  level,
  event,
  fields,
})

function makeRepo(delayMs = 0) {
  const batches: AppLogRow[][] = []
  let concurrent = 0
  let maxConcurrent = 0
  const insertMany = vi.fn(async (rows: AppLogRow[]) => {
    concurrent++
    maxConcurrent = Math.max(maxConcurrent, concurrent)
    if (delayMs) await new Promise((r) => setTimeout(r, delayMs))
    batches.push(rows)
    concurrent--
  })
  return { repo: { insertMany }, insertMany, batches, maxConcurrent: () => maxConcurrent }
}

beforeEach(() => {
  vi.useFakeTimers()
})
afterEach(() => {
  vi.useRealTimers()
})

describe("createLogPersister: filtro", () => {
  it("lista os eventos info persistidos", () => {
    expect([...PERSISTED_INFO_EVENTS].sort()).toEqual(
      ["notification.dispatch.sent", "plan.generation.done", "submit.done", "webhook.asaas.received"].sort(),
    )
  })

  it("só grava info da lista; warn e error sempre", async () => {
    const { repo, batches } = makeRepo()
    const p = createLogPersister({ repo, write: vi.fn() })
    p.push(entry("info", "job.round.done"))
    p.push(entry("info", "submit.done"))
    p.push(entry("warn", "a.b"))
    p.push(entry("error", "c.d"))
    await vi.advanceTimersByTimeAsync(2000)

    expect(batches).toHaveLength(1)
    expect(batches[0].map((r) => r.event)).toEqual(["submit.done", "a.b", "c.d"])
    expect(batches[0].map((r) => r.level)).toEqual(["info", "warn", "error"])
  })

  it("lista os eventos de rate limit que nunca vão para app_logs", () => {
    expect([...NOT_PERSISTED_EVENTS].sort()).toEqual(["events.rate_limited", "submit.rate_limited"])
  })

  it("não grava warn de rate limit, mas grava outro warn", async () => {
    const { repo, insertMany, batches } = makeRepo()
    const p = createLogPersister({ repo, write: vi.fn() })
    p.push(entry("warn", "events.rate_limited"))
    p.push(entry("warn", "submit.rate_limited"))
    await vi.advanceTimersByTimeAsync(5000)
    expect(insertMany).not.toHaveBeenCalled()

    p.push(entry("warn", "payment.x"))
    await vi.advanceTimersByTimeAsync(2000)
    expect(batches).toHaveLength(1)
    expect(batches[0].map((r) => r.event)).toEqual(["payment.x"])
  })

  it("rate limit em enxurrada não ocupa o buffer", async () => {
    const { repo, batches } = makeRepo()
    const write = vi.fn()
    const p = createLogPersister({ repo, write, maxBuffer: 2 })
    for (let i = 0; i < 50; i++) p.push(entry("warn", "events.rate_limited"))
    p.push(entry("error", "payment.fail"))
    await vi.advanceTimersByTimeAsync(2000)
    expect(batches[0].map((r) => r.event)).toEqual(["payment.fail"])
    expect(write).not.toHaveBeenCalled()
  })

  it("não agenda nada quando nada é gravável", async () => {
    const { repo, insertMany } = makeRepo()
    const p = createLogPersister({ repo, write: vi.fn() })
    p.push(entry("info", "job.round.done"))
    await vi.advanceTimersByTimeAsync(5000)
    expect(insertMany).not.toHaveBeenCalled()
  })
})

describe("createLogPersister: lote", () => {
  it("três push seguidos viram um só insertMany depois de 2.000 ms, com area", async () => {
    const { repo, insertMany, batches } = makeRepo()
    const p = createLogPersister({ repo, write: vi.fn() })
    p.push(entry("error", "payment.sync.failed", { id: 1 }))
    p.push(entry("warn", "plan.x"))
    p.push(entry("warn", "semponto"))

    await vi.advanceTimersByTimeAsync(1999)
    expect(insertMany).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)

    expect(insertMany).toHaveBeenCalledTimes(1)
    expect(batches[0][0]).toEqual({
      ts: new Date("2026-10-24T12:00:00.000Z"),
      level: "error",
      event: "payment.sync.failed",
      area: "payment",
      fields: { id: 1 },
    })
    expect(batches[0][1].area).toBe("plan")
    expect(batches[0][2].area).toBe("semponto")
  })

  it("250 linhas viram lotes de 100, 100 e 50, nunca dois ao mesmo tempo", async () => {
    const { repo, batches, maxConcurrent } = makeRepo(3000)
    const p = createLogPersister({ repo, write: vi.fn() })
    for (let i = 0; i < 250; i++) p.push(entry("warn", "a.b", { i }))

    await vi.advanceTimersByTimeAsync(60_000)

    expect(batches.map((b) => b.length)).toEqual([100, 100, 50])
    expect(maxConcurrent()).toBe(1)
  })

  it("flush chamado durante outro flush não grava em paralelo", async () => {
    const { repo, batches, maxConcurrent } = makeRepo(100)
    const p = createLogPersister({ repo, write: vi.fn() })
    for (let i = 0; i < 150; i++) p.push(entry("warn", "a.b"))

    const first = p.flush()
    const second = p.flush()
    await vi.advanceTimersByTimeAsync(10_000)
    await Promise.all([first, second])

    expect(maxConcurrent()).toBe(1)
    expect(batches.map((b) => b.length)).toEqual([100, 50])
  })
})

describe("createLogPersister: buffer cheio", () => {
  it("descarta o excedente e avisa uma vez no flush seguinte", async () => {
    const { repo, batches } = makeRepo()
    const write = vi.fn()
    const p = createLogPersister({ repo, write, maxBuffer: 3 })
    for (let i = 0; i < 5; i++) p.push(entry("warn", "a.b", { i }))

    await vi.advanceTimersByTimeAsync(2000)

    expect(batches).toHaveLength(1)
    expect(batches[0]).toHaveLength(3)
    expect(write).toHaveBeenCalledTimes(1)
    expect(JSON.parse(write.mock.calls[0][0])).toMatchObject({
      level: "warn",
      event: "log.persist_dropped",
      dropped: 2,
    })

    // contador zerado: o próximo flush não repete o aviso
    p.push(entry("warn", "a.b"))
    await vi.advanceTimersByTimeAsync(2000)
    expect(batches).toHaveLength(2)
    expect(write).toHaveBeenCalledTimes(1)
  })
})

describe("createLogPersister: falha do repo", () => {
  it("escreve log.persist_failed direto no write e não realimenta o buffer", async () => {
    const insertMany = vi.fn().mockRejectedValue(new Error("db fora do ar"))
    const write = vi.fn()
    const p = createLogPersister({ repo: { insertMany }, write })
    p.push(entry("error", "a.b"))
    p.push(entry("error", "a.c"))

    await vi.advanceTimersByTimeAsync(2000)

    expect(insertMany).toHaveBeenCalledTimes(1)
    expect(write).toHaveBeenCalledTimes(1)
    const line = JSON.parse(write.mock.calls[0][0])
    expect(line).toMatchObject({ level: "error", event: "log.persist_failed", dropped: 2, message: "db fora do ar" })
    expect(typeof line.ts).toBe("string")

    // nada novo no buffer: nenhum outro flush agendado
    await vi.advanceTimersByTimeAsync(10_000)
    expect(insertMany).toHaveBeenCalledTimes(1)
  })

  it("flush nunca rejeita, nem quando o repo rejeita um valor que não é Error", async () => {
    const insertMany = vi.fn().mockRejectedValue("texto")
    const write = vi.fn()
    const p = createLogPersister({ repo: { insertMany }, write })
    p.push(entry("error", "a.b"))
    await expect(p.flush()).resolves.toBeUndefined()
    expect(JSON.parse(write.mock.calls[0][0]).message).toBe("texto")
  })

  it("agenda outro flush quando sobra linha depois de uma falha", async () => {
    const insertMany = vi.fn().mockRejectedValueOnce(new Error("x")).mockResolvedValue(undefined)
    const p = createLogPersister({ repo: { insertMany }, write: vi.fn(), batchSize: 2 })
    for (let i = 0; i < 3; i++) p.push(entry("warn", "a.b"))

    await vi.advanceTimersByTimeAsync(4000)
    expect(insertMany).toHaveBeenCalledTimes(2)
    expect(insertMany.mock.calls[1][0]).toHaveLength(1)
  })
})

describe("createLogPersister: timer", () => {
  it("usa o setTimer injetado e o intervalMs, um só por vez", () => {
    const setTimer = vi.fn((_fn: () => void, _ms: number) => ({}))
    const p = createLogPersister({ repo: makeRepo().repo, write: vi.fn(), setTimer, intervalMs: 500 })
    p.push(entry("warn", "a.b"))
    p.push(entry("warn", "a.b"))
    expect(setTimer).toHaveBeenCalledTimes(1)
    expect(setTimer).toHaveBeenCalledWith(expect.any(Function), 500)
  })

  it("se o setTimer lançar, o próximo push tenta agendar de novo", () => {
    const setTimer = vi
      .fn((_fn: () => void, _ms: number): unknown => ({}))
      .mockImplementationOnce(() => {
        throw new Error("sem timer")
      })
    const p = createLogPersister({ repo: makeRepo().repo, write: vi.fn(), setTimer })
    expect(() => p.push(entry("warn", "a.b"))).not.toThrow()
    p.push(entry("warn", "a.b"))
    expect(setTimer).toHaveBeenCalledTimes(2)
  })

  it("o timer padrão não segura o processo (unref)", () => {
    const unref = vi.fn()
    const spy = vi.spyOn(globalThis, "setTimeout").mockImplementation((() => ({ unref })) as never)
    const p = createLogPersister({ repo: makeRepo().repo, write: vi.fn() })
    p.push(entry("warn", "a.b"))
    expect(unref).toHaveBeenCalled()
    spy.mockRestore()
  })
})
