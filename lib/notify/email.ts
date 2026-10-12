import nodemailer from "nodemailer"

export interface EmailSender {
  send(m: { to: string; subject: string; html: string; text: string }): Promise<void>
}

export function createSmtpEmailSender(
  cfg: { host: string; port: number; user: string; pass: string; from: string },
  createTransport: typeof nodemailer.createTransport = nodemailer.createTransport,
): EmailSender {
  const transport = createTransport({
    host: cfg.host,
    port: cfg.port,
    secure: cfg.port === 465,
    auth: { user: cfg.user, pass: cfg.pass },
    // Os padrões do nodemailer (~2 min) igualam o TTL do lock da notificação (120 s): um SMTP lento
    // deixaria o lock expirar e outro worker enviaria o e-mail em duplicidade.
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 20_000,
  })
  return {
    async send(m) {
      await transport.sendMail({ from: cfg.from, to: m.to, subject: m.subject, html: m.html, text: m.text })
    },
  }
}
