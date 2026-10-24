// Nomes, formatos e tipos do rastreamento da Meta compartilhados entre o navegador e o servidor.
// Sem zod e sem módulos do Node: o bundle do quiz importa este arquivo.

export const BROWSER_EVENT_NAMES = ["ViewContent", "Lead", "InitiateCheckout"] as const
export type BrowserEventName = (typeof BROWSER_EVENT_NAMES)[number]

/** Prefixo do `event_id` de cada evento do navegador: `<prefixo>:<sessionId>`. */
export const EVENT_ID_PREFIX: Record<BrowserEventName, "vc" | "lead" | "ic"> = {
  ViewContent: "vc",
  Lead: "lead",
  InitiateCheckout: "ic",
}

/** Formatos dos cookies da Meta: `fb.<subdomínio>.<ms>.<id>`. */
export const FBP_RE = /^fb\.\d\.\d+\.\d+$/
export const FBC_RE = /^fb\.\d\.\d+\..+$/

/** Evento do navegador espelhado em `POST /api/meta/events`. */
export type BrowserMetaEvent = {
  eventName: BrowserEventName
  eventId: string
  eventSourceUrl: string
  externalId?: string
  fbp?: string
  fbc?: string
  email?: string
  phone?: string
  name?: string
}

/** Atribuição que o navegador manda junto com o envio do quiz. */
export type SubmitMetaInput = {
  externalId?: string
  fbp?: string
  fbc?: string
  eventSourceUrl?: string
}
