import type { AppLogRepo, AppLogRow } from "@/lib/db/repos/types"
import type { LogEntry } from "@/lib/log"

/** Eventos info que também vão para app_logs: os denominadores da taxa de falha (spec §8.2). */
export const PERSISTED_INFO_EVENTS: ReadonlySet<string> = new Set([
  "submit.done",
  "webhook.asaas.received",
  "plan.generation.done",
  "notification.dispatch.sent",
])

/**
 * Eventos que só vão para o stdout: rate limit é ruído sob enxurrada e encheria o buffer,
 * derrubando os warn e error de verdade (pagamento, notificação, plano).
 */
export const NOT_PERSISTED_EVENTS: ReadonlySet<string> = new Set(["events.rate_limited", "submit.rate_limited"])

const AREA_MAX = 40

type Deps = {
  repo: Pick<AppLogRepo, "insertMany">
  /** Escrita direta (stdout). O persister nunca usa o logger: uma falha aqui não pode gerar mais logs gravados. */
  write: (line: string) => void
  setTimer?: (fn: () => void, ms: number) => unknown
  intervalMs?: number
  batchSize?: number
  maxBuffer?: number
}

/** `setTimeout` que não segura o processo vivo só por causa de um flush pendente. */
function defaultSetTimer(fn: () => void, ms: number): unknown {
  const timer = setTimeout(fn, ms)
  if (typeof timer === "object" && timer !== null && "unref" in timer) timer.unref()
  return timer
}

export function createLogPersister(d: Deps): { push(entry: LogEntry): void; flush(): Promise<void> } {
  const setTimer = d.setTimer ?? defaultSetTimer
  const intervalMs = d.intervalMs ?? 2000
  const batchSize = d.batchSize ?? 100
  const maxBuffer = d.maxBuffer ?? 1000

  const buffer: AppLogRow[] = []
  let dropped = 0
  let scheduled = false
  let inFlight: Promise<void> | null = null

  const writeLine = (level: "warn" | "error", event: string, fields: Record<string, unknown>) => {
    try {
      d.write(JSON.stringify({ ...fields, ts: new Date().toISOString(), level, event }))
    } catch {
      // sem saída para reportar; o importante é nunca lançar
    }
  }

  const schedule = () => {
    if (scheduled) return
    scheduled = true
    try {
      setTimer(() => {
        scheduled = false
        void flush()
      }, intervalMs)
    } catch {
      // sem timer agora; o próximo push tenta de novo
      scheduled = false
    }
  }

  async function run(): Promise<void> {
    if (dropped > 0) {
      writeLine("warn", "log.persist_dropped", { dropped })
      dropped = 0
    }
    const batch = buffer.splice(0, batchSize)
    if (batch.length > 0) {
      try {
        await d.repo.insertMany(batch)
      } catch (err) {
        writeLine("error", "log.persist_failed", {
          dropped: batch.length,
          message: err instanceof Error ? err.message : String(err),
        })
      }
    }
    if (buffer.length > 0) schedule()
  }

  /** Um lote por chamada; se sobrar linha, agenda o próximo. Nunca rejeita e nunca roda dois ao mesmo tempo. */
  function flush(): Promise<void> {
    if (inFlight) return inFlight
    inFlight = run()
      .catch(() => {})
      .finally(() => {
        inFlight = null
      })
    return inFlight
  }

  function push(entry: LogEntry): void {
    if (NOT_PERSISTED_EVENTS.has(entry.event)) return
    if (entry.level === "info" && !PERSISTED_INFO_EVENTS.has(entry.event)) return
    if (buffer.length >= maxBuffer) {
      dropped++
      return
    }
    buffer.push({
      ts: entry.ts,
      level: entry.level,
      event: entry.event,
      area: entry.event.split(".")[0].slice(0, AREA_MAX),
      fields: entry.fields,
    })
    schedule()
  }

  return { push, flush }
}
