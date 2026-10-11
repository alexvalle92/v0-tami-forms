import type { LastError } from "@/lib/db/repos/types"
import type { Logger } from "@/lib/log"
import type { EmailSender } from "@/lib/notify/email"
import { safeErrorMessage } from "./last-error"

export type AdminAlert = {
  kind: "payment" | "notification" | "meal_plan"
  id: string
  patientName: string
  error: LastError
}

export type AlertAdmin = (a: AdminAlert) => Promise<void>

const escapeHtml = (s: string) =>
  s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;")

/**
 * Avisa o admin por e-mail de uma falha definitiva. Nunca lança: se o envio falhar, só registra no log.
 * O e-mail não leva o corpo da resposta (`responseBody`); ele fica no `last_error` do banco.
 */
export function createAlertAdmin(d: { email: EmailSender; to: string; log: Logger }): AlertAdmin {
  return async (a) => {
    try {
      const lines: [string, string][] = [
        ["Tipo", a.kind],
        ["ID", a.id],
        ["Paciente", a.patientName],
        ["Etapa", a.error.step],
        ["Status HTTP", a.error.httpStatus === undefined ? "-" : String(a.error.httpStatus)],
        ["Mensagem", a.error.message],
        ["Tentativa", String(a.error.attempt)],
      ]
      const footer = "Veja o campo last_error no banco de dados para os detalhes."
      await d.email.send({
        to: d.to,
        subject: `[tami-forms] Falha definitiva: ${a.kind} ${a.id}`,
        text: [...lines.map(([k, v]) => `${k}: ${v}`), "", footer].join("\n"),
        html: `<p>${lines.map(([k, v]) => `<strong>${k}:</strong> ${escapeHtml(v)}`).join("<br>")}</p><p>${footer}</p>`,
      })
    } catch (err) {
      d.log.error("alert_admin.send_failed", {
        kind: a.kind,
        id: a.id,
        message: safeErrorMessage(err),
      })
    }
  }
}
