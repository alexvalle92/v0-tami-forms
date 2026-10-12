import { describe, expect, it } from "vitest"
import {
  RENEWAL_OPEN_DAYS,
  WARN_DAYS,
  daysLeft,
  expiryStage,
  isRenewalOpen,
  renewalState,
  type RenewalCharge,
} from "@/lib/renewal/rules"

const TODAY = "2026-10-12"

function charge(over: Partial<RenewalCharge>): RenewalCharge {
  return { id: "p1", status: "PENDING", dueDate: null, paymentUrl: "https://a/i/1", paidAt: null, ...over }
}

describe("constantes", () => {
  it("avisa a partir de 5 dias e abre o formulário com 2", () => {
    expect(WARN_DAYS).toBe(5)
    expect(RENEWAL_OPEN_DAYS).toBe(2)
  })
})

describe("daysLeft", () => {
  it("conta os dias entre hoje e o fim do plano", () => {
    expect(daysLeft("2026-10-17", "2026-10-12")).toBe(5)
  })

  it("fica negativo depois do fim", () => {
    expect(daysLeft("2026-10-11", "2026-10-12")).toBe(-1)
  })

  it("atravessa a virada do mês", () => {
    expect(daysLeft("2026-11-01", "2026-10-30")).toBe(2)
  })

  it("devolve null sem data de fim", () => {
    expect(daysLeft(null, "2026-10-12")).toBeNull()
  })
})

describe("expiryStage", () => {
  it("não avisa com mais de 5 dias", () => {
    expect(expiryStage(6)).toBeNull()
  })

  it("d5 de 5 a 3 dias", () => {
    expect(expiryStage(5)).toBe("d5")
    expect(expiryStage(3)).toBe("d5")
  })

  it("d2 com 2 e 1 dias", () => {
    expect(expiryStage(2)).toBe("d2")
    expect(expiryStage(1)).toBe("d2")
  })

  it("d0 no dia do vencimento", () => {
    expect(expiryStage(0)).toBe("d0")
  })

  it("expired depois do vencimento, por mais que faça tempo", () => {
    expect(expiryStage(-1)).toBe("expired")
    expect(expiryStage(-40)).toBe("expired")
  })

  it("null sem data de fim", () => {
    expect(expiryStage(null)).toBeNull()
  })
})

describe("isRenewalOpen", () => {
  it("fechado com 3 dias ou mais", () => {
    expect(isRenewalOpen(3)).toBe(false)
  })

  it("aberto com 2 dias, no dia e vencido há muito tempo", () => {
    expect(isRenewalOpen(2)).toBe(true)
    expect(isRenewalOpen(0)).toBe(true)
    expect(isRenewalOpen(-40)).toBe(true)
  })

  it("fechado sem data de fim", () => {
    expect(isRenewalOpen(null)).toBe(false)
  })
})

describe("renewalState", () => {
  it("none quando não há cobrança", () => {
    expect(renewalState(null, TODAY)).toEqual({
      status: "none",
      paymentId: null,
      dueDate: null,
      paymentUrl: null,
    })
  })

  it("paid quando há paidAt, qualquer que seja o status", () => {
    const state = renewalState(
      charge({ status: "OVERDUE", dueDate: "2026-10-01", paidAt: new Date("2026-10-12T12:00:00Z") }),
      TODAY,
    )
    expect(state).toEqual({ status: "paid", paymentId: "p1", dueDate: null, paymentUrl: null })
  })

  it("PENDING_ASAAS fica aguardando, sem vencimento nem link", () => {
    const state = renewalState(charge({ status: "PENDING_ASAAS", paymentUrl: null }), TODAY)
    expect(state).toEqual({ status: "awaiting_payment", paymentId: "p1", dueDate: null, paymentUrl: null })
  })

  it("PENDING com vencimento hoje continua aguardando, com vencimento e link", () => {
    const state = renewalState(charge({ status: "PENDING", dueDate: "2026-10-12" }), TODAY)
    expect(state).toEqual({
      status: "awaiting_payment",
      paymentId: "p1",
      dueDate: "2026-10-12",
      paymentUrl: "https://a/i/1",
    })
  })

  it("PENDING sem vencimento fica aguardando", () => {
    const state = renewalState(charge({ status: "PENDING", dueDate: null }), TODAY)
    expect(state.status).toBe("awaiting_payment")
  })

  it("PENDING com vencimento anterior a hoje expirou, sem link", () => {
    const state = renewalState(charge({ status: "PENDING", dueDate: "2026-10-11" }), TODAY)
    expect(state).toEqual({
      status: "payment_expired",
      paymentId: "p1",
      dueDate: "2026-10-11",
      paymentUrl: null,
    })
  })

  it("OVERDUE expirou", () => {
    const state = renewalState(charge({ status: "OVERDUE", dueDate: "2026-10-12" }), TODAY)
    expect(state.status).toBe("payment_expired")
    expect(state.paymentUrl).toBeNull()
  })

  it("DELETED e ASAAS_FAILED voltam para none, sem paymentId", () => {
    for (const status of ["DELETED", "ASAAS_FAILED"]) {
      expect(renewalState(charge({ status, dueDate: "2026-10-12" }), TODAY)).toEqual({
        status: "none",
        paymentId: null,
        dueDate: null,
        paymentUrl: null,
      })
    }
  })
})
