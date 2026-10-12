import { createHash, randomBytes, scryptSync } from "node:crypto"
import { describe, expect, it } from "vitest"
import { hashPassword, verifyPassword } from "@/lib/access/password-hash"

const b64 = (n: number) => randomBytes(n).toString("base64")

describe("hashPassword", () => {
  it("o hash tem o formato de §8", async () => {
    expect(await hashPassword("SWSC8VWD8T")).toMatch(
      /^scrypt\$16384\$8\$1\$[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=$/,
    )
  })

  it("o mesmo texto gera hashes diferentes (salt aleatório)", async () => {
    const a = await hashPassword("SWSC8VWD8T")
    const b = await hashPassword("SWSC8VWD8T")
    expect(a).not.toBe(b)
  })
})

describe("verifyPassword", () => {
  it("confere a senha certa e recusa a errada", async () => {
    const stored = await hashPassword("SWSC8VWD8T")
    expect(await verifyPassword("SWSC8VWD8T", stored)).toBe(true)
    expect(await verifyPassword("SWSC8VWD8U", stored)).toBe(false)
    expect(await verifyPassword("", stored)).toBe(false)
  })

  it("confere um hash gerado de forma independente no formato de §8", async () => {
    const salt = randomBytes(16)
    const hash = scryptSync("senha-externa", salt, 32, { N: 16384, r: 8, p: 1 })
    const stored = `scrypt$16384$8$1$${salt.toString("base64")}$${hash.toString("base64")}`
    expect(await verifyPassword("senha-externa", stored)).toBe(true)
    expect(await verifyPassword("outra", stored)).toBe(false)
  })

  it.each([
    "",
    "abc",
    "scrypt$16384$8$1$x",
    "scrypt$abc$8$1$AAAA$AAAA",
    "scrypt$1073741824$8$1$AAAA$AAAA",
    createHash("sha512").update("SWSC8VWD8T").digest("base64"),
  ])("valor fora do formato %j → false", async (stored) => {
    expect(await verifyPassword("SWSC8VWD8T", stored)).toBe(false)
  })

  it("recusa parâmetros fora dos limites, sem lançar", async () => {
    const salt = b64(16)
    const hash = b64(32)
    const cases = [
      `scrypt$262144$8$1$${salt}$${hash}`, // N acima do teto
      `scrypt$16384$32$1$${salt}$${hash}`, // r acima do teto
      `scrypt$16384$8$8$${salt}$${hash}`, // p acima do teto
      `scrypt$16383$8$1$${salt}$${hash}`, // N não é potência de 2
      `scrypt$1$8$1$${salt}$${hash}`, // N menor que 2
      `scrypt$16384$0$1$${salt}$${hash}`, // r zero
      `scrypt$16384$8$0$${salt}$${hash}`, // p zero
      `scrypt$16384$8.5$1$${salt}$${hash}`, // r não inteiro
      `scrypt$16384$8$1$${salt}`, // partes a menos
      `scrypt$16384$8$1$${salt}$${hash}$extra`, // partes a mais
      `bcrypt$16384$8$1$${salt}$${hash}`, // prefixo errado
    ]
    for (const stored of cases) {
      expect(await verifyPassword("SWSC8VWD8T", stored)).toBe(false)
    }
  })

  it("recusa salt ou hash com tamanho errado ou base64 inválido", async () => {
    expect(await verifyPassword("x", `scrypt$16384$8$1$${b64(8)}$${b64(32)}`)).toBe(false)
    expect(await verifyPassword("x", `scrypt$16384$8$1$${b64(16)}$${b64(16)}`)).toBe(false)
    expect(await verifyPassword("x", `scrypt$16384$8$1$${b64(16)}$${b64(33)}`)).toBe(false)
    expect(await verifyPassword("x", `scrypt$16384$8$1$!!!!$${b64(32)}`)).toBe(false)
  })

  it("não lança para entrada que não é string", async () => {
    await expect(verifyPassword("x", undefined as unknown as string)).resolves.toBe(false)
    await expect(verifyPassword("x", null as unknown as string)).resolves.toBe(false)
  })
})
