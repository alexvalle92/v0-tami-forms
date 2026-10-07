import { describe, expect, it, vi } from "vitest"
import type nodemailer from "nodemailer"
import { createSmtpEmailSender } from "@/lib/notify/email"

const cfg = { host: "smtp.example", port: 587, user: "u", pass: "p", from: "Tami <no-reply@example.com>" }

function setup() {
  const sendMail = vi.fn(async () => ({}))
  const createTransport = vi.fn(() => ({ sendMail })) as unknown as typeof nodemailer.createTransport
  return { sendMail, createTransport }
}

describe("createSmtpEmailSender", () => {
  it("envia com from do cfg e demais campos da mensagem", async () => {
    const { sendMail, createTransport } = setup()
    await createSmtpEmailSender(cfg, createTransport).send({
      to: "ana@example.com",
      subject: "Assunto",
      html: "<b>oi</b>",
      text: "oi",
    })
    expect(sendMail).toHaveBeenCalledWith({
      from: cfg.from,
      to: "ana@example.com",
      subject: "Assunto",
      html: "<b>oi</b>",
      text: "oi",
    })
  })

  it("usa secure true na porta 465 e false na 587", () => {
    const a = setup()
    createSmtpEmailSender({ ...cfg, port: 465 }, a.createTransport)
    expect(a.createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 465, secure: true }))

    const b = setup()
    createSmtpEmailSender({ ...cfg, port: 587 }, b.createTransport)
    expect(b.createTransport).toHaveBeenCalledWith(expect.objectContaining({ port: 587, secure: false }))
  })
})
