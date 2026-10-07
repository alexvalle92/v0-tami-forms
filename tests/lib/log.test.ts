import { describe, expect, it, vi } from "vitest"
import { createLogger, maskCpf, maskEmail, maskPhone } from "@/lib/log"

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
})
