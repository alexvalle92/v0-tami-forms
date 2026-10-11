import { describe, expect, it, vi } from "vitest"
import type { Logger } from "@/lib/log"
import type { EmailSender } from "@/lib/notify/email"
import { createAlertAdmin, createNoticeAdmin } from "@/lib/services/alert-admin"
import { toLastError } from "@/lib/services/last-error"
import { HttpError } from "@/lib/http/retry"

const silentLog = (): Logger => ({ info: vi.fn(), warn: vi.fn(), error: vi.fn() })

const error = toLastError(
  "asaas.create_payment",
  new HttpError("asaas 400", { transient: false, status: 400, body: '{"secret":"cpf 123"}' }),
  3,
  new Date("2026-10-07T15:00:00Z"),
)

describe("createAlertAdmin", () => {
  it("envia para `to` com o assunto exato e o conteúdo combinado, sem o corpo da resposta", async () => {
    const send = vi.fn(async () => {})
    const email: EmailSender = { send }
    const alert = createAlertAdmin({ email, to: "admin@example.com", log: silentLog() })

    await alert({ kind: "payment", id: "pay-1", patientName: "Ana <Souza>", error })

    expect(send).toHaveBeenCalledTimes(1)
    const m = send.mock.calls[0] as unknown as [{ to: string; subject: string; html: string; text: string }]
    expect(m[0].to).toBe("admin@example.com")
    expect(m[0].subject).toBe("[tami-forms] Falha definitiva: payment pay-1")
    for (const part of ["payment", "pay-1", "Ana <Souza>", "asaas.create_payment", "400", "asaas 400", "3", "last_error"]) {
      expect(m[0].text).toContain(part)
    }
    expect(m[0].html).toContain("Ana &lt;Souza&gt;")
    expect(m[0].html).not.toContain("<Souza>")
    expect(m[0].text).not.toContain("secret")
    expect(m[0].html).not.toContain("secret")
  })

  it("alerta meal_plan sai com o assunto da geração", async () => {
    const send = vi.fn(async () => {})
    const alert = createAlertAdmin({ email: { send }, to: "admin@example.com", log: silentLog() })

    await alert({ kind: "meal_plan", id: "gen-1", patientName: "Ana", error })

    const m = send.mock.calls[0] as unknown as [{ subject: string; text: string }]
    expect(m[0].subject).toBe("[tami-forms] Falha definitiva: meal_plan gen-1")
    expect(m[0].text).toContain("Tipo: meal_plan")
  })

  it("resolve sem lançar e chama log.error quando o envio falha", async () => {
    const log = silentLog()
    const email: EmailSender = {
      send: async () => {
        throw new Error("smtp down")
      },
    }
    const alert = createAlertAdmin({ email, to: "admin@example.com", log })

    await expect(alert({ kind: "notification", id: "n-1", patientName: "Ana", error })).resolves.toBeUndefined()
    expect(log.error).toHaveBeenCalledTimes(1)
  })
})

describe("createNoticeAdmin", () => {
  const base = {
    paymentId: "pay-1",
    patientName: "Ana <Souza>",
    event: "PAYMENT_REFUNDED",
    asaasPaymentId: "pay_123",
  }

  it("reversão: assunto, destinatário e conteúdo combinados (nome escapado no html)", async () => {
    const send = vi.fn(async () => {})
    const notice = createNoticeAdmin({ email: { send }, to: "admin@example.com", log: silentLog() })

    await notice({ kind: "payment_reversal", ...base })

    expect(send).toHaveBeenCalledTimes(1)
    const m = send.mock.calls[0] as unknown as [{ to: string; subject: string; html: string; text: string }]
    expect(m[0].to).toBe("admin@example.com")
    expect(m[0].subject).toBe("[tami-forms] Pagamento revertido: pay-1")
    for (const part of ["payment_reversal", "PAYMENT_REFUNDED", "pay_123", "pay-1", "Ana <Souza>"]) {
      expect(m[0].text).toContain(part)
    }
    expect(m[0].html).toContain("Ana &lt;Souza&gt;")
    expect(m[0].html).not.toContain("<Souza>")
  })

  it("pagamento sem quiz: assunto próprio e traço quando não há id no Asaas", async () => {
    const send = vi.fn(async () => {})
    const notice = createNoticeAdmin({ email: { send }, to: "admin@example.com", log: silentLog() })

    await notice({ kind: "payment_without_quiz", ...base, event: "PAYMENT_RECEIVED", asaasPaymentId: null })

    const m = send.mock.calls[0] as unknown as [{ subject: string; text: string }]
    expect(m[0].subject).toBe("[tami-forms] Pagamento sem envio do quiz: pay-1")
    expect(m[0].text).toContain("Tipo: payment_without_quiz")
    expect(m[0].text).toContain("Cobrança no Asaas: -")
  })

  it("resolve sem lançar e chama log.error quando o envio falha", async () => {
    const log = silentLog()
    const email: EmailSender = {
      send: async () => {
        throw new Error("smtp down")
      },
    }
    const notice = createNoticeAdmin({ email, to: "admin@example.com", log })

    await expect(notice({ kind: "payment_reversal", ...base })).resolves.toBeUndefined()
    expect(log.error).toHaveBeenCalledTimes(1)
  })
})
