import { isBearerAuthorized } from "@/lib/http/auth"
import { readJsonBody } from "@/lib/http/read-json"
import type { Logger } from "@/lib/log"
import { parseSubmitRequest } from "@/lib/quiz/validation"
import { safeErrorMessage } from "@/lib/services/last-error"
import type { SubmitQuiz } from "@/lib/services/submit-quiz"

export const RENEWALS_MAX_BODY_BYTES = 64 * 1024

const notOk = (status: number) => Response.json({ ok: false }, { status })

/**
 * POST /api/renewals (§7 do spec de vencimento e renovação): o PlanA pede a cobrança de renovação
 * de um paciente. Token (JOBS_TOKEN) → corpo (64 KB) → validação → mesmo serviço do quiz → HTTP.
 * Diferente do quiz, aceita `whatsapp` vazio (paciente cadastrado pelo admin sem telefone) e não
 * tem limite por IP: quem chama é o PlanA. Nada do corpo vai para o log.
 */
export function createRenewalsHandler(d: {
  token: string
  submitQuiz: SubmitQuiz
  dispatchForQuizResponse: (quizResponseId: string) => Promise<void>
  defer: (fn: () => Promise<void>) => void
  log: Logger
}): (req: Request) => Promise<Response> {
  return async function handleRenewals(req) {
    try {
      if (!isBearerAuthorized(req.headers.get("authorization"), d.token)) {
        d.log.warn("renewals.unauthorized")
        return notOk(401)
      }

      const body = await readJsonBody(req, RENEWALS_MAX_BODY_BYTES)
      if (!body.ok) {
        d.log.warn("renewals.bad_body", { status: body.status })
        return notOk(body.status)
      }

      const parsed = parseSubmitRequest(body.value, { allowEmptyPhone: true })
      if (!parsed.ok) {
        // `issues` só tem caminho e mensagem, nunca os valores recebidos.
        d.log.warn("renewals.invalid", { issues: parsed.issues })
        return notOk(400)
      }

      const result = await d.submitQuiz(parsed.value)
      switch (result.kind) {
        case "link": {
          const { quizResponseId } = result
          d.defer(async () => {
            try {
              await d.dispatchForQuizResponse(quizResponseId)
            } catch (err) {
              d.log.error("renewals.dispatch_failed", { quizResponseId, message: safeErrorMessage(err) })
            }
          })
          return Response.json({ ok: true, paymentUrl: result.link })
        }
        case "pending":
          return Response.json({ ok: true, paymentUrl: null })
        default:
          return notOk(500)
      }
    } catch (err) {
      d.log.error("renewals.unexpected_error", { message: safeErrorMessage(err) })
      return notOk(500)
    }
  }
}
