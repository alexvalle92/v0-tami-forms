import { describe, expect, it, vi } from "vitest"
import type { Channel } from "@/lib/db/repos/types"
import { createEnqueueExpiryReminders, REMINDER_HOURS } from "@/lib/jobs/expiry-reminders"
import type { Logger } from "@/lib/log"

const CHANNELS: Channel[] = ["email", "whatsapp"]

function setup(nowIso: string, count = 2) {
  const now = new Date(nowIso)
  const enqueuePlanExpiring = vi.fn(async (_d: { today: string; channels: Channel[]; now: Date }) => count)
  const log: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const enqueue = createEnqueueExpiryReminders({
    notifications: { enqueuePlanExpiring },
    channels: CHANNELS,
    now: () => now,
    log,
  })
  return { now, enqueuePlanExpiring, log, enqueue }
}

describe("createEnqueueExpiryReminders", () => {
  it("a janela é de 9h às 20h (exclusivo) no horário de São Paulo", () => {
    expect(REMINDER_HOURS).toEqual({ from: 9, to: 20 })
  })

  it("antes das 9h devolve 0 e não toca o repositório", async () => {
    const s = setup("2026-10-12T11:59:00Z") // 8h59 em São Paulo

    expect(await s.enqueue()).toBe(0)

    expect(s.enqueuePlanExpiring).not.toHaveBeenCalled()
    expect(s.log.info).not.toHaveBeenCalled()
  })

  it("às 9h00 enfileira com o dia de São Paulo, os canais e o agora", async () => {
    const s = setup("2026-10-12T12:00:00Z") // 9h00

    expect(await s.enqueue()).toBe(2)

    expect(s.enqueuePlanExpiring).toHaveBeenCalledTimes(1)
    expect(s.enqueuePlanExpiring).toHaveBeenCalledWith({ today: "2026-10-12", channels: CHANNELS, now: s.now })
  })

  it("às 19h59 ainda enfileira", async () => {
    const s = setup("2026-10-12T22:59:00Z")

    expect(await s.enqueue()).toBe(2)

    expect(s.enqueuePlanExpiring).toHaveBeenCalledTimes(1)
  })

  it("às 20h00 não enfileira", async () => {
    const s = setup("2026-10-12T23:00:00Z")

    expect(await s.enqueue()).toBe(0)

    expect(s.enqueuePlanExpiring).not.toHaveBeenCalled()
  })

  it("registra job.reminders.enqueued com a contagem quando criou linhas", async () => {
    const s = setup("2026-10-12T15:00:00Z", 2)

    await s.enqueue()

    expect(s.log.info).toHaveBeenCalledWith("job.reminders.enqueued", { count: 2 })
  })

  it("não registra nada quando o resultado é 0", async () => {
    const s = setup("2026-10-12T15:00:00Z", 0)

    expect(await s.enqueue()).toBe(0)

    expect(s.enqueuePlanExpiring).toHaveBeenCalledTimes(1)
    expect(s.log.info).not.toHaveBeenCalled()
  })
})
