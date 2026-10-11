// Contrato dos repositórios. Só tipos: a implementação MySQL (Drizzle) e o fake em memória
// (tests/fakes/memory-repos.ts) satisfazem as mesmas interfaces e passam pelo mesmo contrato
// (tests/db/repos.contract.ts). Todas as datas são `Date` (UTC).

export type Channel = "email" | "whatsapp"

export type LastError = {
  step: string
  httpStatus?: number
  responseBody?: string
  message: string
  attempt: number
  at: string
}

export type SubmissionRef = { quizResponseId: string; paymentId: string }

export type NewSubmission = {
  submissionId: string
  patient: { name: string; cpf: string; email: string; phone: string }
  answers: Record<string, unknown>
  amount: string
  /** "Hoje" no fuso America/Sao_Paulo (YYYY-MM-DD), usado na regra de reaproveitamento. */
  todaySP: string
}

export interface SubmissionRepo {
  findBySubmissionId(id: string): Promise<SubmissionRef | null>
  /**
   * Uma transação (passo 4 de §5 + reaproveitamento de §4): upsert do paciente pelo CPF,
   * insert do envio, cobrança reaproveitável ou nova (`PENDING_ASAAS`, `sync_attempts` 0,
   * `next_sync_at` = agora) e vínculo. Devolve "duplicate" se o `submissionId` já existe,
   * inclusive em corrida entre chamadas concorrentes.
   */
  create(s: NewSubmission): Promise<SubmissionRef | "duplicate">
}

export type PaymentView = {
  id: string
  patientId: string
  status: string
  amount: string
  asaasId: string | null
  paymentUrl: string | null
  syncAttempts: number
  patient: {
    id: string
    name: string
    cpf: string
    email: string
    phone: string
    asaasCustomerId: string | null
  }
}

export interface PaymentRepo {
  get(id: string): Promise<PaymentView | null>
  /** Reserva a cobrança por `ttlMs`. `false` se já reservada (e não expirada) ou inexistente. */
  tryLock(id: string, ttlMs: number): Promise<boolean>
  unlock(id: string): Promise<void>
  setPatientAsaasCustomer(patientId: string, customerId: string): Promise<void>
  /** Grava o resultado do Asaas; limpa o lock e o `last_error`. */
  markSynced(
    id: string,
    d: {
      asaasId: string
      asaasCustomerId: string
      status: string
      paymentUrl: string
      invoiceNumber: string | null
      billingType: string | null
      dueDate: string
    },
  ): Promise<void>
  /** Com `failed`, o status vira `ASAAS_FAILED`. Sempre limpa o lock. */
  markSyncFailure(
    id: string,
    d: { attempts: number; nextSyncAt: Date | null; failed: boolean; error: LastError },
  ): Promise<void>
  /** `PENDING_ASAAS` com `next_sync_at <= now` e não reservadas, por `next_sync_at` crescente. */
  listDue(now: Date, limit: number): Promise<string[]>
  /** Só age em `ASAAS_FAILED`. `false` se não encontrada ou não falha. */
  reopen(id: string): Promise<boolean>
  /** Reabre todas as `ASAAS_FAILED`; devolve quantas. */
  reopenAllFailed(): Promise<number>
}

export type NotificationView = {
  id: string
  quizResponseId: string
  paymentId: string
  channel: Channel
  kind: "payment_link"
  recipient: string
  status: "pending" | "sent" | "failed"
  partsSent: number
  attempts: number
  patientName: string
  paymentUrl: string | null
}

export interface NotificationRepo {
  /**
   * Para cada `quiz_response` do filtro e cada canal, cria uma linha `pending`
   * (`next_attempt_at` = agora). Linhas já existentes são ignoradas.
   */
  enqueuePaymentLink(
    filter: { paymentId: string } | { quizResponseId: string },
    channels: Channel[],
  ): Promise<void>
  listPendingIdsForQuizResponse(quizResponseId: string): Promise<string[]>
  get(id: string): Promise<NotificationView | null>
  tryLock(id: string, ttlMs: number): Promise<boolean>
  /** Solta a reserva sem alterar mais nada. Id inexistente é no-op. */
  unlock(id: string): Promise<void>
  markPartSent(id: string, partsSent: number): Promise<void>
  /** Marca como enviada; limpa o lock. */
  markSent(id: string): Promise<void>
  /** Com `failed`, o status vira `failed`; senão segue `pending` em `nextAttemptAt`. Limpa o lock. */
  markFailure(
    id: string,
    d: { attempts: number; nextAttemptAt: Date | null; failed: boolean; error: LastError },
  ): Promise<void>
  /** `pending` com `next_attempt_at <= now` e não reservadas, por `next_attempt_at` crescente. */
  listDue(now: Date, limit: number): Promise<string[]>
  /** Só age em `failed`; mantém `parts_sent`. */
  reopen(id: string): Promise<boolean>
  reopenAllFailed(): Promise<number>
}

export type Repos = {
  submissions: SubmissionRepo
  payments: PaymentRepo
  notifications: NotificationRepo
}

/** Grupo do evento do Asaas, que decide a regra aplicada à cobrança. */
export type PaymentEventGroup = "paid" | "reversal" | "pre_payment" | "other"

/** Evento de cobrança do Asaas, já lido e classificado (só os campos usados). */
export type PaymentEventInput = {
  eventId: string
  event: string
  group: PaymentEventGroup
  asaasPaymentId: string | null
  externalReference: string | null
  status: string | null
  billingType: string | null
  invoiceNumber: string | null
  /** YYYY-MM-DD */
  paymentDate: string | null
}
