import { describe, expect, it } from "vitest"
import { createMemoryRepos } from "../fakes/memory-repos"
import { defineRepoContract } from "./repos.contract"

defineRepoContract("memory", async () => createMemoryRepos())

describe("fake em memória: password_reset", () => {
  it("mensagem sem quiz nem cobrança; markSent apaga o payload", async () => {
    const repos = createMemoryRepos()
    const ref = await repos.submissions.create({
      submissionId: "sub-1",
      patient: { name: "Ana Souza", cpf: "52998224725", email: "ana@example.com", phone: "11987654321" },
      answers: {},
      amount: "39.90",
      todaySP: "2026-10-12",
    })
    if (ref === "duplicate") throw new Error("duplicate inesperado")
    const patientId = [...repos.state.patients.values()][0].id

    const id = repos.seed.passwordReset({ patientId, channel: "email", link: "https://plana.test/x" })

    expect(await repos.notifications.get(id)).toMatchObject({
      kind: "password_reset",
      quizResponseId: null,
      paymentId: null,
      paymentUrl: null,
      patientId,
      patientName: "Ana Souza",
      recipient: "ana@example.com",
      payload: { link: "https://plana.test/x" },
    })

    await repos.notifications.markSent(id)
    expect(await repos.notifications.get(id)).toMatchObject({ status: "sent", payload: null })
  })
})
