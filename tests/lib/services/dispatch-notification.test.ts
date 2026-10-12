import { describe, expect, it, vi } from "vitest"
import type { Channel, LastError, NotificationRepo } from "@/lib/db/repos/types"
import { hashPassword, verifyPassword } from "@/lib/access/password-hash"
import { deriveTempPassword } from "@/lib/access/temp-password"
import { HttpError } from "@/lib/http/retry"
import type { Logger } from "@/lib/log"
import type { EmailSender } from "@/lib/notify/email"
import {
  FIRST_ACCESS_TITLE,
  PASSWORD_RESET_TITLE,
  PAYMENT_LINK_TITLE,
  PLAN_READY_TITLE,
  renderFirstAccess,
  renderPasswordReset,
  renderPaymentLink,
  renderPlanReady,
  toWhatsAppParts,
} from "@/lib/notify/templates"
import type { WhatsAppSender } from "@/lib/notify/whatsapp"
import { createDispatchNotification } from "@/lib/services/dispatch-notification"
import { createMemoryRepos } from "../../fakes/memory-repos"

const NOW = new Date("2026-10-07T15:00:00Z")
const PAY_URL = "https://asaas.test/i/abc123"
const NAME = "Ana Souza"
const EMAIL = "ana@gmail.com"
const PHONE = "44991651250"
const RECIPIENT_WA = `55${PHONE}`
const APP_URL = "https://plana.nutritamilivalle.com.br/"
const ACCESS_SECRET = "segredo-de-teste-com-mais-de-32-caracteres"
const tempPasswordOf = (patientId: string) => deriveTempPassword(ACCESS_SECRET, patientId)

const seedError: LastError = { step: "seed", message: "seed", attempt: 1, at: NOW.toISOString() }
const PARTS = toWhatsAppParts(PAYMENT_LINK_TITLE, renderPaymentLink({ name: NAME, link: PAY_URL }).html)

type Setup = Awaited<ReturnType<typeof setup>>

async function setup(
  opts: {
    synced?: boolean
    wrap?: (repos: ReturnType<typeof createMemoryRepos>) => NotificationRepo
    tempPassword?: (patientId: string) => string
  } = {},
) {
  const repos = createMemoryRepos()
  const created = await repos.submissions.create({
    submissionId: "sub-1",
    patient: { name: NAME, cpf: "52998224725", email: EMAIL, phone: PHONE },
    answers: {},
    amount: "39.90",
    todaySP: "2026-10-07",
  })
  if (created === "duplicate") throw new Error("unexpected duplicate")
  if (opts.synced !== false) {
    await repos.payments.markSynced(created.paymentId, {
      asaasId: "pay_1",
      asaasCustomerId: "cus_1",
      status: "PENDING",
      paymentUrl: PAY_URL,
      invoiceNumber: null,
      billingType: "UNDEFINED",
      dueDate: "2026-10-09",
    })
  }
  const channels: Channel[] = ["email", "whatsapp"]
  await repos.notifications.enqueuePaymentLink({ paymentId: created.paymentId }, channels)
  const ids = Object.fromEntries([...repos.state.notifications.values()].map((n) => [n.channel, n.id])) as Record<
    Channel,
    string
  >

  const email = { send: vi.fn(async (_m: Parameters<EmailSender["send"]>[0]) => {}) }
  const whatsapp = { sendText: vi.fn(async (_n: string, _t: string) => {}) }
  const alertAdmin = vi.fn(async (_a: unknown) => {})
  const log: Logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() }
  const sleeps: number[] = []
  const dispatch = createDispatchNotification({
    notifications: opts.wrap ? opts.wrap(repos) : repos.notifications,
    email: email satisfies EmailSender,
    whatsapp: whatsapp satisfies WhatsAppSender,
    alertAdmin,
    log,
    now: () => NOW,
    sleep: async (ms) => {
      sleeps.push(ms)
    },
    access: { tempPassword: opts.tempPassword ?? tempPasswordOf, verifyPassword },
    appUrl: APP_URL,
  })
  return { repos, ids, paymentId: created.paymentId, email, whatsapp, alertAdmin, log, sleeps, dispatch }
}

const row = (s: Setup, channel: Channel) => s.repos.state.notifications.get(s.ids[channel])!

/**
 * Pagamento confirmado e plano concluído: cria as notificações `plan_ready` (uma por canal) e grava `passwordHash`
 * como credencial do paciente (null = paciente sem credencial).
 */
async function completePlan(s: Setup, passwordHash: string | null) {
  const applied = await s.repos.webhooks.applyPaymentEvent(
    {
      eventId: "evt_paid_1",
      event: "PAYMENT_RECEIVED",
      group: "paid",
      asaasPaymentId: "pay_1",
      externalReference: s.paymentId,
      status: "RECEIVED",
      billingType: null,
      invoiceNumber: null,
      paymentDate: null,
    },
    NOW,
  )
  if (applied.outcome !== "processed" || !applied.pendingGeneration) throw new Error("esperava uma geração pendente")
  await s.repos.planGenerations.complete(applied.pendingGeneration.id, {
    title: "Plano Alimentar 10/2026",
    startDate: "2026-10-07",
    endDate: "2026-11-06",
    planData: { meals: [], calories: 1800, observations: "" },
    generation: { model: "claude-opus-5-5" },
    passwordHash,
    channels: ["email", "whatsapp"],
  })
  const planRows = [...s.repos.state.notifications.values()].filter((n) => n.kind === "plan_ready")
  const planIds = Object.fromEntries(planRows.map((n) => [n.channel, n.id])) as Record<Channel, string>
  const patientId = (await s.repos.notifications.get(planIds.email))!.patientId
  return { planIds, patientId, tempPassword: tempPasswordOf(patientId) }
}

const planRow = (s: Setup, id: string) => s.repos.state.notifications.get(id)!
const patientIdOf = (s: Setup) => s.repos.state.payments.get(s.paymentId)!.patientId

async function expectUnlocked(s: Setup, channel: Channel) {
  expect(row(s, channel).lockedUntil).toBeNull()
  expect(await s.repos.notifications.tryLock(s.ids[channel], 60_000)).toBe(true)
  await s.repos.notifications.unlock(s.ids[channel])
  expect(row(s, channel).lockedUntil).toBeNull()
}

function loggedText(log: Logger): string {
  return JSON.stringify([
    ...(log.info as ReturnType<typeof vi.fn>).mock.calls,
    ...(log.warn as ReturnType<typeof vi.fn>).mock.calls,
    ...(log.error as ReturnType<typeof vi.fn>).mock.calls,
  ])
}

async function seedAttempts(s: Setup, channel: Channel, attempts: number) {
  await s.repos.notifications.markFailure(s.ids[channel], {
    attempts,
    nextAttemptAt: NOW,
    failed: false,
    error: seedError,
  })
}

describe("createDispatchNotification", () => {
  it("e-mail: envia o link com o assunto do plano e marca como enviada", async () => {
    const s = await setup()

    expect(await s.dispatch(s.ids.email)).toBe("sent")

    expect(s.email.send).toHaveBeenCalledTimes(1)
    const sent = s.email.send.mock.calls[0][0]
    expect(sent).toMatchObject({ to: EMAIL, subject: PAYMENT_LINK_TITLE })
    expect(sent.html).toContain(PAY_URL)
    expect(sent.text).toContain(PAY_URL)
    expect(row(s, "email")).toMatchObject({ status: "sent" })
    expect(row(s, "email").sentAt).not.toBeNull()
    expect(s.whatsapp.sendText).not.toHaveBeenCalled()
    expect(s.alertAdmin).not.toHaveBeenCalled()
    await expectUnlocked(s, "email")
  })

  it("whatsapp: envia 3 partes com 3 s entre elas e marca como enviada", async () => {
    const s = await setup()
    expect(PARTS).toHaveLength(3)

    expect(await s.dispatch(s.ids.whatsapp)).toBe("sent")

    expect(s.whatsapp.sendText.mock.calls).toEqual(PARTS.map((p) => [RECIPIENT_WA, p]))
    expect(s.whatsapp.sendText.mock.calls.every((c) => c[0] === "5544991651250")).toBe(true)
    expect(s.sleeps).toEqual([3000, 3000])
    expect(row(s, "whatsapp")).toMatchObject({ status: "sent", partsSent: 3 })
    expect(s.email.send).not.toHaveBeenCalled()
    await expectUnlocked(s, "whatsapp")
  })

  it("whatsapp parcial: a parte 2 falha (transitório), depois só as partes 2 e 3 são enviadas", async () => {
    const s = await setup()
    s.whatsapp.sendText
      .mockImplementationOnce(async () => {})
      .mockImplementationOnce(async () => {
        throw new HttpError("evolution 503", { transient: true, status: 503, body: "SEGREDO-CORPO" })
      })

    expect(await s.dispatch(s.ids.whatsapp)).toBe("retry_scheduled")

    expect(row(s, "whatsapp")).toMatchObject({ status: "pending", partsSent: 1, attempts: 1 })
    expect(row(s, "whatsapp").nextAttemptAt).toEqual(new Date(NOW.getTime() + 2 * 60_000))
    expect(row(s, "whatsapp").lastError).toMatchObject({
      step: "notify.whatsapp",
      httpStatus: 503,
      attempt: 1,
      at: NOW.toISOString(),
    })
    expect(s.alertAdmin).not.toHaveBeenCalled()
    expect(loggedText(s.log)).not.toContain("SEGREDO-CORPO")
    await expectUnlocked(s, "whatsapp")

    s.whatsapp.sendText.mockClear()
    s.sleeps.length = 0

    expect(await s.dispatch(s.ids.whatsapp)).toBe("sent")

    expect(s.whatsapp.sendText.mock.calls).toEqual([
      [RECIPIENT_WA, PARTS[1]],
      [RECIPIENT_WA, PARTS[2]],
    ])
    expect(s.whatsapp.sendText.mock.calls.map((c) => c[1])).not.toContain(PARTS[0])
    expect(s.sleeps).toEqual([3000])
    expect(row(s, "whatsapp")).toMatchObject({ status: "sent", partsSent: 3 })
    await expectUnlocked(s, "whatsapp")
  })

  it("whatsapp: todas as partes já enviadas, mas não marcada: só marca como enviada", async () => {
    const s = await setup()
    await s.repos.notifications.markPartSent(s.ids.whatsapp, PARTS.length)

    expect(await s.dispatch(s.ids.whatsapp)).toBe("sent")

    expect(s.whatsapp.sendText).not.toHaveBeenCalled()
    expect(s.sleeps).toEqual([])
    expect(row(s, "whatsapp").status).toBe("sent")
  })

  it("5ª falha transitória: failed, sem próxima tentativa, e alerta o admin", async () => {
    const s = await setup()
    await seedAttempts(s, "whatsapp", 4)
    s.whatsapp.sendText.mockRejectedValueOnce(new HttpError("evolution 503", { transient: true, status: 503 }))

    expect(await s.dispatch(s.ids.whatsapp)).toBe("failed")

    expect(row(s, "whatsapp")).toMatchObject({ status: "failed", attempts: 5 })
    expect(s.alertAdmin).toHaveBeenCalledTimes(1)
    expect(s.alertAdmin).toHaveBeenCalledWith({
      kind: "notification",
      id: s.ids.whatsapp,
      patientName: NAME,
      error: expect.objectContaining({ step: "notify.whatsapp", httpStatus: 503, attempt: 5 }),
    })
    await expectUnlocked(s, "whatsapp")
  })

  it("4ª falha transitória ainda reagenda, com backoff de 16 min", async () => {
    const s = await setup()
    await seedAttempts(s, "email", 3)
    s.email.send.mockRejectedValueOnce(new Error("socket hang up"))

    expect(await s.dispatch(s.ids.email)).toBe("retry_scheduled")

    expect(row(s, "email")).toMatchObject({ status: "pending", attempts: 4 })
    expect(row(s, "email").nextAttemptAt).toEqual(new Date(NOW.getTime() + 16 * 60_000))
    expect(row(s, "email").lastError).toMatchObject({ step: "notify.email", message: "socket hang up" })
    expect(s.alertAdmin).not.toHaveBeenCalled()
  })

  it("whatsapp 400: falha na hora e alerta o admin", async () => {
    const s = await setup()
    s.whatsapp.sendText.mockRejectedValueOnce(
      new HttpError("evolution 400", { transient: false, status: 400, body: "SEGREDO" }),
    )

    expect(await s.dispatch(s.ids.whatsapp)).toBe("failed")

    expect(row(s, "whatsapp")).toMatchObject({ status: "failed", attempts: 1, partsSent: 0 })
    expect(s.alertAdmin).toHaveBeenCalledTimes(1)
    expect(s.alertAdmin).toHaveBeenCalledWith({
      kind: "notification",
      id: s.ids.whatsapp,
      patientName: NAME,
      error: expect.objectContaining({ step: "notify.whatsapp", httpStatus: 400 }),
    })
    expect(loggedText(s.log)).not.toContain("SEGREDO")
    await expectUnlocked(s, "whatsapp")
  })

  it("e-mail com erro permanente: failed e alerta", async () => {
    const s = await setup()
    s.email.send.mockRejectedValueOnce(new HttpError("smtp rejected", { transient: false, status: 550 }))

    expect(await s.dispatch(s.ids.email)).toBe("failed")
    expect(row(s, "email").status).toBe("failed")
    expect(s.alertAdmin).toHaveBeenCalledTimes(1)
  })

  it("já enviada: skipped, sem enviar nada", async () => {
    const s = await setup()
    await s.repos.notifications.markSent(s.ids.email)

    expect(await s.dispatch(s.ids.email)).toBe("skipped")
    expect(s.email.send).not.toHaveBeenCalled()
  })

  it("já falhada: skipped", async () => {
    const s = await setup()
    await s.repos.notifications.markFailure(s.ids.email, {
      attempts: 5,
      nextAttemptAt: null,
      failed: true,
      error: seedError,
    })

    expect(await s.dispatch(s.ids.email)).toBe("skipped")
    expect(s.email.send).not.toHaveBeenCalled()
  })

  it("inexistente: skipped", async () => {
    const s = await setup()
    expect(await s.dispatch("nao-existe")).toBe("skipped")
  })

  it("reservada por outro processo: busy, sem enviar e sem soltar o lock alheio", async () => {
    const s = await setup()
    expect(await s.repos.notifications.tryLock(s.ids.email, 60_000)).toBe(true)

    expect(await s.dispatch(s.ids.email)).toBe("busy")

    expect(s.email.send).not.toHaveBeenCalled()
    expect(row(s, "email").lockedUntil).not.toBeNull()
  })

  it("R19: a linha muda entre o get e o lock: relê, devolve skipped e solta o lock", async () => {
    const s = await setup({
      wrap: (repos) => ({
        ...repos.notifications,
        tryLock: async (id, ttl) => {
          await repos.notifications.markSent(id) // outro worker termina entre o get e o lock
          return repos.notifications.tryLock(id, ttl)
        },
      }),
    })

    expect(await s.dispatch(s.ids.email)).toBe("skipped")

    expect(s.email.send).not.toHaveBeenCalled()
    expect(row(s, "email").status).toBe("sent")
    await expectUnlocked(s, "email")
  })

  it("R19: usa o partsSent relido depois do lock, não o do primeiro get", async () => {
    const s = await setup({
      wrap: (repos) => ({
        ...repos.notifications,
        tryLock: async (id, ttl) => {
          await repos.notifications.markPartSent(id, 2) // outro worker enviou 2 partes e caiu
          return repos.notifications.tryLock(id, ttl)
        },
      }),
    })

    expect(await s.dispatch(s.ids.whatsapp)).toBe("sent")

    expect(s.whatsapp.sendText.mock.calls).toEqual([[RECIPIENT_WA, PARTS[2]]])
    expect(s.sleeps).toEqual([])
  })

  it("sem paymentUrl: conta como falha da etapa notify.<canal> com 'payment without url'", async () => {
    const s = await setup({ synced: false })

    expect(await s.dispatch(s.ids.email)).toBe("retry_scheduled")

    expect(s.email.send).not.toHaveBeenCalled()
    expect(row(s, "email")).toMatchObject({ status: "pending", attempts: 1 })
    expect(row(s, "email").lastError).toMatchObject({ step: "notify.email", message: "payment without url" })
    expect(row(s, "email").nextAttemptAt).toEqual(new Date(NOW.getTime() + 2 * 60_000))
    await expectUnlocked(s, "email")

    expect(await s.dispatch(s.ids.whatsapp)).toBe("retry_scheduled")
    expect(row(s, "whatsapp").lastError).toMatchObject({ step: "notify.whatsapp", message: "payment without url" })
    expect(s.whatsapp.sendText).not.toHaveBeenCalled()
  })

  it("sem paymentUrl na 5ª tentativa: failed e alerta", async () => {
    const s = await setup({ synced: false })
    await seedAttempts(s, "email", 4)

    expect(await s.dispatch(s.ids.email)).toBe("failed")
    expect(s.alertAdmin).toHaveBeenCalledTimes(1)
  })

  it("alertAdmin que lança não muda o resultado failed", async () => {
    const s = await setup()
    s.alertAdmin.mockRejectedValueOnce(new Error("alert broke"))
    s.whatsapp.sendText.mockRejectedValueOnce(new HttpError("evolution 400", { transient: false, status: 400 }))

    expect(await s.dispatch(s.ids.whatsapp)).toBe("failed")
    expect(row(s, "whatsapp").status).toBe("failed")
    expect(s.log.error).toHaveBeenCalled()
    await expectUnlocked(s, "whatsapp")
  })

  it("não consegue registrar a falha: retry_scheduled, sem alerta, loga e solta o lock", async () => {
    const s = await setup({
      wrap: (repos) => ({
        ...repos.notifications,
        markFailure: async () => {
          throw new Error("db down")
        },
      }),
    })
    s.whatsapp.sendText.mockRejectedValueOnce(new HttpError("evolution 400", { transient: false, status: 400 }))

    expect(await s.dispatch(s.ids.whatsapp)).toBe("retry_scheduled")

    expect(s.alertAdmin).not.toHaveBeenCalled()
    expect(s.log.error).toHaveBeenCalled()
    await expectUnlocked(s, "whatsapp")
  })

  it("markSent lança: registra a falha da etapa db.mark_sent e solta o lock", async () => {
    const s = await setup({
      wrap: (repos) => ({
        ...repos.notifications,
        markSent: async () => {
          throw new Error("db down")
        },
      }),
    })

    expect(await s.dispatch(s.ids.email)).toBe("retry_scheduled")
    expect(row(s, "email").lastError).toMatchObject({ step: "db.mark_sent", message: "db down" })
    await expectUnlocked(s, "email")
  })

  it("markPartSent lança: registra db.mark_part_sent e solta o lock", async () => {
    const s = await setup({
      wrap: (repos) => ({
        ...repos.notifications,
        markPartSent: async () => {
          throw new Error("db down")
        },
      }),
    })

    expect(await s.dispatch(s.ids.whatsapp)).toBe("retry_scheduled")
    expect(row(s, "whatsapp").lastError?.step).toBe("db.mark_part_sent")
    // A parte 1 saiu, mas não foi gravada: a nova tentativa a reenvia (comportamento aceito, ver o serviço).
    expect(s.whatsapp.sendText.mock.calls).toEqual([[RECIPIENT_WA, PARTS[0]]])
    expect(row(s, "whatsapp").partsSent).toBe(0)
    await expectUnlocked(s, "whatsapp")

    s.whatsapp.sendText.mockClear()
    expect(await s.dispatch(s.ids.whatsapp)).toBe("retry_scheduled")
    expect(s.whatsapp.sendText.mock.calls).toEqual([[RECIPIENT_WA, PARTS[0]]])
  })

  it("exceção inesperada fora do try de envio (releitura): o lock é solto", async () => {
    let calls = 0
    const s = await setup({
      wrap: (repos) => ({
        ...repos.notifications,
        get: async (id) => {
          if (++calls === 2) throw new Error("db down na releitura")
          return repos.notifications.get(id)
        },
      }),
    })

    await expect(s.dispatch(s.ids.email)).rejects.toThrow()
    expect(s.email.send).not.toHaveBeenCalled()
    await expectUnlocked(s, "email")
  })

  describe("plan_ready", () => {
    // Hash de uma senha que o paciente já escolheu (formato scrypt, mas não é a temporária).
    const changedHash = () => hashPassword("minha-senha-nova-123")
    // Formato antigo do PlanA (SHA-512 em base64, 88 caracteres): não é scrypt, então não confere.
    const SHA512_BASE64 = `${"Zm9v".repeat(21)}Zg==`

    it("e-mail de primeiro acesso: assunto e senha temporária no corpo", async () => {
      const s = await setup()
      const plan = await completePlan(s, await hashPassword(tempPasswordOf(patientIdOf(s))))

      expect(await s.dispatch(plan.planIds.email)).toBe("sent")

      expect(s.email.send).toHaveBeenCalledTimes(1)
      const sent = s.email.send.mock.calls[0][0]
      expect(sent).toMatchObject({ to: EMAIL, subject: FIRST_ACCESS_TITLE })
      expect(sent.html).toBe(renderFirstAccess({ name: NAME, appUrl: APP_URL, tempPassword: plan.tempPassword }).html)
      expect(sent.html).toContain(plan.tempPassword)
      expect(sent.text).toContain(`Senha temporária: ${plan.tempPassword}`)
      expect(planRow(s, plan.planIds.email)).toMatchObject({ status: "sent" })
      expect(s.whatsapp.sendText).not.toHaveBeenCalled()
      expect(s.alertAdmin).not.toHaveBeenCalled()
    })

    it("WhatsApp de primeiro acesso: as 3 partes, com 3 s entre elas", async () => {
      const s = await setup()
      const plan = await completePlan(s, await hashPassword(tempPasswordOf(patientIdOf(s))))
      const parts = toWhatsAppParts(
        FIRST_ACCESS_TITLE,
        renderFirstAccess({ name: NAME, appUrl: APP_URL, tempPassword: plan.tempPassword }).html,
      )
      expect(parts).toHaveLength(3)

      expect(await s.dispatch(plan.planIds.whatsapp)).toBe("sent")

      expect(s.whatsapp.sendText.mock.calls).toEqual(parts.map((p) => [RECIPIENT_WA, p]))
      expect(parts[1]).toContain(`*Senha temporária:* ${plan.tempPassword}`)
      expect(s.sleeps).toEqual([3000, 3000])
      expect(planRow(s, plan.planIds.whatsapp)).toMatchObject({ status: "sent", partsSent: 3 })
      expect(s.email.send).not.toHaveBeenCalled()
    })

    it("senha já trocada: sai o texto de plano novo, sem a senha temporária", async () => {
      const s = await setup()
      const plan = await completePlan(s, await changedHash())

      expect(await s.dispatch(plan.planIds.email)).toBe("sent")
      expect(await s.dispatch(plan.planIds.whatsapp)).toBe("sent")

      const sent = s.email.send.mock.calls[0][0]
      expect(sent.subject).toBe(PLAN_READY_TITLE)
      expect(sent.html).toBe(renderPlanReady({ name: NAME, appUrl: APP_URL }).html)
      expect(sent.html).not.toContain(plan.tempPassword)
      expect(sent.text).not.toContain(plan.tempPassword)

      const parts = toWhatsAppParts(PLAN_READY_TITLE, renderPlanReady({ name: NAME, appUrl: APP_URL }).html)
      expect(parts).toHaveLength(2)
      expect(s.whatsapp.sendText.mock.calls).toEqual(parts.map((p) => [RECIPIENT_WA, p]))
      expect(s.whatsapp.sendText.mock.calls.map((c) => c[1]).join("\n")).not.toContain(plan.tempPassword)
      expect(s.sleeps).toEqual([3000])
    })

    it("hash em outro formato (SHA-512 base64): sai o texto de plano novo", async () => {
      const s = await setup()
      const plan = await completePlan(s, SHA512_BASE64)

      expect(await s.dispatch(plan.planIds.email)).toBe("sent")

      const sent = s.email.send.mock.calls[0][0]
      expect(sent.subject).toBe(PLAN_READY_TITLE)
      expect(sent.html).not.toContain(plan.tempPassword)
    })

    it("paciente sem hash: nova tentativa agendada, nada é enviado", async () => {
      const s = await setup()
      const plan = await completePlan(s, null)

      expect(await s.dispatch(plan.planIds.email)).toBe("retry_scheduled")
      expect(await s.dispatch(plan.planIds.whatsapp)).toBe("retry_scheduled")

      expect(s.email.send).not.toHaveBeenCalled()
      expect(s.whatsapp.sendText).not.toHaveBeenCalled()
      expect(planRow(s, plan.planIds.email)).toMatchObject({ status: "pending", attempts: 1 })
      expect(planRow(s, plan.planIds.email).lastError).toMatchObject({ step: "notify.email" })
      expect(planRow(s, plan.planIds.email).nextAttemptAt).toEqual(new Date(NOW.getTime() + 2 * 60_000))
      expect(planRow(s, plan.planIds.whatsapp).lastError).toMatchObject({ step: "notify.whatsapp" })
      expect(s.alertAdmin).not.toHaveBeenCalled()
      expect(planRow(s, plan.planIds.email).lockedUntil).toBeNull()
    })

    it("plan_ready não exige payment_url", async () => {
      const s = await setup({ synced: false })
      const plan = await completePlan(s, await hashPassword(tempPasswordOf(patientIdOf(s))))
      expect((await s.repos.notifications.get(plan.planIds.email))!.paymentUrl).toBeNull()

      expect(await s.dispatch(plan.planIds.email)).toBe("sent")

      expect(s.email.send.mock.calls[0][0].subject).toBe(FIRST_ACCESS_TITLE)
    })

    it("tempPassword que lança (segredo vazio): nova tentativa normal, sem vazar nada", async () => {
      const s = await setup({ tempPassword: (patientId) => deriveTempPassword("", patientId) })
      const plan = await completePlan(s, await hashPassword("qualquer-senha-1"))

      expect(await s.dispatch(plan.planIds.email)).toBe("retry_scheduled")

      expect(s.email.send).not.toHaveBeenCalled()
      expect(planRow(s, plan.planIds.email)).toMatchObject({ status: "pending", attempts: 1 })
      expect(planRow(s, plan.planIds.email).lastError).toMatchObject({
        step: "notify.email",
        message: "deriveTempPassword: segredo vazio",
      })
    })

    it("nenhum log, last_error nem alerta contém a senha temporária", async () => {
      const s = await setup()
      const plan = await completePlan(s, await hashPassword(tempPasswordOf(patientIdOf(s))))
      s.email.send.mockRejectedValueOnce(new Error("socket hang up"))
      s.whatsapp.sendText
        .mockImplementationOnce(async () => {})
        .mockRejectedValueOnce(new HttpError("evolution 503", { transient: true, status: 503 }))

      expect(await s.dispatch(plan.planIds.email)).toBe("retry_scheduled") // falha
      expect(await s.dispatch(plan.planIds.email)).toBe("sent") // sucesso
      expect(await s.dispatch(plan.planIds.whatsapp)).toBe("retry_scheduled") // falha na parte 2
      expect(await s.dispatch(plan.planIds.whatsapp)).toBe("sent")

      const everything = JSON.stringify({
        logs: loggedText(s.log),
        errors: [planRow(s, plan.planIds.email).lastError, planRow(s, plan.planIds.whatsapp).lastError],
        alerts: s.alertAdmin.mock.calls,
      })
      expect(loggedText(s.log)).not.toBe("[]")
      expect(everything).not.toContain(plan.tempPassword)
    })
  })

  describe("password_reset", () => {
    const LINK = "https://plana.test/cliente/redefinir-senha/tok_abc123"
    const message = renderPasswordReset({ name: NAME, link: LINK })

    it("e-mail: envia o texto com o link do payload e apaga o payload", async () => {
      const s = await setup()
      const id = s.repos.seed.passwordReset({ patientId: patientIdOf(s), channel: "email", link: LINK })

      expect(await s.dispatch(id)).toBe("sent")

      expect(s.email.send).toHaveBeenCalledTimes(1)
      expect(s.email.send.mock.calls[0][0]).toMatchObject({
        to: EMAIL,
        subject: PASSWORD_RESET_TITLE,
        html: message.html,
      })
      expect(planRow(s, id)).toMatchObject({ status: "sent", payload: null })
      expect(s.whatsapp.sendText).not.toHaveBeenCalled()
    })

    it("WhatsApp: as 3 partes, com 3 s entre elas", async () => {
      const s = await setup()
      const id = s.repos.seed.passwordReset({ patientId: patientIdOf(s), channel: "whatsapp", link: LINK })
      const parts = toWhatsAppParts(PASSWORD_RESET_TITLE, message.html)

      expect(await s.dispatch(id)).toBe("sent")

      expect(parts).toHaveLength(3)
      expect(s.whatsapp.sendText.mock.calls).toEqual(parts.map((p) => [RECIPIENT_WA, p]))
      expect(s.sleeps).toEqual([3000, 3000])
      expect(planRow(s, id)).toMatchObject({ status: "sent", partsSent: 3, payload: null })
    })

    it("sem link no payload: falha definitiva na primeira tentativa, com alerta", async () => {
      const s = await setup()
      const id = s.repos.seed.passwordReset({ patientId: patientIdOf(s), channel: "email" })

      expect(await s.dispatch(id)).toBe("failed")

      expect(s.email.send).not.toHaveBeenCalled()
      expect(planRow(s, id)).toMatchObject({ status: "failed", attempts: 1 })
      expect(s.alertAdmin).toHaveBeenCalledTimes(1)
      expect(s.alertAdmin.mock.calls[0][0]).toMatchObject({ kind: "notification", id, patientName: NAME })
    })

    it("o link nunca aparece em log, last_error nem alerta", async () => {
      const s = await setup()
      s.email.send.mockRejectedValueOnce(new HttpError("HTTP 503", { transient: true }))
      const id = s.repos.seed.passwordReset({ patientId: patientIdOf(s), channel: "email", link: LINK })

      expect(await s.dispatch(id)).toBe("retry_scheduled")

      const everything = JSON.stringify({
        logs: loggedText(s.log),
        error: planRow(s, id).lastError,
        alerts: s.alertAdmin.mock.calls,
      })
      expect(loggedText(s.log)).not.toBe("[]")
      expect(everything).not.toContain("tok_abc123")
      // A tentativa seguinte ainda precisa do link.
      expect(planRow(s, id).payload).toEqual({ link: LINK })
    })
  })

  describe("R17: sem PII, texto da mensagem nem corpo bruto em logs, last_error e alerta", () => {
    class DrizzleQueryError extends Error {
      constructor(message: string, cause?: unknown) {
        super(message, { cause })
        this.name = "DrizzleQueryError"
      }
    }
    const PII =
      "Failed query: update notifications set parts_sent = ? where id = ?\nparams: ana@gmail.com,5544991651250,Ana Souza"
    const failingMarkPartSent = (repos: ReturnType<typeof createMemoryRepos>): NotificationRepo => ({
      ...repos.notifications,
      markPartSent: async () => {
        throw new DrizzleQueryError(PII, { code: "ER_LOCK_DEADLOCK", errno: 1213 })
      },
    })
    const leaks = (s: Setup, channel: Channel) =>
      JSON.stringify({
        logs: loggedText(s.log),
        lastError: row(s, channel).lastError,
        alerts: s.alertAdmin.mock.calls,
      })
    const FORBIDDEN = ["ana@gmail.com", "5544991651250", "Ana Souza", PAY_URL, "Recebemos seu cadastro"]
    // O nome do paciente vai no alerta por contrato (`patientName`); o resto não.
    const forbiddenInAlert = FORBIDDEN.filter((f) => f !== "Ana Souza")

    it("erro do Drizzle em markPartSent (transitório)", async () => {
      const s = await setup({ wrap: failingMarkPartSent })

      expect(await s.dispatch(s.ids.whatsapp)).toBe("retry_scheduled")

      expect(row(s, "whatsapp").lastError).toMatchObject({
        step: "db.mark_part_sent",
        message: "DrizzleQueryError: ER_LOCK_DEADLOCK",
      })
      for (const pii of FORBIDDEN) {
        expect(loggedText(s.log)).not.toContain(pii)
        expect(JSON.stringify(row(s, "whatsapp").lastError)).not.toContain(pii)
      }
    })

    it("erro do Drizzle em markPartSent na 5ª tentativa (alerta ao admin)", async () => {
      const s = await setup({ wrap: failingMarkPartSent })
      await seedAttempts(s, "whatsapp", 4)

      expect(await s.dispatch(s.ids.whatsapp)).toBe("failed")

      expect(s.alertAdmin).toHaveBeenCalledTimes(1)
      for (const pii of forbiddenInAlert) expect(leaks(s, "whatsapp")).not.toContain(pii)
      expect(loggedText(s.log)).not.toContain("Ana Souza")
      expect(JSON.stringify(row(s, "whatsapp").lastError)).not.toContain("Ana Souza")
    })

    it("markFailure com erro cuja mensagem carrega o last_error serializado: nada disso vai ao log", async () => {
      const MARKER = "MARCADOR-CORPO-BRUTO"
      const s = await setup({
        wrap: (repos) => ({
          ...repos.notifications,
          markFailure: async () => {
            throw new Error(
              "Failed query: update notifications set last_error = ? where id = ?\nparams: " +
                JSON.stringify({ step: "x", responseBody: MARKER, recipient: EMAIL }),
            )
          },
        }),
      })
      s.whatsapp.sendText.mockRejectedValueOnce(
        new HttpError("evolution 503", { transient: true, status: 503, body: MARKER }),
      )

      expect(await s.dispatch(s.ids.whatsapp)).toBe("retry_scheduled")

      expect(s.log.error).toHaveBeenCalled()
      expect(loggedText(s.log)).not.toContain(MARKER)
      expect(loggedText(s.log)).not.toContain(EMAIL)
    })

    describe("rejeição SMTP que ecoa o destinatário", () => {
      const SMTP = `Can't send mail - all recipients were rejected: 550 5.1.1 <${EMAIL}>: Recipient address rejected`
      const everything = (s: Setup) =>
        JSON.stringify({
          logs: loggedText(s.log),
          lastError: row(s, "email").lastError,
          alerts: s.alertAdmin.mock.calls,
        })

      it("tentativa reagendada: o destinatário não aparece em log nem em last_error", async () => {
        const s = await setup()
        s.email.send.mockRejectedValueOnce(new Error(SMTP))

        expect(await s.dispatch(s.ids.email)).toBe("retry_scheduled")

        expect(row(s, "email").lastError?.message).toContain("[email]")
        expect(everything(s)).not.toContain(EMAIL)
        expect(everything(s)).not.toContain("gmail")
      })

      it("falha definitiva (5ª tentativa): nem o alerta ao admin carrega o destinatário", async () => {
        const s = await setup()
        await seedAttempts(s, "email", 4)
        s.email.send.mockRejectedValueOnce(new Error(SMTP))

        expect(await s.dispatch(s.ids.email)).toBe("failed")

        expect(s.alertAdmin).toHaveBeenCalledTimes(1)
        expect(everything(s)).not.toContain(EMAIL)
        expect(everything(s)).not.toContain("gmail")
      })
    })

    it("falha de e-mail não registra destinatário nem conteúdo nos logs", async () => {
      const s = await setup()
      s.email.send.mockRejectedValueOnce(new Error("socket hang up"))

      await s.dispatch(s.ids.email)

      for (const pii of FORBIDDEN) expect(loggedText(s.log)).not.toContain(pii)
    })

    it("alertAdmin que lança com texto sensível: o log não carrega a mensagem bruta", async () => {
      const s = await setup()
      s.alertAdmin.mockRejectedValueOnce(new Error(`Failed query: x\nparams: ${EMAIL}`))
      s.whatsapp.sendText.mockRejectedValueOnce(new HttpError("evolution 400", { transient: false, status: 400 }))

      expect(await s.dispatch(s.ids.whatsapp)).toBe("failed")
      expect(loggedText(s.log)).not.toContain(EMAIL)
    })
  })
})
