import { afterEach, describe, expect, it, vi } from "vitest"
import { createExclusiveRunner, startScheduler } from "@/lib/jobs/scheduler"
import type { Logger } from "@/lib/log"

const makeLog = (): Logger => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })

function deferred() {
  let resolve!: () => void
  const promise = new Promise<void>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

describe("createExclusiveRunner", () => {
  it("duas chamadas concorrentes com fn lento -> ['ran', 'skipped']", async () => {
    const gate = deferred()
    const fn = vi.fn(() => gate.promise)
    const run = createExclusiveRunner(fn)

    const first = run()
    const second = run()
    gate.resolve()

    expect(await Promise.all([first, second])).toEqual(["ran", "skipped"])
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it("depois que a execução termina, a próxima chamada roda de novo", async () => {
    const fn = vi.fn(async () => {})
    const run = createExclusiveRunner(fn)
    expect(await run()).toBe("ran")
    expect(await run()).toBe("ran")
    expect(fn).toHaveBeenCalledTimes(2)
  })

  it("libera a trava quando fn rejeita (e propaga o erro)", async () => {
    const fn = vi.fn<() => Promise<void>>().mockRejectedValueOnce(new Error("boom")).mockResolvedValue(undefined)
    const run = createExclusiveRunner(fn)
    await expect(run()).rejects.toThrow("boom")
    expect(await run()).toBe("ran")
  })

  it("execução travada além de maxRunMs: a próxima chamada roda ('ran') e loga o aviso", async () => {
    let clock = 1_000
    const log = makeLog()
    const fn = vi.fn(() => new Promise<void>(() => {})) // nunca termina
    const run = createExclusiveRunner(fn, { maxRunMs: 600_000, now: () => clock, log })

    void run()
    expect(fn).toHaveBeenCalledTimes(1)

    clock += 599_999
    expect(await run()).toBe("skipped")
    expect(fn).toHaveBeenCalledTimes(1)

    clock += 1 // exatamente maxRunMs: ainda não passou
    expect(await run()).toBe("skipped")

    clock += 1
    void run()
    expect(fn).toHaveBeenCalledTimes(2)
    expect(log.warn).toHaveBeenCalledWith("job.runner.stale_run_released", { elapsedMs: 600_001 })
  })

  it("a promessa abandonada que termina depois não libera a trava da execução nova", async () => {
    let clock = 0
    const stale = deferred()
    const fresh = deferred()
    const fn = vi.fn<() => Promise<void>>().mockReturnValueOnce(stale.promise).mockReturnValueOnce(fresh.promise)
    const run = createExclusiveRunner(fn, { maxRunMs: 1000, now: () => clock })

    const staleRun = run()
    clock = 2000
    const freshRun = run() // abandona a velha e começa a nova
    expect(fn).toHaveBeenCalledTimes(2)

    stale.resolve()
    expect(await staleRun).toBe("ran")
    // A nova ainda está em andamento: a velha terminar não pode ter limpado a trava.
    expect(await run()).toBe("skipped")
    expect(fn).toHaveBeenCalledTimes(2)

    fresh.resolve()
    expect(await freshRun).toBe("ran")
    expect(await run()).toBe("ran")
  })
})

describe("startScheduler", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("roda a cada intervalo (não no início) e para após stop()", async () => {
    vi.useFakeTimers()
    const run = vi.fn(async () => {})
    const scheduler = startScheduler({ run, intervalMs: 120_000, log: makeLog() })

    expect(run).toHaveBeenCalledTimes(0)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(run).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(120_000)
    expect(run).toHaveBeenCalledTimes(2)

    scheduler.stop()
    await vi.advanceTimersByTimeAsync(120_000)
    expect(run).toHaveBeenCalledTimes(2)
  })

  it("stop() é idempotente", () => {
    vi.useFakeTimers()
    const scheduler = startScheduler({ run: async () => {}, intervalMs: 1000, log: makeLog() })
    scheduler.stop()
    expect(() => scheduler.stop()).not.toThrow()
    expect(vi.getTimerCount()).toBe(0)
  })

  it("sobrevive a um run que rejeita ou lança: loga mensagem segura e segue rodando", async () => {
    vi.useFakeTimers()
    const log = makeLog()
    const run = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValueOnce(new Error("falhou para ana@gmail.com 44991651250"))
      .mockImplementationOnce(() => {
        throw new Error("lançou na hora")
      })
      .mockResolvedValue(undefined)
    const scheduler = startScheduler({ run, intervalMs: 1000, log })

    await vi.advanceTimersByTimeAsync(3000)

    expect(run).toHaveBeenCalledTimes(3)
    expect(log.error).toHaveBeenCalledTimes(2)
    const logged = JSON.stringify((log.error as ReturnType<typeof vi.fn>).mock.calls)
    expect(logged).toContain("job.scheduler.run_failed")
    expect(logged).toContain("lançou na hora")
    expect(logged).not.toContain("ana@gmail.com")
    expect(logged).not.toContain("44991651250")
    scheduler.stop()
  })

  it("o timer não mantém o processo vivo (unref)", () => {
    vi.useFakeTimers()
    const unref = vi.fn()
    const realSetInterval = globalThis.setInterval
    const spy = vi.spyOn(globalThis, "setInterval").mockImplementation(((fn: () => void, ms: number) => {
      const t = realSetInterval(fn, ms)
      return Object.assign(t, { unref })
    }) as unknown as typeof setInterval)

    const scheduler = startScheduler({ run: async () => {}, intervalMs: 1000, log: makeLog() })

    expect(unref).toHaveBeenCalledTimes(1)
    scheduler.stop()
    spy.mockRestore()
  })
})
