import { describe, expect, it } from "vitest"
import { priceOffer } from "@/lib/price-display"

describe("priceOffer", () => {
  it("monta De / Por / desconto / por dia com tudo configurado", () => {
    expect(
      priceOffer({ PAYMENT_AMOUNT: "39.90", PAYMENT_DISPLAY_FROM_AMOUNT: "79.90", PAYMENT_DISPLAY_DISCOUNT_PERCENT: "50" }),
    ).toEqual({ price: "R$ 39,90", fromPrice: "R$ 79,90", discountPercent: 50, perDay: "R$ 1,33" })
  })

  it("sem as variáveis de vitrine, mostra só o preço", () => {
    expect(priceOffer({ PAYMENT_AMOUNT: "39.90" })).toEqual({
      price: "R$ 39,90",
      fromPrice: undefined,
      discountPercent: undefined,
      perDay: "R$ 1,33",
    })
  })

  it.each([
    ["em branco", ""],
    ["com vírgula", "79,90"],
    ["igual ao preço", "39.90"],
    ["menor que o preço", "29.90"],
  ])("De %s: escondido", (_name, value) => {
    expect(priceOffer({ PAYMENT_AMOUNT: "39.90", PAYMENT_DISPLAY_FROM_AMOUNT: value }).fromPrice).toBeUndefined()
  })

  it("De aceita inteiro e uma casa", () => {
    expect(priceOffer({ PAYMENT_AMOUNT: "39.90", PAYMENT_DISPLAY_FROM_AMOUNT: "80" }).fromPrice).toBe("R$ 80,00")
    expect(priceOffer({ PAYMENT_AMOUNT: "39.90", PAYMENT_DISPLAY_FROM_AMOUNT: "79.9" }).fromPrice).toBe("R$ 79,90")
  })

  it.each([
    ["em branco", ""],
    ["zero", "0"],
    ["100", "100"],
    ["com %", "50%"],
    ["decimal", "12.5"],
  ])("percentual %s: escondido", (_name, value) => {
    expect(priceOffer({ PAYMENT_DISPLAY_DISCOUNT_PERCENT: value }).discountPercent).toBeUndefined()
  })

  it("por dia acompanha o PAYMENT_AMOUNT", () => {
    expect(priceOffer({ PAYMENT_AMOUNT: "100" }).perDay).toBe("R$ 3,33")
    expect(priceOffer({ PAYMENT_AMOUNT: "29.90" }).perDay).toBe("R$ 1,00")
  })
})
