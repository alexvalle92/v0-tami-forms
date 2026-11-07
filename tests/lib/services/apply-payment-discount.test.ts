import { describe, expect, it, vi } from "vitest"
import type { Channel } from "@/lib/db/repos/types"
import { HttpError } from "@/lib/http/retry"
import type { Logger } from "@/lib/log"
import type { AlertAdmin } from "@/lib/services/alert-admin"
import { createApplyPaymentDiscount } from "@/lib/services/apply-payment-discount"
import { createSyncPayment } from "@/lib/services/sync-payment"
import { createFakeAsaas } from "../../fakes/fake-asaas"
import { createMemoryRepos } from "../../fakes/memory-repos"

// 9h em São Paulo.
const NOW = new Date("2026-10-31T12:00:00Z")
const OPTS = { deadline: NOW.getTime() + 60_000 }
const CHANNELS: Channel[] = ["email", "whatsapp"]
const SUCCESS_URL = "https://app.example.com/obrigado"
const CONFIG = { amount: "29.90", dueDays: 5, successUrl: SUCCESS_URL, channels: CHANNELS }

type Setup = Awaited<ReturnType<typeof setup>>

/** Chega a uma cobrança `PENDING` com `asaasId`, usando o `syncPayment` real. */
async function setup() {
  const repos = createMemoryRepos()
  const asaas = createFakeAsaas()
  const log: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const created = await repos.submissions.create({
    submissionId: "sub-1",
    patient: { name: "Maria da Silva", cpf: "52998224725", email: "maria@example.com", phone: "11999990000" },
    answers: {},
    amount: "39.90",
    todaySP: "2026-10-30",
  })
  if (created === "duplicate") throw new Error("unexpected duplicate")
  const sync = createSyncPayment({
    payments: repos.payments,
    notifications: repos.notifications,
    asaas,
    alertAdmin: vi.fn(async () => {}),
    log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
    now: () => NOW,
    config: { dueDays: 2, successUrl: SUCCESS_URL, channels: CHANNELS },
  })
  expect(await sync(created.paymentId, OPTS)).toMatchObject({ status: "synced" })

  const alertAdmin = vi.fn<AlertAdmin>(async () => {})
  const apply = createApplyPaymentDiscount({
    payments: repos.payments,
    asaas,
    alertAdmin,
    log,
    now: () => NOW,
    config: CONFIG,
  })
  const asaasId = repos.state.payments.get(created.paymentId)!.asaasId!
  return { repos, asaas, log, alertAdmin, apply, paymentId: created.paymentId, asaasId }
}

const row = (s: Setup) => s.repos.state.payments.get(s.paymentId)!
/** A linha do estado é somente leitura nos tipos; o teste altera o status para montar o cenário. */
const mutableRow = (s: Setup) => row(s) as { -readonly [K in keyof ReturnType<typeof row>]: ReturnType<typeof row>[K] }
const discountNotifications = (s: Setup) =>
  [...s.repos.state.notifications.values()].filter((n) => n.kind === "payment_discount")

async function expectUnlocked(s: Setup) {
  expect(await s.repos.payments.tryLock(s.paymentId, 1000)).toBe(true)
  await s.repos.payments.unlock(s.paymentId)
}

describe("createApplyPaymentDiscount", () => {
  it("aplica: PUT com valor, vencimento hoje+5, descrição e o billingType do Asaas", async () => {
    const s = await setup()
    s.asaas.byId.get(s.asaasId)!.billingType = "PIX"

    const result = await s.apply(s.paymentId, OPTS)

    expect(result).toBe("applied")
    expect(s.asaas.updatedPayments).toHaveLength(1)
    expect(s.asaas.updatedPayments[0].asaasId).toBe(s.asaasId)
    expect(s.asaas.updatedPayments[0].input).toEqual({
      value: 29.9,
      dueDate: "2026-11-05",
      description: "Plano Alimentar Personalizado - Maria da Silva - 30 dias - condição especial",
      billingType: "PIX",
      externalReference: s.paymentId,
      callback: { successUrl: SUCCESS_URL },
    })
    expect(row(s).amount).toBe("29.90")
    expect(row(s).originalAmount).toBe("39.90")
    expect(row(s).discountStatus).toBe("applied")
    expect(discountNotifications(s)).toHaveLength(2)
    expect(s.log.info).toHaveBeenCalledWith("discount.applied", {
      paymentId: s.paymentId,
      originalAmount: "39.90",
      amount: "29.90",
      dueDate: "2026-11-05",
    })
    await expectUnlocked(s)
  })

  it("cobrança vencida (OVERDUE): o status local acompanha o que o Asaas devolve (PENDING)", async () => {
    const s = await setup()
    s.asaas.byId.get(s.asaasId)!.status = "OVERDUE"
    mutableRow(s).status = "OVERDUE"

    expect(await s.apply(s.paymentId, OPTS)).toBe("applied")

    expect(row(s).status).toBe("PENDING")
    expect(row(s).discountStatus).toBe("applied")
  })

  it("PUT pulado (Asaas já com o valor novo): o status gravado vem do GET", async () => {
    const s = await setup()
    const remote = s.asaas.byId.get(s.asaasId)!
    remote.value = 29.9
    remote.dueDate = "2026-11-05"
    remote.status = "OVERDUE"

    expect(await s.apply(s.paymentId, OPTS)).toBe("applied")

    expect(s.asaas.calls).not.toContain("updatePayment")
    expect(row(s).status).toBe("OVERDUE")
  })

  it("valor no Asaas não passa do desconto: skipped, sem PUT e sem mensagem", async () => {
    const s = await setup()
    // O valor local (39.90) está defasado: no Asaas a cobrança já é de 19.90.
    s.asaas.byId.get(s.asaasId)!.value = 19.9

    const result = await s.apply(s.paymentId, OPTS)

    expect(result).toBe("skipped")
    expect(s.asaas.calls).not.toContain("updatePayment")
    expect(s.asaas.updatedPayments).toEqual([])
    expect(row(s).discountStatus).toBe("skipped")
    expect(row(s).amount).toBe("39.90")
    expect(discountNotifications(s)).toHaveLength(0)
    expect(s.log.info).toHaveBeenCalledWith(
      "discount.skipped",
      expect.objectContaining({ paymentId: s.paymentId, reason: "asaas_value_not_above_discount" }),
    )
    await expectUnlocked(s)
  })

  it("falha ao marcar como pulada: retry no passo db.mark_discount_skipped", async () => {
    const s = await setup()
    s.asaas.byId.get(s.asaasId)!.status = "RECEIVED"
    vi.spyOn(s.repos.payments, "markDiscountSkipped").mockRejectedValueOnce(new Error("db"))

    expect(await s.apply(s.paymentId, OPTS)).toBe("retry")

    expect(s.log.warn).toHaveBeenCalledWith(
      "discount.retry",
      expect.objectContaining({ paymentId: s.paymentId, step: "db.mark_discount_skipped" }),
    )
    await expectUnlocked(s)
  })

  it("já paga no Asaas: skipped, sem PUT e sem mensagem", async () => {
    const s = await setup()
    s.asaas.byId.get(s.asaasId)!.status = "RECEIVED"

    const result = await s.apply(s.paymentId, OPTS)

    expect(result).toBe("skipped")
    expect(row(s).discountStatus).toBe("skipped")
    expect(row(s).amount).toBe("39.90")
    expect(s.asaas.updatedPayments).toEqual([])
    expect(discountNotifications(s)).toHaveLength(0)
    await expectUnlocked(s)
  })

  it("Asaas já tem o valor novo (29.9) e o vencimento novo: grava sem PUT", async () => {
    const s = await setup()
    const remote = s.asaas.byId.get(s.asaasId)!
    remote.value = 29.9
    remote.dueDate = "2026-11-05"

    const result = await s.apply(s.paymentId, OPTS)

    expect(result).toBe("applied")
    expect(s.asaas.calls).not.toContain("updatePayment")
    expect(row(s).discountStatus).toBe("applied")
    expect(row(s).originalAmount).toBe("39.90")
    expect(discountNotifications(s)).toHaveLength(2)
  })

  it("erro passageiro no GET: retry, nada gravado, lock solto", async () => {
    const s = await setup()
    s.asaas.failNext("getPayment", new HttpError("HTTP 503", { transient: true, status: 503 }))

    const result = await s.apply(s.paymentId, OPTS)

    expect(result).toBe("retry")
    expect(row(s).discountStatus).toBeNull()
    expect(s.log.warn).toHaveBeenCalledWith(
      "discount.retry",
      expect.objectContaining({ paymentId: s.paymentId, step: "asaas.get_payment", httpStatus: 503 }),
    )
    await expectUnlocked(s)
  })

  it("erro passageiro no PUT: retry, nada gravado, lock solto", async () => {
    const s = await setup()
    s.asaas.failNext("updatePayment", new HttpError("x", { transient: true }))

    const result = await s.apply(s.paymentId, OPTS)

    expect(result).toBe("retry")
    expect(row(s).discountStatus).toBeNull()
    expect(row(s).amount).toBe("39.90")
    expect(s.log.warn).toHaveBeenCalledWith(
      "discount.retry",
      expect.objectContaining({ paymentId: s.paymentId, step: "asaas.update_payment", message: "x" }),
    )
    await expectUnlocked(s)
  })

  it("erro que não é HttpError no cliente do Asaas conta como passageiro", async () => {
    const s = await setup()
    s.asaas.failNext("getPayment", new TypeError("fetch failed"))

    expect(await s.apply(s.paymentId, OPTS)).toBe("retry")
    expect(row(s).discountStatus).toBeNull()
    await expectUnlocked(s)
  })

  it("4xx no PUT: skipped definitivo", async () => {
    const s = await setup()
    s.asaas.failNext("updatePayment", new HttpError("HTTP 400", { transient: false, status: 400 }))

    const result = await s.apply(s.paymentId, OPTS)

    expect(result).toBe("skipped")
    expect(row(s).discountStatus).toBe("skipped")
    expect(row(s).amount).toBe("39.90")
    expect(s.log.error).toHaveBeenCalledWith(
      "discount.skipped",
      expect.objectContaining({ paymentId: s.paymentId, step: "asaas.update_payment", httpStatus: 400 }),
    )
    await expectUnlocked(s)
  })

  it("paciente que já usou o desconto: skipped sem chamar o Asaas", async () => {
    const s = await setup()
    vi.spyOn(s.repos.payments, "hasAppliedDiscount").mockResolvedValueOnce(true)

    const result = await s.apply(s.paymentId, OPTS)

    expect(result).toBe("skipped")
    expect(row(s).discountStatus).toBe("skipped")
    expect(s.asaas.calls.filter((c) => c === "getPayment" || c === "updatePayment")).toEqual([])
    await expectUnlocked(s)
  })

  it("cobrança já avaliada: skipped sem gravar", async () => {
    const s = await setup()
    const appliedAt = new Date("2026-10-30T12:00:00Z")
    await s.repos.payments.markDiscountSkipped(s.paymentId, appliedAt)

    expect(await s.apply(s.paymentId, OPTS)).toBe("skipped")
    expect(row(s).discountAppliedAt).toBe(appliedAt)
    expect(s.asaas.calls.filter((c) => c === "getPayment")).toEqual([])
  })

  it("cobrança que não está PENDING/OVERDUE: skipped sem gravar", async () => {
    const s = await setup()
    mutableRow(s).status = "RECEIVED"

    expect(await s.apply(s.paymentId, OPTS)).toBe("skipped")
    expect(row(s).discountStatus).toBeNull()
    expect(s.asaas.calls.filter((c) => c === "getPayment")).toEqual([])
  })

  it("cobrança inexistente: skipped sem gravar", async () => {
    const s = await setup()
    expect(await s.apply("nao-existe", OPTS)).toBe("skipped")
  })

  it("lock ocupado: busy", async () => {
    const s = await setup()
    expect(await s.repos.payments.tryLock(s.paymentId, 120_000)).toBe(true)

    expect(await s.apply(s.paymentId, OPTS)).toBe("busy")
    expect(row(s).discountStatus).toBeNull()
    expect(s.asaas.calls.filter((c) => c === "getPayment")).toEqual([])
  })

  it("banco falha depois do PUT; a próxima chamada grava sem novo PUT", async () => {
    const s = await setup()
    vi.spyOn(s.repos.payments, "applyDiscount").mockRejectedValueOnce(new Error("db"))

    expect(await s.apply(s.paymentId, OPTS)).toBe("retry")
    expect(row(s).discountStatus).toBeNull()
    expect(s.log.warn).toHaveBeenCalledWith(
      "discount.retry",
      expect.objectContaining({ paymentId: s.paymentId, step: "db.apply_discount" }),
    )
    await expectUnlocked(s)

    expect(await s.apply(s.paymentId, OPTS)).toBe("applied")
    expect(s.asaas.updatedPayments).toHaveLength(1)
    expect(discountNotifications(s)).toHaveLength(2)
    expect(row(s).originalAmount).toBe("39.90")
  })

  describe("PUT feito e banco falhou: Asaas e banco divergem", () => {
    it("loga o evento, avisa o admin uma vez e devolve retry", async () => {
      const s = await setup()
      vi.spyOn(s.repos.payments, "applyDiscount").mockRejectedValueOnce(new Error("db"))

      expect(await s.apply(s.paymentId, OPTS)).toBe("retry")

      expect(s.asaas.updatedPayments).toHaveLength(1)
      expect(s.log.error).toHaveBeenCalledWith("discount.asaas_changed_db_not", {
        paymentId: s.paymentId,
        message: "db",
      })
      expect(s.alertAdmin).toHaveBeenCalledTimes(1)
      expect(s.alertAdmin).toHaveBeenCalledWith({
        kind: "payment",
        id: s.paymentId,
        patientName: "Maria da Silva",
        error: expect.objectContaining({ step: "db.apply_discount", message: "db", attempt: 1 }),
      })
      await expectUnlocked(s)
    })

    it("sem PUT nesta rodada (Asaas já tinha o valor novo) também avisa", async () => {
      const s = await setup()
      const remote = s.asaas.byId.get(s.asaasId)!
      remote.value = 29.9
      remote.dueDate = "2026-11-05"
      vi.spyOn(s.repos.payments, "applyDiscount").mockRejectedValueOnce(new Error("db"))

      expect(await s.apply(s.paymentId, OPTS)).toBe("retry")

      expect(s.asaas.calls).not.toContain("updatePayment")
      expect(s.alertAdmin).toHaveBeenCalledTimes(1)
    })

    it("falha do alerta é logada e não muda o resultado", async () => {
      const s = await setup()
      vi.spyOn(s.repos.payments, "applyDiscount").mockRejectedValueOnce(new Error("db"))
      s.alertAdmin.mockRejectedValueOnce(new Error("smtp down"))

      expect(await s.apply(s.paymentId, OPTS)).toBe("retry")

      expect(s.log.error).toHaveBeenCalledWith("discount.alert_failed", {
        paymentId: s.paymentId,
        message: "smtp down",
      })
      await expectUnlocked(s)
    })

    it("falha antes do PUT (GET) não avisa o admin", async () => {
      const s = await setup()
      s.asaas.failNext("getPayment", new HttpError("HTTP 503", { transient: true, status: 503 }))
      await s.apply(s.paymentId, OPTS)

      s.asaas.failNext("updatePayment", new HttpError("x", { transient: true }))
      await s.apply(s.paymentId, OPTS)

      expect(s.alertAdmin).not.toHaveBeenCalled()
      expect(s.log.error).not.toHaveBeenCalledWith("discount.asaas_changed_db_not", expect.anything())
    })
  })

  it("sem quiz_response: aplica e avisa no log", async () => {
    const s = await setup()
    vi.spyOn(s.repos.payments, "applyDiscount").mockResolvedValueOnce({ notificationsEnqueued: 0 })

    expect(await s.apply(s.paymentId, OPTS)).toBe("applied")
    expect(s.log.warn).toHaveBeenCalledWith("discount.no_quiz_response", { paymentId: s.paymentId })
  })

  it("não loga nome, e-mail, telefone nem link", async () => {
    const s = await setup()
    s.asaas.failNext("updatePayment", new HttpError("x", { transient: true }))
    await s.apply(s.paymentId, OPTS)
    await s.apply(s.paymentId, OPTS)

    const text = JSON.stringify([
      ...(s.log.info as ReturnType<typeof vi.fn>).mock.calls,
      ...(s.log.warn as ReturnType<typeof vi.fn>).mock.calls,
      ...(s.log.error as ReturnType<typeof vi.fn>).mock.calls,
    ])
    for (const secret of ["Maria", "maria@example.com", "11999990000", "asaas.test"]) {
      expect(text).not.toContain(secret)
    }
  })
})
