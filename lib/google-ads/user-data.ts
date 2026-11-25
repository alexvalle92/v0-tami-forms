// Identificadores de usuário para as conversões otimizadas (enhanced conversions) da Data Manager API.
// Função pura: normaliza como o Google exige e aplica SHA-256 (hex). CPF e nome não entram de propósito.

import { sha256Hex } from "@/lib/meta/user-data"

export type GoogleUserIdentifier = { emailAddress: string } | { phoneNumber: string }

const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"])

/**
 * E-mail como o Google pede: sem espaços e em minúsculas; em gmail.com/googlemail.com, sem pontos e sem o
 * que vem depois do `+` na parte antes do `@`. Nulo se não parece um e-mail.
 */
export function normalizeGoogleEmail(raw: string | null | undefined): string | null {
  const email = (raw ?? "").trim().toLowerCase()
  const at = email.lastIndexOf("@")
  if (at <= 0 || at === email.length - 1) return null
  let local = email.slice(0, at)
  const domain = email.slice(at + 1)
  if (GMAIL_DOMAINS.has(domain)) {
    local = local.split("+")[0].replaceAll(".", "")
    if (!local) return null
  }
  return `${local}@${domain}`
}

/** Telefone em E.164 (`+55` + DDD + número). Nulo se o tamanho não é de um telefone brasileiro. */
export function normalizeGooglePhoneE164(raw: string | null | undefined): string | null {
  const digits = (raw ?? "").replace(/\D/g, "")
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) return `+${digits}`
  return null
}

export function buildGoogleUserIdentifiers(input: {
  email?: string | null
  phone?: string | null
}): GoogleUserIdentifier[] {
  const out: GoogleUserIdentifier[] = []
  const email = normalizeGoogleEmail(input.email)
  if (email) out.push({ emailAddress: sha256Hex(email) })
  const phone = normalizeGooglePhoneE164(input.phone)
  if (phone) out.push({ phoneNumber: sha256Hex(phone) })
  return out
}
