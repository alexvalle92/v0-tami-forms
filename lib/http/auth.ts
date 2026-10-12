import { createHash, timingSafeEqual } from "node:crypto"

const sha256 = (value: string) => createHash("sha256").update(value).digest()

/** Valida `Authorization: Bearer <token>` em tempo constante. Token esperado vazio nunca autoriza. */
export function isBearerAuthorized(header: string | null, token: string): boolean {
  if (!token) return false
  if (!header || !header.startsWith("Bearer ")) return false
  return timingSafeEqual(sha256(header.slice("Bearer ".length)), sha256(token))
}

/**
 * Compara o valor de um header com o token esperado em tempo constante (SHA-256 dos dois lados,
 * como em `isBearerAuthorized`). Header ausente ou token esperado vazio nunca autoriza.
 */
export function isTokenAuthorized(header: string | null, token: string): boolean {
  if (!token) return false
  if (header === null) return false
  return timingSafeEqual(sha256(header), sha256(token))
}
