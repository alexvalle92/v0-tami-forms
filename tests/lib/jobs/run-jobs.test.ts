import { describe, expect, it, vi } from "vitest"
import { hashPassword, verifyPassword } from "@/lib/access/password-hash"
import { deriveTempPassword } from "@/lib/access/temp-password"
import type { Channel, NotificationRepo, PaymentRepo, PlanGenerationRepo } from "@/lib/db/repos/types"
import { createEnqueueExpiryReminders } from "@/lib/jobs/expiry-reminders"
import { createRunJobs } from "@/lib/jobs/run-jobs"
import type { Logger } from "@/lib/log"
import { parsePlanAnswers } from "@/lib/meal-plan/answers"
import type { GeneratorResult } from "@/lib/meal-plan/generator"
import type { GeneratedPlan } from "@/lib/meal-plan/plan"
import { computeTargets } from "@/lib/meal-plan/targets"
import { createDispatchNotification, type DispatchNotification } from "@/lib/services/dispatch-notification"
import { createGeneratePlan, type GeneratePlan } from "@/lib/services/generate-plan"
import { createSyncPayment, type SyncPayment } from "@/lib/services/sync-payment"
import { createFakeAsaas } from "../../fakes/fake-asaas"
import { createMemoryRepos } from "../../fakes/memory-repos"

const CHANNELS: Channel[] = ["email", "whatsapp"]
const PATIENTS = [
  { name: "Ana Souza", cpf: "52998224725", email: "ana@example.com", phone: "11999990000" },
  { name: "Bia Lima", cpf: "11144477735", email: "bia@example.com", phone: "11888880000" },
  { name: "Carla Dias", cpf: "39053344705", email: "carla@example.com", phone: "11777770000" },
  { name: "Dani Reis", cpf: "86288366757", email: "dani@example.com", phone: "11666660000" },
]
const LIMITS = { payments: 20, plans: 3, reminders: 0, notifications: 50 }
const ACCESS_SECRET = "segredo-de-teste-com-mais-de-32-caracteres"

// Respostas válidas do quiz: as gerações do teste passam pelo cálculo de metas e pela validação reais.
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
  habitos: "Belisco à noite",
  altura_cm: "165",
  peso_kg: "80",
  imc: "29,4",
  meta_peso_30d: "75",
}

const TARGET_CALORIES = (() => {
  const parsed = parsePlanAnswers(ANSWERS)
  if (!parsed.ok) throw new Error("respostas de teste inválidas")
  return computeTargets(parsed.value).calories
})()

/** Plano válido para a meta: 4 refeições que somam a meta. */
function validPlan(): GeneratedPlan {
  const each = TARGET_CALORIES / 4
  return {
    meals: ["Café da manhã", "Almoço", "Lanche", "Jantar"].map((name, i) => ({
      name,
      time: `0${7 + i}:00`,
      foods: "Ovos — 100 g\nCafé sem açúcar — 200 ml",
      calories: each,
    })),
    calories: TARGET_CALORIES,
    observations: "Beba água.",
  }
}

const generated = (): GeneratorResult => ({
  plan: validPlan(),
  model: "claude-opus-5-5",
  inputTokens: 2000,
  outputTokens: 5000,
})

type Overrides = {
  payments?: (r: ReturnType<typeof createMemoryRepos>) => PaymentRepo
  notifications?: (r: ReturnType<typeof createMemoryRepos>) => NotificationRepo
  planGenerations?: (r: ReturnType<typeof createMemoryRepos>) => PlanGenerationRepo
  wrapGenerate?: (real: GeneratePlan) => GeneratePlan
  wrapSync?: (real: SyncPayment) => SyncPayment
  wrapDispatch?: (real: DispatchNotification) => DispatchNotification
  /** Passo dos avisos de vencimento; por padrão não enfileira nada. */
  reminders?: (r: ReturnType<typeof createMemoryRepos>) => () => Promise<number>
  now?: () => Date
  /** Limpeza por retenção; por padrão a rodada não recebe `purge`. */
  purge?: () => Promise<number>
}

async function setup(patientCount = 1, o: Overrides = {}) {
  const repos = createMemoryRepos()
  const asaas = createFakeAsaas()
  const log: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const email = { send: vi.fn(async (_m: unknown) => {}) }
  const whatsapp = { sendText: vi.fn(async (_n: string, _t: string) => {}) }
  const now = o.now ?? (() => new Date())
  const paymentIds: string[] = []
  for (let i = 0; i < patientCount; i++) {
    const created = await repos.submissions.create({
      submissionId: `sub-${i}`,
      patient: PATIENTS[i],
      answers: ANSWERS,
      amount: "39.90",
      todaySP: "2026-10-07",
    })
    if (created === "duplicate") throw new Error("unexpected duplicate")
    paymentIds.push(created.paymentId)
  }
  const alertAdmin = vi.fn(async (_a: unknown) => {})
  const syncPayment = createSyncPayment({
    payments: repos.payments,
    notifications: repos.notifications,
    asaas,
    alertAdmin,
    log,
    now,
    config: { dueDays: 2, successUrl: "https://app.example.com/obrigado", channels: CHANNELS },
  })
  const dispatchNotification = createDispatchNotification({
    notifications: repos.notifications,
    email,
    whatsapp,
    alertAdmin,
    log,
    now,
    sleep: async () => {},
    access: { tempPassword: (patientId) => deriveTempPassword(ACCESS_SECRET, patientId), verifyPassword },
    appUrl: "https://plana.example.com/",
  })
  const generator = { generate: vi.fn(async (_i: { system: string; user: string }) => generated()) }
  const generatePlan = createGeneratePlan({
    planGenerations: repos.planGenerations,
    generator,
    hashPassword,
    tempPassword: (patientId) => deriveTempPassword(ACCESS_SECRET, patientId),
    alertAdmin,
    log,
    now,
    config: { channels: CHANNELS },
  })
  const runJobs = createRunJobs({
    payments: o.payments ? o.payments(repos) : repos.payments,
    planGenerations: o.planGenerations ? o.planGenerations(repos) : repos.planGenerations,
    notifications: o.notifications ? o.notifications(repos) : repos.notifications,
    syncPayment: o.wrapSync ? o.wrapSync(syncPayment) : syncPayment,
    generatePlan: o.wrapGenerate ? o.wrapGenerate(generatePlan) : generatePlan,
    dispatchNotification: o.wrapDispatch ? o.wrapDispatch(dispatchNotification) : dispatchNotification,
    enqueueExpiryReminders: o.reminders ? o.reminders(repos) : async () => 0,
    log,
    now,
    paymentDeadlineMs: 30_000,
    limits: LIMITS,
    ...(o.purge ? { purge: o.purge } : {}),
  })
  /** Marca a cobrança como paga pelo webhook (cria a geração `pending`); devolve o id da geração. */
  async function payAndQueueGeneration(paymentId: string, n: number): Promise<string> {
    await repos.payments.markSynced(paymentId, {
      asaasId: `pay_${n}`,
      asaasCustomerId: `cus_${n}`,
      status: "PENDING",
      paymentUrl: `https://asaas.test/i/${n}`,
      invoiceNumber: `INV-${n}`,
      billingType: "UNDEFINED",
      dueDate: "2026-10-09",
    })
    const event = await repos.webhooks.applyPaymentEvent(
      {
        eventId: `evt-${n}`,
        event: "PAYMENT_RECEIVED",
        group: "paid",
        asaasPaymentId: `pay_${n}`,
        externalReference: paymentId,
        status: "RECEIVED",
        billingType: "PIX",
        invoiceNumber: `INV-${n}`,
        paymentDate: "2026-10-09",
      },
      now(),
    )
    if (event.outcome !== "processed" || !event.pendingGeneration) throw new Error("geração não criada")
    return event.pendingGeneration.id
  }
  return { repos, asaas, log, email, whatsapp, paymentIds, runJobs, generator, payAndQueueGeneration }
}

function loggedText(log: Logger): string {
  return JSON.stringify([
    ...(log.info as ReturnType<typeof vi.fn>).mock.calls,
    ...(log.warn as ReturnType<typeof vi.fn>).mock.calls,
    ...(log.error as ReturnType<typeof vi.fn>).mock.calls,
  ])
}

describe("createRunJobs", () => {
  it("sincroniza a cobrança vencida e envia as 2 notificações na mesma rodada", async () => {
    const s = await setup()

    const summary = await s.runJobs()

    expect(summary).toEqual({ payments: 1, plans: 0, reminders: 0, notifications: 2, errors: 0 })
    const payment = s.repos.state.payments.get(s.paymentIds[0])!
    expect(payment.paymentUrl).toBeTruthy()
    expect(payment.nextSyncAt).toBeNull()
    const notifications = [...s.repos.state.notifications.values()]
    expect(notifications.map((n) => n.status)).toEqual(["sent", "sent"])
    expect(s.email.send).toHaveBeenCalledTimes(1)
    expect(s.whatsapp.sendText).toHaveBeenCalled()
  })

  it("uma segunda rodada não tem mais nada a fazer", async () => {
    const s = await setup()
    await s.runJobs()
    expect(await s.runJobs()).toEqual({ payments: 0, plans: 0, reminders: 0, notifications: 0, errors: 0 })
  })

  it("syncPayment que lança na 1ª de 2 cobranças: errors 1 e a 2ª é processada", async () => {
    const s = await setup(2, {
      wrapSync: (real) => async (id, opts) => {
        if (id === first) throw new Error("boom")
        return real(id, opts)
      },
    })
    const first = (await s.repos.payments.listDue(new Date(Date.now() + 1000), 10))[0]
    const second = s.paymentIds.find((id) => id !== first)!

    const summary = await s.runJobs()

    expect(summary).toEqual({ payments: 2, plans: 0, reminders: 0, notifications: 2, errors: 1 })
    expect(s.repos.state.payments.get(second)!.paymentUrl).toBeTruthy()
    expect(s.repos.state.payments.get(first)!.paymentUrl).toBeNull()
    expect(s.log.error).toHaveBeenCalledWith("job.payment.error", { paymentId: first, message: "boom" })
  })

  it("dispatchNotification que lança numa notificação: errors 1 e a outra é processada", async () => {
    let calls = 0
    const s = await setup(1, {
      wrapDispatch: (real) => async (id) => {
        if (calls++ === 0) throw new Error("boom")
        return real(id)
      },
    })

    const summary = await s.runJobs()

    expect(summary).toEqual({ payments: 1, plans: 0, reminders: 0, notifications: 2, errors: 1 })
    expect([...s.repos.state.notifications.values()].map((n) => n.status).sort()).toEqual(["pending", "sent"])
  })

  it("falha ao listar as cobranças conta 1 erro e as notificações ainda são processadas", async () => {
    const s = await setup(1, {
      payments: (r) => ({
        ...r.payments,
        listDue: async () => {
          throw new Error("db down")
        },
      }),
    })
    // Cobrança já sincronizada por outro caminho, com notificações pendentes.
    await s.repos.payments.markSynced(s.paymentIds[0], {
      asaasId: "pay_1",
      asaasCustomerId: "cus_1",
      status: "PENDING",
      paymentUrl: "https://asaas.test/i/abc",
      invoiceNumber: null,
      billingType: "UNDEFINED",
      dueDate: "2026-10-09",
    })
    await s.repos.notifications.enqueuePaymentLink({ paymentId: s.paymentIds[0] }, CHANNELS)

    const summary = await s.runJobs()

    expect(summary).toEqual({ payments: 0, plans: 0, reminders: 0, notifications: 2, errors: 1 })
    expect(s.log.error).toHaveBeenCalledWith("job.payments.list_failed", { message: "db down" })
  })

  it("usa os limites e o deadline configurados (agora + 30 s) e processa em sequência", async () => {
    const now = new Date("2026-10-07T15:00:00Z")
    const paymentListDue = vi.fn(async (_n: Date, _l: number) => ["p1", "p2"])
    const notificationListDue = vi.fn(async (_n: Date, _l: number) => ["n1"])
    const order: string[] = []
    const s = await setup(0, {
      now: () => now,
      payments: (r) => ({ ...r.payments, listDue: paymentListDue }),
      notifications: (r) => ({ ...r.notifications, listDue: notificationListDue }),
      wrapSync: () => async (id, opts) => {
        order.push(`sync:${id}:${opts.deadline - now.getTime()}`)
        return { status: "busy" }
      },
      wrapDispatch: () => async (id) => {
        order.push(`dispatch:${id}`)
        return "busy"
      },
    })

    const summary = await s.runJobs()

    expect(paymentListDue).toHaveBeenCalledWith(now, 20)
    expect(notificationListDue).toHaveBeenCalledWith(now, 50)
    expect(order).toEqual(["sync:p1:30000", "sync:p2:30000", "dispatch:n1"])
    expect(summary).toEqual({ payments: 2, plans: 0, reminders: 0, notifications: 1, errors: 0 })
  })

  it("loga uma linha job.round.done (info) por rodada, com o resumo e a duração", async () => {
    let t = Date.now()
    const s = await setup(1, { now: () => new Date((t += 10)) })

    const summary = await s.runJobs()

    const infoCalls = (s.log.info as ReturnType<typeof vi.fn>).mock.calls.filter((c) =>
      (c[0] as string).startsWith("job."),
    )
    expect(infoCalls).toHaveLength(1)
    expect(infoCalls[0][0]).toBe("job.round.done")
    expect(infoCalls[0][1]).toEqual({ ...summary, durationMs: expect.any(Number) })
    expect(infoCalls[0][1].durationMs).toBeGreaterThan(0)
  })

  it("erros dos itens (com e-mail/telefone/CPF na mensagem) não vazam para nenhum log", async () => {
    const leak = "falha para ana@example.com tel 11999990000 cpf 52998224725"
    const s = await setup(2, {
      wrapSync: () => async () => {
        throw new Error(leak)
      },
      wrapDispatch: () => async () => {
        throw new Error(leak)
      },
    })
    // A 2ª cobrança já está sincronizada, com 2 notificações pendentes para o dispatch lançar.
    await s.repos.payments.markSynced(s.paymentIds[1], {
      asaasId: "pay_1",
      asaasCustomerId: "cus_1",
      status: "PENDING",
      paymentUrl: "https://asaas.test/i/abc",
      invoiceNumber: null,
      billingType: "UNDEFINED",
      dueDate: "2026-10-09",
    })
    await s.repos.notifications.enqueuePaymentLink({ paymentId: s.paymentIds[1] }, CHANNELS)

    const summary = await s.runJobs()

    expect(summary).toEqual({ payments: 1, plans: 0, reminders: 0, notifications: 2, errors: 3 })
    const text = loggedText(s.log)
    expect(text).toContain("job.payment.error")
    expect(text).toContain("job.notification.error")
    expect(text).not.toContain("ana@example.com")
    expect(text).not.toContain("11999990000")
    expect(text).not.toContain("52998224725")
  })

  it("erro de repositório ao listar (mensagem com e-mail/telefone) não vaza para nenhum log", async () => {
    const leak = "Failed query: select ... params: ana@example.com,11999990000"
    const s = await setup(0, {
      payments: (r) => ({
        ...r.payments,
        listDue: async () => {
          throw new Error(leak)
        },
      }),
      notifications: (r) => ({
        ...r.notifications,
        listDue: async () => {
          throw Object.assign(new Error(leak), { cause: undefined })
        },
      }),
    })

    const summary = await s.runJobs()

    expect(summary).toEqual({ payments: 0, plans: 0, reminders: 0, notifications: 0, errors: 2 })
    const text = loggedText(s.log)
    expect(text).not.toContain("ana@example.com")
    expect(text).not.toContain("11999990000")
    expect(text).toContain("job.payments.list_failed")
    expect(text).toContain("job.notifications.list_failed")
  })

  it("a rodada processa cobranças, depois gerações, depois avisos, depois notificações", async () => {
    const order: string[] = []
    const s = await setup(2, {
      wrapSync: (real) => async (id, opts) => {
        order.push("sync")
        return real(id, opts)
      },
      wrapGenerate: (real) => async (id) => {
        order.push("generate")
        return real(id)
      },
      reminders: () => async () => {
        order.push("reminders")
        return 0
      },
      wrapDispatch: (real) => async (id) => {
        order.push("dispatch")
        return real(id)
      },
    })
    // A 1ª cobrança ainda precisa do link; a 2ª já foi paga e tem a geração do plano pendente.
    const generationId = await s.payAndQueueGeneration(s.paymentIds[1], 2)

    const summary = await s.runJobs()

    // 2 notificações payment_link (etapa 1) + 2 plan_ready (criadas na etapa 2), todas na mesma rodada.
    expect(summary).toEqual({ payments: 1, plans: 1, reminders: 0, notifications: 4, errors: 0 })
    expect(order).toEqual(["sync", "generate", "reminders", "dispatch", "dispatch", "dispatch", "dispatch"])
    expect(s.repos.state.planGenerations.get(generationId)!.status).toBe("done")
    const notifications = [...s.repos.state.notifications.values()]
    expect(notifications.map((n) => [n.kind, n.status]).sort()).toEqual([
      ["payment_link", "sent"],
      ["payment_link", "sent"],
      ["plan_ready", "sent"],
      ["plan_ready", "sent"],
    ])
  })

  it("no máximo `limits.plans` gerações por rodada", async () => {
    const s = await setup(4)
    for (const [i, paymentId] of s.paymentIds.entries()) await s.payAndQueueGeneration(paymentId, i + 1)

    const first = await s.runJobs()

    expect(first.plans).toBe(3)
    expect(s.generator.generate).toHaveBeenCalledTimes(3)
    const statuses = () => [...s.repos.state.planGenerations.values()].map((g) => g.status).sort()
    expect(statuses()).toEqual(["done", "done", "done", "pending"])

    const second = await s.runJobs()

    expect(second.plans).toBe(1)
    expect(statuses()).toEqual(["done", "done", "done", "done"])
  })

  it("exceção em uma geração conta em errors e não interrompe as demais", async () => {
    const s = await setup(2, {
      wrapGenerate: (real) => async (id) => {
        if (id === first) throw new Error("boom")
        return real(id)
      },
    })
    await s.payAndQueueGeneration(s.paymentIds[0], 1)
    await s.payAndQueueGeneration(s.paymentIds[1], 2)
    const first = (await s.repos.planGenerations.listDue(new Date(Date.now() + 1000), 10))[0]
    const second = [...s.repos.state.planGenerations.keys()].find((id) => id !== first)!

    const summary = await s.runJobs()

    // plan_ready só da geração que concluiu (2 canais), enviadas na mesma rodada.
    expect(summary).toEqual({ payments: 0, plans: 2, reminders: 0, notifications: 2, errors: 1 })
    expect(s.repos.state.planGenerations.get(first)!.status).toBe("pending")
    expect(s.repos.state.planGenerations.get(second)!.status).toBe("done")
    expect(s.log.error).toHaveBeenCalledWith("job.plan.error", { generationId: first, message: "boom" })
  })

  it("falha ao listar gerações conta em errors e a rodada segue para as notificações", async () => {
    const s = await setup(1, {
      planGenerations: (r) => ({
        ...r.planGenerations,
        listDue: async () => {
          throw new Error("db down")
        },
      }),
    })

    const summary = await s.runJobs()

    expect(summary).toEqual({ payments: 1, plans: 0, reminders: 0, notifications: 2, errors: 1 })
    expect(s.log.error).toHaveBeenCalledWith("job.plans.list_failed", { message: "db down" })
  })

  it("lista as gerações com o limite configurado e o resumo do log inclui plans", async () => {
    const now = new Date("2026-10-07T15:00:00Z")
    const planListDue = vi.fn(async (_n: Date, _l: number) => ["g1", "g2"])
    const order: string[] = []
    const s = await setup(0, {
      now: () => now,
      planGenerations: (r) => ({ ...r.planGenerations, listDue: planListDue }),
      wrapGenerate: () => async (id) => {
        order.push(`generate:${id}`)
        return { status: "busy" }
      },
    })

    const summary = await s.runJobs()

    expect(planListDue).toHaveBeenCalledWith(now, 3)
    expect(order).toEqual(["generate:g1", "generate:g2"])
    expect(summary).toEqual({ payments: 0, plans: 2, reminders: 0, notifications: 0, errors: 0 })
    expect(s.log.info).toHaveBeenCalledWith("job.round.done", { ...summary, durationMs: 0 })
  })

  it("o aviso enfileirado na rodada sai na mesma rodada", async () => {
    const now = new Date("2026-10-12T15:00:00Z") // 12h em São Paulo, dentro da janela dos avisos
    const order: string[] = []
    const s = await setup(1, {
      now: () => now,
      notifications: (r) => ({
        ...r.notifications,
        listDue: async (at, limit) => {
          order.push("listDue")
          return r.notifications.listDue(at, limit)
        },
      }),
      reminders: (r) => {
        const real = createEnqueueExpiryReminders({
          notifications: r.notifications,
          channels: CHANNELS,
          now: () => now,
          log: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
        })
        return async () => {
          order.push("reminders")
          return real()
        }
      },
    })
    // Cobrança já sincronizada e plano que vence amanhã (aviso d2 nos 2 canais).
    await s.repos.payments.markSynced(s.paymentIds[0], {
      asaasId: "pay_1",
      asaasCustomerId: "cus_1",
      status: "PENDING",
      paymentUrl: "https://asaas.test/i/abc",
      invoiceNumber: null,
      billingType: "UNDEFINED",
      dueDate: "2026-10-09",
    })
    const patientId = s.repos.state.payments.get(s.paymentIds[0])!.patientId
    const planId = s.repos.seed.mealPlan({ patientId, endDate: "2026-10-13" })

    const summary = await s.runJobs()

    expect(order).toEqual(["reminders", "listDue"])
    expect(summary.reminders).toBe(2)
    expect(summary.errors).toBe(0)
    const expiring = [...s.repos.state.notifications.values()].filter((n) => n.mealPlanId === planId)
    expect(expiring.map((n) => [n.channel, n.status]).sort()).toEqual([
      ["email", "sent"],
      ["whatsapp", "sent"],
    ])
  })

  it("exceção ao enfileirar avisos não interrompe a rodada", async () => {
    const s = await setup(1, {
      reminders: () => async () => {
        throw new Error("db down")
      },
    })

    const summary = await s.runJobs()

    // A cobrança é sincronizada e as 2 notificações pendentes são enviadas mesmo assim.
    expect(summary).toEqual({ payments: 1, plans: 0, reminders: 0, notifications: 2, errors: 1 })
    expect(s.log.error).toHaveBeenCalledWith("job.reminders.error", { message: "db down" })
    expect([...s.repos.state.notifications.values()].map((n) => n.status)).toEqual(["sent", "sent"])
  })

  describe("limpeza por retenção", () => {
    const roundDone = (log: Logger) =>
      (log.info as ReturnType<typeof vi.fn>).mock.calls.filter((c) => c[0] === "job.round.done")

    it("roda no fim da rodada, depois das notificações, e o total vai em purged no job.round.done", async () => {
      const order: string[] = []
      const s = await setup(1, {
        wrapDispatch: (real) => async (id) => {
          order.push("dispatch")
          return real(id)
        },
        purge: async () => {
          order.push("purge")
          return 7
        },
      })

      const summary = await s.runJobs()

      expect(order).toEqual(["dispatch", "dispatch", "purge"])
      expect(summary).toEqual({ payments: 1, plans: 0, reminders: 0, notifications: 2, errors: 0 })
      const done = roundDone(s.log)
      expect(done).toHaveLength(1)
      expect(done[0][1]).toEqual({ ...summary, purged: 7, durationMs: expect.any(Number) })
    })

    it("sem purge, o job.round.done não tem purged", async () => {
      const s = await setup(1)

      await s.runJobs()

      const done = roundDone(s.log)
      expect(done).toHaveLength(1)
      expect(done[0][1]).not.toHaveProperty("purged")
    })

    it("purge que rejeita conta 1 erro, loga job.purge.error e a rodada termina normalmente", async () => {
      const s = await setup(1, {
        purge: async () => {
          throw new Error("db down")
        },
      })

      const summary = await s.runJobs()

      expect(summary).toEqual({ payments: 1, plans: 0, reminders: 0, notifications: 2, errors: 1 })
      expect(s.log.error).toHaveBeenCalledWith("job.purge.error", { message: "db down" })
      expect([...s.repos.state.notifications.values()].map((n) => n.status)).toEqual(["sent", "sent"])
      const done = roundDone(s.log)
      expect(done).toHaveLength(1)
      expect(done[0][1]).toEqual({ ...summary, purged: 0, durationMs: expect.any(Number) })
    })

    it("a mensagem do erro da limpeza não vaza dados pessoais para o log", async () => {
      const s = await setup(0, {
        purge: async () => {
          throw new Error("Failed query: delete ... params: ana@example.com,11999990000")
        },
      })

      await s.runJobs()

      const text = loggedText(s.log)
      expect(text).toContain("job.purge.error")
      expect(text).not.toContain("ana@example.com")
      expect(text).not.toContain("11999990000")
    })
  })
})
