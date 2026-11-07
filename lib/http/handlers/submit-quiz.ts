import { readJsonBody } from "@/lib/http/read-json"
import type { Logger } from "@/lib/log"
import { MENSAGEM_ERRO_PADRAO } from "@/lib/quiz/messages"
import { parseSubmitRequest } from "@/lib/quiz/validation"
import { safeErrorMessage } from "@/lib/services/last-error"
import type { SubmitQuiz } from "@/lib/services/submit-quiz"

export const SUBMIT_MAX_BODY_BYTES = 64 * 1024

/** Primeiro IP de `x-forwarded-for`, ou "unknown". */
export function clientIp(req: Request): string {
  const first = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
  return first || "unknown"
}

const failure = (status: number) =>
  Response.json({ sucesso: false, mensagemErro: MENSAGEM_ERRO_PADRAO }, { status })

/**
 * POST /api/submit-quiz (spec §5): rate limit → corpo (64 KB) → validação → serviço → HTTP.
 * Nunca devolve detalhes internos: todo erro vira a mensagem padrão. Nada do corpo é logado.
 */
export function createSubmitQuizHandler(d: {
  submitQuiz: SubmitQuiz
  dispatchForQuizResponse: (quizResponseId: string) => Promise<void>
  rateLimiter: { hit(k: string): boolean }
  defer: (fn: () => Promise<void>) => void
  log: Logger
}): (req: Request) => Promise<Response> {
  return async function handleSubmitQuiz(req) {
    try {
      if (!d.rateLimiter.hit(clientIp(req))) {
        d.log.warn("submit.rate_limited")
        return failure(429)
      }

      const body = await readJsonBody(req, SUBMIT_MAX_BODY_BYTES)
      if (!body.ok) {
        d.log.warn("submit.bad_body", { status: body.status })
        return failure(body.status)
      }

      const parsed = parseSubmitRequest(body.value)
      if (!parsed.ok) {
        // `issues` só tem caminho e mensagem, nunca os valores recebidos.
        d.log.warn("submit.invalid", { issues: parsed.issues })
        return failure(400)
      }

      const result = await d.submitQuiz(parsed.value, {
        clientIp: clientIp(req),
        userAgent: req.headers.get("user-agent") ?? undefined,
      })
      switch (result.kind) {
        case "link": {
          const { quizResponseId } = result
          d.defer(async () => {
            try {
              await d.dispatchForQuizResponse(quizResponseId)
            } catch (err) {
              d.log.error("submit.dispatch_failed", { quizResponseId, message: safeErrorMessage(err) })
            }
          })
          return Response.json({ sucesso: true, linkPagamento: result.link })
        }
        case "pending":
          return Response.json({ sucesso: true })
        default:
          return failure(500)
      }
    } catch (err) {
      d.log.error("submit.unexpected_error", { message: safeErrorMessage(err) })
      return failure(500)
    }
  }
}
