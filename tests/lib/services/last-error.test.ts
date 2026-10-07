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
