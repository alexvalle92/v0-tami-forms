// `user_data` da API de Conversões da Meta. Função pura: normaliza como a Meta exige e aplica SHA-256 nos
// campos pessoais. IP, User-Agent, fbp e fbc vão sem hash. O CPF não entra aqui de propósito.

import { createHash } from "node:crypto"

export type UserDataInput = {
  email?: string | null
  phone?: string | null
  name?: string | null
  externalId?: string | null
  ip?: string | null
  userAgent?: string | null
  fbp?: string | null
  fbc?: string | null
}

export type CapiUserData = {
  em?: [string]
  ph?: [string]
  fn?: [string]
  ln?: [string]
  external_id?: [string]
  country: [string]
  client_ip_address?: string
  client_user_agent?: string
  fbp?: string
  fbc?: string
}

export function sha256Hex(value: string): string {
  return createHash("sha256").update(value, "utf8").digest("hex")
}

function clean(value: string | null | undefined): string {
  return (value ?? "").trim()
}

function normalizePhone(raw: string | null | undefined): string | null {
  const digits = clean(raw).replace(/\D/g, "")
  if (digits.length === 10 || digits.length === 11) return `55${digits}`
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return digits
  return null
}

function nameParts(raw: string | null | undefined): { first: string; last: string | null } | null {
  const words = clean(raw)
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .split(/\s+/)
    .filter(Boolean)
  if (words.length === 0) return null
  return { first: words[0], last: words.length > 1 ? words[words.length - 1] : null }
}

export function buildUserData(input: UserDataInput): CapiUserData {
  const out: CapiUserData = { country: [sha256Hex("br")] }

  const email = clean(input.email).toLowerCase()
  if (email) out.em = [sha256Hex(email)]

  const phone = normalizePhone(input.phone)
  if (phone) out.ph = [sha256Hex(phone)]

  const name = nameParts(input.name)
  if (name) {
    out.fn = [sha256Hex(name.first)]
    if (name.last) out.ln = [sha256Hex(name.last)]
  }

  const externalId = clean(input.externalId).toLowerCase()
  if (externalId) out.external_id = [sha256Hex(externalId)]

  const ip = clean(input.ip)
  if (ip) out.client_ip_address = ip
  const userAgent = clean(input.userAgent)
  if (userAgent) out.client_user_agent = userAgent
  const fbp = clean(input.fbp)
  if (fbp) out.fbp = fbp
  const fbc = clean(input.fbc)
  if (fbc) out.fbc = fbc

  return out
}
