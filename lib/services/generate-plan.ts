import type { Channel, PlanGenerationRepo, PlanGenerationView } from "@/lib/db/repos/types"
import { MAX_PLAN_ATTEMPTS, jobBackoffMs } from "@/lib/jobs/backoff"
import type { Logger } from "@/lib/log"
import { parsePlanAnswers, type PlanAnswers } from "@/lib/meal-plan/answers"
import { PlanGenerationError, type MealPlanGenerator } from "@/lib/meal-plan/generator"
import { toPlanData, validatePlan } from "@/lib/meal-plan/plan"
import { SYSTEM_PROMPT, buildUserMessage } from "@/lib/meal-plan/prompt"
import { computeTargets } from "@/lib/meal-plan/targets"
import { addDaysISO, todayInSaoPaulo } from "@/lib/time"
import type { AlertAdmin } from "./alert-admin"
import { safeErrorMessage, toLastError } from "./last-error"

export type GeneratePlanResult =
  | { status: "done"; quizResponseId: string }
  | { status: "busy" | "skipped" | "retry_scheduled" | "failed" }

export type GeneratePlan = (generationId: string) => Promise<GeneratePlanResult>

/** Cobre a chamada à IA (até 120 s, mais uma repetição do SDK) com folga. */
const LOCK_TTL_MS = 300_000
const PLAN_VALIDITY_DAYS = 30

/**
 * Respostas do envio prontas para o cálculo. Respostas inválidas não melhoram com nova tentativa:
 * viram erro definitivo. A mensagem traz só nomes de campo, nunca os valores (vai para `last_error` e log).
 */
function readAnswers(answers: unknown): PlanAnswers {
  if (typeof answers !== "object" || answers === null || Array.isArray(answers)) {
    throw new PlanGenerationError("invalid answers: not an object", false)
  }
  let parsed: ReturnType<typeof parsePlanAnswers>
  try {
    parsed = parsePlanAnswers(answers as Record<string, unknown>)
  } catch {
    throw new PlanGenerationError("invalid answers: unreadable", false)
  }
  if (!parsed.ok) throw new PlanGenerationError(`invalid answers: ${parsed.issues.join(",")}`, false)
  return parsed.value
}

/** "Plano Alimentar MM/AAAA" a partir de uma data YYYY-MM-DD. */
function planTitle(startDate: string): string {
  return `Plano Alimentar ${startDate.slice(5, 7)}/${startDate.slice(0, 4)}`
}

/**
 * Gera o plano alimentar de uma geração `pending` (spec §6): respostas → metas → IA → validação →
 * credencial → transação de conclusão. Falhas viram nova tentativa com backoff; a definitiva
 * (respostas inválidas, erro permanente da IA ou 5ª tentativa) marca `failed` e alerta o admin.
 * Logs e `last_error` nunca levam respostas do quiz, conteúdo do plano nem a senha temporária.
 */
export function createGeneratePlan(d: {
  planGenerations: PlanGenerationRepo
  generator: MealPlanGenerator
  hashPassword: (password: string) => Promise<string>
  tempPassword: (patientId: string) => string
  alertAdmin: AlertAdmin
  log: Logger
  now: () => Date
  config: { channels: Channel[] }
}): GeneratePlan {
  async function recordFailure(
    g: PlanGenerationView,
    step: string,
    err: unknown,
  ): Promise<{ result: GeneratePlanResult; lockCleared: boolean }> {
    const attempts = g.attempts + 1
    const failed = (err instanceof PlanGenerationError && !err.transient) || attempts >= MAX_PLAN_ATTEMPTS
    const at = d.now()
    const error = toLastError(step, err, attempts, at)
    const fields = {
      generationId: g.id,
      step,
      attempt: attempts,
      message: error.message,
      ...(error.httpStatus !== undefined ? { httpStatus: error.httpStatus } : {}),
    }

    try {
      await d.planGenerations.markFailure(g.id, {
        attempts,
        nextAttemptAt: failed ? null : new Date(at.getTime() + jobBackoffMs(attempts)),
        failed,
        error,
      })
    } catch (recordErr) {
      d.log.error("plan.generation.record_failure_failed", { ...fields, recordMessage: safeErrorMessage(recordErr) })
      return { result: { status: "retry_scheduled" }, lockCleared: false }
    }

    if (!failed) {
      d.log.warn("plan.generation.retry_scheduled", fields)
      return { result: { status: "retry_scheduled" }, lockCleared: true }
    }

    d.log.error("plan.generation.failed", fields)
    try {
      await d.alertAdmin({ kind: "meal_plan", id: g.id, patientName: g.patient.name, error })
    } catch (alertErr) {
      d.log.error("plan.generation.alert_failed", { generationId: g.id, message: safeErrorMessage(alertErr) })
    }
    return { result: { status: "failed" }, lockCleared: true }
  }

  return async function generatePlan(generationId) {
    const first = await d.planGenerations.get(generationId)
    if (!first || first.status !== "pending") return { status: "skipped" }

    if (!(await d.planGenerations.tryLock(generationId, LOCK_TTL_MS))) return { status: "busy" }

    // `complete` e `markFailure` soltam o lock; em qualquer outro caminho o `finally` o solta.
    let lockHeld = true
    try {
      // Outro processo pode ter terminado entre o `get` e o lock: relê para não gerar de novo nem recontar tentativas.
      const g = await d.planGenerations.get(generationId)
      if (!g || g.status !== "pending") return { status: "skipped" }

      const startedAtMs = d.now().getTime()
      let step = "plan.answers"
      try {
        const answers = readAnswers(g.answers)
        const targets = computeTargets(answers)

        step = "plan.generate"
        const generated = await d.generator.generate({
          system: SYSTEM_PROMPT,
          user: buildUserMessage(answers, targets),
        })

        // Plano fora das regras pode sair certo na próxima chamada: erro temporário.
        step = "plan.validate"
        const issues = validatePlan(generated.plan, targets)
        if (issues.length > 0) throw new PlanGenerationError(`invalid plan: ${issues.join(",")}`, true)
        const planData = toPlanData(generated.plan)

        // Fora da transação: o scrypt é lento. Só quem ainda não tem credencial recebe a senha temporária.
        step = "access.hash"
        const passwordHash = g.patient.hasPassword ? null : await d.hashPassword(d.tempPassword(g.patient.id))

        step = "db.complete"
        const startDate = todayInSaoPaulo(d.now())
        const { mealPlanId } = await d.planGenerations.complete(g.id, {
          title: planTitle(startDate),
          startDate,
          endDate: addDaysISO(startDate, PLAN_VALIDITY_DAYS),
          planData,
          generation: {
            model: generated.model,
            inputTokens: generated.inputTokens,
            outputTokens: generated.outputTokens,
            targets,
          },
          passwordHash,
          channels: d.config.channels,
        })
        lockHeld = false

        d.log.info("plan.generation.done", {
          generationId: g.id,
          mealPlanId,
          model: generated.model,
          inputTokens: generated.inputTokens,
          outputTokens: generated.outputTokens,
          durationMs: d.now().getTime() - startedAtMs,
        })
        return { status: "done", quizResponseId: g.quizResponseId }
      } catch (err) {
        const { result, lockCleared } = await recordFailure(g, step, err)
        if (lockCleared) lockHeld = false
        return result
      }
    } finally {
      if (lockHeld) {
        try {
          await d.planGenerations.unlock(generationId)
        } catch (err) {
          d.log.error("plan.generation.unlock_failed", { generationId, message: safeErrorMessage(err) })
        }
      }
    }
  }
}

/** Gera e, se concluiu, despacha as notificações do envio. Nunca lança. */
export function createRunPlanGeneration(d: {
  generatePlan: GeneratePlan
  dispatchForQuizResponse: (quizResponseId: string) => Promise<void>
  log: Logger
}): (generationId: string) => Promise<void> {
  return async function runPlanGeneration(generationId) {
    try {
      const result = await d.generatePlan(generationId)
      if (result.status === "done") await d.dispatchForQuizResponse(result.quizResponseId)
    } catch (err) {
      d.log.error("plan.generation.run_failed", { generationId, message: safeErrorMessage(err) })
    }
  }
}
