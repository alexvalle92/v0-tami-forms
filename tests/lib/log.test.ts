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
