import { describe, expect, it } from "vitest"
import { enabledChannels } from "@/lib/container"

// Importar o container não pode montar nada (o `next build` roda sem env): este arquivo
// só carrega o módulo, sem DATABASE_URL, e chama uma função pura.
describe("enabledChannels", () => {
  it.each([
    [true, true, ["email", "whatsapp"]],
    [true, false, ["email"]],
    [false, true, ["whatsapp"]],
    [false, false, []],
  ])("email=%s whatsapp=%s → %j", (email, whatsapp, expected) => {
    expect(enabledChannels({ NOTIFY_EMAIL_ENABLED: email, NOTIFY_WHATSAPP_ENABLED: whatsapp })).toEqual(expected)
  })
})
