import { describe, expect, it, vi } from "vitest"
import { createLogger, maskCpf, maskEmail, maskPhone } from "@/lib/log"

function logOnce(fn: (log: ReturnType<typeof createLogger>) => void) {
  const write = vi.fn()
  fn(createLogger(write))
  expect(write).toHaveBeenCalledTimes(1)
  return JSON.parse(write.mock.calls[0][0])
}

describe("máscaras", () => {
  it("mascara CPF mantendo apenas os dígitos 8-9 e os verificadores", () => {
    expect(maskCpf("05687104950")).toBe("***.***.*49-50")
  })

  it("mascara e-mail mantendo a primeira letra e o domínio", () => {
    expect(maskEmail("alex@gmail.com")).toBe("a***@gmail.com")
  })

  it("mascara telefone mantendo só os 4 últimos dígitos", () => {
    expect(maskPhone("41999679512")).toBe("***9512")
  })
})

describe("createLogger", () => {
  it("escreve uma linha JSON com ts, level, event e os campos", () => {
    const write = vi.fn()
    createLogger(write).info("x", { a: 1 })

    expect(write).toHaveBeenCalledTimes(1)
    const line = JSON.parse(write.mock.calls[0][0])
    expect(line.level).toBe("info")
    expect(line.event).toBe("x")
    expect(line.a).toBe(1)
    expect(typeof line.ts).toBe("string")
    expect(new Date(line.ts).toISOString()).toBe(line.ts)
  })

  it("expõe warn e error com o level correspondente", () => {
    const write = vi.fn()
    const log = createLogger(write)
    log.warn("w")
    log.error("e", { b: 2 })

    expect(JSON.parse(write.mock.calls[0][0]).level).toBe("warn")
    expect(JSON.parse(write.mock.calls[1][0])).toMatchObject({ level: "error", event: "e", b: 2 })
  })

  it("não deixa campos do chamador sobrescreverem ts, level e event", () => {
    const line = logOnce((log) => log.info("real", { level: "debug", event: "fake", ts: "ontem" }))
    expect(line.level).toBe("info")
    expect(line.event).toBe("real")
    expect(line.ts).not.toBe("ontem")
  })
})

describe("createLogger: robustez", () => {
  it("preserva name, message e stack de um Error", () => {
    const line = logOnce((log) => log.error("falhou", { err: new TypeError("boom") }))
    expect(line.err.name).toBe("TypeError")
    expect(line.err.message).toBe("boom")
    expect(typeof line.err.stack).toBe("string")
  })

  it("não lança com BigInt", () => {
    const line = logOnce((log) => log.info("big", { n: BigInt(10) }))
    expect(line.n).toBe("10")
  })

  it("não lança com objeto circular e ainda escreve JSON válido", () => {
    const circular: Record<string, unknown> = {}
    circular.self = circular
    const line = logOnce((log) => log.info("circ", { circular }))
    expect(line.event).toBe("circ")
    expect(line.level).toBe("info")
    expect(line.logError).toBe(true)
  })
})

describe("createLogger: redação de campos sensíveis", () => {
  it("mascara cpf, email e telefone no nível superior", () => {
    const line = logOnce((log) =>
      log.info("lead", {
        cpf: "05687104950",
        Email: "alex@gmail.com",
        whatsapp: "41999679512",
        telefone: "41999679512",
        phone: "41999679512",
      }),
    )
    expect(line.cpf).toBe("***.***.*49-50")
    expect(line.Email).toBe("a***@gmail.com")
    expect(line.whatsapp).toBe("***9512")
    expect(line.telefone).toBe("***9512")
    expect(line.phone).toBe("***9512")
  })

  it("substitui chaves e tokens por [REDACTED]", () => {
    const line = logOnce((log) =>
      log.info("req", {
        apiKey: "k",
        api_key: "k",
        Authorization: "Bearer abc",
        access_token: "t",
        password: "p",
        clientSecret: "s",
        cronToken: "c",
        ok: "visível",
      }),
    )
    for (const key of ["apiKey", "api_key", "Authorization", "access_token", "password", "clientSecret", "cronToken"]) {
      expect(line[key]).toBe("[REDACTED]")
    }
    expect(line.ok).toBe("visível")
  })
})

describe("createLogger: persist", () => {
  it("entrega ao persist a entrada com campos já mascarados e mantém o stdout igual", () => {
    const write = vi.fn()
    const persist = vi.fn()
    createLogger(write, persist).warn("x.y", { cpf: "05687104950", n: 1 })

    expect(persist).toHaveBeenCalledTimes(1)
    const entry = persist.mock.calls[0][0]
    expect(entry).toMatchObject({ level: "warn", event: "x.y", fields: { cpf: "***.***.*49-50", n: 1 } })
    expect(entry.ts).toBeInstanceOf(Date)

    expect(write).toHaveBeenCalledTimes(1)
    const line = JSON.parse(write.mock.calls[0][0])
    expect(line).toMatchObject({ level: "warn", event: "x.y", cpf: "***.***.*49-50", n: 1 })
    expect(line.ts).toBe(entry.ts.toISOString())
  })

  it("não inclui ts, level e event nos campos entregues", () => {
    const persist = vi.fn()
    createLogger(vi.fn(), persist).info("real", { a: 1 })
    expect(persist.mock.calls[0][0].fields).toEqual({ a: 1 })
  })

  it("converte Error e bigint como no stdout, sem lançar, e escreve o stdout uma vez", () => {
    const write = vi.fn()
    const persist = vi.fn()
    createLogger(write, persist).error("e.x", { err: new Error("boom"), n: BigInt(10) })

    const { fields } = persist.mock.calls[0][0]
    expect(fields.err).toEqual({ name: "Error", message: "boom", stack: expect.any(String) })
    expect(fields.n).toBe("10")
    expect(write).toHaveBeenCalledTimes(1)
  })

  it("entrega { logError: true } com objeto circular, sem lançar", () => {
    const write = vi.fn()
    const persist = vi.fn()
    const circular: Record<string, unknown> = {}
    circular.self = circular
    createLogger(write, persist).info("circ", { circular })

    expect(persist.mock.calls[0][0].fields).toEqual({ logError: true })
    expect(write).toHaveBeenCalledTimes(1)
  })

  it("se o redact lançar, escreve a linha logError, entrega { logError: true } e não lança", () => {
    const write = vi.fn()
    const persist = vi.fn()
    const fields = {
      get boom(): string {
        throw new Error("getter quebrou")
      },
    }
    expect(() => createLogger(write, persist).warn("g.x", fields)).not.toThrow()

    expect(write).toHaveBeenCalledTimes(1)
    expect(JSON.parse(write.mock.calls[0][0])).toMatchObject({ level: "warn", event: "g.x", logError: true })
    expect(persist).toHaveBeenCalledTimes(1)
    expect(persist.mock.calls[0][0]).toMatchObject({ level: "warn", event: "g.x", fields: { logError: true } })
  })

  it("engole a exceção do persist e ainda escreve o stdout", () => {
    const write = vi.fn()
    const persist = vi.fn(() => {
      throw new Error("persist quebrou")
    })
    expect(() => createLogger(write, persist).error("e.y", { a: 1 })).not.toThrow()
    expect(write).toHaveBeenCalledTimes(1)
    expect(JSON.parse(write.mock.calls[0][0])).toMatchObject({ event: "e.y", a: 1 })
  })
})
