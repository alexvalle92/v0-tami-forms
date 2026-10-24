import type { LastError } from "@/lib/db/repos/types"
import type { Logger } from "@/lib/log"
import type { EmailSender } from "@/lib/notify/email"
import { safeErrorMessage } from "./last-error"

export type AdminAlert = {
  kind: "payment" | "notification" | "meal_plan" | "meta_conversion"
  id: string
  patientName: string
  error: LastError
}

export type AlertAdmin = (a: AdminAlert) => Promise<void>

/** Aviso ao admin de um evento do Asaas que pede atenção humana (spec §5, §9). */
export type AdminNotice = {
  kind: "payment_reversal" | "payment_without_quiz"
  /** Id da cobrança no app (`payments.id`). */
  paymentId: string
  patientName: string
  /** Nome do evento do Asaas (`PAYMENT_REFUNDED` etc.). */
  event: string
  asaasPaymentId: string | null
}

export type NoticeAdmin = (n: AdminNotice) => Promise<void>

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

const NOTICE_SUBJECT: Record<AdminNotice["kind"], string> = {
  payment_reversal: "Pagamento revertido",
  payment_without_quiz: "Pagamento sem envio do quiz",
}

/**
 * Avisa o admin por e-mail de um estorno/chargeback ou de um pagamento sem envio do quiz.
 * Nunca lança: se o envio falhar, só registra no log (o evento já está gravado em `payments`).
 * O e-mail leva só tipo, evento, ids da cobrança e nome do paciente: nada de CPF, e-mail, telefone
 * nem do corpo do evento.
 */
export function createNoticeAdmin(d: { email: EmailSender; to: string; log: Logger }): NoticeAdmin {
  return async (n) => {
    try {
      const lines: [string, string][] = [
        ["Tipo", n.kind],
        ["Evento", n.event],
        ["Cobrança no Asaas", n.asaasPaymentId ?? "-"],
        ["Cobrança", n.paymentId],
        ["Paciente", n.patientName],
      ]
      await d.email.send({
        to: d.to,
        subject: `[tami-forms] ${NOTICE_SUBJECT[n.kind]}: ${n.paymentId}`,
        text: lines.map(([k, v]) => `${k}: ${v}`).join("\n"),
        html: `<p>${lines.map(([k, v]) => `<strong>${k}:</strong> ${escapeHtml(v)}`).join("<br>")}</p>`,
      })
    } catch (err) {
      d.log.error("notice_admin.send_failed", {
        kind: n.kind,
        paymentId: n.paymentId,
        message: safeErrorMessage(err),
      })
    }
  }
}
