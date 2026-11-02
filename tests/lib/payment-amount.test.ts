import { describe, expect, it } from "vitest"
import { paymentAmount } from "@/lib/payment-amount"

describe("paymentAmount", () => {
  it("usa PAYMENT_AMOUNT quando está no formato", () => {
    expect(paymentAmount({ PAYMENT_AMOUNT: "49.90" })).toBe("49.90")
    expect(paymentAmount({ PAYMENT_AMOUNT: "100" })).toBe("100")
  })

  it.each([
    ["ausente", undefined],
    ["em branco", ""],
    ["com vírgula", "39,90"],
    ["com três casas", "39.901"],
  ])("%s: cai em 39.90", (_name, value) => {
    expect(paymentAmount({ PAYMENT_AMOUNT: value })).toBe("39.90")
  })
})
