import { describe, expect, it, vi } from "vitest"
import type { Channel, LastError, PlanGenerationRepo } from "@/lib/db/repos/types"
import type { Logger } from "@/lib/log"
import { parsePlanAnswers } from "@/lib/meal-plan/answers"
import { PlanGenerationError, type GeneratorResult, type MealPlanGenerator } from "@/lib/meal-plan/generator"
import type { GeneratedPlan } from "@/lib/meal-plan/plan"
import { SYSTEM_PROMPT, buildUserMessage } from "@/lib/meal-plan/prompt"
import { computeTargets } from "@/lib/meal-plan/targets"
import { createGeneratePlan, createRunPlanGeneration, type GeneratePlanResult } from "@/lib/services/generate-plan"
import { createMemoryRepos, type PatientRow } from "../../fakes/memory-repos"

const NOW = new Date("2026-10-11T15:00:00Z")
const CHANNELS: Channel[] = ["email", "whatsapp"]
const TEMP_PASSWORD = "SENHATEMP7"
const ANSWER_MARKER = "RESPOSTA-SECRETA-DO-QUIZ"
const FOOD_MARKER = "ALIMENTO-SECRETO-DO-PLANO"
const OBS_MARKER = "OBSERVACAO-SECRETA-DO-PLANO"

const ANSWERS: Record<string, unknown> = {
  faixa_etaria: "25-34 anos",
  sexo_biologico: "Feminino",
  tipo_fisico: "Mais cheinha",
  peso_comportamento: "Ganho peso com facilidade",
  breakfast_foods: ["Pão francês", "Café com leite"],
  almoco: "Arroz, feijão e frango",
  lanche_tarde: "Fruta",
  jantar: "Sopa",
  sobremesa: "Chocolate",
  rotina_dia: "Trabalho sentada",
  sono: "6 horas",
  agua: "1 litro",
  habitos: ANSWER_MARKER,
  altura_cm: "165",
  peso_kg: "80",
  imc: "29,4",
  meta_peso_30d: "75",
}

const PARSED = (() => {
  const p = parsePlanAnswers(ANSWERS)
  if (!p.ok) throw new Error("respostas de teste inválidas")
  return p.value
})()
const TARGETS = computeTargets(PARSED)

/** Plano válido para a meta da paciente: 4 refeições que somam a meta. */
function validPlan(): GeneratedPlan {
  const each = TARGETS.calories / 4
  return {
    meals: ["Café da manhã", "Almoço", "Lanche", "Jantar"].map((name, i) => ({
      name,
      time: `0${7 + i}:00`,
      foods: `${FOOD_MARKER} — 100 g\nCafé sem açúcar — 200 ml`,
      calories: each,
    })),
    calories: TARGETS.calories,
    observations: OBS_MARKER,
  }
}

function invalidPlan(): GeneratedPlan {
  // Total muito abaixo do piso: calories_out_of_range.
  const plan = validPlan()
  return { ...plan, meals: plan.meals.map((m) => ({ ...m, calories: 100 })), calories: 400 }
}

const reply = (plan: GeneratedPlan): GeneratorResult => ({
  plan,
  model: "claude-opus-5-5",
  inputTokens: 2000,
  outputTokens: 5000,
})

const seedError: LastError = { step: "seed", message: "seed", attempt: 1, at: NOW.toISOString() }

type Setup = Awaited<ReturnType<typeof setup>>

async function setup(
  opts: {
    answers?: Record<string, unknown>
    now?: Date
    wrap?: (repo: PlanGenerationRepo) => PlanGenerationRepo
  } = {},
) {
  const repos = createMemoryRepos()
  const created = await repos.submissions.create({
    submissionId: "sub-1",
    patient: { name: "Ana Souza", cpf: "52998224725", email: "ana@example.com", phone: "11999990000" },
    answers: opts.answers !== undefined ? opts.answers : ANSWERS,
    amount: "39.90",
    todaySP: "2026-10-11",
  })
  if (created === "duplicate") throw new Error("unexpected duplicate")
  await repos.payments.markSynced(created.paymentId, {
    asaasId: "pay_1",
    asaasCustomerId: "cus_1",
    status: "PENDING",
    paymentUrl: "https://asaas.test/i/1",
    invoiceNumber: "INV-1",
    billingType: "UNDEFINED",
    dueDate: "2026-10-13",
  })
  const event = await repos.webhooks.applyPaymentEvent(
    {
      eventId: "evt-1",
      event: "PAYMENT_RECEIVED",
      group: "paid",
      asaasPaymentId: "pay_1",
      externalReference: created.paymentId,
      status: "RECEIVED",
      billingType: "PIX",
      invoiceNumber: "INV-1",
      paymentDate: "2026-10-11",
    },
    NOW,
  )
  if (event.outcome !== "processed" || !event.pendingGeneration) throw new Error("geração não criada")

  const generator = { generate: vi.fn(async (_i: { system: string; user: string }) => reply(validPlan())) }
  const hashPassword = vi.fn(async (p: string) => `scrypt$hash-of-${p.length}`)
  const tempPassword = vi.fn((_patientId: string) => TEMP_PASSWORD)
  const alertAdmin = vi.fn(async (_a: unknown) => {})
  const log: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const generatePlan = createGeneratePlan({
    planGenerations: opts.wrap ? opts.wrap(repos.planGenerations) : repos.planGenerations,
    generator: generator satisfies MealPlanGenerator,
    hashPassword,
    tempPassword,
    alertAdmin,
    log,
    now: () => opts.now ?? NOW,
    config: { channels: CHANNELS },
  })
  return {
    repos,
    generator,
    hashPassword,
    tempPassword,
    alertAdmin,
    log,
    generatePlan,
    generationId: event.pendingGeneration.id,
    quizResponseId: created.quizResponseId,
    paymentId: created.paymentId,
  }
}

const row = (s: Setup) => s.repos.state.planGenerations.get(s.generationId)!
const patientRow = (s: Setup) => [...s.repos.state.patients.values()][0]
const plans = (s: Setup) => [...s.repos.state.mealPlans.values()]

function loggedText(log: Logger): string {
  return JSON.stringify([
    ...(log.info as ReturnType<typeof vi.fn>).mock.calls,
    ...(log.warn as ReturnType<typeof vi.fn>).mock.calls,
    ...(log.error as ReturnType<typeof vi.fn>).mock.calls,
  ])
}

function leaks(s: Setup): string {
  return JSON.stringify({ logs: loggedText(s.log), lastError: row(s).lastError, alerts: s.alertAdmin.mock.calls })
}

const SECRETS = [ANSWER_MARKER, FOOD_MARKER, OBS_MARKER, TEMP_PASSWORD]

describe("createGeneratePlan", () => {
  it("sucesso: plano active com título e datas, credencial, notificações e geração done", async () => {
    const s = await setup()

    const result = await s.generatePlan(s.generationId)

    expect(result).toEqual({ status: "done", quizResponseId: s.quizResponseId })
    const [plan] = plans(s)
    expect(plans(s)).toHaveLength(1)
    expect(plan).toMatchObject({
      paymentId: s.paymentId,
      title: "Plano Alimentar 10/2026",
      startDate: "2026-10-11",
      endDate: "2026-11-10",
      status: "active",
    })
    expect(typeof plan.planData.meals[0].calories).toBe("string")
    expect(plan.planData.calories).toBe(TARGETS.calories)

    const patient = patientRow(s)
    expect(s.tempPassword).toHaveBeenCalledWith(patient.id)
    expect(s.hashPassword).toHaveBeenCalledWith(TEMP_PASSWORD)
    expect(patient.passwordHash).toBe(`scrypt$hash-of-${TEMP_PASSWORD.length}`)

    const notifications = [...s.repos.state.notifications.values()].filter((n) => n.kind === "plan_ready")
    expect(notifications.map((n) => [n.channel, n.status]).sort()).toEqual([
      ["email", "pending"],
      ["whatsapp", "pending"],
    ])

    expect(row(s)).toMatchObject({ status: "done", mealPlanId: plan.id, lockedUntil: null })
    expect(row(s).generation).toEqual({
      model: "claude-opus-5-5",
      inputTokens: 2000,
      outputTokens: 5000,
      targets: TARGETS,
    })
    expect(s.log.info).toHaveBeenCalledWith("plan.generation.done", {
      generationId: s.generationId,
      mealPlanId: plan.id,
      model: "claude-opus-5-5",
      inputTokens: 2000,
      outputTokens: 5000,
      durationMs: expect.any(Number),
    })
    expect(s.alertAdmin).not.toHaveBeenCalled()
    for (const secret of SECRETS) expect(loggedText(s.log)).not.toContain(secret)
  })

  it("fuso: 2026-11-01T01:30:00Z é 31/10 em São Paulo", async () => {
    const s = await setup({ now: new Date("2026-11-01T01:30:00Z") })

    expect((await s.generatePlan(s.generationId)).status).toBe("done")

    expect(plans(s)[0]).toMatchObject({
      title: "Plano Alimentar 10/2026",
      startDate: "2026-10-31",
      endDate: "2026-11-30",
    })
  })

  it("o gerador recebe o prompt de sistema e a mensagem com as metas", async () => {
    const s = await setup()

    await s.generatePlan(s.generationId)

    expect(s.generator.generate).toHaveBeenCalledTimes(1)
    expect(s.generator.generate).toHaveBeenCalledWith({
      system: SYSTEM_PROMPT,
      user: buildUserMessage(PARSED, TARGETS),
    })
  })

  it("paciente que já tem senha: hashPassword não é chamado e o hash fica", async () => {
    const s = await setup()
    // O fake não tem método para isso: a credencial já gravada é simulada direto na linha.
    ;(patientRow(s) as PatientRow).passwordHash = "scrypt$existente"

    expect((await s.generatePlan(s.generationId)).status).toBe("done")

    expect(s.hashPassword).not.toHaveBeenCalled()
    expect(s.tempPassword).not.toHaveBeenCalled()
    expect(patientRow(s).passwordHash).toBe("scrypt$existente")
  })

  it.each([{ peso_kg: "abc" }, { altura_cm: "" }, { faixa_etaria: "60+ anos" }])(
    "respostas inválidas %j: failed na primeira vez, alerta meal_plan, IA não chamada",
    async (override) => {
      const s = await setup({ answers: { ...ANSWERS, ...override } })

      expect(await s.generatePlan(s.generationId)).toEqual({ status: "failed" })

      expect(s.generator.generate).not.toHaveBeenCalled()
      expect(row(s)).toMatchObject({ status: "failed", attempts: 1, nextAttemptAt: null, lockedUntil: null })
      expect(row(s).lastError).toMatchObject({ step: "plan.answers", attempt: 1, at: NOW.toISOString() })
      expect(s.alertAdmin).toHaveBeenCalledTimes(1)
      expect(s.alertAdmin).toHaveBeenCalledWith({
        kind: "meal_plan",
        id: s.generationId,
        patientName: "Ana Souza",
        error: expect.objectContaining({ step: "plan.answers" }),
      })
      expect(s.log.error).toHaveBeenCalledWith("plan.generation.failed", {
        generationId: s.generationId,
        step: "plan.answers",
        attempt: 1,
        message: expect.any(String),
      })
      expect(plans(s)).toHaveLength(0)
    },
  )

  it("respostas que não são objeto: failed definitivo em plan.answers, sem lançar", async () => {
    const s = await setup({ answers: null as unknown as Record<string, unknown> })

    expect(await s.generatePlan(s.generationId)).toEqual({ status: "failed" })

    expect(s.generator.generate).not.toHaveBeenCalled()
    expect(row(s)).toMatchObject({ status: "failed", attempts: 1 })
    expect(row(s).lastError?.step).toBe("plan.answers")
    expect(s.alertAdmin).toHaveBeenCalledTimes(1)
  })

  it("plano inválido: retry_scheduled, attempts 1, próxima tentativa em NOW + 2 min, nenhum plano gravado", async () => {
    const s = await setup()
    s.generator.generate.mockResolvedValueOnce(reply(invalidPlan()))

    expect(await s.generatePlan(s.generationId)).toEqual({ status: "retry_scheduled" })

    expect(row(s)).toMatchObject({ status: "pending", attempts: 1, lockedUntil: null })
    expect(row(s).nextAttemptAt).toEqual(new Date(NOW.getTime() + 2 * 60_000))
    expect(row(s).lastError).toMatchObject({ step: "plan.validate", attempt: 1, at: NOW.toISOString() })
    expect(row(s).lastError?.message).toContain("invalid plan")
    expect(plans(s)).toHaveLength(0)
    expect(s.hashPassword).not.toHaveBeenCalled()
    expect(s.alertAdmin).not.toHaveBeenCalled()
    expect(s.log.warn).toHaveBeenCalledWith("plan.generation.retry_scheduled", {
      generationId: s.generationId,
      step: "plan.validate",
      attempt: 1,
      message: row(s).lastError?.message,
    })
    expect(await s.repos.planGenerations.listDue(new Date(NOW.getTime() + 60_000), 10)).not.toContain(s.generationId)
    expect(await s.repos.planGenerations.listDue(new Date(NOW.getTime() + 2 * 60_000), 10)).toContain(s.generationId)
  })

  it("erro temporário da IA agenda nova tentativa; o definitivo vira failed com alerta na primeira vez", async () => {
    const s = await setup()
    s.generator.generate.mockRejectedValueOnce(new PlanGenerationError("anthropic 529", true))

    expect(await s.generatePlan(s.generationId)).toEqual({ status: "retry_scheduled" })
    expect(row(s)).toMatchObject({ status: "pending", attempts: 1, lockedUntil: null })
    expect(row(s).lastError).toMatchObject({ step: "plan.generate", message: "anthropic 529" })
    expect(s.alertAdmin).not.toHaveBeenCalled()

    s.generator.generate.mockRejectedValueOnce(new PlanGenerationError("anthropic 401", false))

    expect(await s.generatePlan(s.generationId)).toEqual({ status: "failed" })
    expect(row(s)).toMatchObject({ status: "failed", attempts: 2, nextAttemptAt: null, lockedUntil: null })
    expect(row(s).lastError).toMatchObject({ step: "plan.generate", message: "anthropic 401", attempt: 2 })
    expect(s.alertAdmin).toHaveBeenCalledTimes(1)
    expect(s.alertAdmin).toHaveBeenCalledWith({
      kind: "meal_plan",
      id: s.generationId,
      patientName: "Ana Souza",
      error: expect.objectContaining({ step: "plan.generate", message: "anthropic 401" }),
    })
    expect(plans(s)).toHaveLength(0)
  })

  it("erro que não é PlanGenerationError é temporário", async () => {
    const s = await setup()
    s.generator.generate.mockRejectedValueOnce(new Error("socket hang up"))

    expect(await s.generatePlan(s.generationId)).toEqual({ status: "retry_scheduled" })
    expect(row(s).lastError).toMatchObject({ step: "plan.generate", message: "socket hang up" })
  })

  it("a 5ª falha vira failed com alerta", async () => {
    const s = await setup()
    await s.repos.planGenerations.markFailure(s.generationId, {
      attempts: 4,
      nextAttemptAt: NOW,
      failed: false,
      error: seedError,
    })
    s.generator.generate.mockRejectedValueOnce(new PlanGenerationError("anthropic 529", true))

    expect(await s.generatePlan(s.generationId)).toEqual({ status: "failed" })

    expect(row(s)).toMatchObject({ status: "failed", attempts: 5, nextAttemptAt: null, lockedUntil: null })
    expect(s.alertAdmin).toHaveBeenCalledTimes(1)
    expect(s.log.error).toHaveBeenCalledWith("plan.generation.failed", {
      generationId: s.generationId,
      step: "plan.generate",
      attempt: 5,
      message: "anthropic 529",
    })
  })

  it("a 4ª falha ainda reagenda, com backoff de 16 min", async () => {
    const s = await setup()
    await s.repos.planGenerations.markFailure(s.generationId, {
      attempts: 3,
      nextAttemptAt: NOW,
      failed: false,
      error: seedError,
    })
    s.generator.generate.mockResolvedValueOnce(reply(invalidPlan()))

    expect(await s.generatePlan(s.generationId)).toEqual({ status: "retry_scheduled" })
    expect(row(s).nextAttemptAt).toEqual(new Date(NOW.getTime() + 16 * 60_000))
  })

  describe("last_error e logs não contêm respostas do quiz nem alimentos do plano", () => {
    it("plano inválido até a falha definitiva", async () => {
      const s = await setup()
      await s.repos.planGenerations.markFailure(s.generationId, {
        attempts: 4,
        nextAttemptAt: NOW,
        failed: false,
        error: seedError,
      })
      s.generator.generate.mockResolvedValueOnce(reply(invalidPlan()))

      expect(await s.generatePlan(s.generationId)).toEqual({ status: "failed" })

      expect(s.alertAdmin).toHaveBeenCalledTimes(1)
      for (const secret of SECRETS) expect(leaks(s)).not.toContain(secret)
    })

    it("complete lança erro do Drizzle com o plano e o hash nos parâmetros", async () => {
      const s = await setup({
        wrap: (repo) => ({
          ...repo,
          complete: async () => {
            throw new Error(
              `Failed query: insert into meal_plans (plan_data) values (?)\nparams: ${FOOD_MARKER},${OBS_MARKER},${TEMP_PASSWORD}`,
            )
          },
        }),
      })

      expect(await s.generatePlan(s.generationId)).toEqual({ status: "retry_scheduled" })

      expect(row(s).lastError?.step).toBe("db.complete")
      for (const secret of SECRETS) expect(leaks(s)).not.toContain(secret)
    })

    it("respostas inválidas não vão para o last_error", async () => {
      const s = await setup({ answers: { ...ANSWERS, peso_kg: "MARCADOR-PESO" } })

      expect(await s.generatePlan(s.generationId)).toEqual({ status: "failed" })

      for (const secret of [...SECRETS, "MARCADOR-PESO"]) expect(leaks(s)).not.toContain(secret)
    })
  })

  it("geração reservada → busy, IA não chamada", async () => {
    const s = await setup()
    expect(await s.repos.planGenerations.tryLock(s.generationId, 60_000)).toBe(true)

    expect(await s.generatePlan(s.generationId)).toEqual({ status: "busy" })

    expect(s.generator.generate).not.toHaveBeenCalled()
    expect(row(s).lockedUntil).not.toBeNull()
    expect(row(s).attempts).toBe(0)
  })

  it("geração done ou inexistente → skipped", async () => {
    const s = await setup()
    expect((await s.generatePlan(s.generationId)).status).toBe("done")
    s.generator.generate.mockClear()

    expect(await s.generatePlan(s.generationId)).toEqual({ status: "skipped" })
    expect(await s.generatePlan("nao-existe")).toEqual({ status: "skipped" })

    expect(s.generator.generate).not.toHaveBeenCalled()
    expect(plans(s)).toHaveLength(1)
  })

  it("geração failed → skipped, sem alerta novo", async () => {
    const s = await setup()
    await s.repos.planGenerations.markFailure(s.generationId, {
      attempts: 5,
      nextAttemptAt: null,
      failed: true,
      error: seedError,
    })

    expect(await s.generatePlan(s.generationId)).toEqual({ status: "skipped" })
    expect(s.generator.generate).not.toHaveBeenCalled()
    expect(s.alertAdmin).not.toHaveBeenCalled()
  })

  it("concluída por outro processo entre o get e o lock: a releitura devolve skipped", async () => {
    let calls = 0
    const s = await setup({
      wrap: (repo) => ({
        ...repo,
        get: async (id) => {
          const view = await repo.get(id)
          calls++
          return calls === 2 && view ? { ...view, status: "done" } : view
        },
      }),
    })

    expect(await s.generatePlan(s.generationId)).toEqual({ status: "skipped" })
    expect(s.generator.generate).not.toHaveBeenCalled()
    expect(row(s).lockedUntil).toBeNull()
  })

  it("complete falha: retry_scheduled e o lock é solto", async () => {
    const s = await setup({
      wrap: (repo) => ({
        ...repo,
        complete: async () => {
          throw new Error("plan_generations: geração não está pending")
        },
      }),
    })

    expect(await s.generatePlan(s.generationId)).toEqual({ status: "retry_scheduled" })

    expect(row(s)).toMatchObject({ status: "pending", attempts: 1, lockedUntil: null })
    expect(row(s).lastError).toMatchObject({ step: "db.complete" })
    expect(plans(s)).toHaveLength(0)
  })

  it("hash lança: retry_scheduled em access.hash", async () => {
    const s = await setup()
    s.tempPassword.mockImplementationOnce(() => {
      throw new Error("deriveTempPassword: segredo vazio")
    })

    expect(await s.generatePlan(s.generationId)).toEqual({ status: "retry_scheduled" })
    expect(row(s).lastError).toMatchObject({ step: "access.hash", message: "deriveTempPassword: segredo vazio" })
    expect(row(s).lockedUntil).toBeNull()
    expect(s.alertAdmin).not.toHaveBeenCalled()
  })

  it("markFailure lança: loga, devolve retry_scheduled e solta o lock", async () => {
    const s = await setup({
      wrap: (repo) => ({
        ...repo,
        markFailure: async () => {
          throw new Error("db down")
        },
      }),
    })
    s.generator.generate.mockRejectedValueOnce(new PlanGenerationError("anthropic 529", true))

    expect(await s.generatePlan(s.generationId)).toEqual({ status: "retry_scheduled" })
    expect(s.log.error).toHaveBeenCalledWith("plan.generation.record_failure_failed", expect.any(Object))
    expect(row(s).lockedUntil).toBeNull()
  })

  it("alertAdmin que lança não derruba o resultado failed", async () => {
    const s = await setup()
    s.alertAdmin.mockRejectedValueOnce(new Error("alert broke"))
    s.generator.generate.mockRejectedValueOnce(new PlanGenerationError("anthropic 401", false))

    expect(await s.generatePlan(s.generationId)).toEqual({ status: "failed" })
    expect(row(s).status).toBe("failed")
  })
})

describe("createRunPlanGeneration", () => {
  function run(result: () => Promise<GeneratePlanResult>, dispatchFails = false) {
    const generatePlan = vi.fn(async (_id: string) => result())
    const dispatchForQuizResponse = vi.fn(async (_id: string) => {
      if (dispatchFails) throw new Error("dispatch broke")
    })
    const log: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
    const runPlanGeneration = createRunPlanGeneration({ generatePlan, dispatchForQuizResponse, log })
    return { generatePlan, dispatchForQuizResponse, log, runPlanGeneration }
  }

  it("runPlanGeneration: done despacha as notificações do envio; falha não despacha; exceção não vaza", async () => {
    const done = run(async () => ({ status: "done", quizResponseId: "qr-1" }))
    await done.runPlanGeneration("gen-1")
    expect(done.generatePlan).toHaveBeenCalledWith("gen-1")
    expect(done.dispatchForQuizResponse).toHaveBeenCalledWith("qr-1")

    for (const status of ["busy", "skipped", "retry_scheduled", "failed"] as const) {
      const r = run(async () => ({ status }))
      await r.runPlanGeneration("gen-1")
      expect(r.dispatchForQuizResponse).not.toHaveBeenCalled()
    }

    const throwing = run(async () => {
      throw new Error("db down")
    })
    await expect(throwing.runPlanGeneration("gen-1")).resolves.toBeUndefined()
    expect(throwing.dispatchForQuizResponse).not.toHaveBeenCalled()
    expect(throwing.log.error).toHaveBeenCalled()

    const dispatchThrows = run(async () => ({ status: "done", quizResponseId: "qr-1" }), true)
    await expect(dispatchThrows.runPlanGeneration("gen-1")).resolves.toBeUndefined()
    expect(dispatchThrows.log.error).toHaveBeenCalled()
  })

  it("integração: a geração concluída despacha o envio dela", async () => {
    const s = await setup()
    const dispatchForQuizResponse = vi.fn(async (_id: string) => {})
    const runPlanGeneration = createRunPlanGeneration({
      generatePlan: s.generatePlan,
      dispatchForQuizResponse,
      log: s.log,
    })

    await runPlanGeneration(s.generationId)

    expect(dispatchForQuizResponse).toHaveBeenCalledWith(s.quizResponseId)
  })
})
