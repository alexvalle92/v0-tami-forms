// Rastreador do funil no navegador. Módulo sem React, que nunca lança: o quiz não pode depender
// do rastreamento, então toda função exportada fica dentro de try/catch. Os eventos entram numa
// fila (máx. 100) e saem em lote, no máximo a cada 1 s, para POST /api/events. Erro de rede
// descarta o lote, sem nova tentativa. Tudo que toca o navegador entra por injeção, para os testes.

import type { FunnelEvent, FunnelEventInput, Utm } from "@/lib/analytics/events"
import { newSubmissionId } from "@/lib/client/submit-quiz"

export const TRACK_SESSION_KEY = "tf_session_id"
export const TRACK_FLUSH_DELAY_MS = 1000
export const TRACK_MAX_QUEUE = 100
export const TRACK_MAX_PER_REQUEST = 25
// O servidor aceita 16 KB (16 * 1024); a folga cobre qualquer diferença de medida.
export const TRACK_MAX_BYTES = 15_000

const DEFAULT_ENDPOINT = "/api/events"

export type Tracker = {
  readonly sessionId: string
  track(e: FunnelEventInput): void
  flush(opts?: { beacon?: boolean }): void
}

export type TrackerDeps = {
  storage?: Pick<Storage, "getItem" | "setItem"> | null
  fetchImpl?: typeof fetch
  sendBeacon?: ((url: string, data: Blob) => boolean) | null
  now?: () => Date
  setTimer?: (fn: () => void, ms: number) => unknown
  search?: string
  referrer?: string
  ownHost?: string
  viewport?: { w: number; h: number } | null
  endpoint?: string
}

const UTM_PARAMS = [
  ["utm_source", "source"],
  ["utm_medium", "medium"],
  ["utm_campaign", "campaign"],
  ["utm_content", "content"],
  ["utm_term", "term"],
] as const satisfies ReadonlyArray<readonly [string, keyof Utm]>

function readUtm(search: string): Utm {
  const utm: Utm = {}
  try {
    const params = new URLSearchParams(search)
    for (const [param, key] of UTM_PARAMS) {
      const value = params.get(param)
      if (value) utm[key] = value
    }
  } catch {
    // sem utm
  }
  return utm
}

function readReferrerHost(referrer: string, ownHost: string): string | undefined {
  if (!referrer) return undefined
  try {
    const host = new URL(referrer).host
    if (!host || host === ownHost) return undefined
    return host
  } catch {
    return undefined
  }
}

// Tamanho em bytes UTF-8 (é o que o servidor mede no corpo, não o número de caracteres).
function utf8Length(s: string): number {
  let bytes = 0
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x80) bytes += 1
    else if (c < 0x800) bytes += 2
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length) {
      bytes += 4
      i++
    } else bytes += 3
  }
  return bytes
}

function readOrCreateSessionId(storage: TrackerDeps["storage"]): { id: string; created: boolean } {
  try {
    const stored = storage?.getItem(TRACK_SESSION_KEY)
    if (stored) return { id: stored, created: false }
  } catch {
    // storage bloqueado: o id vive só na memória desta página
  }
  const id = newSubmissionId()
  try {
    storage?.setItem(TRACK_SESSION_KEY, id)
  } catch {
    // idem
  }
  return { id, created: true }
}

export function createTracker(d: TrackerDeps = {}): Tracker {
  const {
    storage = null,
    sendBeacon = null,
    now = () => new Date(),
    setTimer = (fn: () => void, ms: number) => setTimeout(fn, ms),
    search = "",
    referrer = "",
    ownHost = "",
    viewport = null,
    endpoint = DEFAULT_ENDPOINT,
  } = d

  const queue: FunnelEvent[] = []
  let timerPending = false
  let sessionId = ""

  function post(body: string, keepalive: boolean): void {
    try {
      const fetchImpl = d.fetchImpl ?? fetch
      const init: RequestInit = { method: "POST", headers: { "Content-Type": "application/json" }, body }
      if (keepalive) init.keepalive = true
      Promise.resolve(fetchImpl(endpoint, init)).catch(() => {
        // erro de rede: o lote é descartado
      })
    } catch {
      // fetch lançou de forma síncrona: idem
    }
  }

  function send(body: string, beacon: boolean): void {
    if (beacon && sendBeacon) {
      try {
        if (sendBeacon(endpoint, new Blob([body], { type: "application/json" }))) return
      } catch {
        // cai para o fetch com keepalive
      }
    }
    post(body, beacon)
  }

  // Cada corpo respeita TRACK_MAX_BYTES e TRACK_MAX_PER_REQUEST. O corpo é montado com os eventos
  // já serializados, o que dá o mesmo texto de JSON.stringify({ sessionId, events }).
  function flush(opts?: { beacon?: boolean }): void {
    try {
      const beacon = opts?.beacon === true
      const events = queue.splice(0, queue.length)
      if (events.length === 0) return

      const prefix = `{"sessionId":${JSON.stringify(sessionId)},"events":[`
      const suffix = "]}"
      const overhead = utf8Length(prefix) + utf8Length(suffix)

      let batch: string[] = []
      let bytes = overhead
      const emit = () => {
        if (batch.length === 0) return
        send(prefix + batch.join(",") + suffix, beacon)
        batch = []
        bytes = overhead
      }

      for (const event of events) {
        let json: string
        try {
          json = JSON.stringify(event)
        } catch {
          continue
        }
        const size = utf8Length(json)
        if (overhead + size > TRACK_MAX_BYTES) continue // sozinho já não cabe: descartado
        const extra = size + (batch.length > 0 ? 1 : 0) // a vírgula
        if (batch.length >= TRACK_MAX_PER_REQUEST || bytes + extra > TRACK_MAX_BYTES) emit()
        bytes += size + (batch.length > 0 ? 1 : 0)
        batch.push(json)
      }
      emit()
    } catch {
      // o rastreamento nunca quebra o quiz
    }
  }

  function schedule(): void {
    if (timerPending) return
    timerPending = true
    try {
      setTimer(() => {
        timerPending = false
        flush()
      }, TRACK_FLUSH_DELAY_MS)
    } catch {
      timerPending = false
    }
  }

  function enqueue(e: FunnelEventInput): void {
    try {
      if (!e || typeof e !== "object") return
      queue.push({ ...e, ts: now().toISOString() } as FunnelEvent)
      while (queue.length > TRACK_MAX_QUEUE) queue.shift()
      schedule()
    } catch {
      // evento perdido, sem efeito no quiz
    }
  }

  const session = readOrCreateSessionId(storage)
  sessionId = session.id

  if (session.created) {
    const start: FunnelEventInput = { event: "session_start", utm: readUtm(search) }
    const referrerHost = readReferrerHost(referrer, ownHost)
    if (referrerHost) start.referrerHost = referrerHost
    if (viewport) start.viewport = { w: viewport.w, h: viewport.h }
    enqueue(start)
  }

  return {
    get sessionId() {
      return sessionId
    },
    track: enqueue,
    flush,
  }
}

const NOOP_TRACKER: Tracker = { sessionId: "", track() {}, flush() {} }

let browserTracker: Tracker | null = null

// Rastreador único do navegador. Fora dele (SSR, testes) não faz nada, então importar é seguro.
export function getTracker(): Tracker {
  if (typeof window === "undefined") return NOOP_TRACKER
  if (browserTracker) return browserTracker
  try {
    let storage: TrackerDeps["storage"] = null
    try {
      storage = window.sessionStorage
    } catch {
      // acesso bloqueado
    }
    const nav = window.navigator
    browserTracker = createTracker({
      storage,
      fetchImpl: (...args) => window.fetch(...args),
      sendBeacon: typeof nav?.sendBeacon === "function" ? (url, data) => nav.sendBeacon(url, data) : null,
      search: window.location.search,
      referrer: window.document.referrer,
      ownHost: window.location.host,
      viewport: { w: Math.round(window.innerWidth), h: Math.round(window.innerHeight) },
    })
    return browserTracker
  } catch {
    return NOOP_TRACKER
  }
}
