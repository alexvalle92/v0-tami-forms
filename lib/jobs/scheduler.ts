import type { Logger } from "@/lib/log"
import { safeErrorMessage } from "@/lib/services/last-error"

const DEFAULT_MAX_RUN_MS = 600_000

/**
 * Impede execuções sobrepostas de `fn`: com uma em andamento, devolve "skipped". Se a execução em
 * andamento passou de `maxRunMs` (a promessa nunca resolveu, p.ex. chamada de rede travada), a próxima
 * chamada a abandona e começa uma nova: o job de fundo nunca fica preso para sempre. A promessa
 * abandonada, ao terminar, não mexe na trava da execução mais nova (cada execução tem seu id).
 */
export function createExclusiveRunner(
  fn: () => Promise<unknown>,
  opts: { maxRunMs?: number; now?: () => number; log?: Logger } = {},
): () => Promise<"ran" | "skipped"> {
  const maxRunMs = opts.maxRunMs ?? DEFAULT_MAX_RUN_MS
  const now = opts.now ?? Date.now
  let current: { id: number; startedAt: number } | null = null
  let nextId = 0

  return async function run() {
    const at = now()
    if (current) {
      const elapsedMs = at - current.startedAt
      if (elapsedMs <= maxRunMs) return "skipped"
      opts.log?.warn("job.runner.stale_run_released", { elapsedMs })
    }
    const mine = { id: ++nextId, startedAt: at }
    current = mine
    try {
      await fn()
      return "ran"
    } finally {
      if (current?.id === mine.id) current = null
    }
  }
}

/** Chama `run` a cada `intervalMs` (a primeira vez após o primeiro intervalo). Erros de `run` são logados e nunca param o agendador. */
export function startScheduler(d: {
  run: () => Promise<unknown>
  intervalMs: number
  log: Logger
}): { stop(): void } {
  async function tick() {
    try {
      await d.run()
    } catch (err) {
      d.log.error("job.scheduler.run_failed", { message: safeErrorMessage(err) })
    }
  }

  let timer: ReturnType<typeof setInterval> | null = setInterval(() => void tick(), d.intervalMs)
  // Nunca mantém o processo vivo só por causa do agendador.
  ;(timer as { unref?: () => void }).unref?.()

  return {
    stop() {
      if (timer === null) return
      clearInterval(timer)
      timer = null
    },
  }
}
