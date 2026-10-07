import { describe, expect, it } from "vitest"
import { HttpError } from "@/lib/http/retry"
import { safeErrorMessage, toLastError } from "@/lib/services/last-error"

class DrizzleQueryError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message, { cause })
    this.name = "DrizzleQueryError"
  }
}

const PII_MESSAGE =
  "Failed query: insert into notifications (recipient) values (?)\nparams: ana@example.com,5511999990000"

describe("safeErrorMessage", () => {
  it("HttpError: mantém a mensagem", () => {
    expect(safeErrorMessage(new HttpError("HTTP 503", { transient: true, status: 503, body: "corpo" }))).toBe(
      "HTTP 503",
    )
  })

  it("erro do Drizzle com causa do mysql2: só nome e código, nunca a mensagem", () => {
    const err = new DrizzleQueryError(PII_MESSAGE, { code: "ER_LOCK_DEADLOCK", errno: 1213 })
    expect(safeErrorMessage(err)).toBe("DrizzleQueryError: ER_LOCK_DEADLOCK")
  })

  it("causa só com errno usa o errno", () => {
    expect(safeErrorMessage(new DrizzleQueryError(PII_MESSAGE, { errno: 1213 }))).toBe("DrizzleQueryError: 1213")
  })

  it("Error comum: devolve a mensagem", () => {
    expect(safeErrorMessage(new Error("db down"))).toBe("db down")
  })

  it("Error sem causa útil mas com 'params:': corta e marca [redacted]", () => {
    const out = safeErrorMessage(new Error(PII_MESSAGE))
    expect(out).not.toContain("ana@example.com")
    expect(out).not.toContain("5511999990000")
    expect(out).toContain("[redacted]")
  })

  it("mensagem que começa com 'Failed query' sem 'params:' também é marcada", () => {
    const out = safeErrorMessage(new Error("Failed query: select 1"))
    expect(out).toContain("[redacted]")
    expect(out.length).toBeLessThanOrEqual(300)
  })

  it("trunca mensagens longas em 300 caracteres", () => {
    expect(safeErrorMessage(new Error("x".repeat(1000))).length).toBe(300)
  })

  it("valor que não é Error: String() truncado em 300", () => {
    expect(safeErrorMessage("falhou")).toBe("falhou")
    expect(safeErrorMessage(42)).toBe("42")
    expect(safeErrorMessage("y".repeat(1000)).length).toBe(300)
  })
})

describe("safeErrorMessage: R21, scrub de e-mail e números longos", () => {
  const SMTP =
    "Can't send mail - all recipients were rejected: 550 5.1.1 <ana@gmail.com>: Recipient address rejected"

  it("rejeição SMTP: o e-mail do destinatário não sai", () => {
    const out = safeErrorMessage(new Error(SMTP))
    expect(out).not.toContain("ana@gmail.com")
    expect(out).not.toContain("gmail")
    expect(out).toContain("[email]")
    expect(out).toContain("550 5.1.1")
  })

  it.each([
    ["CPF", "falha para 529.982.247-25 no cadastro", "529.982.247-25", "98224725"],
    ["telefone formatado", "falha para (44) 9 9165-1250 agora", "(44) 9 9165-1250", "9165"],
    ["telefone só dígitos", "numero 5544991651250 invalido", "5544991651250", "991651250"],
    ["telefone com +55", "numero +55 44 99165-1250 invalido", "99165-1250", "1250"],
  ])("%s: a sequência de dígitos não sobrevive", (_n, message, whole, fragment) => {
    const out = safeErrorMessage(new Error(message))
    expect(out).not.toContain(whole)
    expect(out).not.toContain(fragment)
    expect(out).toContain("[number]")
  })

  it.each(["HTTP 503", "timeout after 8000ms", "ER_LOCK_DEADLOCK 1213", "status 429 retry in 30000 ms"])(
    "números curtos sobrevivem: %s",
    (message) => {
      expect(safeErrorMessage(new Error(message))).toBe(message)
    },
  )

  it("HttpError não é alterado", () => {
    const msg = "HTTP 503 5544991651250 ana@gmail.com"
    expect(safeErrorMessage(new HttpError(msg, { transient: true, status: 503 }))).toBe(msg)
  })

  it("vale também para um valor que não é Error (string lançada)", () => {
    const out = safeErrorMessage("falha para ana@gmail.com ou 5544991651250")
    expect(out).not.toContain("ana@gmail.com")
    expect(out).not.toContain("5544991651250")
    expect(out).toBe("falha para [email] ou [number]")
  })

  it("aplica o scrub antes do corte de 300 caracteres", () => {
    const out = safeErrorMessage(new Error("x".repeat(295) + " ana@gmail.com"))
    expect(out).not.toContain("ana@")
    expect(out.length).toBeLessThanOrEqual(300)
  })

  it("e-mail e telefone numa mensagem 'Failed query' sem 'params:' também são limpos", () => {
    const out = safeErrorMessage(new Error("Failed query for ana@gmail.com 5544991651250"))
    expect(out).not.toContain("ana@gmail.com")
    expect(out).not.toContain("5544991651250")
  })

  it("toLastError também limpa", () => {
    const e = toLastError("notify.email", new Error(SMTP), 1, new Date("2026-10-07T15:00:00Z"))
    expect(JSON.stringify(e)).not.toContain("ana@gmail.com")
  })
})

describe("toLastError", () => {
  const at = new Date("2026-10-07T15:00:00Z")

  it("HttpError: httpStatus, responseBody truncado em 2048 e message", () => {
    const e = toLastError("s", new HttpError("HTTP 400", { transient: false, status: 400, body: "b".repeat(5000) }), 2, at)
    expect(e).toMatchObject({ step: "s", httpStatus: 400, message: "HTTP 400", attempt: 2, at: at.toISOString() })
    expect(e.responseBody).toHaveLength(2048)
  })

  it("erro de banco: mensagem segura, sem PII", () => {
    const e = toLastError("db.x", new DrizzleQueryError(PII_MESSAGE, { code: "ER_LOCK_DEADLOCK" }), 1, at)
    expect(JSON.stringify(e)).not.toContain("ana@example.com")
    expect(e.message).toBe("DrizzleQueryError: ER_LOCK_DEADLOCK")
    expect(e.httpStatus).toBeUndefined()
    expect(e.responseBody).toBeUndefined()
  })
})
