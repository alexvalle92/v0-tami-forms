import { z } from "zod"
import { isBearerAuthorized } from "@/lib/http/auth"
import { readJsonBody } from "@/lib/http/read-json"
import type { RetryTarget } from "@/lib/jobs/retry-failed"
import type { Logger } from "@/lib/log"
import { safeErrorMessage } from "@/lib/services/last-error"

const RETRY_MAX_BODY_BYTES = 4 * 1024

type Runner = () => Promise<"ran" | "skipped">

const notOk = (status: number) => Response.json({ ok: false }, { status })

const authorized = (req: Request, token: string) => isBearerAuthorized(req.headers.get("authorization"), token)

const id = z.string().min(1).max(64)
const retryTargetSchema = z.union([
  z.object({ paymentId: id }).strict(),
  z.object({ notificationId: id }).strict(),
  z.object({ planGenerationId: id }).strict(),
  z.object({ allFailed: z.literal(true) }).strict(),
])

/** POST /api/jobs/run: uma rodada do job sob demanda (Bearer `JOBS_TOKEN`). */
export function createJobsRunHandler(d: {
  token: string
  runner: Runner
  log?: Logger
}): (req: Request) => Promise<Response> {
  return async function handleJobsRun(req) {
    if (!authorized(req, d.token)) return notOk(401)
    try {
      const resultado = await d.runner()
      return Response.json({ ok: true, resultado })
    } catch (err) {
      d.log?.error("jobs.run.failed", { message: safeErrorMessage(err) })
      return notOk(500)
    }
  }
}

/**
 * POST /api/jobs/retry: reabre cobranças/notificações/gerações de plano em falha definitiva
 * (`{ paymentId }`, `{ notificationId }`, `{ planGenerationId }` ou `{ allFailed: true }`) e, depois da resposta, dispara uma rodada do job.
 */
export function createJobsRetryHandler(d: {
  token: string
  retryFailed: (t: RetryTarget) => Promise<{ reopened: number }>
  runner: Runner
  defer: (fn: () => Promise<void>) => void
  log?: Logger
}): (req: Request) => Promise<Response> {
  return async function handleJobsRetry(req) {
    if (!authorized(req, d.token)) return notOk(401)

    const body = await readJsonBody(req, RETRY_MAX_BODY_BYTES)
    if (!body.ok) return notOk(400)
    const target = retryTargetSchema.safeParse(body.value)
    if (!target.success) return notOk(400)

    let reopened: number
    try {
      ;({ reopened } = await d.retryFailed(target.data))
    } catch (err) {
      d.log?.error("jobs.retry.failed", { message: safeErrorMessage(err) })
      return notOk(500)
    }

    d.log?.info("jobs.retry.reopened", { reopened })
    d.defer(async () => {
      try {
        await d.runner()
      } catch (err) {
        d.log?.error("jobs.retry.run_failed", { message: safeErrorMessage(err) })
      }
    })
    return Response.json({ ok: true, reopened })
  }
}
