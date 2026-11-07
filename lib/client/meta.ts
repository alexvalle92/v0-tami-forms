// Pixel da Meta no navegador. Módulo sem React, que nunca lança: o quiz não pode depender do rastreamento,
// então toda função exportada fica dentro de try/catch. Cada evento sai duas vezes, com o mesmo `eventID`
// para a Meta deduplicar: pelo `fbq` e, como espelho, para POST /api/meta/events (que fala com a API de
// Conversões). O `fbq` e o snippet são injetados no <head> por components/meta-pixel-head.tsx; sem
// `window.__TF_META__` nada aqui faz coisa alguma. Tudo que toca o navegador entra por injeção, para os testes.

import { getTracker } from "@/lib/client/track"
import {
  EVENT_ID_PREFIX,
  FBC_RE,
  FBP_RE,
  type BrowserEventName,
  type SubmitMetaInput,
} from "@/lib/meta/shared"

export const META_SENT_KEY = "tf_meta_sent"
export const META_FBC_KEY = "tf_meta_fbc"

const DEFAULT_ENDPOINT = "/api/meta/events"
const MAX_COOKIE_VALUE = 500
// O fbclid entra no fbc (até 500 caracteres no servidor): o prefixo `fb.1.<ms>.` ocupa menos de 20.
const FBCLID_RE = /^[A-Za-z0-9_-]{1,400}$/

export type MetaConfig = { pixelId: string; value: string }
export type MetaUser = { email?: string; phone?: string; name?: string }

export type Meta = {
  /** Ponto único que decide se rastreia. Hoje é "o Pixel foi configurado"; o consentimento entra aqui. */
  trackingAllowed(): boolean
  /** Dispara o evento (uma vez por sessão) no Pixel e no espelho do servidor. */
  event(name: BrowserEventName, opts: { user?: MetaUser }): void
  /** Atribuição para o envio do quiz, ou `undefined` com o rastreamento desligado. */
  attributionForSubmit(): SubmitMetaInput | undefined
}

export type MetaDeps = {
  config?: MetaConfig | null
  sessionId?: string
  /** `document.cookie`. */
  cookie?: string
  /** `location.search`. */
  search?: string
  /** `location.href`. */
  href?: string
  storage?: Pick<Storage, "getItem" | "setItem"> | null
  fbq?: ((...args: unknown[]) => void) | null
  fetchImpl?: typeof fetch
  sendBeacon?: ((url: string, data: Blob) => boolean) | null
  nowMs?: () => number
  endpoint?: string
}

declare global {
  interface Window {
    __TF_META__?: MetaConfig
    fbq?: (...args: unknown[]) => void
  }
}

function readCookie(cookie: string, name: string): string | undefined {
  for (const part of cookie.split(";")) {
    const at = part.indexOf("=")
    if (at < 0 || part.slice(0, at).trim() !== name) continue
    const raw = part.slice(at + 1).trim()
    try {
      return decodeURIComponent(raw)
    } catch {
      return raw
    }
  }
  return undefined
}

const valid = (value: string | undefined, re: RegExp): string | undefined =>
  value && value.length <= MAX_COOKIE_VALUE && re.test(value) ? value : undefined

const text = (value: string | undefined): string | undefined => {
  const v = value?.trim()
  return v ? v : undefined
}

export function createMeta(d: MetaDeps): Meta {
  // Lê as dependências a cada uso (não na criação): o navegador só tem `fbq` e o config depois do snippet.
  const safe = <T>(read: () => T, fallback: T): T => {
    try {
      return read()
    } catch {
      return fallback
    }
  }
  const config = () => safe(() => d.config ?? null, null)
  const sessionId = () => safe(() => d.sessionId ?? "", "")
  const endpoint = () => d.endpoint ?? DEFAULT_ENDPOINT

  const sentInMemory = new Set<string>()

  function trackingAllowed(): boolean {
    return !!config()?.pixelId
  }

  function alreadySent(eventId: string): boolean {
    if (sentInMemory.has(eventId)) return true
    try {
      const raw = d.storage?.getItem(META_SENT_KEY)
      const list: unknown = raw ? JSON.parse(raw) : []
      return Array.isArray(list) && list.includes(eventId)
    } catch {
      return false
    }
  }

  function markSent(eventId: string): void {
    sentInMemory.add(eventId)
    try {
      const raw = d.storage?.getItem(META_SENT_KEY)
      const parsed: unknown = raw ? JSON.parse(raw) : []
      const list = Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []
      d.storage?.setItem(META_SENT_KEY, JSON.stringify([...list, eventId]))
    } catch {
      // storage bloqueado: a deduplicação vale só na memória desta página
    }
  }

  function readFbp(): string | undefined {
    return valid(readCookie(safe(() => d.cookie ?? "", ""), "_fbp"), FBP_RE)
  }

  // Cookie do Pixel; sem ele, o valor montado do fbclid da URL (guardado, porque o fbclid só está na
  // primeira página). Um fbclid novo na mesma sessão substitui o guardado.
  function readFbc(): string | undefined {
    const fromCookie = valid(readCookie(safe(() => d.cookie ?? "", ""), "_fbc"), FBC_RE)
    if (fromCookie) return fromCookie

    let stored: string | undefined
    try {
      stored = valid(d.storage?.getItem(META_FBC_KEY) ?? undefined, FBC_RE)
    } catch {
      stored = undefined
    }

    const fbclid = safe(() => new URLSearchParams(d.search ?? "").get("fbclid"), null)
    if (!fbclid || !FBCLID_RE.test(fbclid)) return stored
    if (stored?.endsWith(`.${fbclid}`)) return stored

    const built = `fb.1.${(d.nowMs ?? Date.now)()}.${fbclid}`
    try {
      d.storage?.setItem(META_FBC_KEY, built)
    } catch {
      // storage bloqueado: vale só neste carregamento
    }
    return built
  }

  function mirror(name: BrowserEventName, eventId: string, user: MetaUser | undefined, sid: string): void {
    const payload: Record<string, string> = {
      eventName: name,
      eventId,
      eventSourceUrl: safe(() => d.href ?? "", ""),
      externalId: sid,
    }
    const extras: Record<string, string | undefined> = {
      fbp: readFbp(),
      fbc: readFbc(),
      email: text(user?.email),
      phone: text(user?.phone),
      name: text(user?.name),
    }
    for (const [key, value] of Object.entries(extras)) if (value) payload[key] = value
    const body = JSON.stringify(payload)

    try {
      if (d.sendBeacon && d.sendBeacon(endpoint(), new Blob([body], { type: "application/json" }))) return
    } catch {
      // cai para o fetch com keepalive
    }
    try {
      const fetchImpl = d.fetchImpl ?? fetch
      Promise.resolve(
        fetchImpl(endpoint(), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body,
          keepalive: true,
        }),
      ).catch(() => {
        // erro de rede: o Pixel já cobre
      })
    } catch {
      // fetch lançou de forma síncrona: idem
    }
  }

  return {
    trackingAllowed,

    event(name, opts) {
      try {
        const cfg = config()
        const sid = sessionId()
        if (!cfg?.pixelId || !sid) return
        const eventId = `${EVENT_ID_PREFIX[name]}:${sid}`
        if (alreadySent(eventId)) return
        markSent(eventId)

        try {
          const fbq = safe(() => d.fbq ?? null, null)
          if (typeof fbq === "function") {
            const customData = name === "InitiateCheckout" ? { value: Number(cfg.value), currency: "BRL" } : {}
            fbq("track", name, customData, { eventID: eventId })
          }
        } catch {
          // Pixel com defeito: o espelho no servidor ainda sai
        }
        mirror(name, eventId, opts.user, sid)
      } catch {
        // o rastreamento nunca quebra o quiz
      }
    },

    attributionForSubmit() {
      try {
        if (!trackingAllowed()) return undefined
        const out: SubmitMetaInput = {}
        const fbp = readFbp()
        const fbc = readFbc()
        if (fbp) out.fbp = fbp
        if (fbc) out.fbc = fbc
        const href = safe(() => d.href ?? "", "")
        if (href) out.eventSourceUrl = href
        const sid = sessionId()
        if (sid) out.externalId = sid
        return out
      } catch {
        return undefined
      }
    },
  }
}

const NOOP_META: Meta = { trackingAllowed: () => false, event() {}, attributionForSubmit: () => undefined }

let browserMeta: Meta | null = null

// Pixel único do navegador. Fora dele (SSR, testes) não faz nada, então importar é seguro.
export function getMeta(): Meta {
  if (typeof window === "undefined") return NOOP_META
  if (browserMeta) return browserMeta
  try {
    let storage: MetaDeps["storage"] = null
    try {
      storage = window.sessionStorage
    } catch {
      // acesso bloqueado
    }
    const nav = window.navigator
    browserMeta = createMeta({
      get config() {
        return window.__TF_META__ ?? null
      },
      get sessionId() {
        return getTracker().sessionId
      },
      get cookie() {
        return window.document.cookie
      },
      get search() {
        return window.location.search
      },
      get href() {
        return window.location.href
      },
      get fbq() {
        return typeof window.fbq === "function" ? window.fbq : null
      },
      storage,
      fetchImpl: (...args) => window.fetch(...args),
      sendBeacon: typeof nav?.sendBeacon === "function" ? (url, data) => nav.sendBeacon(url, data) : null,
    })
    return browserMeta
  } catch {
    return NOOP_META
  }
}
