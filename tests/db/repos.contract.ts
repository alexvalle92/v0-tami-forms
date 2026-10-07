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
  })
}
