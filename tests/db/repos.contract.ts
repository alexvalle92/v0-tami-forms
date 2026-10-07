import { randomUUID } from "node:crypto"
import { describe, expect, it } from "vitest"
import type { NewSubmission, Repos, SubmissionRef } from "@/lib/db/repos/types"

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

const syncError = (step: string) => ({
  step,
  httpStatus: 500,
  message: "falhou",
  attempt: 1,
  at: new Date().toISOString(),
})

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

    it("3. o mesmo submissionId duas vezes devolve duplicate e preserva o primeiro", async () => {
      const { submissions } = await setup()
      const s = newSub()
      const first = expectRef(await submissions.create(s))
      const again = await submissions.create(newSub({ submissionId: s.submissionId }))

      expect(again).toBe("duplicate")
      expect(await submissions.findBySubmissionId(s.submissionId)).toEqual(first)
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

      const synced = (status: string, dueDate: string) => ({
        asaasId: `pay_${randomUUID()}`,
        asaasCustomerId: "cus_1",
        status,
        paymentUrl: "https://asaas.example/i/1",
        invoiceNumber: "123",
        billingType: "UNDEFINED",
        dueDate,
      })

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

    it("6. locks: exclusivo, liberável e com expiração", async () => {
      const { submissions, payments, notifications } = await setup()
      const ref = expectRef(await submissions.create(newSub()))
      await notifications.enqueuePaymentLink({ paymentId: ref.paymentId }, ["email"])
      const [notificationId] = await notifications.listPendingIdsForQuizResponse(ref.quizResponseId)

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

      expect(await notifications.tryLock(notificationId, 60_000)).toBe(true)
      expect(await notifications.tryLock(notificationId, 60_000)).toBe(false)
      expect(await notifications.listDue(new Date(), BIG)).not.toContain(notificationId)
      await notifications.markFailure(notificationId, {
        attempts: 1,
        nextAttemptAt: new Date(),
        failed: false,
        error: syncError("notify.email"),
      })
      expect(await notifications.tryLock(notificationId, 60_000)).toBe(true) // markFailure limpou
      await notifications.markSent(notificationId)
      expect(await notifications.tryLock(notificationId, 60_000)).toBe(true) // markSent limpou
      expect(await notifications.tryLock(UNKNOWN_ID, 60_000)).toBe(false)
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
      expect(await payments.listDue(inMinutes(3), BIG)).toContain(a.paymentId) // o lock foi limpo

      // Falha definitiva.
      await payments.markSyncFailure(a.paymentId, { attempts: 8, nextSyncAt: null, failed: true, error })
      await payments.markSyncFailure(b.paymentId, { attempts: 8, nextSyncAt: null, failed: true, error })
      expect((await payments.get(a.paymentId))!.status).toBe("ASAAS_FAILED")
      expect(await payments.listDue(inMinutes(60), BIG)).not.toContain(a.paymentId)

      // Reabertura individual.
      expect(await payments.reopen(a.paymentId)).toBe(true)
      const reopened = await payments.get(a.paymentId)
      expect(reopened!.status).toBe("PENDING_ASAAS")
      expect(reopened!.syncAttempts).toBe(0)
      expect(await payments.listDue(new Date(), BIG)).toContain(a.paymentId)
      expect(await payments.reopen(a.paymentId)).toBe(false) // não está mais falha
      expect(await payments.reopen(UNKNOWN_ID)).toBe(false)

      // Reabertura em massa.
      expect(await payments.reopenAllFailed()).toBeGreaterThanOrEqual(1)
      expect((await payments.get(b.paymentId))!.status).toBe("PENDING_ASAAS")
      expect(await payments.listDue(new Date(), BIG)).toContain(b.paymentId)
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
      expect(await notifications.reopen(id)).toBe(true)
      expect((await notifications.get(id))!).toMatchObject({ status: "pending", attempts: 0, partsSent: 2 })
      expect(await notifications.listDue(new Date(), BIG)).toContain(id)
      expect(await notifications.reopen(UNKNOWN_ID)).toBe(false)

      await notifications.markFailure(id, { attempts: 5, nextAttemptAt: null, failed: true, error })
      expect(await notifications.reopenAllFailed()).toBeGreaterThanOrEqual(1)
      expect((await notifications.get(id))!).toMatchObject({ status: "pending", partsSent: 2 })

      await notifications.markSent(id)
      expect((await notifications.get(id))!.status).toBe("sent")
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
  })
}
