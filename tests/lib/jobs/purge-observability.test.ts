import { describe, expect, it, vi } from "vitest"
import {
  APP_LOG_RETENTION_DAYS,
  createPurgeObservability,
  FUNNEL_RETENTION_DAYS,
  PURGE_BATCH,
} from "@/lib/jobs/purge-observability"

const DAY_MS = 24 * 60 * 60 * 1000
const NOW = new Date("2026-10-24T12:00:00.000Z")

describe("createPurgeObservability", () => {
  it("usa as constantes de retenção do spec", () => {
    expect(FUNNEL_RETENTION_DAYS).toBe(365)
    expect(APP_LOG_RETENTION_DAYS).toBe(90)
    expect(PURGE_BATCH).toBe(1000)
  })

  it("apaga o funil com mais de 365 dias e os logs com mais de 90, em lotes de 1.000, e soma", async () => {
    const analytics = { purgeOlderThan: vi.fn(async (_c: Date, _l: number) => 5) }
    const appLogs = { purgeOlderThan: vi.fn(async (_c: Date, _l: number) => 2) }
    const purge = createPurgeObservability({ analytics, appLogs, now: () => NOW })

    expect(await purge()).toBe(7)

    expect(analytics.purgeOlderThan).toHaveBeenCalledTimes(1)
    expect(analytics.purgeOlderThan).toHaveBeenCalledWith(new Date(NOW.getTime() - 365 * DAY_MS), 1000)
    expect(appLogs.purgeOlderThan).toHaveBeenCalledTimes(1)
    expect(appLogs.purgeOlderThan).toHaveBeenCalledWith(new Date(NOW.getTime() - 90 * DAY_MS), 1000)
  })

  it("aceita um limite de lote diferente", async () => {
    const analytics = { purgeOlderThan: vi.fn(async (_c: Date, _l: number) => 0) }
    const appLogs = { purgeOlderThan: vi.fn(async (_c: Date, _l: number) => 0) }
    await createPurgeObservability({ analytics, appLogs, now: () => NOW, limit: 10 })()

    expect(analytics.purgeOlderThan).toHaveBeenCalledWith(expect.any(Date), 10)
    expect(appLogs.purgeOlderThan).toHaveBeenCalledWith(expect.any(Date), 10)
  })

  it("rejeita se a limpeza do funil falha", async () => {
    const analytics = {
      purgeOlderThan: vi.fn(async (_c: Date, _l: number): Promise<number> => {
        throw new Error("db down")
      }),
    }
    const appLogs = { purgeOlderThan: vi.fn(async (_c: Date, _l: number) => 0) }

    await expect(createPurgeObservability({ analytics, appLogs, now: () => NOW })()).rejects.toThrow("db down")
  })

  it("rejeita se a limpeza dos logs falha", async () => {
    const analytics = { purgeOlderThan: vi.fn(async (_c: Date, _l: number) => 0) }
    const appLogs = {
      purgeOlderThan: vi.fn(async (_c: Date, _l: number): Promise<number> => {
        throw new Error("db down")
      }),
    }

    await expect(createPurgeObservability({ analytics, appLogs, now: () => NOW })()).rejects.toThrow("db down")
  })
})
