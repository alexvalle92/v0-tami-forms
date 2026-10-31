# Desconto automático na cobrança não paga: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** a partir das 9h, baixar para `PAYMENT_DISCOUNT_AMOUNT` a cobrança criada ontem e ainda em aberto, estender o vencimento para hoje + `PAYMENT_DISCOUNT_DUE_DAYS` e avisar o paciente por e-mail e WhatsApp, uma vez por paciente.

**Architecture:** nova etapa opcional na rodada do job (a cada 2 min), ativa só das 9h às 20h em São Paulo. Um job lista as cobranças elegíveis; um serviço por cobrança faz lock → `GET` no Asaas → `PUT` no Asaas → transação que grava a cobrança e enfileira `payment_discount`. O despachante existente envia a mensagem e descarta a que perdeu a validade.

**Tech Stack:** Next 16 (runtime Node), TypeScript, Drizzle + MySQL 8, zod, vitest, pnpm.

**Spec:** [docs/superpowers/specs/2026-10-31-desconto-cobranca-design.md](../specs/2026-10-31-desconto-cobranca-design.md)

**Branch:** `feature/desconto-cobranca`, a partir da `develop`.

## Global Constraints

- Padrões: `PAYMENT_DISCOUNT_ENABLED=false`, `PAYMENT_DISCOUNT_AMOUNT=29.90`, `PAYMENT_DISCOUNT_DUE_DAYS=5`.
- Janela: `[9, 20)` em São Paulo; fora dela a etapa devolve 0 sem tocar no banco.
- "Ontem" = `[saoPauloDayStartUtc(ontem), saoPauloDayStartUtc(hoje))` sobre `payments.created_at`; offset fixo `-03:00`.
- Elegível: `status IN ('PENDING','OVERDUE')`, `asaas_id` não nulo, `paid_at` nulo, `discount_status` nulo, `amount > PAYMENT_DISCOUNT_AMOUNT` (comparação numérica), nenhuma cobrança do paciente com `discount_status = 'applied'`, uma por paciente (a de `created_at` mais recente).
- `discount_status`: `'applied' | 'skipped' | null`.
- Descrição no Asaas: `Plano Alimentar Personalizado - {nome} - 30 dias - condição especial`.
- Assunto: `🎁 Condição especial: seu plano de R$ {original} por R$ {novo}` (valores com vírgula).
- Logs nunca levam nome, e-mail, telefone, link nem corpo de resposta. Eventos: `discount.applied`, `discount.skipped`, `discount.retry`, `discount.no_quiz_response`, `discount.config.no_effect`, `job.discount.error` (um item), `job.discounts.error` (a etapa inteira, na rodada), `job.discounts.done`.
- Código e comentários em português, no estilo dos arquivos vizinhos (JSDoc curto explicando o porquê).
- Testes: `pnpm vitest run <arquivo>`; tudo: `pnpm test` e `pnpm typecheck`. O contrato MySQL só roda com `TEST_DATABASE_URL` (sem ela o arquivo é pulado; rode se tiver o MySQL local).

## Review Focus

1. **Valor comparado como texto.** `"100.00" > "29.90"` é falso em comparação de strings. O fake em memória e a conferência "o Asaas já tem o valor novo" precisam comparar em centavos. O teste fica na Task 3 (cobrança de `100.00` é elegível) e na Task 4 (Asaas devolve `value: 29.9` para `"29.90"`).
2. **Paciente sem telefone.** `applyDiscount` cria só a linha de e-mail. O teste fica na Task 3.
3. **Pago entre a alteração e o envio.** A mensagem é descartada sem enviar (`notify.stale`). O teste fica na Task 6.
4. **Banco falhou depois do `PUT`.** A rodada seguinte não repete o `PUT` e não duplica mensagens. O teste fica na Task 4 (serviço) e na Task 3 (`applyDiscount` duas vezes).
5. **Cobrança reaproveitada por dois quizzes.** Sai uma mensagem por canal, ligada ao quiz mais recente. O teste fica na Task 3.

---

### Task 1: variáveis de ambiente e início do dia em São Paulo

**Files:**
- Modify: `lib/env.ts`, `lib/time.ts`, `.env.example`
- Test: `tests/lib/env.test.ts`, `tests/lib/time.test.ts`

**Interfaces:**
- Produces:
  - `saoPauloDayStartUtc(date: string): Date` em `lib/time.ts`
  - `Env.PAYMENT_DISCOUNT_ENABLED: boolean`, `Env.PAYMENT_DISCOUNT_AMOUNT: string`, `Env.PAYMENT_DISCOUNT_DUE_DAYS: number`

- [ ] **Step 1: testes que falham**

`tests/lib/time.test.ts`:
```ts
it("saoPauloDayStartUtc: meia-noite de São Paulo em UTC (offset fixo -03:00)", () => {
  expect(saoPauloDayStartUtc("2026-10-31").toISOString()).toBe("2026-10-31T03:00:00.000Z")
  expect(saoPauloDayStartUtc("2026-01-01").toISOString()).toBe("2026-01-01T03:00:00.000Z")
})
```

`tests/lib/env.test.ts`, usando o env válido base que o arquivo já monta:
- `"desconto: padrões"`: sem as três variáveis → `{ PAYMENT_DISCOUNT_ENABLED: false, PAYMENT_DISCOUNT_AMOUNT: "29.90", PAYMENT_DISCOUNT_DUE_DAYS: 5 }`.
- `"desconto desligado: valores em branco ou inválidos não impedem o boot"`: `ENABLED=""`, `AMOUNT="abc"`, `DUE_DAYS="-1"` → não lança, `ENABLED` false, `DUE_DAYS` 5.
- `"desconto ligado: lê os valores"`: `ENABLED="true"`, `AMOUNT="24.90"`, `DUE_DAYS="7"` → `"24.90"`, `7`.
- `"desconto ligado com valor inválido: falha citando a variável"`: `AMOUNT="29,90"` → lança com `PAYMENT_DISCOUNT_AMOUNT`; `AMOUNT="0"` → lança; `DUE_DAYS="0"` → lança com `PAYMENT_DISCOUNT_DUE_DAYS`.

- [ ] **Step 2: rodar e ver falhar**

Run: `pnpm vitest run tests/lib/time.test.ts tests/lib/env.test.ts`
Expected: FAIL (`saoPauloDayStartUtc` não existe; chaves ausentes no env).

- [ ] **Step 3: implementar**

- `saoPauloDayStartUtc`: `new Date(\`${date}T00:00:00-03:00\`)`, com JSDoc dizendo que o Brasil não tem horário de verão desde 2019.
- `lib/env.ts`: o mesmo padrão das `META_*`. `PAYMENT_DISCOUNT_ENABLED` com `blankAsMissing` e padrão `false`. `AMOUNT` e `DUE_DAYS` como texto com `blankAsMissing` e padrões `"29.90"` e `"5"`. Com a chave ligada, o `superRefine` exige `AMOUNT` com `^\d+(\.\d{1,2})?$` e maior que zero, e `DUE_DAYS` inteiro positivo. Um `.transform` final converte `DUE_DAYS` para `number` (se for inválido com a chave desligada, vira `5`). Atualize o comentário de topo do bloco Meta para cobrir também o desconto.
- `.env.example`: bloco novo depois de `# Pagamento`:
```
# Desconto automático na cobrança não paga (desligado por padrão; veja o README)
PAYMENT_DISCOUNT_ENABLED=false
PAYMENT_DISCOUNT_AMOUNT=29.90
PAYMENT_DISCOUNT_DUE_DAYS=5
```

- [ ] **Step 4: rodar e ver passar**

Run: `pnpm vitest run tests/lib/time.test.ts tests/lib/env.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add lib/env.ts lib/time.ts .env.example tests/lib/env.test.ts tests/lib/time.test.ts
git commit -m "feat: variáveis do desconto na cobrança e início do dia de São Paulo em UTC"
```

---

### Task 2: cliente do Asaas lê e altera a cobrança

**Files:**
- Modify: `lib/asaas/client.ts`, `tests/fakes/fake-asaas.ts`
- Test: `tests/lib/asaas/client.test.ts`

**Interfaces:**
- Produces:
  - `AsaasPayment` ganha `value: number` (`toPayment` lê `raw.value` numérico; ausente ou não numérico → `0`)
  - `UpdatePaymentInput = { value: number; dueDate: string; description: string; billingType: string }`
  - `AsaasClient.getPayment(asaasId: string, o: CallOpts): Promise<AsaasPayment>`
  - `AsaasClient.updatePayment(asaasId: string, i: UpdatePaymentInput, o: CallOpts): Promise<AsaasPayment>`
  - Fake: `FakeMethod` inclui `"getPayment" | "updatePayment"`; `payments` continua indexado por `externalReference`; `byId: Map<string, AsaasPayment>` (id do Asaas → cobrança; `createPayment` grava nos dois); `updatedPayments: { asaasId: string; input: UpdatePaymentInput }[]`. `getPayment` de id inexistente lança `HttpError` 404 não transiente; `updatePayment` aplica `value` e `dueDate` na cobrança guardada e a devolve. `createPayment` passa a preencher `value: i.value`.

- [ ] **Step 1: testes que falham** (no estilo dos testes de `findPaymentByExternalReference` e `createPayment` do mesmo arquivo)

- `"getPayment: GET /payments/{id} com o id codificado e devolve value"`: URL `https://api-sandbox.asaas.com/v3/payments/pay_123`, método `GET`; resposta `{ id: "pay_123", status: "PENDING", invoiceUrl: "https://x/i/1", value: 39.9, dueDate: "2026-11-01", billingType: "PIX" }` → `value` 39.9 e `billingType` "PIX".
- `"getPayment: resposta sem id é inválida (transiente)"`.
- `"updatePayment: PUT /payments/{id} com o corpo exato e uma tentativa só"`: corpo `{"value":29.9,"dueDate":"2026-11-05","description":"d","billingType":"PIX"}`; um 503 lança `HttpError` transiente depois de **1** chamada ao `fetch`.
- `"updatePayment: 400 lança HttpError não transiente"`.

- [ ] **Step 2: rodar e ver falhar**

Run: `pnpm vitest run tests/lib/asaas/client.test.ts`
Expected: FAIL (`getPayment is not a function`).

- [ ] **Step 3: implementar**

`request` aceita `"PUT"`. `getPayment` usa `encodeURIComponent(asaasId)` e as tentativas padrão (GET é seguro). `updatePayment` usa `attempts: 1`; JSDoc: a repetição fica com a rodada seguinte, que começa pelo `GET`. Atualize o fake conforme o Interfaces.

- [ ] **Step 4: rodar e ver passar**

Run: `pnpm vitest run tests/lib/asaas tests/lib/services/sync-payment.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add lib/asaas/client.ts tests/fakes/fake-asaas.ts tests/lib/asaas/client.test.ts
git commit -m "feat: cliente do Asaas lê e altera a cobrança"
```

---

### Task 3: colunas do desconto e repositório

**Files:**
- Modify: `lib/db/schema.ts` (tabela `payments`), `lib/db/repos/types.ts`, `lib/db/repos/mysql.ts`, `tests/fakes/memory-repos.ts`
- Create: `lib/db/migrations/0007_payment_discount.sql` (+ `meta/0007_snapshot.json` e `_journal.json`, gerados)
- Test: `tests/db/repos.contract.ts` (seção nova `47. desconto na cobrança`), `tests/db/repos.mysql.test.ts` (só se houver conferência de colunas)

**Interfaces:**
- Produces (em `types.ts`):
```ts
export type DiscountStatus = "applied" | "skipped"
// PaymentView ganha:
discountStatus: DiscountStatus | null
originalAmount: string | null
// NotificationKind ganha "payment_discount"
// PaymentRepo ganha:
/** Cobranças elegíveis ao desconto (spec §6): uma por paciente, por `created_at` crescente. */
listDiscountEligible(d: { fromUtc: Date; toUtc: Date; discountAmount: string; limit: number }): Promise<string[]>
hasAppliedDiscount(patientId: string): Promise<boolean>
/** Uma transação: grava o desconto, solta o lock e enfileira `payment_discount` no quiz mais recente da cobrança. */
applyDiscount(id: string, d: { amount: string; originalAmount: string; dueDate: string; at: Date; channels: Channel[] }): Promise<{ notificationsEnqueued: number }>
/** `discount_status = 'skipped'`, `discount_applied_at = at`; solta o lock. */
markDiscountSkipped(id: string, at: Date): Promise<void>
```

- [ ] **Step 1: schema e migration**

Em `payments`: `discountStatus: varchar("discount_status", { length: 16 }).$type<DiscountStatus>()`, `discountAppliedAt: dateTime("discount_applied_at")`, `originalAmount: decimal("original_amount", { precision: 10, scale: 2 })`, e os índices `payments_discount_status_patient_idx (discount_status, patient_id)` e `payments_created_at_idx (created_at)`.

Run: `pnpm db:generate --name payment_discount`
Expected: cria `lib/db/migrations/0007_payment_discount.sql` com os três `ADD COLUMN` e os dois índices, e mais nada.

- [ ] **Step 2: testes do contrato que falham**

Seção `47. desconto na cobrança`. Use os helpers existentes (`syncedPayment`, `ev`, `on`, `randomCpf`, `newSub`, `BIG`) e uma janela em volta do relógio real: `win = { fromUtc: inMinutes(-10), toUtc: inMinutes(10), discountAmount: "29.90", limit: BIG }`.

- `"lista a PENDING sincronizada dentro da janela"`: `syncedPayment` → `listDiscountEligible(win)` contém o id.
- `"fora da janela não entra"`: `{ fromUtc: inMinutes(10), toUtc: inMinutes(20) }` e `{ fromUtc: inMinutes(-20), toUtc: inMinutes(-10) }` → não contém.
- `"fica fora: PENDING_ASAAS, paga, ASAAS_FAILED, já avaliada"`: cobrança só criada (sem `markSynced`); paga via `webhooks.applyPaymentEvent(ev("paid", on(p)))`; `markSyncFailure(..., failed: true)`; `markDiscountSkipped` → nenhuma listada.
- `"OVERDUE entra"`: `markSynced(id, synced("OVERDUE", "2026-10-01"))` → listada.
- `"valor comparado como número"`: `newSub({ amount: "100.00" })` sincronizada → listada; `newSub({ amount: "29.90" })` → não listada; `discountAmount: "29.89"` → a de `29.90` entra.
- `"uma por paciente: só a mais recente"`: mesmo CPF; 1ª cobrança `synced("PENDING", "2026-10-06")`, `await sleep(5)`, 2º envio com `todaySP: "2026-10-07"` (gera cobrança nova, como no teste 5) e sincronizada → a lista contém só a 2ª.
- `"paciente que já recebeu desconto fica fora"`: `applyDiscount` na 1ª → a 2ª não é listada; `hasAppliedDiscount(patientId)` true; para outro paciente, false.
- `"applyDiscount grava a cobrança e enfileira e-mail e WhatsApp"`: `applyDiscount(id, { amount: "29.90", originalAmount: "39.90", dueDate: "2026-11-05", at: new Date(), channels: BOTH })` → `{ notificationsEnqueued: 2 }`; `payments.get` → `amount "29.90"`, `originalAmount "39.90"`, `discountStatus "applied"`; as notificações pendentes têm `kind "payment_discount"`, `paymentId` da cobrança e `quizResponseId` do envio.
- `"applyDiscount de novo não duplica mensagens"`: segunda chamada → `{ notificationsEnqueued: 0 }` e continua havendo 2 linhas `payment_discount`.
- `"paciente sem telefone: só e-mail"`: `newSub({ patient: { phone: "" } })` → 1 linha, `channel "email"`.
- `"cobrança de dois quizzes: mensagens só no mais recente"`: mesmo CPF, 2º envio reaproveita a cobrança (`synced("PENDING", "2026-10-14")`, como no helper `syncedPayment`) → linhas `payment_discount` só com o `quizResponseId` do 2º envio.
- `"applyDiscount e markDiscountSkipped soltam o lock"`: `tryLock` → ação → `tryLock` de novo devolve true.

- [ ] **Step 3: rodar e ver falhar**

Run: `pnpm vitest run tests/db/repos.memory.test.ts`
Expected: FAIL (métodos inexistentes).

- [ ] **Step 4: implementar no MySQL e no fake**

- `get` (os dois) passa a devolver `discountStatus` e `originalAmount`.
- MySQL `listDiscountEligible`: o SQL de §6 do spec, com `ROW_NUMBER() OVER (PARTITION BY patient_id ORDER BY created_at DESC) = 1` numa subconsulta, ordenado por `created_at` e com `LIMIT`. Compare `amount > CAST(:discountAmount AS DECIMAL(10,2))`.
- MySQL `applyDiscount`: `withTxRetry` como em `complete`. `UPDATE payments SET amount, original_amount, due_date, discount_status='applied', discount_applied_at, locked_until=NULL, updated_at`. Seleciona o `quiz_responses` mais recente (`created_at DESC, id DESC`) com `payment_id = id`. Se houver, insere com `addressed(channels, target)` e `INSERT IGNORE` (o mesmo caminho do `enqueuePaymentLink`, `kind: "payment_discount"`) e devolve as linhas afetadas.
- Fake: mesma semântica. Compare valores em centavos (`Math.round(Number(x) * 100)`). Reaproveite `enqueueNotification` com `"payment_discount"`.

- [ ] **Step 5: rodar e ver passar**

Run: `pnpm vitest run tests/db && pnpm typecheck` (com `TEST_DATABASE_URL` definido, o contrato MySQL também roda)
Expected: PASS.

- [ ] **Step 6: commit**

```bash
git add lib/db tests/db tests/fakes/memory-repos.ts
git commit -m "feat: colunas do desconto em payments e repositório da cobrança elegível"
```

---

### Task 4: serviço `applyPaymentDiscount`

**Files:**
- Create: `lib/services/apply-payment-discount.ts`
- Test: `tests/lib/services/apply-payment-discount.test.ts`

**Interfaces:**
- Consumes: `PaymentRepo.get/tryLock/unlock/hasAppliedDiscount/applyDiscount/markDiscountSkipped` (Task 3); `AsaasClient.getPayment/updatePayment` (Task 2); `addDaysISO`, `todayInSaoPaulo`; `HttpError`; `safeErrorMessage`.
- Produces:
```ts
export type DiscountResult = "applied" | "skipped" | "retry" | "busy"
export type ApplyPaymentDiscount = (paymentId: string, opts: { deadline: number }) => Promise<DiscountResult>
export function createApplyPaymentDiscount(d: {
  payments: PaymentRepo
  asaas: AsaasClient
  log: Logger
  now: () => Date
  config: { amount: string; dueDays: number; channels: Channel[] }
}): ApplyPaymentDiscount
```

- [ ] **Step 1: testes que falham**

Montagem: `createMemoryRepos()`, `createFakeAsaas()` e `syncPayment` real (como em `sync-payment.test.ts`) para chegar a uma cobrança `PENDING` com `asaasId`. O relógio é fixo em `2026-10-31T12:00:00Z` (9h em São Paulo). Config: `{ amount: "29.90", dueDays: 5, channels: ["email", "whatsapp"] }`.

- `"aplica: PUT com valor, vencimento hoje+5, descrição e o billingType do Asaas"`: o fake tem `billingType "PIX"` → `updatedPayments[0]` igual a `{ value: 29.9, dueDate: "2026-11-05", description: "Plano Alimentar Personalizado - Maria da Silva - 30 dias - condição especial", billingType: "PIX" }`; resultado `"applied"`; cobrança com `amount "29.90"` e `originalAmount "39.90"`; duas notificações `payment_discount`; `log.info("discount.applied", { paymentId, originalAmount: "39.90", amount: "29.90", dueDate: "2026-11-05" })`.
- `"já paga no Asaas: skipped, sem PUT e sem mensagem"`: status `RECEIVED` no fake → `"skipped"`, `discountStatus "skipped"`, `updatedPayments` vazio.
- `"Asaas já tem o valor novo (29.9) e o vencimento novo: grava sem PUT"`: → `"applied"`, `calls` sem `updatePayment`.
- `"erro passageiro no GET ou no PUT: retry, nada gravado, lock solto"`: `failNext("updatePayment", new HttpError("x", { transient: true }))` → `"retry"`, `discountStatus null`, `tryLock` volta a dar true; `log.warn("discount.retry", ...)`.
- `"4xx no PUT: skipped definitivo"`: `HttpError` com `status: 400, transient: false` → `"skipped"`, `discountStatus "skipped"`, `log.error("discount.skipped", { paymentId, step: "asaas.update_payment", httpStatus: 400, ... })`.
- `"paciente que já usou o desconto: skipped sem chamar o Asaas"`.
- `"cobrança já avaliada ou não PENDING/OVERDUE: skipped sem gravar"`.
- `"lock ocupado: busy"`.
- `"banco falha depois do PUT; a próxima chamada grava sem novo PUT"`: `vi.spyOn(repos.payments, "applyDiscount").mockRejectedValueOnce(new Error("db"))` → `"retry"`; segunda chamada → `"applied"`, `updatedPayments` com 1 item, 2 notificações.
- `"sem quiz_response: aplica e avisa no log"`: `applyDiscount` devolve `{ notificationsEnqueued: 0 }` com canais ligados → `log.warn("discount.no_quiz_response", { paymentId })`.

- [ ] **Step 2: rodar e ver falhar**

Run: `pnpm vitest run tests/lib/services/apply-payment-discount.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: implementar `createApplyPaymentDiscount`** seguindo o §5 do spec e a estrutura de `createSyncPayment`: lock de 120 s, deadline `min(opts.deadline, lockTakenAt + 100_000)`, `lockHeld` + `finally` com `unlock`. Etapas para o log: `asaas.get_payment`, `asaas.update_payment`, `db.apply_discount`. Falha transiente = `HttpError` com `transient` ou erro não `HttpError`; definitiva = `HttpError` não transiente. A conferência "Asaas já tem o valor" compara centavos (`Math.round(value * 100) === Math.round(Number(amount) * 100)`) e `dueDate` igual.

- [ ] **Step 4: rodar e ver passar**

Run: `pnpm vitest run tests/lib/services/apply-payment-discount.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add lib/services/apply-payment-discount.ts tests/lib/services/apply-payment-discount.test.ts
git commit -m "feat: serviço que aplica o desconto na cobrança do Asaas"
```

---

### Task 5: job das cobranças de ontem e etapa na rodada

**Files:**
- Create: `lib/jobs/payment-discounts.ts`
- Modify: `lib/jobs/run-jobs.ts`, `lib/container.ts`, `lib/boot.ts`, `README.md`
- Test: `tests/lib/jobs/payment-discounts.test.ts`, `tests/lib/jobs/run-jobs.test.ts`, `tests/lib/container.wiring.test.ts` (se cobrir a montagem da rodada)

**Interfaces:**
- Consumes: `ApplyPaymentDiscount` (Task 4); `PaymentRepo.listDiscountEligible` (Task 3); `saoPauloDayStartUtc`, `hourInSaoPaulo`, `todayInSaoPaulo`, `addDaysISO`.
- Produces:
```ts
export const DISCOUNT_HOURS = { from: 9, to: 20 }
export function createApplyPaymentDiscounts(d: {
  payments: Pick<PaymentRepo, "listDiscountEligible">
  applyDiscount: ApplyPaymentDiscount
  discountAmount: string
  limit: number
  deadlineMs: number
  now: () => Date
  log: Logger
}): () => Promise<number>
// run-jobs: opção `discounts?: () => Promise<number>`; RunSummary ganha `discounts?: number`
```

- [ ] **Step 1: testes do job que falham** (no estilo de `expiry-reminders.test.ts`, com `vi.fn`)

- `"8h59 e 20h00 devolvem 0 sem listar"`: `2026-10-31T11:59:00Z` e `2026-10-31T23:00:00Z`.
- `"9h00 e 19h59 listam o dia anterior em UTC"`: `2026-10-31T12:00:00Z` → `listDiscountEligible` com `{ fromUtc: 2026-10-30T03:00:00.000Z, toUtc: 2026-10-31T03:00:00.000Z, discountAmount: "29.90", limit: 50 }`; idem para `2026-10-31T22:59:00Z`.
- `"virada do mês"`: `2026-11-01T12:00:00Z` → `fromUtc 2026-10-31T03:00:00.000Z`.
- `"chama o serviço por id com deadline e devolve o total"`: ids `["a","b"]` → 2 chamadas, `deadline = now + deadlineMs`, retorno 2; `log.info("job.discounts.done", { applied, skipped, retry, busy, errors })`.
- `"exceção de um item é logada e não para os demais"`: o 1º lança → `log.error("job.discount.error", { paymentId: "a", message })`, o 2º roda.
- `"lista vazia: sem log de done"`.

- [ ] **Step 2: teste da rodada que falha**, em `run-jobs.test.ts`

- `"discounts roda depois dos avisos e antes das notificações"`: registre a ordem das chamadas → `reminders` antes de `discounts`, e `discounts` antes de `notifications.listDue`; `summary.discounts` igual ao retorno.
- `"sem discounts, o resumo não tem a chave"`.
- `"discounts que lança conta em errors e a rodada segue"` → `log.error("job.discounts.error", ...)`.

- [ ] **Step 3: rodar e ver falhar**

Run: `pnpm vitest run tests/lib/jobs`
Expected: FAIL.

- [ ] **Step 4: implementar**

- `lib/jobs/payment-discounts.ts` segue o §6 do spec.
- `run-jobs.ts`: etapa opcional entre `enqueueExpiryReminders` e as notificações. Atualize o JSDoc da rodada e o do `RunSummary`.
- `container.ts`: `createApplyPaymentDiscount({ payments, asaas, log, now, config: { amount: env.PAYMENT_DISCOUNT_AMOUNT, dueDays: env.PAYMENT_DISCOUNT_DUE_DAYS, channels } })`. Na rodada, `discounts: env.PAYMENT_DISCOUNT_ENABLED ? createApplyPaymentDiscounts({ ..., limit: 50, deadlineMs: JOB_PAYMENT_DEADLINE_MS }) : undefined`.
- `boot.ts`: com a chave ligada e `PAYMENT_DISCOUNT_AMOUNT >= PAYMENT_AMOUNT` em centavos, `log.warn("discount.config.no_effect", { discountAmount, amount })`. `boot.done` passa a incluir `discountEnabled`.
- `README.md`: seção "Desconto automático na cobrança não paga", com regras (resumo do §2 do spec), as variáveis e a ativação (§10 do spec, incluindo `pnpm db:sync-schema` no PlanA por causa das colunas novas).

- [ ] **Step 5: rodar tudo**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 6: commit**

```bash
git add lib/jobs lib/container.ts lib/boot.ts README.md tests/lib
git commit -m "feat: job das 9h aplica o desconto nas cobranças de ontem"
```

---

### Task 6: mensagem da condição especial

**Files:**
- Modify: `lib/notify/templates.ts`, `lib/services/dispatch-notification.ts`, `lib/db/repos/types.ts` (`NotificationView`), `lib/db/repos/mysql.ts` e `tests/fakes/memory-repos.ts` (`notifications.get`)
- Test: `tests/lib/notify/templates.test.ts`, `tests/lib/services/dispatch-notification.test.ts`, `tests/db/repos.contract.ts` (seção 47)

**Interfaces:**
- Consumes: `applyDiscount` (Task 3), para criar as linhas nos testes.
- Produces:
```ts
export const PAYMENT_DISCOUNT_TITLE = (original: string, amount: string) => string // "🎁 Condição especial: seu plano de R$ 39,90 por R$ 29,90"
export function formatBRL(decimal: string): string // "29.90" → "R$ 29,90"; "100" → "R$ 100,00"
export function renderPaymentDiscount(d: {
  name: string; link: string; originalAmount: string; amount: string; dueDate: string; returning: boolean
}): { subject: string; html: string; text: string }
// NotificationView ganha:
paymentDiscount: {
  paymentStatus: string; paidAt: Date | null; discountStatus: DiscountStatus | null
  amount: string; originalAmount: string | null; dueDate: string | null
} | null // preenchido só em `payment_discount`
```

- [ ] **Step 1: testes que falham**

`templates.test.ts`:
- `"formatBRL"`: `"29.90"` → `"R$ 29,90"`, `"100"` → `"R$ 100,00"`, `"1234.5"` → `"R$ 1234,50"`; `"abc"` lança.
- `"renderPaymentDiscount: 1º quiz"`: `{ name: "Maria", link: "https://asaas.test/i/1", originalAmount: "39.90", amount: "29.90", dueDate: "2026-11-05", returning: false }` → `subject` `"🎁 Condição especial: seu plano de R$ 39,90 por R$ 29,90"`; `html` exatamente:
```
Olá Maria! 👋 <br>Seu <strong>Plano Alimentar Personalizado</strong> já está pronto e só falta o pagamento para liberar. <br><br>Preparamos uma <strong>condição especial</strong> para você começar agora: o valor baixou de <strong>R$ 39,90 para R$ 29,90</strong>. <br><br>Essa condição vale até <strong>05/11/2026</strong>. O link de pagamento é o mesmo de antes: <br>https://asaas.test/i/1 <br><br>Assim que o pagamento for confirmado, você recebe os dados de acesso ao seu plano. 💚
```
- `"renderPaymentDiscount: renovação"`: `returning: true` → último parágrafo `Assim que o pagamento for confirmado, seu novo plano aparece no PlanA. É só entrar com seu CPF e a senha que você já usa. 💚`.
- `"nome com HTML é escapado"` e `"toWhatsAppParts gera 4 partes, a primeira com o título em negrito"`.

`dispatch-notification.test.ts` (no estilo dos testes de `payment_link` e de aviso vencido):
- `"payment_discount: envia o texto da condição especial com os valores da cobrança"`: e-mail com o `subject` acima.
- `"payment_discount: paciente com senha recebe a variante de renovação"`.
- `"payment_discount: cobrança paga antes do envio é descartada sem enviar"`: `paidAt` preenchido → `"skipped"`, `markFailure` com `step "notify.stale"`, nada enviado, sem alerta. O mesmo vale para `paymentStatus "RECEIVED"` e `discountStatus` diferente de `"applied"`.
- `"payment_discount sem link ou sem originalAmount: falha definitiva"` (`PermanentNotificationError`).

Contrato, seção 47:
- `"a mensagem relida traz os dados do desconto"`: depois de `applyDiscount`, `notifications.get` → `paymentDiscount` igual a `{ paymentStatus: "PENDING", paidAt: null, discountStatus: "applied", amount: "29.90", originalAmount: "39.90", dueDate: "2026-11-05" }`; numa `payment_link`, `paymentDiscount: null`.

- [ ] **Step 2: rodar e ver falhar**

Run: `pnpm vitest run tests/lib/notify tests/lib/services/dispatch-notification.test.ts tests/db/repos.memory.test.ts`
Expected: FAIL.

- [ ] **Step 3: implementar**

- `formatBRL` com regex sobre a string (`^(\d+)(?:\.(\d{1,2}))?$`), sem `Number`. Reaproveite o `formatDateBR` existente.
- `renderPaymentDiscount` monta o html acima com `escapeHtml(name)` e `escapeHtml(link)`, no padrão dos outros templates.
- `notifications.get` (MySQL e fake): faça `left join` na cobrança e preencha `paymentDiscount` quando `kind === "payment_discount"`.
- Despachante: ramo `payment_discount` em `renderMessage`, com `returning = n.patientPasswordHash !== null`, como no `payment_link`. Em `staleReason`, para `payment_discount`: `paidAt` presente → `"payment already paid"`; status fora de `PENDING`/`OVERDUE` → `"payment no longer open"`; `discountStatus !== "applied"` → `"discount not applied"`. Atualize os JSDoc dos dois.

- [ ] **Step 4: rodar tudo**

Run: `pnpm test && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: commit**

```bash
git add lib/notify lib/services/dispatch-notification.ts lib/db tests
git commit -m "feat: mensagem da condição especial por e-mail e WhatsApp"
```

---

## Ordem e dependências

1 → 2 → 3 → 4 → 5 → 6, em sequência. A Task 6 depende só da 3; as outras dependem da anterior. O merge na `develop` acontece só com as seis prontas: sem a Task 6, o despachante não conhece o `kind` `payment_discount` que a Task 5 passa a enfileirar.
