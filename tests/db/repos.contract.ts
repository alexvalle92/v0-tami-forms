import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import type {
  Channel,
  FunnelEventRow,
  FunnelSessionPatch,
  MetaAttributionInput,
  NewSubmission,
  NotificationView,
  PaymentEventGroup,
  PaymentEventInput,
  PaymentEventResult,
  PlanData,
  PlanGenerationRepo,
  Repos,
  SubmissionRef,
} from "@/lib/db/repos/types"

// Contrato compartilhado: roda contra o fake em memória e contra o MySQL real.
// Usa só as interfaces públicas e dados únicos por teste (o banco real pode ser compartilhado).

function randomCpf(): string {
  const d = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10))
  const check = (len: number) => {
    const sum = d.slice(0, len).reduce((acc, n, i) => acc + n * (len + 1 - i), 0)
    const r = (sum * 10) % 11
    return r === 10 ? 0 : r
  }
  d.push(check(9))
  d.push(check(10))
  return d.join("")
}

function randomPhone(): string {
  return "119" + String(Math.floor(Math.random() * 1e8)).padStart(8, "0")
}

type SubOverrides = Partial<Omit<NewSubmission, "patient">> & {
  patient?: Partial<NewSubmission["patient"]>
}

function newSub(overrides: SubOverrides = {}): NewSubmission {
  const { patient, ...rest } = overrides
  const id = randomUUID()
  return {
    submissionId: id,
    patient: {
      name: "Maria da Silva",
      cpf: randomCpf(),
      email: `maria-${id}@example.com`,
      phone: randomPhone(),
      ...patient,
    },
    answers: { peso: 70, objetivo: "emagrecer" },
    amount: "39.90",
    todaySP: "2026-10-07",
    ...rest,
  }
}

const inMinutes = (min: number) => new Date(Date.now() + min * 60_000)
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
const BIG = 100_000
const UNKNOWN_ID = "00000000-0000-4000-8000-000000000000"

function expectRef(r: SubmissionRef | "duplicate"): SubmissionRef {
  if (r === "duplicate") throw new Error("esperava um ref, veio duplicate")
  expect(r.quizResponseId).toBeTruthy()
  expect(r.paymentId).toBeTruthy()
  return r
}

const synced = (status: string, dueDate: string) => ({
  asaasId: `pay_${randomUUID()}`,
  asaasCustomerId: "cus_1",
  status,
  paymentUrl: "https://asaas.example/i/1",
  invoiceNumber: "123",
  billingType: "UNDEFINED",
  dueDate,
})

const syncError = (step: string) => ({
  step,
  httpStatus: 500,
  message: "falhou",
  attempt: 1,
  at: new Date().toISOString(),
})

/** Envio novo com a cobrança já criada no Asaas (`PENDING`, reaproveitável até 14/10). */
async function syncedPayment(repos: Repos, over: SubOverrides = {}) {
  const sub = newSub(over)
  const ref = expectRef(await repos.submissions.create(sub))
  const data = synced("PENDING", "2026-10-14")
  await repos.payments.markSynced(ref.paymentId, data)
  return { ref, asaasId: data.asaasId, sub }
}

const EVENT_OF: Record<PaymentEventGroup, { event: string; status: string }> = {
  paid: { event: "PAYMENT_RECEIVED", status: "RECEIVED" },
  reversal: { event: "PAYMENT_REFUNDED", status: "REFUNDED" },
  pre_payment: { event: "PAYMENT_OVERDUE", status: "OVERDUE" },
  other: { event: "PAYMENT_CREATED", status: "PENDING" },
}

/** Evento do grupo pedido, com `eventId` aleatório. */
function ev(group: PaymentEventGroup, over: Partial<PaymentEventInput> = {}): PaymentEventInput {
  return {
    eventId: `evt_${randomUUID()}`,
    group,
    ...EVENT_OF[group],
    asaasPaymentId: null,
    externalReference: null,
    billingType: null,
    invoiceNumber: null,
    paymentDate: null,
    ...over,
  }
}

/** Campos do evento que apontam para a cobrança. */
const on = (p: { ref: SubmissionRef; asaasId: string | null }) => ({
  externalReference: p.ref.paymentId,
  asaasPaymentId: p.asaasId,
})

type Processed = Extract<PaymentEventResult, { outcome: "processed" }>

function expectProcessed(r: PaymentEventResult): Processed {
  if (r.outcome !== "processed") throw new Error(`esperava processed, veio ${JSON.stringify(r)}`)
  return r
}

const at = (iso: string) => new Date(iso)

/** Envio pago: cobrança sincronizada + evento pago → geração `pending`. */
async function paidGeneration(repos: Repos, over: SubOverrides = {}) {
  const p = await syncedPayment(repos, over)
  const r = expectProcessed(await repos.webhooks.applyPaymentEvent(ev("paid", on(p)), new Date()))
  if (!r.pendingGeneration) throw new Error("esperava uma geração pendente")
  const patientId = (await repos.payments.get(p.ref.paymentId))!.patientId
  return { ref: p.ref, sub: p.sub, generationId: r.pendingGeneration.id, patientId }
}

const PLAN: PlanData = {
  meals: [
    {
      name: "Café da manhã",
      time: "07:00 - 08:00",
      foods: "Pão francês — 50 g (1 unidade)\nOvos mexidos — 100 g (2 unidades)",
      calories: "350",
    },
  ],
  calories: 1800,
  observations: "Beba água ao longo do dia.\nEvite frituras.",
}

const HASH_1 = "scrypt$16384$8$1$c2FsdC0xLXNhbHQtMQ==$aGFzaC0xLWhhc2gtMS1oYXNoLTEtaGFzaC0xLWhh"
const HASH_2 = "scrypt$16384$8$1$c2FsdC0yLXNhbHQtMg==$aGFzaC0yLWhhc2gtMi1oYXNoLTItaGFzaC0yLWhh"

type CompleteInput = Parameters<PlanGenerationRepo["complete"]>[1]

/** Argumento de `complete` com um plano de uma refeição. */
function done(over: Partial<CompleteInput> = {}): CompleteInput {
  return {
    title: "Plano Alimentar 10/2026",
    startDate: "2026-10-11",
    endDate: "2026-11-10",
    planData: PLAN,
    generation: { model: "claude-opus-5-5", inputTokens: 2000, outputTokens: 5000 },
    passwordHash: HASH_1,
    channels: ["email", "whatsapp"] as Channel[],
    ...over,
  }
}

// Avisos de vencimento (spec de vencimento e renovação, §6.1).
const TODAY = "2026-10-12"
const BOTH: Channel[] = ["email", "whatsapp"]

/** Enfileira os avisos do dia com o relógio real (as linhas entram na fila agora). */
const expire = (repos: Repos, today = TODAY, channels = BOTH) =>
  repos.notifications.enqueuePlanExpiring({ today, channels, now: new Date() })

/** Avisos de vencimento do plano: as notificações vencidas da fila cujo `mealPlan` é ele. */
async function expiringOf(repos: Repos, mealPlanId: string): Promise<NotificationView[]> {
  const ids = await repos.notifications.listDue(inMinutes(1), BIG)
  const views = await Promise.all(ids.map((id) => repos.notifications.get(id)))
  return views.filter((n): n is NotificationView => n !== null && n.mealPlan?.id === mealPlanId)
}

/** Plano ativo concluído por `complete`, com o `endDate` pedido (paciente novo, salvo `over`). */
async function planEnding(repos: Repos, endDate: string, over: SubOverrides = {}) {
  const g = await paidGeneration(repos, over)
  const { mealPlanId } = await repos.planGenerations.complete(g.generationId, done({ endDate }))
  return { ...g, mealPlanId }
}

const kindsOf = (rows: NotificationView[]) => rows.map((n) => `${n.kind}:${n.channel}`).sort()

export function defineRepoContract(name: string, setup: () => Promise<Repos>): void {
  describe(`contrato dos repositórios: ${name}`, () => {
    it("1. cria envio, paciente e cobrança PENDING_ASAAS pronta para o job", async () => {
      const { submissions, payments } = await setup()
      const s = newSub()
      const ref = expectRef(await submissions.create(s))

      expect(await submissions.findBySubmissionId(s.submissionId)).toEqual(ref)
      const view = await payments.get(ref.paymentId)
      expect(view).not.toBeNull()
      expect(view!.status).toBe("PENDING_ASAAS")
      expect(view!.amount).toBe("39.90")
      expect(view!.syncAttempts).toBe(0)
      expect(view!.asaasId).toBeNull()
      expect(view!.paymentUrl).toBeNull()
      expect(view!.patient).toMatchObject({
        name: s.patient.name,
        cpf: s.patient.cpf,
        email: s.patient.email,
        phone: s.patient.phone,
        asaasCustomerId: null,
      })
      expect(view!.patientId).toBe(view!.patient.id)
      expect(await payments.listDue(new Date(), BIG)).toContain(ref.paymentId)
    })

    it("2. mesmo CPF no segundo envio reaproveita paciente e cobrança e atualiza os dados", async () => {
      const { submissions, payments } = await setup()
      const cpf = randomCpf()
      const first = newSub({ patient: { name: "Ana", cpf, email: "ana@example.com", phone: "11911112222" } })
      const second = newSub({
        patient: { name: "Ana Paula", cpf, email: "ana.paula@example.com", phone: "11933334444" },
      })
      const r1 = expectRef(await submissions.create(first))
      const r2 = expectRef(await submissions.create(second))

      expect(r2.quizResponseId).not.toBe(r1.quizResponseId)
      expect(r2.paymentId).toBe(r1.paymentId)
      const view = await payments.get(r2.paymentId)
      expect(view!.patient.name).toBe("Ana Paula")
      expect(view!.patient.email).toBe("ana.paula@example.com")
      expect(view!.patient.phone).toBe("11933334444")
      expect((await payments.get(r1.paymentId))!.patientId).toBe(view!.patientId)
    })

    it("3. o mesmo submissionId duas vezes devolve duplicate sem tocar em nada", async () => {
      const { submissions, payments } = await setup()
      const cpf = randomCpf()
      const s = newSub({ patient: { name: "Carla", cpf, email: "carla@example.com" } })
      const first = expectRef(await submissions.create(s))
      const again = await submissions.create(
        newSub({
          submissionId: s.submissionId,
          patient: { name: "Outro Nome", cpf, email: "outro@example.com" },
        }),
      )

      expect(again).toBe("duplicate")
      expect(await submissions.findBySubmissionId(s.submissionId)).toEqual(first)
      // O duplicado não pode ter alterado o paciente.
      const view = await payments.get(first.paymentId)
      expect(view!.patient.name).toBe("Carla")
      expect(view!.patient.email).toBe("carla@example.com")
    })

    it("4. duas chamadas concorrentes com o mesmo submissionId: exatamente um ref e um duplicate", async () => {
      const { submissions } = await setup()
      const submissionId = randomUUID()
      const results = await Promise.all([
        submissions.create(newSub({ submissionId })),
        submissions.create(newSub({ submissionId })),
      ])

      expect(results.filter((r) => r === "duplicate")).toHaveLength(1)
      const refs = results.filter((r): r is SubmissionRef => r !== "duplicate")
      expect(refs).toHaveLength(1)
      expect(await submissions.findBySubmissionId(submissionId)).toEqual(refs[0])
    })

    describe("5. reaproveitamento de cobrança", () => {
      async function secondSubmissionAfter(
        prepare: (repos: Repos, paymentId: string) => Promise<void>,
      ) {
        const repos = await setup()
        const cpf = randomCpf()
        const first = expectRef(await repos.submissions.create(newSub({ patient: { cpf } })))
        await prepare(repos, first.paymentId)
        const second = expectRef(await repos.submissions.create(newSub({ patient: { cpf } })))
        return { first, second }
      }

      it("PENDING com vencimento hoje é reaproveitada", async () => {
        const { first, second } = await secondSubmissionAfter((r, id) =>
          r.payments.markSynced(id, synced("PENDING", "2026-10-07")),
        )
        expect(second.paymentId).toBe(first.paymentId)
      })

      it("PENDING vencida (ontem) gera nova cobrança", async () => {
        const { first, second } = await secondSubmissionAfter((r, id) =>
          r.payments.markSynced(id, synced("PENDING", "2026-10-06")),
        )
        expect(second.paymentId).not.toBe(first.paymentId)
      })

      it("ASAAS_FAILED gera nova cobrança", async () => {
        const { first, second } = await secondSubmissionAfter((r, id) =>
          r.payments.markSyncFailure(id, {
            attempts: 1,
            nextSyncAt: null,
            failed: true,
            error: syncError("asaas.create_payment"),
          }),
        )
        expect(second.paymentId).not.toBe(first.paymentId)
      })

      it("RECEIVED gera nova cobrança", async () => {
        const { first, second } = await secondSubmissionAfter((r, id) =>
          r.payments.markSynced(id, synced("RECEIVED", "2026-10-07")),
        )
        expect(second.paymentId).not.toBe(first.paymentId)
      })
    })

    it("6a. locks de cobrança: exclusivo, liberável e com expiração", async () => {
      const { submissions, payments } = await setup()
      const ref = expectRef(await submissions.create(newSub()))

      expect(await payments.tryLock(ref.paymentId, 60_000)).toBe(true)
      expect(await payments.tryLock(ref.paymentId, 60_000)).toBe(false)
      expect(await payments.listDue(new Date(), BIG)).not.toContain(ref.paymentId)
      await payments.unlock(ref.paymentId)
      expect(await payments.tryLock(ref.paymentId, 60_000)).toBe(true)
      expect(await payments.tryLock(UNKNOWN_ID, 60_000)).toBe(false)

      // Reserva expirada pode ser retomada.
      const other = expectRef(await submissions.create(newSub()))
      expect(await payments.tryLock(other.paymentId, 1)).toBe(true)
      await sleep(10)
      expect(await payments.tryLock(other.paymentId, 60_000)).toBe(true)
    })

    it("6b. locks de notificação: exclusivo, liberável e com expiração", async () => {
      const { submissions, notifications } = await setup()
      const ref = expectRef(await submissions.create(newSub()))
      await notifications.enqueuePaymentLink({ paymentId: ref.paymentId }, ["email"])
      const [id] = await notifications.listPendingIdsForQuizResponse(ref.quizResponseId)

      expect(await notifications.tryLock(id, 60_000)).toBe(true)
      expect(await notifications.tryLock(id, 60_000)).toBe(false)
      expect(await notifications.listDue(new Date(), BIG)).not.toContain(id)
      expect(await notifications.tryLock(UNKNOWN_ID, 60_000)).toBe(false)

      // unlock solta a reserva; id inexistente não lança.
      await notifications.unlock(id)
      expect(await notifications.tryLock(id, 60_000)).toBe(true)
      await expect(notifications.unlock(UNKNOWN_ID)).resolves.toBeUndefined()

      // markFailure e markSent sempre limpam a reserva.
      await notifications.markFailure(id, {
        attempts: 1,
        nextAttemptAt: new Date(),
        failed: false,
        error: syncError("notify.email"),
      })
      expect(await notifications.tryLock(id, 60_000)).toBe(true)
      await notifications.markSent(id)
      expect(await notifications.tryLock(id, 60_000)).toBe(true)

      // Reserva expirada pode ser retomada.
      const other = expectRef(await submissions.create(newSub()))
      await notifications.enqueuePaymentLink({ paymentId: other.paymentId }, ["email"])
      const [otherId] = await notifications.listPendingIdsForQuizResponse(other.quizResponseId)
      expect(await notifications.tryLock(otherId, 1)).toBe(true)
      await sleep(10)
      expect(await notifications.tryLock(otherId, 60_000)).toBe(true)
    })

    it("7. falhas de sincronização, reabertura individual e em massa", async () => {
      const { submissions, payments } = await setup()
      const a = expectRef(await submissions.create(newSub()))
      const b = expectRef(await submissions.create(newSub()))
      const error = syncError("asaas.create_payment")

      // Falha transitória: sai da fila agora, volta depois do próximo agendamento.
      expect(await payments.tryLock(a.paymentId, 60_000)).toBe(true)
      await payments.markSyncFailure(a.paymentId, {
        attempts: 1,
        nextSyncAt: inMinutes(2),
        failed: false,
        error,
      })
      const afterFailure = await payments.get(a.paymentId)
      expect(afterFailure!.status).toBe("PENDING_ASAAS")
      expect(afterFailure!.syncAttempts).toBe(1)
      expect(await payments.listDue(new Date(), BIG)).not.toContain(a.paymentId)
      expect(await payments.listDue(inMinutes(3), BIG)).toContain(a.paymentId)
      // markSyncFailure limpou a reserva (o lock de 60 s ainda estaria ativo agora).
      expect(await payments.tryLock(a.paymentId, 60_000)).toBe(true)

      // Falha definitiva (também limpa a reserva que acabamos de tomar).
      await payments.markSyncFailure(a.paymentId, { attempts: 8, nextSyncAt: null, failed: true, error })
      expect(await payments.tryLock(a.paymentId, 60_000)).toBe(true)
      await payments.markSyncFailure(b.paymentId, { attempts: 8, nextSyncAt: null, failed: true, error })
      expect((await payments.get(a.paymentId))!.status).toBe("ASAAS_FAILED")
      expect(await payments.listDue(inMinutes(60), BIG)).not.toContain(a.paymentId)

      // Reabertura individual (a reserva ativa de `a` é limpa).
      expect(await payments.reopen(a.paymentId)).toBe(true)
      const reopened = await payments.get(a.paymentId)
      expect(reopened!.status).toBe("PENDING_ASAAS")
      expect(reopened!.syncAttempts).toBe(0)
      expect(await payments.listDue(new Date(), BIG)).toContain(a.paymentId)
      expect(await payments.tryLock(a.paymentId, 60_000)).toBe(true)
      expect(await payments.reopen(a.paymentId)).toBe(false) // não está mais falha
      expect(await payments.reopen(UNKNOWN_ID)).toBe(false)

      // Reabertura em massa (também limpa a reserva).
      expect(await payments.tryLock(b.paymentId, 60_000)).toBe(true)
      expect(await payments.reopenAllFailed()).toBeGreaterThanOrEqual(1)
      expect((await payments.get(b.paymentId))!.status).toBe("PENDING_ASAAS")
      expect(await payments.listDue(new Date(), BIG)).toContain(b.paymentId)
      expect(await payments.tryLock(b.paymentId, 60_000)).toBe(true)
    })

    it("8. fila de notificações: idempotente, por cobrança ou por envio", async () => {
      const { submissions, notifications } = await setup()
      const p1 = { name: "Bia", cpf: randomCpf(), email: "bia@example.com", phone: "11955556666" }
      const r1 = expectRef(await submissions.create(newSub({ patient: p1 })))
      const r2 = expectRef(await submissions.create(newSub({ patient: p1 })))
      expect(r2.paymentId).toBe(r1.paymentId)

      await notifications.enqueuePaymentLink({ paymentId: r1.paymentId }, ["email", "whatsapp"])
      await notifications.enqueuePaymentLink({ paymentId: r1.paymentId }, ["email", "whatsapp"])

      const ids1 = await notifications.listPendingIdsForQuizResponse(r1.quizResponseId)
      const ids2 = await notifications.listPendingIdsForQuizResponse(r2.quizResponseId)
      expect(ids1).toHaveLength(2)
      expect(ids2).toHaveLength(2)
      expect(new Set([...ids1, ...ids2]).size).toBe(4)

      const views1 = await Promise.all(ids1.map((id) => notifications.get(id)))
      for (const n of views1) {
        expect(n).toMatchObject({
          quizResponseId: r1.quizResponseId,
          paymentId: r1.paymentId,
          kind: "payment_link",
          status: "pending",
          attempts: 0,
          partsSent: 0,
          payload: null,
        })
        expect(n!.recipient).toBe(n!.channel === "email" ? p1.email : `55${p1.phone}`)
      }
      expect(views1.map((n) => n!.channel).sort()).toEqual(["email", "whatsapp"])

      // Terceiro envio (outro paciente): por quizResponseId, só o canal pedido.
      const s3 = newSub()
      const r3 = expectRef(await submissions.create(s3))
      await notifications.enqueuePaymentLink({ quizResponseId: r3.quizResponseId }, ["email"])
      const ids3 = await notifications.listPendingIdsForQuizResponse(r3.quizResponseId)
      expect(ids3).toHaveLength(1)
      expect((await notifications.get(ids3[0]))!.recipient).toBe(s3.patient.email)
      expect(await notifications.listPendingIdsForQuizResponse(r1.quizResponseId)).toHaveLength(2)
    })

    it("9. ciclo de vida da notificação: partes, falha, reabertura e envio", async () => {
      const { submissions, payments, notifications } = await setup()
      const s = newSub()
      const ref = expectRef(await submissions.create(s))
      await notifications.enqueuePaymentLink({ paymentId: ref.paymentId }, ["whatsapp"])
      const [id] = await notifications.listPendingIdsForQuizResponse(ref.quizResponseId)

      expect((await notifications.get(id))!.paymentUrl).toBeNull()
      await payments.markSynced(ref.paymentId, {
        asaasId: `pay_${randomUUID()}`,
        asaasCustomerId: "cus_1",
        status: "PENDING",
        paymentUrl: "https://asaas.example/i/abc",
        invoiceNumber: null,
        billingType: null,
        dueDate: "2026-10-14",
      })
      const view = (await notifications.get(id))!
      expect(view.patientName).toBe(s.patient.name)
      expect(view.paymentUrl).toBe("https://asaas.example/i/abc")
      expect(await notifications.listDue(new Date(), BIG)).toContain(id)

      await notifications.markPartSent(id, 2)
      expect((await notifications.get(id))!.partsSent).toBe(2)

      const error = syncError("notify.whatsapp")
      // Falha com nova tentativa: continua pending, mas fora da fila até o próximo horário.
      await notifications.markFailure(id, { attempts: 1, nextAttemptAt: inMinutes(2), failed: false, error })
      expect((await notifications.get(id))!).toMatchObject({ status: "pending", attempts: 1, partsSent: 2 })
      expect(await notifications.listDue(new Date(), BIG)).not.toContain(id)
      expect(await notifications.listDue(inMinutes(3), BIG)).toContain(id)
      expect(await notifications.reopen(id)).toBe(false) // não está failed

      // Falha definitiva e reabertura mantêm as partes já enviadas.
      await notifications.markFailure(id, { attempts: 5, nextAttemptAt: null, failed: true, error })
      expect((await notifications.get(id))!.status).toBe("failed")
      expect(await notifications.listDue(inMinutes(60), BIG)).not.toContain(id)
      expect(await notifications.tryLock(id, 60_000)).toBe(true)
      expect(await notifications.reopen(id)).toBe(true)
      expect((await notifications.get(id))!).toMatchObject({ status: "pending", attempts: 0, partsSent: 2 })
      expect(await notifications.listDue(new Date(), BIG)).toContain(id) // reopen limpou a reserva
      expect(await notifications.tryLock(id, 60_000)).toBe(true)
      expect(await notifications.reopen(UNKNOWN_ID)).toBe(false)

      await notifications.markFailure(id, { attempts: 5, nextAttemptAt: null, failed: true, error })
      expect(await notifications.tryLock(id, 60_000)).toBe(true)
      expect(await notifications.reopenAllFailed()).toBeGreaterThanOrEqual(1)
      expect((await notifications.get(id))!).toMatchObject({ status: "pending", partsSent: 2 })
      expect(await notifications.tryLock(id, 60_000)).toBe(true) // reopenAllFailed limpou a reserva

      await notifications.markSent(id)
      expect((await notifications.get(id))!).toMatchObject({ status: "sent", payload: null })
      expect(await notifications.listDue(inMinutes(60), BIG)).not.toContain(id)
      expect(await notifications.listPendingIdsForQuizResponse(ref.quizResponseId)).not.toContain(id)
    })

    it("10. nome com emoji volta idêntico no paciente e na notificação", async () => {
      const { submissions, payments, notifications } = await setup()
      const name = "Ana Souza 💚"
      const ref = expectRef(await submissions.create(newSub({ patient: { name } })))
      await notifications.enqueuePaymentLink({ quizResponseId: ref.quizResponseId }, ["email"])
      const [id] = await notifications.listPendingIdsForQuizResponse(ref.quizResponseId)

      expect((await payments.get(ref.paymentId))!.patient.name).toBe(name)
      expect((await notifications.get(id))!.patientName).toBe(name)
    })

    it("8b. enqueue por quizResponseId só cria linha para aquele envio, mesmo com cobrança compartilhada", async () => {
      const { submissions, notifications } = await setup()
      const cpf = randomCpf()
      const r1 = expectRef(await submissions.create(newSub({ patient: { cpf } })))
      const r2 = expectRef(await submissions.create(newSub({ patient: { cpf } })))
      expect(r2.paymentId).toBe(r1.paymentId)

      await notifications.enqueuePaymentLink({ quizResponseId: r1.quizResponseId }, ["email"])
      await notifications.enqueuePaymentLink({ quizResponseId: r1.quizResponseId }, ["email"])

      expect(await notifications.listPendingIdsForQuizResponse(r1.quizResponseId)).toHaveLength(1)
      expect(await notifications.listPendingIdsForQuizResponse(r2.quizResponseId)).toEqual([])
    })

    it("11. markSynced grava o resultado do Asaas e limpa a reserva; setPatientAsaasCustomer persiste", async () => {
      const { submissions, payments } = await setup()
      const ref = expectRef(await submissions.create(newSub()))
      const before = (await payments.get(ref.paymentId))!

      await payments.setPatientAsaasCustomer(before.patientId, "cus_abc")
      expect((await payments.get(ref.paymentId))!.patient.asaasCustomerId).toBe("cus_abc")

      await payments.markSyncFailure(ref.paymentId, {
        attempts: 3,
        nextSyncAt: inMinutes(2),
        failed: false,
        error: syncError("asaas.create_payment"),
      })
      expect(await payments.tryLock(ref.paymentId, 60_000)).toBe(true)
      const data = synced("PENDING", "2026-10-14")
      await payments.markSynced(ref.paymentId, data)

      const view = (await payments.get(ref.paymentId))!
      expect(view.status).toBe("PENDING")
      expect(view.asaasId).toBe(data.asaasId)
      expect(view.paymentUrl).toBe(data.paymentUrl)
      expect(view.syncAttempts).toBe(3) // markSynced não zera as tentativas
      expect(await payments.tryLock(ref.paymentId, 60_000)).toBe(true) // reserva limpa
      expect(await payments.listDue(inMinutes(60), BIG)).not.toContain(ref.paymentId)
    })

    it("12a. listDue de cobranças: ordenado por next_sync_at e respeita o limite", async () => {
      const { submissions, payments } = await setup()
      const a = expectRef(await submissions.create(newSub()))
      const b = expectRef(await submissions.create(newSub()))
      const error = syncError("asaas.create_payment")
      const retryAt = (paymentId: string, nextSyncAt: Date) =>
        payments.markSyncFailure(paymentId, { attempts: 1, nextSyncAt, failed: false, error })
      const giveUp = (paymentId: string) =>
        payments.markSyncFailure(paymentId, { attempts: 8, nextSyncAt: null, failed: true, error })

      try {
        // `b` (criada depois) venceu há um ano, mais antiga que qualquer outra linha possível;
        // `a` (criada antes) venceu há uma hora. A ordem de inserção é oposta à de vencimento.
        await retryAt(a.paymentId, new Date(Date.now() - 3_600_000))
        await retryAt(b.paymentId, new Date(Date.now() - 365 * 86_400_000))
        const now = new Date()

        const all = await payments.listDue(now, BIG)
        expect(all).toContain(a.paymentId)
        expect(all).toContain(b.paymentId)
        expect(all.indexOf(b.paymentId)).toBeLessThan(all.indexOf(a.paymentId))
        expect(await payments.listDue(now, 1)).toEqual([b.paymentId])
        expect((await payments.listDue(now, 2)).length).toBeLessThanOrEqual(2)
      } finally {
        await giveUp(a.paymentId)
        await giveUp(b.paymentId)
      }
    })

    it("12b. listDue de notificações: ordenado por next_attempt_at e respeita o limite", async () => {
      const { submissions, notifications } = await setup()
      const error = syncError("notify.email")
      const mk = async () => {
        const ref = expectRef(await submissions.create(newSub()))
        await notifications.enqueuePaymentLink({ quizResponseId: ref.quizResponseId }, ["email"])
        return (await notifications.listPendingIdsForQuizResponse(ref.quizResponseId))[0]
      }
      const a = await mk()
      const b = await mk()
      const retryAt = (id: string, nextAttemptAt: Date) =>
        notifications.markFailure(id, { attempts: 1, nextAttemptAt, failed: false, error })

      try {
        // `b` (criada depois) é a mais antiga; a ordem de inserção é oposta à de vencimento.
        await retryAt(a, new Date(Date.now() - 3_600_000))
        await retryAt(b, new Date(Date.now() - 365 * 86_400_000))
        const now = new Date()

        const all = await notifications.listDue(now, BIG)
        expect(all).toContain(a)
        expect(all).toContain(b)
        expect(all.indexOf(b)).toBeLessThan(all.indexOf(a))
        expect(await notifications.listDue(now, 1)).toEqual([b])
        expect((await notifications.listDue(now, 2)).length).toBeLessThanOrEqual(2)
      } finally {
        await notifications.markSent(a)
        await notifications.markSent(b)
      }
    })

    it("13. evento pago: cobrança paga e geração pendente do envio", async () => {
      const repos = await setup()
      const p = await syncedPayment(repos)
      const now = at("2026-10-11T12:00:00.000Z")

      const r = expectProcessed(
        await repos.webhooks.applyPaymentEvent(
          ev("paid", { ...on(p), billingType: "PIX", invoiceNumber: "777", paymentDate: "2026-10-11" }),
          now,
        ),
      )

      expect(r.paymentId).toBe(p.ref.paymentId)
      expect(r.patientName).toBe(p.sub.patient.name)
      expect(r.missingQuizResponse).toBe(false)
      expect(r.pendingGeneration).not.toBeNull()
      expect(r.pendingGeneration!.id).toBeTruthy()
      expect(r.pendingGeneration!.quizResponseId).toBe(p.ref.quizResponseId)
      const view = (await repos.payments.get(p.ref.paymentId))!
      expect(view.status).toBe("RECEIVED")
      expect(view.paidAt).toEqual(now)
      expect(view.asaasId).toBe(p.asaasId)
    })

    it("14. o mesmo evento duas vezes: o segundo é duplicate e nada muda", async () => {
      const repos = await setup()
      const p = await syncedPayment(repos)
      const e = ev("paid", on(p))
      expectProcessed(await repos.webhooks.applyPaymentEvent(e, at("2026-10-11T12:00:00.000Z")))
      const before = await repos.payments.get(p.ref.paymentId)

      // Mesmo `eventId` com outro conteúdo: a chave de idempotência é só o id.
      const again = await repos.webhooks.applyPaymentEvent(
        { ...e, event: "PAYMENT_REFUNDED", group: "reversal", status: "REFUNDED" },
        at("2026-10-12T12:00:00.000Z"),
      )

      expect(again).toEqual({ outcome: "duplicate" })
      expect(await repos.payments.get(p.ref.paymentId)).toEqual(before)
    })

    it("15. CONFIRMED e depois RECEIVED: uma geração só; paidAt não muda; status vira RECEIVED", async () => {
      const repos = await setup()
      const p = await syncedPayment(repos)
      const t1 = at("2026-10-11T12:00:00.000Z")
      const t2 = at("2026-11-12T12:00:00.000Z")

      const first = expectProcessed(
        await repos.webhooks.applyPaymentEvent(
          ev("paid", { ...on(p), event: "PAYMENT_CONFIRMED", status: "CONFIRMED" }),
          t1,
        ),
      )
      expect((await repos.payments.get(p.ref.paymentId))!.status).toBe("CONFIRMED")
      const second = expectProcessed(await repos.webhooks.applyPaymentEvent(ev("paid", on(p)), t2))

      expect(first.pendingGeneration).not.toBeNull()
      expect(second.pendingGeneration).toEqual(first.pendingGeneration)
      const view = (await repos.payments.get(p.ref.paymentId))!
      expect(view.status).toBe("RECEIVED")
      expect(view.paidAt).toEqual(t1)
    })

    it("16. cobrança desconhecida, externalReference nulo e asaas_id divergente são ignorados", async () => {
      const repos = await setup()
      const p = await syncedPayment(repos)
      const before = await repos.payments.get(p.ref.paymentId)
      const now = new Date()
      const apply = (over: Partial<PaymentEventInput>) =>
        repos.webhooks.applyPaymentEvent(ev("paid", { ...on(p), ...over }), now)
      const unknown = { outcome: "ignored", reason: "unknown_payment" }
      const mismatch = { outcome: "ignored", reason: "asaas_id_mismatch" }

      expect(await apply({ externalReference: UNKNOWN_ID })).toEqual(unknown)
      expect(await apply({ externalReference: null })).toEqual(unknown)
      expect(await apply({ externalReference: "nao-e-um-id-nosso" })).toEqual(unknown)
      expect(await apply({ asaasPaymentId: `pay_${randomUUID()}` })).toEqual(mismatch)
      expect(await repos.payments.get(p.ref.paymentId)).toEqual(before)

      // Cobrança sem asaas_id, mas o id do evento já é de outra cobrança nossa.
      const orphan = expectRef(await repos.submissions.create(newSub()))
      expect(
        await repos.webhooks.applyPaymentEvent(
          ev("paid", { externalReference: orphan.paymentId, asaasPaymentId: p.asaasId }),
          now,
        ),
      ).toEqual(mismatch)
      const orphanView = (await repos.payments.get(orphan.paymentId))!
      expect(orphanView.asaasId).toBeNull()
      expect(orphanView.status).toBe("PENDING_ASAAS")
      expect(orphanView.paidAt).toBeNull()
    })

    it("17. cobrança ainda sem asaas_id: o evento pago é aceito e grava o asaas_id", async () => {
      const repos = await setup()
      const ref = expectRef(await repos.submissions.create(newSub()))
      const asaasId = `pay_${randomUUID()}`

      const r = expectProcessed(
        await repos.webhooks.applyPaymentEvent(
          ev("paid", { externalReference: ref.paymentId, asaasPaymentId: asaasId }),
          new Date(),
        ),
      )

      expect(r.pendingGeneration!.quizResponseId).toBe(ref.quizResponseId)
      const view = (await repos.payments.get(ref.paymentId))!
      expect(view.asaasId).toBe(asaasId)
      expect(view.status).toBe("RECEIVED")
      expect(view.paidAt).not.toBeNull()
    })

    it("18. OVERDUE antes de pagar muda o status e a cobrança deixa de ser reaproveitada", async () => {
      const repos = await setup()
      const cpf = randomCpf()
      const p = await syncedPayment(repos, { patient: { cpf } })

      const r = expectProcessed(
        await repos.webhooks.applyPaymentEvent(ev("pre_payment", on(p)), new Date()),
      )

      expect(r.pendingGeneration).toBeNull()
      expect(r.missingQuizResponse).toBe(false)
      const view = (await repos.payments.get(p.ref.paymentId))!
      expect(view.status).toBe("OVERDUE")
      expect(view.paidAt).toBeNull()
      const next = expectRef(await repos.submissions.create(newSub({ patient: { cpf } })))
      expect(next.paymentId).not.toBe(p.ref.paymentId)
    })

    it("19. OVERDUE depois de pago é ignorado (already_paid) e o status fica", async () => {
      const repos = await setup()
      const p = await syncedPayment(repos)
      expectProcessed(await repos.webhooks.applyPaymentEvent(ev("paid", on(p)), new Date()))
      const before = await repos.payments.get(p.ref.paymentId)

      expect(await repos.webhooks.applyPaymentEvent(ev("pre_payment", on(p)), new Date())).toEqual({
        outcome: "ignored",
        reason: "already_paid",
      })
      expect(
        await repos.webhooks.applyPaymentEvent(
          ev("pre_payment", { ...on(p), event: "PAYMENT_DELETED", status: "DELETED" }),
          new Date(),
        ),
      ).toEqual({ outcome: "ignored", reason: "already_paid" })
      expect(await repos.payments.get(p.ref.paymentId)).toEqual(before)
      expect((await repos.payments.get(p.ref.paymentId))!.status).toBe("RECEIVED")
    })

    it("20. reversão muda o status e não cria nem altera geração", async () => {
      const repos = await setup()
      const p = await syncedPayment(repos)
      const paidAt = at("2026-10-11T12:00:00.000Z")
      const paid = expectProcessed(await repos.webhooks.applyPaymentEvent(ev("paid", on(p)), paidAt))

      const r = expectProcessed(
        await repos.webhooks.applyPaymentEvent(ev("reversal", on(p)), at("2026-10-20T12:00:00.000Z")),
      )

      expect(r.pendingGeneration).toBeNull()
      expect(r.missingQuizResponse).toBe(false)
      expect(r.patientName).toBe(p.sub.patient.name)
      const view = (await repos.payments.get(p.ref.paymentId))!
      expect(view.status).toBe("REFUNDED")
      expect(view.paidAt).toEqual(paidAt)
      // A geração segue a mesma, ainda pendente e com o mesmo envio.
      const later = expectProcessed(await repos.webhooks.applyPaymentEvent(ev("paid", on(p)), new Date()))
      expect(later.pendingGeneration).toEqual(paid.pendingGeneration)

      // Reversão de uma cobrança ainda não paga não cria geração nem marca paidAt.
      const q = await syncedPayment(repos)
      const rq = expectProcessed(await repos.webhooks.applyPaymentEvent(ev("reversal", on(q)), new Date()))
      expect(rq.pendingGeneration).toBeNull()
      expect((await repos.payments.get(q.ref.paymentId))!).toMatchObject({
        status: "REFUNDED",
        paidAt: null,
      })
    })

    it("21. grupo other é ignorado (event_not_handled)", async () => {
      const repos = await setup()
      const p = await syncedPayment(repos)
      const before = await repos.payments.get(p.ref.paymentId)
      const e = ev("other", on(p))

      expect(await repos.webhooks.applyPaymentEvent(e, new Date())).toEqual({
        outcome: "ignored",
        reason: "event_not_handled",
      })
      expect(await repos.payments.get(p.ref.paymentId)).toEqual(before)
      // O evento ficou gravado: reenviá-lo é duplicata.
      expect(await repos.webhooks.applyPaymentEvent(e, new Date())).toEqual({ outcome: "duplicate" })
    })

    it("22. dois envios na mesma cobrança: a geração usa o envio mais recente", async () => {
      const repos = await setup()
      const cpf = randomCpf()
      const p = await syncedPayment(repos, { patient: { cpf } })
      await sleep(5) // created_at em milissegundos: garante a ordem também no MySQL
      const second = expectRef(await repos.submissions.create(newSub({ patient: { cpf } })))
      expect(second.paymentId).toBe(p.ref.paymentId)

      const r = expectProcessed(await repos.webhooks.applyPaymentEvent(ev("paid", on(p)), new Date()))

      expect(r.pendingGeneration!.quizResponseId).toBe(second.quizResponseId)
    })

    it("23. concorrência: dois eventos pagos diferentes ao mesmo tempo → a mesma geração", async () => {
      const repos = await setup()
      const p = await syncedPayment(repos)
      const now = at("2026-10-11T12:00:00.000Z")

      const results = await Promise.all([
        repos.webhooks.applyPaymentEvent(
          ev("paid", { ...on(p), event: "PAYMENT_CONFIRMED", status: "CONFIRMED" }),
          now,
        ),
        repos.webhooks.applyPaymentEvent(ev("paid", on(p)), now),
      ])

      const [a, b] = results.map(expectProcessed)
      expect(a.pendingGeneration).not.toBeNull()
      expect(b.pendingGeneration!.id).toBe(a.pendingGeneration!.id)
      expect((await repos.payments.get(p.ref.paymentId))!.paidAt).toEqual(now)
    })

    it("24. concorrência: o mesmo evento duas vezes ao mesmo tempo → um processed e um duplicate", async () => {
      const repos = await setup()
      const p = await syncedPayment(repos)
      const e = ev("paid", on(p))

      const results = await Promise.all([
        repos.webhooks.applyPaymentEvent(e, new Date()),
        repos.webhooks.applyPaymentEvent(e, new Date()),
      ])

      expect(results.filter((r) => r.outcome === "duplicate")).toHaveLength(1)
      expect(results.filter((r) => r.outcome === "processed")).toHaveLength(1)
    })

    it("25. evento sem status: pago vira CONFIRMED/RECEIVED; demais grupos mantêm o status", async () => {
      const repos = await setup()
      const apply = (e: PaymentEventInput) => repos.webhooks.applyPaymentEvent(e, new Date())
      const statusOf = async (id: string) => (await repos.payments.get(id))!.status

      const a = await syncedPayment(repos)
      expectProcessed(await apply(ev("paid", { ...on(a), event: "PAYMENT_CONFIRMED", status: null })))
      expect(await statusOf(a.ref.paymentId)).toBe("CONFIRMED")
      expectProcessed(await apply(ev("paid", { ...on(a), status: null })))
      expect(await statusOf(a.ref.paymentId)).toBe("RECEIVED")
      expectProcessed(await apply(ev("reversal", { ...on(a), status: null })))
      expect(await statusOf(a.ref.paymentId)).toBe("RECEIVED")

      const b = await syncedPayment(repos)
      expectProcessed(await apply(ev("pre_payment", { ...on(b), status: null })))
      expect(await statusOf(b.ref.paymentId)).toBe("PENDING")
    })

    // Gerações, planos e credencial (numeração do brief deslocada em 1: o 25 já existia).

    it("26. get devolve respostas, paciente e estado; id desconhecido → null", async () => {
      const repos = await setup()
      const g = await paidGeneration(repos)

      expect(await repos.planGenerations.get(g.generationId)).toEqual({
        id: g.generationId,
        paymentId: g.ref.paymentId,
        quizResponseId: g.ref.quizResponseId,
        status: "pending",
        attempts: 0,
        answers: g.sub.answers,
        patient: { id: g.patientId, name: g.sub.patient.name, hasPassword: false },
      })
      expect(await repos.planGenerations.get(UNKNOWN_ID)).toBeNull()
    })

    it("27. locks de geração: exclusivo, liberável; lock expirado volta a aparecer em listDue", async () => {
      const repos = await setup()
      const { planGenerations } = repos
      const id = (await paidGeneration(repos)).generationId

      expect(await planGenerations.listDue(new Date(), BIG)).toContain(id)
      expect(await planGenerations.tryLock(id, 60_000)).toBe(true)
      expect(await planGenerations.tryLock(id, 60_000)).toBe(false)
      expect(await planGenerations.listDue(new Date(), BIG)).not.toContain(id)
      expect(await planGenerations.tryLock(UNKNOWN_ID, 60_000)).toBe(false)

      await planGenerations.unlock(id)
      expect(await planGenerations.listDue(new Date(), BIG)).toContain(id)
      expect(await planGenerations.tryLock(id, 50)).toBe(true)
      expect(await planGenerations.listDue(new Date(), BIG)).not.toContain(id)
      await sleep(80)
      expect(await planGenerations.listDue(new Date(), BIG)).toContain(id)
      expect(await planGenerations.tryLock(id, 60_000)).toBe(true)
      await expect(planGenerations.unlock(UNKNOWN_ID)).resolves.toBeUndefined()
    })

    it("28. complete: plano active, geração done, credencial e notificações plan_ready", async () => {
      const repos = await setup()
      const g = await paidGeneration(repos)
      expect(await repos.planGenerations.tryLock(g.generationId, 60_000)).toBe(true)

      const { mealPlanId } = await repos.planGenerations.complete(g.generationId, done())

      expect(await repos.mealPlans.listByPatient(g.patientId)).toEqual([
        {
          id: mealPlanId,
          patientId: g.patientId,
          paymentId: g.ref.paymentId,
          title: "Plano Alimentar 10/2026",
          startDate: "2026-10-11",
          endDate: "2026-11-10",
          status: "active",
          planData: PLAN,
        },
      ])
      const generation = (await repos.planGenerations.get(g.generationId))!
      expect(generation.status).toBe("done")
      expect(generation.patient.hasPassword).toBe(true)
      expect(await repos.planGenerations.listDue(inMinutes(60), BIG)).not.toContain(g.generationId)
      // O lock foi solto: depois de concluída, a geração pode ser reservada de novo (e nada faz).
      expect(await repos.planGenerations.tryLock(g.generationId, 60_000)).toBe(true)

      const ids = await repos.notifications.listPendingIdsForQuizResponse(g.ref.quizResponseId)
      expect(ids).toHaveLength(2)
      const views = await Promise.all(ids.map((id) => repos.notifications.get(id)))
      for (const n of views) {
        expect(n).toMatchObject({
          quizResponseId: g.ref.quizResponseId,
          paymentId: g.ref.paymentId,
          kind: "plan_ready",
          status: "pending",
          attempts: 0,
          partsSent: 0,
          patientId: g.patientId,
          patientName: g.sub.patient.name,
          patientPasswordHash: HASH_1,
        })
        expect(n!.recipient).toBe(
          n!.channel === "email" ? g.sub.patient.email : `55${g.sub.patient.phone}`,
        )
      }
      expect(views.map((n) => n!.channel).sort()).toEqual(["email", "whatsapp"])
      for (const id of ids) {
        expect(await repos.notifications.listDue(new Date(), BIG)).toContain(id)
      }
    })

    it("29. segunda compra: plano anterior completed, novo active, credencial intacta", async () => {
      const repos = await setup()
      const cpf = randomCpf()
      const first = await paidGeneration(repos, { patient: { cpf } })
      const { mealPlanId: plan1 } = await repos.planGenerations.complete(first.generationId, done())
      await sleep(5) // created_at em milissegundos: garante a ordem também no MySQL

      const second = await paidGeneration(repos, { patient: { cpf } })
      expect(second.patientId).toBe(first.patientId)
      expect(second.ref.paymentId).not.toBe(first.ref.paymentId)
      expect((await repos.planGenerations.get(second.generationId))!.patient.hasPassword).toBe(true)
      const { mealPlanId: plan2 } = await repos.planGenerations.complete(
        second.generationId,
        done({ title: "Plano Alimentar 11/2026", startDate: "2026-11-11", endDate: "2026-12-11", passwordHash: HASH_2 }),
      )

      const plans = await repos.mealPlans.listByPatient(first.patientId)
      expect(plans.map((p) => [p.id, p.status, p.paymentId])).toEqual([
        [plan1, "completed", first.ref.paymentId],
        [plan2, "active", second.ref.paymentId],
      ])
      expect(plans[1]).toMatchObject({ title: "Plano Alimentar 11/2026", startDate: "2026-11-11" })
      const ids = await repos.notifications.listPendingIdsForQuizResponse(second.ref.quizResponseId)
      expect(ids).toHaveLength(2)
      for (const id of ids) {
        expect((await repos.notifications.get(id))!.patientPasswordHash).toBe(HASH_1)
      }
    })

    it("30. complete com passwordHash null não cria credencial", async () => {
      const repos = await setup()
      const g = await paidGeneration(repos)

      await repos.planGenerations.complete(g.generationId, done({ passwordHash: null }))

      expect((await repos.planGenerations.get(g.generationId))!).toMatchObject({
        status: "done",
        patient: { hasPassword: false },
      })
      const ids = await repos.notifications.listPendingIdsForQuizResponse(g.ref.quizResponseId)
      expect(ids).toHaveLength(2)
      for (const id of ids) {
        expect((await repos.notifications.get(id))!.patientPasswordHash).toBeNull()
      }
    })

    it("31. complete em geração que não está pending lança e não grava nada", async () => {
      const repos = await setup()
      const error = syncError("plan.generate")

      // Já concluída: a segunda conclusão lança e não cria outro plano nem muda a credencial.
      const a = await paidGeneration(repos)
      const { mealPlanId } = await repos.planGenerations.complete(a.generationId, done())
      await expect(
        repos.planGenerations.complete(a.generationId, done({ passwordHash: HASH_2 })),
      ).rejects.toThrow()
      expect((await repos.mealPlans.listByPatient(a.patientId)).map((p) => [p.id, p.status])).toEqual([
        [mealPlanId, "active"],
      ])
      expect(await repos.notifications.listPendingIdsForQuizResponse(a.ref.quizResponseId)).toHaveLength(2)
      expect((await repos.planGenerations.get(a.generationId))!.status).toBe("done")

      // Falha definitiva: lança e não grava plano, credencial nem notificação.
      const b = await paidGeneration(repos)
      await repos.planGenerations.markFailure(b.generationId, {
        attempts: 5,
        nextAttemptAt: null,
        failed: true,
        error,
      })
      await expect(repos.planGenerations.complete(b.generationId, done())).rejects.toThrow()
      expect(await repos.mealPlans.listByPatient(b.patientId)).toEqual([])
      expect((await repos.planGenerations.get(b.generationId))!).toMatchObject({
        status: "failed",
        patient: { hasPassword: false },
      })
      expect(await repos.notifications.listPendingIdsForQuizResponse(b.ref.quizResponseId)).toEqual([])

      // Id desconhecido também lança.
      await expect(repos.planGenerations.complete(UNKNOWN_ID, done())).rejects.toThrow()

      // markFailure numa geração done não a tira de done.
      await repos.planGenerations.markFailure(a.generationId, {
        attempts: 1,
        nextAttemptAt: new Date(),
        failed: true,
        error,
      })
      expect((await repos.planGenerations.get(a.generationId))!).toMatchObject({ status: "done", attempts: 0 })
    })

    it("32. duas gerações do mesmo paciente concluídas ao mesmo tempo: um plano active e uma credencial", async () => {
      const repos = await setup()
      const cpf = randomCpf()
      const a = await paidGeneration(repos, { patient: { cpf } })
      const b = await paidGeneration(repos, { patient: { cpf } })
      expect(b.patientId).toBe(a.patientId)
      expect(b.generationId).not.toBe(a.generationId)

      const results = await Promise.all([
        repos.planGenerations.complete(a.generationId, done({ passwordHash: HASH_1 })),
        repos.planGenerations.complete(b.generationId, done({ passwordHash: HASH_2 })),
      ])

      const plans = await repos.mealPlans.listByPatient(a.patientId)
      expect(plans.map((p) => p.id).sort()).toEqual(results.map((r) => r.mealPlanId).sort())
      expect(plans.filter((p) => p.status === "active")).toHaveLength(1)
      expect(plans.filter((p) => p.status === "completed")).toHaveLength(1)

      const ids = [
        ...(await repos.notifications.listPendingIdsForQuizResponse(a.ref.quizResponseId)),
        ...(await repos.notifications.listPendingIdsForQuizResponse(b.ref.quizResponseId)),
      ]
      expect(ids).toHaveLength(4)
      const hashes = await Promise.all(
        ids.map(async (id) => (await repos.notifications.get(id))!.patientPasswordHash),
      )
      expect([HASH_1, HASH_2]).toContain(hashes[0])
      expect(new Set(hashes).size).toBe(1)
      expect((await repos.planGenerations.get(a.generationId))!.status).toBe("done")
      expect((await repos.planGenerations.get(b.generationId))!.status).toBe("done")
    })

    it("33. markFailure agenda nova tentativa; failed sai da fila; reopen e reopenAllFailed devolvem", async () => {
      const repos = await setup()
      const { planGenerations } = repos
      const a = (await paidGeneration(repos)).generationId
      const b = (await paidGeneration(repos)).generationId
      const error = syncError("plan.generate")

      // Falha temporária: continua pending, fora da fila até o próximo horário; lock solto.
      expect(await planGenerations.tryLock(a, 60_000)).toBe(true)
      await planGenerations.markFailure(a, { attempts: 1, nextAttemptAt: inMinutes(2), failed: false, error })
      expect((await planGenerations.get(a))!).toMatchObject({ status: "pending", attempts: 1 })
      expect(await planGenerations.listDue(new Date(), BIG)).not.toContain(a)
      expect(await planGenerations.listDue(inMinutes(3), BIG)).toContain(a)
      expect(await planGenerations.reopen(a)).toBe(false) // não está failed
      expect(await planGenerations.tryLock(a, 60_000)).toBe(true)

      // Falha definitiva: sai da fila e limpa o lock.
      await planGenerations.markFailure(a, { attempts: 5, nextAttemptAt: null, failed: true, error })
      expect((await planGenerations.get(a))!).toMatchObject({ status: "failed", attempts: 5 })
      expect(await planGenerations.listDue(inMinutes(60), BIG)).not.toContain(a)
      expect(await planGenerations.tryLock(a, 60_000)).toBe(true)

      // Reabertura individual: pending, attempts 0, na fila agora, sem lock.
      expect(await planGenerations.reopen(a)).toBe(true)
      expect((await planGenerations.get(a))!).toMatchObject({ status: "pending", attempts: 0 })
      expect(await planGenerations.listDue(new Date(), BIG)).toContain(a)
      expect(await planGenerations.reopen(a)).toBe(false)
      expect(await planGenerations.reopen(UNKNOWN_ID)).toBe(false)

      // Reabertura em massa.
      await planGenerations.markFailure(a, { attempts: 5, nextAttemptAt: null, failed: true, error })
      await planGenerations.markFailure(b, { attempts: 5, nextAttemptAt: null, failed: true, error })
      expect(await planGenerations.tryLock(b, 60_000)).toBe(true)
      expect(await planGenerations.reopenAllFailed()).toBeGreaterThanOrEqual(2)
      for (const id of [a, b]) {
        expect((await planGenerations.get(id))!).toMatchObject({ status: "pending", attempts: 0 })
        expect(await planGenerations.listDue(new Date(), BIG)).toContain(id)
      }
    })

    it("34. listDue de gerações: ordenado por next_attempt_at e respeita o limite", async () => {
      const repos = await setup()
      const { planGenerations } = repos
      const a = (await paidGeneration(repos)).generationId
      const b = (await paidGeneration(repos)).generationId
      const error = syncError("plan.generate")
      const retryAt = (id: string, nextAttemptAt: Date) =>
        planGenerations.markFailure(id, { attempts: 1, nextAttemptAt, failed: false, error })

      try {
        // `b` (criada depois) é a mais antiga; a ordem de inserção é oposta à de vencimento.
        await retryAt(a, new Date(Date.now() - 3_600_000))
        await retryAt(b, new Date(Date.now() - 365 * 86_400_000))
        const now = new Date()

        const all = await planGenerations.listDue(now, BIG)
        expect(all).toContain(a)
        expect(all).toContain(b)
        expect(all.indexOf(b)).toBeLessThan(all.indexOf(a))
        expect(await planGenerations.listDue(now, 1)).toEqual([b])
        expect((await planGenerations.listDue(now, 2)).length).toBeLessThanOrEqual(2)
      } finally {
        for (const id of [a, b]) {
          await planGenerations.markFailure(id, { attempts: 5, nextAttemptAt: null, failed: true, error })
        }
      }
    })

    it("35. payment_link e plan_ready do mesmo envio coexistem", async () => {
      const repos = await setup()
      const g = await paidGeneration(repos)
      const channels: Channel[] = ["email", "whatsapp"]

      await repos.notifications.enqueuePaymentLink({ quizResponseId: g.ref.quizResponseId }, channels)
      await repos.planGenerations.complete(g.generationId, done({ channels }))
      // Enfileirar o link de novo não duplica nada.
      await repos.notifications.enqueuePaymentLink({ quizResponseId: g.ref.quizResponseId }, channels)

      const ids = await repos.notifications.listPendingIdsForQuizResponse(g.ref.quizResponseId)
      expect(ids).toHaveLength(4)
      const views = await Promise.all(ids.map((id) => repos.notifications.get(id)))
      const kindChannel = views.map((n) => `${n!.kind}:${n!.channel}`).sort()
      expect(kindChannel).toEqual([
        "payment_link:email",
        "payment_link:whatsapp",
        "plan_ready:email",
        "plan_ready:whatsapp",
      ])
    })

    it("35b. complete só cria plan_ready dos canais pedidos", async () => {
      const repos = await setup()
      const g = await paidGeneration(repos)

      await repos.planGenerations.complete(g.generationId, done({ channels: ["whatsapp"] }))

      const ids = await repos.notifications.listPendingIdsForQuizResponse(g.ref.quizResponseId)
      expect(ids).toHaveLength(1)
      expect((await repos.notifications.get(ids[0]))!).toMatchObject({
        kind: "plan_ready",
        channel: "whatsapp",
        recipient: `55${g.sub.patient.phone}`,
      })

      // Sem canais: conclui sem notificação.
      const h = await paidGeneration(repos)
      await repos.planGenerations.complete(h.generationId, done({ channels: [] }))
      expect((await repos.planGenerations.get(h.generationId))!.status).toBe("done")
      expect(await repos.notifications.listPendingIdsForQuizResponse(h.ref.quizResponseId)).toEqual([])
    })

    it("36. aviso de vencimento: o estágio segue os dias restantes", async () => {
      const repos = await setup()
      const expected: [string, string | null][] = [
        ["2026-10-17", "plan_expiring_d5"],
        ["2026-10-15", "plan_expiring_d5"],
        ["2026-10-14", "plan_expiring_d2"],
        ["2026-10-13", "plan_expiring_d2"],
        ["2026-10-12", "plan_expiring_d0"],
        ["2026-10-18", null],
        ["2026-10-11", null],
      ]
      // Um paciente por plano: concluir uma geração completa o plano ativo anterior do paciente.
      const plans = []
      for (const [endDate, kind] of expected) {
        plans.push({ ...(await planEnding(repos, endDate)), endDate, kind })
      }

      expect(await expire(repos)).toBe(10)

      for (const plan of plans) {
        const rows = await expiringOf(repos, plan.mealPlanId)
        if (plan.kind === null) {
          expect(rows).toEqual([])
          continue
        }
        expect(rows.map((n) => n.channel).sort()).toEqual(["email", "whatsapp"])
        for (const n of rows) {
          expect(n).toMatchObject({
            kind: plan.kind,
            status: "pending",
            quizResponseId: null,
            paymentId: null,
            paymentUrl: null,
            mealPlan: { id: plan.mealPlanId, endDate: plan.endDate },
            patientId: plan.patientId,
            patientName: plan.sub.patient.name,
            attempts: 0,
            partsSent: 0,
          })
          expect(n.recipient).toBe(
            n.channel === "email" ? plan.sub.patient.email : `55${plan.sub.patient.phone}`,
          )
        }
      }
    })

    it("37. aviso de vencimento não se repete", async () => {
      const repos = await setup()
      const plan = await planEnding(repos, "2026-10-17")

      expect(await expire(repos)).toBe(2)
      expect(await expire(repos)).toBe(0)
      expect(kindsOf(await expiringOf(repos, plan.mealPlanId))).toEqual([
        "plan_expiring_d5:email",
        "plan_expiring_d5:whatsapp",
      ])

      // Dois dias depois o plano entra em d2; o d5 não se repete.
      expect(await expire(repos, "2026-10-15")).toBe(2)
      expect(kindsOf(await expiringOf(repos, plan.mealPlanId))).toEqual([
        "plan_expiring_d2:email",
        "plan_expiring_d2:whatsapp",
        "plan_expiring_d5:email",
        "plan_expiring_d5:whatsapp",
      ])
    })

    it("38. renovação já paga não recebe aviso", async () => {
      const repos = await setup()
      const cpf = randomCpf()
      const plan = await planEnding(repos, "2026-10-13", { patient: { cpf } })
      await sleep(5) // created_at em milissegundos: a cobrança de renovação nasce depois do plano

      // Novo envio pago, ainda sem o plano novo (geração pendente).
      const renewal = await paidGeneration(repos, { patient: { cpf } })
      expect(renewal.ref.paymentId).not.toBe(plan.ref.paymentId)

      await expire(repos)
      expect(await expiringOf(repos, plan.mealPlanId)).toEqual([])
    })

    describe("39. a cobrança de renovação entra no aviso só em d2 e d0, com link", () => {
      it("PENDING com vencimento futuro em d2: linhas com a cobrança e o link", async () => {
        const repos = await setup()
        const cpf = randomCpf()
        const plan = await planEnding(repos, "2026-10-13", { patient: { cpf } })
        await sleep(5)
        const renewal = await syncedPayment(repos, { patient: { cpf } }) // PENDING, vence em 14/10

        await expire(repos)

        const rows = await expiringOf(repos, plan.mealPlanId)
        expect(rows.map((n) => n.channel).sort()).toEqual(["email", "whatsapp"])
        for (const n of rows) {
          expect(n).toMatchObject({
            kind: "plan_expiring_d2",
            paymentId: renewal.ref.paymentId,
            paymentUrl: "https://asaas.example/i/1",
            quizResponseId: null,
          })
        }
      })

      it("cobrança ainda PENDING_ASAAS (sem link): sem cobrança", async () => {
        const repos = await setup()
        const cpf = randomCpf()
        const plan = await planEnding(repos, "2026-10-13", { patient: { cpf } })
        await sleep(5)
        expectRef(await repos.submissions.create(newSub({ patient: { cpf } })))

        await expire(repos)

        const rows = await expiringOf(repos, plan.mealPlanId)
        expect(rows).toHaveLength(2)
        for (const n of rows) expect(n).toMatchObject({ paymentId: null, paymentUrl: null })
      })

      it("cobrança PENDING vencida (11/10): sem cobrança", async () => {
        const repos = await setup()
        const cpf = randomCpf()
        const plan = await planEnding(repos, "2026-10-13", { patient: { cpf } })
        await sleep(5)
        const ref = expectRef(await repos.submissions.create(newSub({ patient: { cpf } })))
        await repos.payments.markSynced(ref.paymentId, synced("PENDING", "2026-10-11"))

        await expire(repos)

        const rows = await expiringOf(repos, plan.mealPlanId)
        expect(rows).toHaveLength(2)
        for (const n of rows) expect(n).toMatchObject({ paymentId: null, paymentUrl: null })
      })

      it("plano em d5 com cobrança válida: sem cobrança", async () => {
        const repos = await setup()
        const cpf = randomCpf()
        const plan = await planEnding(repos, "2026-10-16", { patient: { cpf } })
        await sleep(5)
        await syncedPayment(repos, { patient: { cpf } })

        await expire(repos)

        const rows = await expiringOf(repos, plan.mealPlanId)
        expect(rows).toHaveLength(2)
        for (const n of rows) {
          expect(n).toMatchObject({ kind: "plan_expiring_d5", paymentId: null, paymentUrl: null })
        }
      })
    })

    it("40. plano que deixou de ser ativo não recebe aviso", async () => {
      const repos = await setup()
      const cpf = randomCpf()
      const first = await planEnding(repos, "2026-10-13", { patient: { cpf } })
      await sleep(5)
      const second = await planEnding(repos, "2026-10-12", { patient: { cpf } })
      expect(
        (await repos.mealPlans.listByPatient(first.patientId)).map((p) => [p.id, p.status]),
      ).toEqual([
        [first.mealPlanId, "completed"],
        [second.mealPlanId, "active"],
      ])

      await expire(repos)

      expect(await expiringOf(repos, first.mealPlanId)).toEqual([])
      expect(kindsOf(await expiringOf(repos, second.mealPlanId))).toEqual([
        "plan_expiring_d0:email",
        "plan_expiring_d0:whatsapp",
      ])
    })

    it("41. canais e paciente sem telefone", async () => {
      const repos = await setup()

      // Só o canal pedido.
      const a = await planEnding(repos, "2026-10-14")
      expect(await expire(repos, TODAY, ["email"])).toBe(1)
      const onlyEmail = await expiringOf(repos, a.mealPlanId)
      expect(kindsOf(onlyEmail)).toEqual(["plan_expiring_d2:email"])
      expect(onlyEmail[0].recipient).toBe(a.sub.patient.email)

      // Paciente sem telefone (o admin pode cadastrar assim): nenhuma linha de WhatsApp.
      const cpf = randomCpf()
      const b = await planEnding(repos, "2026-10-14", { patient: { cpf, phone: "" } })
      await expire(repos)
      expect(kindsOf(await expiringOf(repos, b.mealPlanId))).toEqual(["plan_expiring_d2:email"])
      // O plan_ready do mesmo paciente também sai só por e-mail.
      const ready = await repos.notifications.listPendingIdsForQuizResponse(b.ref.quizResponseId)
      expect(ready).toHaveLength(1)
      expect((await repos.notifications.get(ready[0]))!).toMatchObject({
        kind: "plan_ready",
        channel: "email",
      })

      // O link de pagamento de um envio desse paciente também.
      const renewalSub = newSub({ patient: { cpf, phone: "" } })
      const renewal = expectRef(await repos.submissions.create(renewalSub))
      await repos.notifications.enqueuePaymentLink({ quizResponseId: renewal.quizResponseId }, BOTH)
      const ids = await repos.notifications.listPendingIdsForQuizResponse(renewal.quizResponseId)
      expect(ids).toHaveLength(1)
      expect((await repos.notifications.get(ids[0]))!).toMatchObject({
        kind: "payment_link",
        channel: "email",
        recipient: renewalSub.patient.email,
      })
    })

    describe("42. o aviso relido traz o status do plano e a cobrança de renovação de agora", () => {
      it("sem cobrança depois do plano: plano ativo e sem cobrança", async () => {
        const repos = await setup()
        const plan = await planEnding(repos, "2026-10-13")

        await expire(repos)

        const rows = await expiringOf(repos, plan.mealPlanId)
        expect(rows).toHaveLength(2)
        for (const n of rows) {
          expect(n.mealPlan).toEqual({
            id: plan.mealPlanId,
            endDate: "2026-10-13",
            status: "active",
            renewalCharge: null,
          })
        }
      })

      it("a cobrança mais recente criada depois do plano, lida na hora (paga depois do aviso)", async () => {
        const repos = await setup()
        const cpf = randomCpf()
        const plan = await planEnding(repos, "2026-10-13", { patient: { cpf } })
        await sleep(5)
        // Primeira cobrança de renovação, já vencida: o envio seguinte cria outra.
        const old = expectRef(await repos.submissions.create(newSub({ patient: { cpf } })))
        await repos.payments.markSynced(old.paymentId, synced("PENDING", "2026-10-11"))
        await sleep(5)
        const renewal = await syncedPayment(repos, { patient: { cpf }, todaySP: TODAY })
        expect(renewal.ref.paymentId).not.toBe(old.paymentId)

        await expire(repos)
        const [before] = await expiringOf(repos, plan.mealPlanId)
        expect(before.mealPlan).toEqual({
          id: plan.mealPlanId,
          endDate: "2026-10-13",
          status: "active",
          renewalCharge: {
            id: renewal.ref.paymentId,
            status: "PENDING",
            dueDate: "2026-10-14",
            paymentUrl: "https://asaas.example/i/1",
            paidAt: null,
          },
        })

        // Pago depois de enfileirado: a releitura mostra o pagamento.
        expectProcessed(await repos.webhooks.applyPaymentEvent(ev("paid", on(renewal)), new Date()))
        const after = (await repos.notifications.get(before.id))!
        expect(after.mealPlan?.renewalCharge).toMatchObject({ id: renewal.ref.paymentId, status: "RECEIVED" })
        expect(after.mealPlan?.renewalCharge?.paidAt).toBeInstanceOf(Date)
      })

      it("plano substituído depois do aviso: o status relido deixa de ser active", async () => {
        const repos = await setup()
        const cpf = randomCpf()
        const plan = await planEnding(repos, "2026-10-13", { patient: { cpf } })
        await expire(repos)
        const [n] = await expiringOf(repos, plan.mealPlanId)
        await sleep(5)

        await planEnding(repos, "2026-11-12", { patient: { cpf } })

        expect((await repos.notifications.get(n.id))!.mealPlan).toMatchObject({
          id: plan.mealPlanId,
          status: "completed",
        })
      })

      it("mensagem que não é aviso de vencimento: sem plano", async () => {
        const repos = await setup()
        const p = await syncedPayment(repos)
        await repos.notifications.enqueuePaymentLink({ paymentId: p.ref.paymentId }, BOTH)
        const ids = await repos.notifications.listPendingIdsForQuizResponse(p.ref.quizResponseId)
        expect(ids).toHaveLength(2)
        for (const id of ids) expect((await repos.notifications.get(id))!.mealPlan).toBeNull()
      })
    })

    describe("43. funil do quiz: AnalyticsRepo", () => {
      const DAY = 86_400_000
      const device = { deviceType: "mobile", os: "iOS", browser: "Instagram" }

      const patch = (sessionId: string, over: Partial<FunnelSessionPatch> = {}): FunnelSessionPatch => ({
        sessionId,
        device,
        checkoutClicked: false,
        answers: {},
        ...over,
      })

      const ev = (sessionId: string, event: string, now: Date, over: Partial<FunnelEventRow> = {}): FunnelEventRow => ({
        sessionId,
        event,
        step: null,
        stepSlug: null,
        props: {},
        clientTs: now,
        createdAt: now,
        ...over,
      })

      it("cria a sessão com tudo e grava os eventos na ordem enviada", async () => {
        const { analytics } = await setup()
        const sessionId = randomUUID()
        const now = new Date("2026-10-20T12:00:00.123Z")
        const events = [
          ev(sessionId, "session_start", now, { props: { referrerHost: "l.instagram.com" } }),
          ev(sessionId, "step_view", now, { step: 1, stepSlug: "tipo_fisico", props: {} }),
          ev(sessionId, "step_answer", now, {
            step: 1,
            stepSlug: "tipo_fisico",
            props: { durationMs: 1500 },
            clientTs: new Date("2026-10-20T11:59:59.000Z"),
          }),
        ]

        await analytics.recordBatch(
          patch(sessionId, {
            start: { utm: { source: "ig" }, referrerHost: "l.instagram.com", viewportW: 390, viewportH: 844 },
            lastStep: { step: 2, slug: "sono" },
            maxStep: { step: 2, slug: "sono" },
            answers: { tipo_fisico: "Gordinho(a)" },
          }),
          events,
          now,
        )

        expect(await analytics.getSession(sessionId)).toEqual({
          sessionId,
          startedAt: now,
          lastEventAt: now,
          lastStep: 2,
          lastStepSlug: "sono",
          maxStep: 2,
          maxStepSlug: "sono",
          checkoutClicked: false,
          utm: { source: "ig" },
          referrerHost: "l.instagram.com",
          deviceType: "mobile",
          os: "iOS",
          browser: "Instagram",
          viewportW: 390,
          viewportH: 844,
          answers: { tipo_fisico: "Gordinho(a)" },
        })
        const rows = await analytics.listEvents(sessionId)
        expect(rows).toHaveLength(3)
        expect(rows).toEqual(events)
      })

      it("sessão inexistente: getSession devolve null e listEvents, lista vazia", async () => {
        const { analytics } = await setup()
        expect(await analytics.getSession(randomUUID())).toBeNull()
        expect(await analytics.listEvents(randomUUID())).toEqual([])
      })

      it("max_step não diminui; last_step acompanha o último lote", async () => {
        const { analytics } = await setup()
        const sessionId = randomUUID()
        const t1 = new Date("2026-10-20T12:00:00.000Z")
        const t2 = new Date("2026-10-20T12:01:00.000Z")
        await analytics.recordBatch(
          patch(sessionId, { lastStep: { step: 2, slug: "sono" }, maxStep: { step: 2, slug: "sono" } }),
          [],
          t1,
        )
        await analytics.recordBatch(
          patch(sessionId, { lastStep: { step: 1, slug: "tipo_fisico" }, maxStep: { step: 1, slug: "tipo_fisico" } }),
          [],
          t2,
        )

        expect(await analytics.getSession(sessionId)).toMatchObject({
          maxStep: 2,
          maxStepSlug: "sono",
          lastStep: 1,
          lastStepSlug: "tipo_fisico",
        })
      })

      it("max_step maior no segundo lote avança junto com o slug", async () => {
        const { analytics } = await setup()
        const sessionId = randomUUID()
        const t1 = new Date("2026-10-20T12:00:00.000Z")
        const t2 = new Date("2026-10-20T12:01:00.000Z")
        await analytics.recordBatch(patch(sessionId, { maxStep: { step: 1, slug: "tipo_fisico" } }), [], t1)
        await analytics.recordBatch(patch(sessionId, { maxStep: { step: 3, slug: "agua" } }), [], t2)
        expect(await analytics.getSession(sessionId)).toMatchObject({ maxStep: 3, maxStepSlug: "agua" })
      })

      it("max_step igual ao anterior não troca o slug", async () => {
        const { analytics } = await setup()
        const sessionId = randomUUID()
        const t1 = new Date("2026-10-20T12:00:00.000Z")
        const t2 = new Date("2026-10-20T12:01:00.000Z")
        await analytics.recordBatch(patch(sessionId, { maxStep: { step: 2, slug: "sono" } }), [], t1)
        await analytics.recordBatch(patch(sessionId, { maxStep: { step: 2, slug: "outro" } }), [], t2)
        expect(await analytics.getSession(sessionId)).toMatchObject({ maxStep: 2, maxStepSlug: "sono" })
      })

      it("lote sem etapa na criação deixa max_step nulo; o seguinte (etapa 0 inclusive) o define", async () => {
        const { analytics } = await setup()
        const sessionId = randomUUID()
        const t1 = new Date("2026-10-20T12:00:00.000Z")
        const t2 = new Date("2026-10-20T12:01:00.000Z")
        await analytics.recordBatch(patch(sessionId), [], t1)
        expect(await analytics.getSession(sessionId)).toMatchObject({
          maxStep: null,
          maxStepSlug: null,
          lastStep: null,
          lastStepSlug: null,
        })
        await analytics.recordBatch(patch(sessionId, { maxStep: { step: 0, slug: "inicio" } }), [], t2)
        expect(await analytics.getSession(sessionId)).toMatchObject({ maxStep: 0, maxStepSlug: "inicio" })
      })

      it("checkout_clicked vira true e não volta", async () => {
        const { analytics } = await setup()
        const sessionId = randomUUID()
        const t1 = new Date("2026-10-20T12:00:00.000Z")
        const t2 = new Date("2026-10-20T12:01:00.000Z")
        await analytics.recordBatch(patch(sessionId, { checkoutClicked: true }), [], t1)
        await analytics.recordBatch(patch(sessionId, { checkoutClicked: false }), [], t2)
        expect((await analytics.getSession(sessionId))!.checkoutClicked).toBe(true)
      })

      it("UTMs, referrer e viewport não são sobrescritos", async () => {
        const { analytics } = await setup()
        const sessionId = randomUUID()
        const t1 = new Date("2026-10-20T12:00:00.000Z")
        const t2 = new Date("2026-10-20T12:01:00.000Z")
        await analytics.recordBatch(
          patch(sessionId, {
            start: { utm: { source: "ig" }, referrerHost: "l.instagram.com", viewportW: 390, viewportH: 844 },
          }),
          [],
          t1,
        )
        await analytics.recordBatch(
          patch(sessionId, {
            start: { utm: { source: "fb", campaign: "c1" }, referrerHost: "facebook.com", viewportW: 1, viewportH: 2 },
          }),
          [],
          t2,
        )

        const session = (await analytics.getSession(sessionId))!
        expect(session.utm.source).toBe("ig")
        expect(session.referrerHost).toBe("l.instagram.com")
        expect(session.viewportW).toBe(390)
        expect(session.viewportH).toBe(844)
      })

      it("UTM ainda nula é preenchida por um lote posterior", async () => {
        const { analytics } = await setup()
        const sessionId = randomUUID()
        const t1 = new Date("2026-10-20T12:00:00.000Z")
        const t2 = new Date("2026-10-20T12:01:00.000Z")
        await analytics.recordBatch(patch(sessionId), [], t1)
        await analytics.recordBatch(
          patch(sessionId, {
            start: { utm: { source: "fb", campaign: "c1" }, referrerHost: null, viewportW: null, viewportH: null },
          }),
          [],
          t2,
        )
        const session = (await analytics.getSession(sessionId))!
        expect(session.utm).toEqual({ source: "fb", campaign: "c1" })
        expect(session.referrerHost).toBeNull()
        expect(session.viewportW).toBeNull()
      })

      it("answers faz merge e a mesma chave é substituída", async () => {
        const { analytics } = await setup()
        const sessionId = randomUUID()
        const at = (min: number) => new Date(Date.UTC(2026, 9, 20, 12, min))
        await analytics.recordBatch(patch(sessionId, { answers: { tipo_fisico: "Gordinho(a)" } }), [], at(0))
        await analytics.recordBatch(patch(sessionId, { answers: { sono: "6h" } }), [], at(1))
        expect((await analytics.getSession(sessionId))!.answers).toEqual({ tipo_fisico: "Gordinho(a)", sono: "6h" })

        await analytics.recordBatch(patch(sessionId, { answers: { sono: "8h" } }), [], at(2))
        expect((await analytics.getSession(sessionId))!.answers).toEqual({ tipo_fisico: "Gordinho(a)", sono: "8h" })

        await analytics.recordBatch(patch(sessionId, { answers: { sintomas: ["a", "b"] } }), [], at(3))
        await analytics.recordBatch(patch(sessionId, { answers: { sintomas: ["c"] } }), [], at(4))
        expect((await analytics.getSession(sessionId))!.answers).toEqual({
          tipo_fisico: "Gordinho(a)",
          sono: "8h",
          sintomas: ["c"],
        })
      })

      it("lote sem lastStep preserva o lastStep anterior", async () => {
        const { analytics } = await setup()
        const sessionId = randomUUID()
        await analytics.recordBatch(
          patch(sessionId, { lastStep: { step: 4, slug: "agua" } }),
          [],
          new Date("2026-10-20T12:00:00.000Z"),
        )
        await analytics.recordBatch(patch(sessionId), [], new Date("2026-10-20T12:01:00.000Z"))
        expect(await analytics.getSession(sessionId)).toMatchObject({ lastStep: 4, lastStepSlug: "agua" })
      })

      it("lastEventAt passa a ser o now do lote mais recente", async () => {
        const { analytics } = await setup()
        const sessionId = randomUUID()
        const t1 = new Date("2026-10-20T12:00:00.000Z")
        const t2 = new Date("2026-10-20T12:05:00.456Z")
        await analytics.recordBatch(patch(sessionId), [], t1)
        await analytics.recordBatch(patch(sessionId), [], t2)
        expect(await analytics.getSession(sessionId)).toMatchObject({ startedAt: t1, lastEventAt: t2 })
      })

      it("o aparelho é gravado na criação e não muda depois", async () => {
        const { analytics } = await setup()
        const sessionId = randomUUID()
        const t1 = new Date("2026-10-20T12:00:00.000Z")
        const t2 = new Date("2026-10-20T12:01:00.000Z")
        await analytics.recordBatch(patch(sessionId), [], t1)
        await analytics.recordBatch(
          patch(sessionId, { device: { deviceType: "desktop", os: "Windows", browser: "Chrome" } }),
          [],
          t2,
        )
        expect(await analytics.getSession(sessionId)).toMatchObject({
          deviceType: "mobile",
          os: "iOS",
          browser: "Instagram",
        })
      })

      it("os eventos de lotes diferentes acumulam na ordem de gravação", async () => {
        const { analytics } = await setup()
        const sessionId = randomUUID()
        const t1 = new Date("2026-10-20T12:00:00.000Z")
        const t2 = new Date("2026-10-20T12:01:00.000Z")
        await analytics.recordBatch(patch(sessionId), [ev(sessionId, "step_view", t1, { step: 1, stepSlug: "a" })], t1)
        await analytics.recordBatch(
          patch(sessionId),
          [
            ev(sessionId, "step_back", t2, { step: 1, stepSlug: "a" }),
            ev(sessionId, "page_hide", t2, { props: { msOnStep: 10 } }),
          ],
          t2,
        )
        expect((await analytics.listEvents(sessionId)).map((e) => e.event)).toEqual([
          "step_view",
          "step_back",
          "page_hide",
        ])
      })

      it("purge do funil: remove só o antigo e devolve o total", async () => {
        const { analytics } = await setup()
        const oldSession = randomUUID()
        const freshSession = randomUUID()
        const old = new Date(Date.now() - 400 * DAY)
        const fresh = new Date()
        await analytics.recordBatch(
          patch(oldSession),
          [ev(oldSession, "session_start", old), ev(oldSession, "step_view", old, { step: 1, stepSlug: "a" })],
          old,
        )
        await analytics.recordBatch(patch(freshSession), [ev(freshSession, "session_start", fresh)], fresh)

        const removed = await analytics.purgeOlderThan(new Date(Date.now() - 365 * DAY), 1000)

        expect(removed).toBeGreaterThanOrEqual(3) // 2 eventos + 1 sessão (um banco compartilhado pode ter mais antigos)
        expect(await analytics.getSession(oldSession)).toBeNull()
        expect(await analytics.listEvents(oldSession)).toEqual([])
        expect(await analytics.getSession(freshSession)).not.toBeNull()
        expect(await analytics.listEvents(freshSession)).toHaveLength(1)
      })

      it("purge do funil: o limite vale por tabela", async () => {
        const { analytics } = await setup()
        const a = randomUUID()
        const b = randomUUID()
        const old = new Date(Date.now() - 400 * DAY)
        await analytics.recordBatch(patch(a), [ev(a, "session_start", old), ev(a, "step_view", old)], old)
        await analytics.recordBatch(patch(b), [ev(b, "session_start", old), ev(b, "step_view", old)], old)
        const cutoff = new Date(Date.now() - 365 * DAY)

        // 4 eventos e 2 sessões velhas: com limit 1, no máximo 1 de cada tabela.
        expect(await analytics.purgeOlderThan(cutoff, 1)).toBe(2)
        const eventsLeft = (await analytics.listEvents(a)).length + (await analytics.listEvents(b)).length
        expect(eventsLeft).toBe(3)
        const sessionsLeft = [await analytics.getSession(a), await analytics.getSession(b)].filter(Boolean)
        expect(sessionsLeft).toHaveLength(1)
      })
    })

    describe("44. logs do app: AppLogRepo", () => {
      const DAY = 86_400_000

      it("insertMany e listByEvent devolvem as linhas por ts, com fields iguais", async () => {
        const { appLogs } = await setup()
        const event = `contrato.${randomUUID()}`
        const t1 = new Date("2026-10-20T12:00:00.100Z")
        const t2 = new Date("2026-10-20T12:00:00.200Z")
        await appLogs.insertMany([
          { ts: t2, level: "error", event, area: "contrato", fields: { paymentId: "p2", attempt: 2, nested: { a: [1, 2] } } },
          { ts: t1, level: "warn", event, area: "contrato", fields: { paymentId: "p1" } },
        ])

        expect(await appLogs.listByEvent(event)).toEqual([
          { ts: t1, level: "warn", event, area: "contrato", fields: { paymentId: "p1" } },
          { ts: t2, level: "error", event, area: "contrato", fields: { paymentId: "p2", attempt: 2, nested: { a: [1, 2] } } },
        ])
        expect(await appLogs.listByEvent(`contrato.${randomUUID()}`)).toEqual([])
      })

      it("purge dos logs: apaga só as linhas anteriores ao corte e respeita o limite", async () => {
        const { appLogs } = await setup()
        const event = `contrato.${randomUUID()}`
        const old = new Date(Date.now() - 100 * DAY)
        const fresh = new Date()
        await appLogs.insertMany([
          { ts: old, level: "warn", event, area: "contrato", fields: {} },
          { ts: new Date(old.getTime() + 1), level: "warn", event, area: "contrato", fields: {} },
          { ts: fresh, level: "info", event, area: "contrato", fields: {} },
        ])
        const cutoff = new Date(Date.now() - 90 * DAY)

        expect(await appLogs.purgeOlderThan(cutoff, 1)).toBe(1)
        expect(await appLogs.listByEvent(event)).toHaveLength(2)

        expect(await appLogs.purgeOlderThan(cutoff, 1000)).toBeGreaterThanOrEqual(1)
        const rest = await appLogs.listByEvent(event)
        expect(rest).toHaveLength(1)
        expect(rest[0].level).toBe("info")
      })

      it("insertMany([]) não lança", async () => {
        const { appLogs } = await setup()
        await expect(appLogs.insertMany([])).resolves.toBeUndefined()
      })
    })

    describe("45. atribuição da Meta: MetaAttributionRepo", () => {
      const DAY = 86_400_000
      const attribution: MetaAttributionInput = {
        externalId: randomUUID(),
        fbp: "fb.1.1700000000000.123",
        fbc: null,
        clientIp: "1.2.3.4",
        userAgent: "UA",
        eventSourceUrl: "https://quiz.example.com/",
      }

      it("save duas vezes para o mesmo envio não lança", async () => {
        const { submissions, metaAttributions } = await setup()
        const ref = expectRef(await submissions.create(newSub()))

        await metaAttributions.save(ref.quizResponseId, attribution, new Date())
        await expect(
          metaAttributions.save(ref.quizResponseId, { ...attribution, clientIp: "9.9.9.9" }, new Date()),
        ).resolves.toBeUndefined()
      })

      it("o purge apaga as antigas, respeita o limite e mantém as novas", async () => {
        const { submissions, metaAttributions } = await setup()
        const old = new Date(Date.now() - 91 * DAY)
        for (let i = 0; i < 3; i++) {
          const ref = expectRef(await submissions.create(newSub()))
          await metaAttributions.save(ref.quizResponseId, attribution, old)
        }
        const fresh = expectRef(await submissions.create(newSub()))
        await metaAttributions.save(fresh.quizResponseId, attribution, new Date())
        const cutoff = new Date(Date.now() - 90 * DAY)

        expect(await metaAttributions.purgeOlderThan(cutoff, 2)).toBe(2)
        expect(await metaAttributions.purgeOlderThan(cutoff, 1000)).toBe(1)
        expect(await metaAttributions.purgeOlderThan(cutoff, 1000)).toBe(0)
      })
    })
  })
}
