import { randomBytes, scrypt, timingSafeEqual } from "node:crypto"
import { promisify } from "node:util"

// Formato gravado em `patients.password_hash` (§8), também verificado pelo PlanA:
//   scrypt$N$r$p$<salt base64, 16 bytes>$<hash base64, 32 bytes>
const PREFIX = "scrypt"
const N = 16384
const R = 8
const P = 1
const SALT_BYTES = 16
const KEY_BYTES = 32

// Teto dos parâmetros aceitos na verificação: um valor adulterado no banco não pode gastar memória/CPU sem limite.
const MAX_N = 131072
const MAX_R = 16
const MAX_P = 4

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: { N: number; r: number; p: number; maxmem: number },
) => Promise<Buffer>

/** O scrypt do Node recusa chamadas que passam de `maxmem` (padrão 32 MiB): dá folga sobre os ~128·N·r bytes. */
const maxmemFor = (n: number, r: number, p: number) => 256 * r * (n + p + 2)

/** Hash scrypt da senha, com salt aleatório de 16 bytes, no formato de §8. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES)
  const key = await scryptAsync(password, salt, KEY_BYTES, { N, r: R, p: P, maxmem: maxmemFor(N, R, P) })
  return [PREFIX, N, R, P, salt.toString("base64"), key.toString("base64")].join("$")
}

/** Inteiro decimal canônico (sem sinal, zeros à esquerda, ponto ou notação científica) dentro de `[1, max]`. */
function parseParam(text: string, max: number): number | null {
  if (!/^[1-9][0-9]{0,9}$/.test(text)) return null
  const value = Number(text)
  return value <= max ? value : null
}

/** Decodifica base64 canônico com exatamente `bytes` bytes; qualquer outra coisa vira `null`. */
function decodeBase64(text: string, bytes: number): Buffer | null {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(text)) return null
  const buffer = Buffer.from(text, "base64")
  if (buffer.length !== bytes) return null
  return buffer.toString("base64") === text ? buffer : null
}

/**
 * `true` só quando a senha confere. `false` para senha errada e para qualquer valor fora do formato de §8
 * (partes, prefixo, parâmetros, base64, tamanhos). Nunca lança e nunca expõe a senha.
 */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  try {
    if (typeof password !== "string" || typeof stored !== "string") return false

    const parts = stored.split("$")
    if (parts.length !== 6 || parts[0] !== PREFIX) return false

    const n = parseParam(parts[1], MAX_N)
    const r = parseParam(parts[2], MAX_R)
    const p = parseParam(parts[3], MAX_P)
    if (n === null || r === null || p === null) return false
    if (n < 2 || (n & (n - 1)) !== 0) return false // N precisa ser potência de 2

    const salt = decodeBase64(parts[4], SALT_BYTES)
    const expected = decodeBase64(parts[5], KEY_BYTES)
    if (!salt || !expected) return false

    const actual = await scryptAsync(password, salt, KEY_BYTES, { N: n, r, p, maxmem: maxmemFor(n, r, p) })
    return actual.length === expected.length && timingSafeEqual(actual, expected)
  } catch {
    return false
  }
}
