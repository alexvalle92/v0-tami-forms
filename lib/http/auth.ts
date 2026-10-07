import { createHash, timingSafeEqual } from "node:crypto"

const sha256 = (value: string) => createHash("sha256").update(value).digest()

/** Valida `Authorization: Bearer <token>` em tempo constante. */
export function isBearerAuthorized(header: string | null, token: string): boolean {
  if (!header || !header.startsWith("Bearer ")) return false
  return timingSafeEqual(sha256(header.slice("Bearer ".length)), sha256(token))
}
