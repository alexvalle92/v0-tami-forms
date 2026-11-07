// Leitura dos dados que o navegador manda para a Meta (espelho dos eventos e atribuição do envio do quiz).
// Vem da internet: nunca lança. Campo opcional inválido vira ausente; só o que identifica o evento derruba.

import { z } from "zod"
import {
  BROWSER_EVENT_NAMES,
  EVENT_ID_PREFIX,
  FBC_RE,
  FBP_RE,
  type BrowserMetaEvent,
  type SubmitMetaInput,
} from "./shared"

export * from "./shared"

const UUID = z.string().uuid()

// URL de anúncio com UTMs dinâmicas passa de 500 caracteres com facilidade: rejeitar derrubaria o evento
// justamente do público que veio do anúncio. Aceita até 2.000 e guarda os primeiros 500 (o tamanho das colunas).
const MAX_URL_KEPT = 500
const httpUrl = z
  .string()
  .max(2000)
  .url()
  .refine((v) => /^https?:\/\//i.test(v))
  .transform((v) => v.slice(0, MAX_URL_KEPT))

// Opcional que, se inválido, é tratado como ausente (mesmo padrão do `optionalText` do webhook do Asaas).
const lenient = <T extends z.ZodTypeAny>(schema: T) => schema.optional().catch(undefined)

const fbp = z.string().max(500).regex(FBP_RE)
const fbc = z.string().max(500).regex(FBC_RE)

const browserEventSchema = z
  .object({
    eventName: z.enum(BROWSER_EVENT_NAMES),
    eventId: z.string(),
    eventSourceUrl: httpUrl,
    externalId: lenient(UUID),
    fbp: lenient(fbp),
    fbc: lenient(fbc),
    email: lenient(z.string().email().max(254)),
    phone: lenient(z.string().min(1).max(20)),
    name: lenient(z.string().min(1).max(200)),
  })
  .refine((e) => {
    const [prefix, id, ...rest] = e.eventId.split(":")
    return rest.length === 0 && prefix === EVENT_ID_PREFIX[e.eventName] && UUID.safeParse(id).success
  })

const submitMetaSchema = z.object({
  externalId: lenient(UUID),
  fbp: lenient(fbp),
  fbc: lenient(fbc),
  eventSourceUrl: lenient(httpUrl),
})

function withoutUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, v]) => v !== undefined)) as T
}

export function parseBrowserMetaEvent(body: unknown): BrowserMetaEvent | null {
  try {
    const parsed = browserEventSchema.safeParse(body)
    return parsed.success ? withoutUndefined(parsed.data) : null
  } catch {
    return null
  }
}

export function parseSubmitMeta(raw: unknown): SubmitMetaInput | undefined {
  try {
    if (typeof raw !== "object" || raw === null || Array.isArray(raw)) return undefined
    const parsed = submitMetaSchema.safeParse(raw)
    if (!parsed.success) return undefined
    const meta = withoutUndefined(parsed.data)
    return Object.keys(meta).length > 0 ? meta : undefined
  } catch {
    return undefined
  }
}
