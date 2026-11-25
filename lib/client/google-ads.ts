// Tag do Google Ads no navegador. Módulo sem React, que nunca lança: o quiz não pode depender do rastreamento,
// então toda função exportada fica dentro de try/catch. Faz duas coisas:
//  1. Guarda o identificador do clique no anúncio (gclid, ou gbraid/wbraid no iOS), que só está na URL da
//     primeira página, para mandá-lo no envio do quiz. É ele que liga o Purchase do servidor ao anúncio.
//  2. Dispara as conversões de Lead e InitiateCheckout pelo gtag, uma vez por sessão.
// O gtag e o config são injetados no <head> por components/google-ads-tag-head.tsx; sem `window.__TF_GADS__`
// nada aqui faz coisa alguma. Tudo que toca o navegador entra por injeção, para os testes.

import { getTracker } from "@/lib/client/track"
import type { GoogleAdsBrowserConfig } from "@/lib/google-ads/head-scripts"
import {
  CLICK_ID_RE,
  GOOGLE_ADS_CLICK_PARAMS,
  GOOGLE_ADS_TRANSACTION_PREFIX,
  type GoogleAdsBrowserConversion,
  type SubmitGoogleAdsInput,
} from "@/lib/google-ads/shared"

export const GADS_SENT_KEY = "tf_gads_sent"
export const GADS_CLICK_KEY = "tf_gads_click"

export type GoogleAds = {
  /** Ponto único que decide se rastreia. Hoje é "a tag foi configurada"; o consentimento entra aqui. */
  trackingAllowed(): boolean
  /** Lê o identificador de clique da URL e o guarda para as etapas seguintes. Chamar ao abrir o quiz. */
  captureClick(): void
  /** Dispara a conversão (uma vez por sessão), se ela tiver rótulo configurado. */
  conversion(name: GoogleAdsBrowserConversion): void
  /** Identificadores de clique para o envio do quiz, ou `undefined` sem rastreamento ou sem clique. */
  attributionForSubmit(): SubmitGoogleAdsInput | undefined
}

export type GoogleAdsDeps = {
  config?: GoogleAdsBrowserConfig | null
  sessionId?: string
  /** `document.cookie`. */
  cookie?: string
  /** `location.search`. */
  search?: string
  storage?: Pick<Storage, "getItem" | "setItem"> | null
  gtag?: ((...args: unknown[]) => void) | null
}

declare global {
  interface Window {
    __TF_GADS__?: GoogleAdsBrowserConfig
    gtag?: (...args: unknown[]) => void
  }
}

function readCookie(cookie: string, name: string): string | undefined {
  for (const part of cookie.split(";")) {
    const at = part.indexOf("=")
    if (at < 0 || part.slice(0, at).trim() !== name) continue
    return part.slice(at + 1).trim()
  }
  return undefined
}

/** Cookies do vinculador de conversões do Google: `GCL.<segundos>.<id>`. */
function fromGclCookie(value: string | undefined): string | undefined {
  const id = value?.split(".").slice(2).join(".")
  return id && CLICK_ID_RE.test(id) ? id : undefined
}

function onlyValid(raw: unknown): SubmitGoogleAdsInput {
  const out: SubmitGoogleAdsInput = {}
  if (typeof raw !== "object" || raw === null) return out
  for (const key of GOOGLE_ADS_CLICK_PARAMS) {
    const v = (raw as Record<string, unknown>)[key]
    if (typeof v === "string" && CLICK_ID_RE.test(v)) out[key] = v
  }
  return out
}

const isEmpty = (ids: SubmitGoogleAdsInput) => Object.keys(ids).length === 0

export function createGoogleAds(d: GoogleAdsDeps): GoogleAds {
  // Lê as dependências a cada uso (não na criação): o navegador só tem o config depois do snippet.
  const safe = <T>(read: () => T, fallback: T): T => {
    try {
      return read()
    } catch {
      return fallback
    }
  }
  const config = () => safe(() => d.config ?? null, null)
  const sessionId = () => safe(() => d.sessionId ?? "", "")

  const sentInMemory = new Set<string>()
  let clickInMemory: SubmitGoogleAdsInput = {}

  function trackingAllowed(): boolean {
    return !!config()?.tagId
  }

  function fromUrl(): SubmitGoogleAdsInput {
    const params = safe(() => new URLSearchParams(d.search ?? ""), new URLSearchParams())
    const raw: Record<string, string> = {}
    for (const key of GOOGLE_ADS_CLICK_PARAMS) {
      const v = params.get(key)
      if (v) raw[key] = v
    }
    return onlyValid(raw)
  }

  function fromStorage(): SubmitGoogleAdsInput {
    if (!isEmpty(clickInMemory)) return clickInMemory
    try {
      const raw = d.storage?.getItem(GADS_CLICK_KEY)
      return raw ? onlyValid(JSON.parse(raw)) : {}
    } catch {
      return {}
    }
  }

  function fromCookies(): SubmitGoogleAdsInput {
    const cookie = safe(() => d.cookie ?? "", "")
    const out: SubmitGoogleAdsInput = {}
    const gclid = fromGclCookie(readCookie(cookie, "_gcl_aw"))
    const gbraid = fromGclCookie(readCookie(cookie, "_gcl_gb"))
    if (gclid) out.gclid = gclid
    if (gbraid) out.gbraid = gbraid
    return out
  }

  // Ordem: URL (clique de agora) > guardado nesta sessão > cookies do gtag (clique de outra visita, até 90 dias).
  // Um clique novo na URL substitui o guardado por inteiro, para não misturar ids de cliques diferentes.
  function readClick(): SubmitGoogleAdsInput {
    const url = fromUrl()
    if (!isEmpty(url)) {
      clickInMemory = url
      try {
        d.storage?.setItem(GADS_CLICK_KEY, JSON.stringify(url))
      } catch {
        // storage bloqueado: vale só na memória desta página
      }
      return url
    }
    const stored = fromStorage()
    return isEmpty(stored) ? fromCookies() : stored
  }

  function alreadySent(id: string): boolean {
    if (sentInMemory.has(id)) return true
    try {
      const raw = d.storage?.getItem(GADS_SENT_KEY)
      const list: unknown = raw ? JSON.parse(raw) : []
      return Array.isArray(list) && list.includes(id)
    } catch {
      return false
    }
  }

  function markSent(id: string): void {
    sentInMemory.add(id)
    try {
      const raw = d.storage?.getItem(GADS_SENT_KEY)
      const parsed: unknown = raw ? JSON.parse(raw) : []
      const list = Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === "string") : []
      d.storage?.setItem(GADS_SENT_KEY, JSON.stringify([...list, id]))
    } catch {
      // storage bloqueado: a deduplicação vale só na memória desta página
    }
  }

  return {
    trackingAllowed,

    captureClick() {
      try {
        if (trackingAllowed()) readClick()
      } catch {
        // o rastreamento nunca quebra o quiz
      }
    },

    conversion(name) {
      try {
        const cfg = config()
        const sid = sessionId()
        if (!cfg?.tagId || !sid) return
        const label = name === "Lead" ? cfg.leadLabel : cfg.checkoutLabel
        if (!label) return
        // O transaction_id deduplica no Google se a mesma sessão disparar de novo (outra aba, recarga).
        const transactionId = `${GOOGLE_ADS_TRANSACTION_PREFIX[name]}:${sid}`
        if (alreadySent(transactionId)) return
        const gtag = safe(() => d.gtag ?? null, null)
        if (typeof gtag !== "function") return
        markSent(transactionId)

        const params: Record<string, unknown> = { send_to: `${cfg.tagId}/${label}`, transaction_id: transactionId }
        if (name === "InitiateCheckout") {
          params.value = Number(cfg.value)
          params.currency = "BRL"
        }
        gtag("event", "conversion", params)
      } catch {
        // o rastreamento nunca quebra o quiz
      }
    },

    attributionForSubmit() {
      try {
        if (!trackingAllowed()) return undefined
        const ids = readClick()
        return isEmpty(ids) ? undefined : ids
      } catch {
        return undefined
      }
    },
  }
}

const NOOP_GOOGLE_ADS: GoogleAds = {
  trackingAllowed: () => false,
  captureClick() {},
  conversion() {},
  attributionForSubmit: () => undefined,
}

let browserGoogleAds: GoogleAds | null = null

// Instância única do navegador. Fora dele (SSR, testes) não faz nada, então importar é seguro.
export function getGoogleAds(): GoogleAds {
  if (typeof window === "undefined") return NOOP_GOOGLE_ADS
  if (browserGoogleAds) return browserGoogleAds
  try {
    let storage: GoogleAdsDeps["storage"] = null
    try {
      storage = window.sessionStorage
    } catch {
      // acesso bloqueado
    }
    browserGoogleAds = createGoogleAds({
      get config() {
        return window.__TF_GADS__ ?? null
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
      get gtag() {
        return typeof window.gtag === "function" ? window.gtag : null
      },
      storage,
    })
    return browserGoogleAds
  } catch {
    return NOOP_GOOGLE_ADS
  }
}
