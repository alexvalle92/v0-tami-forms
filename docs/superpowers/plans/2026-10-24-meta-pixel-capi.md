# Pixel da Meta e API de Conversões: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enviar `ViewContent`, `Lead` e `InitiateCheckout` pelo Pixel e pela CAPI (com deduplicação) e o `Purchase` só pelo servidor, a partir do webhook do Asaas, com fila persistida e novas tentativas.

**Architecture:** O navegador chama `fbq` e espelha o evento em `POST /api/meta/events`, que repassa à CAPI em uma tentativa. O envio do quiz grava a atribuição (`fbp`, `fbc`, IP, User-Agent, URL, `external_id`) em `meta_attributions`. O `applyPaymentEvent` insere o `Purchase` em `meta_conversions` na mesma transação do primeiro evento pago. O webhook tenta enviar no `defer`, e a rodada do job repete com `jobBackoffMs` por até 7 dias.

**Tech Stack:** Next.js 16 (App Router), TypeScript, zod 3, Drizzle + MySQL 8, vitest 5, `node:crypto` (SHA-256).

**Spec:** `docs/superpowers/specs/2026-10-24-meta-pixel-capi-design.md`. Leia junto com este plano. As seções citadas como "spec §N" são de lá.

## Global Constraints

- Branch: `feature/meta-pixel-capi`, criada a partir da `develop`.
- Comandos: `npx vitest run <arquivo>` para um teste, `npx vitest run` para todos e `npx tsc --noEmit` para os tipos. O `pnpm` não está no PATH desta máquina.
- Base antes de começar: 52 arquivos passando, 1 pulado (MySQL sem `TEST_DATABASE_URL`); 871 testes passando. Nenhum teste existente pode quebrar.
- Comentários, nomes de log e mensagens em português, no mesmo tom do código ao redor. Densidade de comentário igual à do arquivo editado.
- Toda mensagem de commit termina com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Prefixos `feat:`, `fix:`, `test:`, `docs:`.
- Logs nunca levam e-mail, telefone, nome, CPF, IP, User-Agent, `fbp`/`fbc`, token nem corpo de pedido. Só ids, nome do evento, status HTTP, `kind` e mensagem segura (`safeErrorMessage`).
- O rastreamento nunca quebra o quiz, o envio nem o webhook: o cliente nunca lança; no servidor, a Meta só é chamada no `defer`, e falhas viram log.
- Valores fixos: `MAX_META_CONVERSION_ATTEMPTS = 8`; janela da Meta `META_MAX_EVENT_AGE_MS = 7 dias`; lock de 60 s; limite da rodada `conversions: 20`; rate limit do espelho `{ limit: 60, windowMs: 60_000 }`; corpo do espelho 4 KB (`4 * 1024`); timeout da CAPI 10 s; retenção de `meta_attributions` 90 dias; `META_API_VERSION` padrão `v24.0`; moeda `"BRL"`; `country` `"br"`.
- `event_id`: `vc:<sessionId>`, `lead:<sessionId>`, `ic:<sessionId>`, `purchase:<paymentId>`.

## Review Focus

1. **Recorrente que reenvia o quiz para a mesma cobrança:** duas linhas de `quiz_responses` com o mesmo `payment_id`. O `Purchase` usa a atribuição do envio mais recente que tem atribuição, e continua sendo uma linha só. Teste na Task 6.
2. **Atribuição apagada pelo purge antes do envio:** `loadPayload` devolve null, a linha vira `failed` com "dados ausentes" e o admin é avisado; nada lança. Teste na Task 7.
3. **`sessionId` vazio no navegador** (tracker no-op porque o `window` falhou ou o storage foi bloqueado de um jeito que derruba o tracker): nenhum dos três eventos sai, e o quiz segue. Teste na Task 11.
4. **Campo `meta` malformado no envio do quiz** (`fbp` com 2 KB, `externalId` que não é UUID, `meta: "x"`): o envio do quiz passa normalmente e `meta` vira ausente ou só com os campos válidos. Teste na Task 4.
5. **Rastreamento desligado com linhas `pending` na fila:** o job não envia, não consome tentativas e não marca `failed`; ao religar dentro dos 7 dias, a linha sai. Teste na Task 7 e na Task 9.

---

## Mapa de arquivos

| Arquivo | Task | Papel |
|---|---|---|
| `lib/env.ts` | 1 | `META_*` com `superRefine` |
| `lib/meta/user-data.ts` | 2 | Normalização + SHA-256 do `user_data` |
| `lib/meta/capi.ts` | 3 | Cliente HTTP da CAPI |
| `lib/meta/events.ts` | 4 | Schemas do espelho e do `meta` do envio, tipos compartilhados |
| `lib/quiz/validation.ts` | 4 | `meta` opcional em `ParsedSubmission` |
| `lib/db/schema.ts`, `lib/db/migrations/0006_*` | 5 | Tabelas `meta_attributions` e `meta_conversions` |
| `lib/db/repos/types.ts`, `lib/db/repos/mysql.ts`, `tests/fakes/memory-repos.ts`, `tests/db/repos.contract.ts` | 5, 6 | Repositórios e regra do `Purchase` |
| `lib/services/submit-quiz.ts`, `lib/http/handlers/submit-quiz.ts`, `app/api/submit-quiz/route.ts` | 8 | Grava a atribuição |
| `lib/services/send-meta-conversion.ts`, `lib/services/alert-admin.ts` | 7 | Envio do `Purchase` |
| `lib/services/handle-asaas-event.ts`, `lib/http/handlers/asaas-webhook.ts`, `app/api/webhooks/asaas/route.ts` | 9 | `pendingConversion` → `defer` |
| `lib/jobs/run-jobs.ts`, `lib/jobs/retry-failed.ts`, `lib/http/handlers/jobs.ts`, `lib/jobs/purge-observability.ts` | 9 | Fila no job, retry, purge |
| `lib/http/handlers/meta-events.ts`, `app/api/meta/events/route.ts` | 10 | Espelho |
| `lib/container.ts` | 7, 9, 10 | Wiring |
| `lib/client/meta.ts` | 11 | Pixel no navegador |
| `components/meta-pixel-head.tsx`, `app/layout.tsx`, `app/page.tsx`, `lib/client/submit-quiz.ts`, `components/loading-screen.tsx` | 12 | Integração na UI |
| `README.md` | 13 | Variáveis e ativação |

---

### Task 0: Branch

- [ ] **Step 1:** `git checkout develop && git checkout -b feature/meta-pixel-capi`
- [ ] **Step 2:** `npx vitest run` → `871 passed`, e `npx tsc --noEmit` sem saída.

---

### Task 1: Variáveis de ambiente da Meta

**Files:**
- Modify: `lib/env.ts`
- Test: `tests/lib/env.test.ts`

**Interfaces:**
- Produces: `Env` ganha `META_TRACKING_ENABLED: boolean`, `META_PIXEL_ID?: string`, `META_CAPI_TOKEN?: string`, `META_API_VERSION: string`, `META_TEST_EVENT_CODE?: string`.

- [ ] **Step 1: Testes que falham** (no `describe("parseEnv")` existente, usando o objeto `valid`):

```ts
it("deixa o rastreamento da Meta desligado por padrão, sem exigir id nem token", () => {
  const env = parseEnv(valid)
  expect(env.META_TRACKING_ENABLED).toBe(false)
  expect(env.META_API_VERSION).toBe("v24.0")
  expect(env.META_PIXEL_ID).toBeUndefined()
})
it("exige META_PIXEL_ID e META_CAPI_TOKEN com o rastreamento ligado", () => {
  expect(() => parseEnv({ ...valid, META_TRACKING_ENABLED: "true" })).toThrow(/META_PIXEL_ID.*META_CAPI_TOKEN|META_CAPI_TOKEN.*META_PIXEL_ID/)
})
it("aceita o rastreamento ligado com id só de dígitos e token", () => {
  const env = parseEnv({ ...valid, META_TRACKING_ENABLED: "true", META_PIXEL_ID: "1234567890", META_CAPI_TOKEN: "EAAB", META_TEST_EVENT_CODE: "TEST123" })
  expect(env.META_TRACKING_ENABLED).toBe(true)
  expect(env.META_TEST_EVENT_CODE).toBe("TEST123")
})
it("rejeita META_PIXEL_ID com letras e META_API_VERSION fora do formato vNN.N", () => {
  expect(() => parseEnv({ ...valid, META_PIXEL_ID: "abc" })).toThrow(/META_PIXEL_ID/)
  expect(() => parseEnv({ ...valid, META_API_VERSION: "24" })).toThrow(/META_API_VERSION/)
})
```

- [ ] **Step 2:** `npx vitest run tests/lib/env.test.ts` → FAIL (campos inexistentes).
- [ ] **Step 3: Implementar.** `META_TRACKING_ENABLED`: o mesmo `z.enum(["true","false"])` do `booleanFlag`, mas com `.default("false")`. `META_PIXEL_ID`: `z.string().regex(/^\d+$/).optional()`. `META_CAPI_TOKEN`, `META_TEST_EVENT_CODE`: `z.string().min(1).optional()`. `META_API_VERSION`: `z.string().regex(/^v\d+\.\d+$/).default("v24.0")`. Depois, `envSchema.superRefine`, que adiciona um issue com `path: ["META_PIXEL_ID"]` e/ou `["META_CAPI_TOKEN"]` quando `META_TRACKING_ENABLED` é verdadeiro e o campo falta. O `parseEnv` já monta a mensagem a partir de `issue.path`.
- [ ] **Step 4:** `npx vitest run tests/lib/env.test.ts tests/lib/container.wiring.test.ts` → PASS. `npx tsc --noEmit` → limpo.
- [ ] **Step 5:** Commit: `feat: variáveis da Meta no env, desligadas por padrão`.

---

### Task 2: `user_data` com hash

**Files:**
- Create: `lib/meta/user-data.ts`
- Test: `tests/lib/meta/user-data.test.ts`

**Interfaces:**
- Produces:

```ts
export type UserDataInput = {
  email?: string | null; phone?: string | null; name?: string | null; externalId?: string | null
  ip?: string | null; userAgent?: string | null; fbp?: string | null; fbc?: string | null
}
export type CapiUserData = {
  em?: [string]; ph?: [string]; fn?: [string]; ln?: [string]; external_id?: [string]; country: [string]
  client_ip_address?: string; client_user_agent?: string; fbp?: string; fbc?: string
}
export function sha256Hex(value: string): string
export function buildUserData(input: UserDataInput): CapiUserData
```

- [ ] **Step 1: Testes que falham:**
  - `sha256Hex("test@example.com")` → `"973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b"`.
  - `buildUserData({ email: "  Test@Example.COM " }).em` → `[sha256Hex("test@example.com")]`.
  - telefone: `"(11) 98765-4321"` → `ph = [sha256Hex("5511987654321")]`; `"5511987654321"` → o mesmo hash; `"1198765432"` (10 dígitos) → `[sha256Hex("551198765432")]`; `"123"` → sem `ph`.
  - nome: `"  Maria José da Silva "` → `fn = [sha256Hex("maria")]`, `ln = [sha256Hex("silva")]`; `"Ângela"` → `fn = [sha256Hex("angela")]` e sem `ln`.
  - `externalId: "ABC-1"` → `external_id = [sha256Hex("abc-1")]`.
  - `ip`, `userAgent`, `fbp`, `fbc` voltam sem hash em `client_ip_address`, `client_user_agent`, `fbp`, `fbc`.
  - `buildUserData({})` → exatamente `{ country: [sha256Hex("br")] }`. Campos vazios, `null` ou só com espaços são omitidos.
- [ ] **Step 2:** `npx vitest run tests/lib/meta/user-data.test.ts` → FAIL (módulo inexistente).
- [ ] **Step 3: Implementar** com `createHash("sha256")` de `node:crypto`. Para tirar o acento: `normalize("NFD").replace(/\p{M}/gu, "")`. Telefone pelas regras da spec §6.2. O `country` também vai com hash: a CAPI exige SHA-256 em `country`.
- [ ] **Step 4:** `npx vitest run tests/lib/meta/user-data.test.ts` → PASS.
- [ ] **Step 5:** Commit: `feat: user_data da Meta normalizado e com SHA-256`.

---

### Task 3: Cliente da CAPI

**Files:**
- Create: `lib/meta/capi.ts`
- Test: `tests/lib/meta/capi.test.ts`

**Interfaces:**
- Consumes: `CapiUserData` (Task 2).
- Produces:

```ts
export type CapiEvent = {
  event_name: "ViewContent" | "Lead" | "InitiateCheckout" | "Purchase"
  event_time: number            // segundos Unix
  event_id: string
  action_source: "website"
  event_source_url?: string
  user_data: CapiUserData
  custom_data?: { value: number; currency: "BRL" }
}
export type CapiResult =
  | { kind: "ok" }
  | { kind: "retryable" | "fatal"; status?: number; message: string }
export type MetaCapiClient = { send(events: CapiEvent[]): Promise<CapiResult> }
export function createMetaCapiClient(d: {
  pixelId: string; token: string; apiVersion: string; testEventCode?: string
  fetchImpl?: typeof fetch; timeoutMs?: number
}): MetaCapiClient
```

- [ ] **Step 1: Testes que falham** (com um `fetchImpl` falso que guarda `url` e `init`):
  - envia `POST` para `https://graph.facebook.com/v24.0/123/events`, com `content-type: application/json` e corpo `{ data: [evento], access_token: "tok", test_event_code: "T1" }`; sem `testEventCode`, o corpo não tem a chave `test_event_code`.
  - 200 → `{ kind: "ok" }`.
  - 400 com `{ error: { message: "Invalid parameter" } }` → `{ kind: "fatal", status: 400, message }`, com a `message` contendo `"400"` e `"Invalid parameter"`.
  - 500 e 429 → `retryable` com o `status`.
  - `fetchImpl` que rejeita → `retryable` sem `status`; `fetchImpl` que nunca resolve, com `timeoutMs: 20` → `retryable`.
  - o token (`"tok-secreto"`) não aparece em `JSON.stringify(result)` em nenhum desses casos, inclusive quando a resposta da Meta repete o token na mensagem.
  - `error.message` com 1.000 caracteres sai cortado em 200.
- [ ] **Step 2:** `npx vitest run tests/lib/meta/capi.test.ts` → FAIL.
- [ ] **Step 3: Implementar.** Timeout com `AbortController` + `setTimeout`, como em `lib/client/submit-quiz.ts`. Um erro ao ler o corpo da resposta não muda a classificação pelo status. O token é tirado da mensagem com `replaceAll(token, "[token]")`.
- [ ] **Step 4:** `npx vitest run tests/lib/meta/capi.test.ts` → PASS.
- [ ] **Step 5:** Commit: `feat: cliente da API de Conversões da Meta`.

---

### Task 4: Schemas do espelho e do `meta` no envio do quiz

**Files:**
- Create: `lib/meta/shared.ts` (nomes, prefixos, regex e tipos, sem zod: o navegador importa este arquivo) e `lib/meta/events.ts` (os schemas zod, que reexportam o `shared.ts`)
- Modify: `lib/quiz/validation.ts`
- Test: `tests/lib/meta/events.test.ts`, `tests/lib/quiz/validation.test.ts` (já existe)

**Interfaces:**
- Produces (as constantes e os tipos em `lib/meta/shared.ts`, as duas funções `parse*` em `lib/meta/events.ts`):

```ts
export const BROWSER_EVENT_NAMES = ["ViewContent", "Lead", "InitiateCheckout"] as const
export type BrowserEventName = (typeof BROWSER_EVENT_NAMES)[number]
export const EVENT_ID_PREFIX: Record<BrowserEventName, "vc" | "lead" | "ic">
export type BrowserMetaEvent = {
  eventName: BrowserEventName; eventId: string; eventSourceUrl: string
  externalId?: string; fbp?: string; fbc?: string; email?: string; phone?: string; name?: string
}
export function parseBrowserMetaEvent(body: unknown): BrowserMetaEvent | null
export type SubmitMetaInput = { externalId?: string; fbp?: string; fbc?: string; eventSourceUrl?: string }
export function parseSubmitMeta(raw: unknown): SubmitMetaInput | undefined
export const FBP_RE: RegExp   // /^fb\.\d\.\d+\.\d+$/
export const FBC_RE: RegExp   // /^fb\.\d\.\d+\..+$/
```

- `ParsedSubmission` ganha `meta?: SubmitMetaInput`.

- [ ] **Step 1: Testes que falham** (`events.test.ts`):
  - `parseBrowserMetaEvent` aceita `{ eventName: "Lead", eventId: "lead:<uuid>", eventSourceUrl: "https://quiz.example.com/?utm_source=fb" }`.
  - rejeita (devolve null): `eventName: "Purchase"`; `eventId: "vc:<uuid>"` com `eventName: "Lead"`; `eventId: "lead:abc"`; `eventSourceUrl: "javascript:alert(1)"`; URL com 501 caracteres; corpo que não é objeto.
  - campos opcionais inválidos viram ausentes, sem derrubar o evento: `externalId: "x"`, `fbp: "abc"`, `fbc` com 501 caracteres, `email: "não-é-email"`, `phone` com 21 caracteres, `name` com 201 caracteres.
  - `parseSubmitMeta(undefined)` → `undefined`; `parseSubmitMeta("x")` → `undefined`; `parseSubmitMeta({ fbp: "fb.1.123.456", externalId: "não-uuid", eventSourceUrl: "https://a.b/" })` → `{ fbp: "fb.1.123.456", eventSourceUrl: "https://a.b/" }`; `{}` → `undefined`.
- [ ] **Step 2: Teste que falha** (`validation.test.ts`, Review Focus 4): `parseSubmitRequest({ submissionId, answers: validAnswers, meta: { fbp: "x".repeat(2000), externalId: "não-uuid" } })` → `ok: true` com `value.meta === undefined`; com `meta: { fbc: "fb.1.1.abc" }` → `value.meta` igual a `{ fbc: "fb.1.1.abc" }`. Use o objeto de respostas válidas que o arquivo já tem.
- [ ] **Step 3:** `npx vitest run tests/lib/meta/events.test.ts tests/lib/quiz/validation.test.ts` → FAIL.
- [ ] **Step 4: Implementar.** Campo opcional: `z.string()...optional().catch(undefined)`, o mesmo padrão "inválido vira ausente" do `optionalText` em `lib/asaas/webhook-event.ts`. `eventSourceUrl`: `z.string().url().max(500)` com `refine` para `http:`/`https:`. Limites da spec §6.1. Em `parseSubmitRequest`, `meta: parseSubmitMeta((body as { meta?: unknown }).meta)`, sem mexer no schema do corpo (o `z.object` externo já ignora chaves desconhecidas).
- [ ] **Step 5:** `npx vitest run tests/lib/meta/events.test.ts tests/lib/quiz/validation.test.ts tests/lib/http` → PASS.
- [ ] **Step 6:** Commit: `feat: schemas do espelho de eventos da Meta e do meta no envio do quiz`.

---

### Task 5: Tabelas, migration 0006 e `MetaAttributionRepo`

**Files:**
- Modify: `lib/db/schema.ts`, `lib/db/repos/types.ts`, `lib/db/repos/mysql.ts`, `tests/fakes/memory-repos.ts`, `tests/db/repos.contract.ts`, `tests/db/repos.mysql.test.ts` (se ele listar as migrations ou as tabelas a limpar)
- Create: `lib/db/migrations/0006_<nome>.sql` + `meta/0006_snapshot.json` + entrada no `_journal.json` (gerados)

**Interfaces:**
- Produces: as tabelas `metaAttributions` e `metaConversions` (Drizzle) com as colunas da spec §8.1; o tipo `MetaAttributionInput` da spec §8.2; `Repos.metaAttributions`. O `save` recebe `now`, como os outros repositórios, para que o teste de purge consiga gravar linhas antigas:

```ts
export interface MetaAttributionRepo {
  /** INSERT IGNORE: a primeira gravação do envio vale (reenvio com o mesmo submissionId não troca). */
  save(quizResponseId: string, a: MetaAttributionInput, now: Date): Promise<void>
  purgeOlderThan(cutoff: Date, limit: number): Promise<number>
}
```

- [ ] **Step 1: Tabelas no `schema.ts`**, depois de `appLogs`, com o comentário de seção no estilo do bloco de observabilidade e as colunas, tipos, índices e FKs da spec §8.1. `metaConversions.quizResponseId` fica sem `.references()` (spec §8.1).
- [ ] **Step 2: Gerar a migration:** `npx drizzle-kit generate --name meta_tracking`. Esperado: `lib/db/migrations/0006_meta_tracking.sql` com os dois `CREATE TABLE` e as duas FKs. Confira o SQL contra a spec §8.1.
- [ ] **Step 3: Testes de contrato que falham** (novo `describe("45. atribuição da Meta: MetaAttributionRepo")` dentro de `defineRepoContract`, usando `newSub()`/`expectRef()`; a regra "a primeira gravação vale" é verificada na Task 6, pelo `loadPayload`):
  - `save` duas vezes para o mesmo `quizResponseId` não lança.
  - purge, no padrão do teste "44. logs do app" (banco compartilhado, por isso `>=`): 3 envios gravados com `now` de 91 dias atrás e 1 com `now` atual; `purgeOlderThan(new Date(Date.now() - 90 * DAY), 2)` → `2`; uma segunda chamada com limite 1000 → `>= 1`; uma terceira → `0`. A linha nova continua lá (verificado na Task 6).
- [ ] **Step 4:** `npx vitest run tests/db` → FAIL no fake de memória.
- [ ] **Step 5: Implementar** `metaAttributions` no fake (Map por `quizResponseId`, `createdAt = now`) e no MySQL (`insert().ignore()` com `createdAt: now`; purge com `DELETE ... WHERE created_at < ? ORDER BY created_at LIMIT ?`, como em `appLogs.purgeOlderThan`).
- [ ] **Step 6:** `npx vitest run tests/db` → PASS (memória). Se houver MySQL local, também `TEST_DATABASE_URL=... npx vitest run tests/db/repos.mysql.test.ts`. `npx tsc --noEmit` → limpo.
- [ ] **Step 7:** Commit: `feat: tabelas meta_attributions e meta_conversions e o repositório da atribuição`.

---

### Task 6: `MetaConversionRepo` e o `Purchase` no `applyPaymentEvent`

**Files:**
- Modify: `lib/db/repos/types.ts`, `lib/db/repos/mysql.ts`, `tests/fakes/memory-repos.ts`, `tests/db/repos.contract.ts`

**Interfaces:**
- Consumes: `MetaAttributionRepo.save` (Task 5).
- Produces: `MetaConversionPayload` e `MetaConversionRepo` da spec §8.2, mais `reopenAllFailed(): Promise<number>` (usado pelo `{ allFailed: true }` da Task 9); `Repos.metaConversions`; `PaymentEventResult` `processed` com `pendingConversion: { id: string } | null`.

- [ ] **Step 1: Testes de contrato que falham** (`describe("46. Purchase da Meta: MetaConversionRepo")`). Helper: `attributedPayment(repos, over?)` = `syncedPayment(repos, over)` + `metaAttributions.save(p.ref.quizResponseId, { externalId: "<uuid>", fbp: "fb.1.1.1", fbc: null, clientIp: "1.2.3.4", userAgent: "UA", eventSourceUrl: "https://q.example/" }, new Date())`.
  - primeiro evento pago de cobrança com atribuição → `pendingConversion` não nulo; `loadPayload(id)` traz `eventId: "purchase:<paymentId>"`, `amount` da cobrança, `patient` do envio e `attribution.clientIp === "1.2.3.4"`.
  - `PAYMENT_CONFIRMED` e depois `PAYMENT_RECEIVED` (dois `eventId`) → o segundo traz `pendingConversion: null`; `listDue` tem um id só.
  - cobrança sem atribuição (o caso da renovação) → `pendingConversion: null`.
  - evento de reversão, `pre_payment` e evento duplicado → `pendingConversion: null` (no `processed`) ou outro `outcome`.
  - uma segunda `save` para o mesmo envio, com `clientIp: "9.9.9.9"`, não troca nada: o `loadPayload` continua trazendo `"1.2.3.4"`.
  - **Review Focus 1:** dois envios do mesmo CPF reaproveitam a cobrança (o fluxo do teste "2." do contrato), com `sleep(5)` entre os dois `create` para que o `created_at` seja diferente. Com atribuição nos dois (`clientIp` `"1.1.1.1"` no primeiro e `"2.2.2.2"` no segundo), o evento pago gera uma linha só, e o `loadPayload` traz `"2.2.2.2"`. Com atribuição só no primeiro, traz `"1.1.1.1"`.
  - `claim(id, now)` → `true`; um segundo `claim` no mesmo instante → `false`; com `now + 61 s` → `true`.
  - `listDue(now, 20)` não traz linha com `next_attempt_at > now`, linha travada nem linha `sent`/`failed`.
  - `markRetry(id, next, err)` → `attempts` sobe para 1 (pelo `loadPayload`), sai do `listDue` até `next`; `markSent` → sai do `listDue` para sempre; `markFailed` → `reopen(id)` devolve `true`, volta ao `listDue` com `attempts: 0`; `reopen` de linha `sent` ou inexistente → `false`; `reopenAllFailed()`, com uma linha `failed`, devolve `>= 1` e a reabre.
  - `loadPayload` de um id inexistente → `null`.
- [ ] **Step 2:** `npx vitest run tests/db` → FAIL.
- [ ] **Step 3: Implementar no MySQL**, dentro de `applyEventOnce`, no bloco `if (e.group === "paid")` depois da geração: só quando `p.paidAt === null` (o valor lido antes do `UPDATE`). Faça um `select` de `quiz_responses.id` com `innerJoin(metaAttributions)`, `where payment_id = p.id`, `orderBy(desc(quizResponses.createdAt))`, `limit(1)`, e depois `insert(metaConversions).ignore()`; `affected(...) === 1` → `pendingConversion = { id }`. Os campos e valores estão na spec §7.1. Métodos do repo no padrão das `notifications` (`claim` = `UPDATE ... WHERE id = ? AND status = 'pending' AND next_attempt_at <= ? AND (locked_until IS NULL OR locked_until < ?)` setando `locked_until = now + 60 s`; `true` se `affected === 1`). `loadPayload`: um `select` com `innerJoin` em `payments`, `patients` e `metaAttributions` (pelo `quiz_response_id` da linha), `null` se qualquer um faltar.
- [ ] **Step 4: Implementar no fake de memória** com a mesma regra, sem `await` no meio do `applyPaymentEvent` (comentário do topo do arquivo).
- [ ] **Step 5:** `npx vitest run tests/db tests/lib/services/handle-asaas-event.test.ts` → PASS. `npx tsc --noEmit` → os únicos erros aceitáveis aqui são de objetos `processed` montados à mão nos testes de `handle-asaas-event` e `asaas-webhook`; adicione `pendingConversion: null` neles.
- [ ] **Step 6:** Commit: `feat: Purchase na fila meta_conversions no primeiro evento pago com atribuição`.

---

### Task 7: `sendMetaConversion`

**Files:**
- Create: `lib/services/send-meta-conversion.ts`
- Modify: `lib/services/alert-admin.ts` (`AdminAlert.kind` ganha `"meta_conversion"`), `lib/container.ts`
- Test: `tests/lib/services/send-meta-conversion.test.ts`, `tests/lib/container.wiring.test.ts`

**Interfaces:**
- Consumes: `MetaConversionRepo` (Task 6), `MetaCapiClient`/`CapiEvent` (Task 3), `buildUserData` (Task 2), `jobBackoffMs` (`lib/jobs/backoff.ts`).
- Produces:

```ts
export const MAX_META_CONVERSION_ATTEMPTS = 8
export const META_MAX_EVENT_AGE_MS = 7 * 24 * 60 * 60 * 1000
export type SendMetaConversion = (id: string) => Promise<void>   // nunca lança
export function createSendMetaConversion(d: {
  conversions: MetaConversionRepo
  capi: MetaCapiClient | null
  enabled: boolean
  alertAdmin: AlertAdmin
  log: Logger
  now: () => Date
}): SendMetaConversion
```

- `Container` ganha `sendMetaConversion: SendMetaConversion`. Com `META_TRACKING_ENABLED` e as credenciais, o container cria o `capi` com `createMetaCapiClient({ pixelId, token, apiVersion, testEventCode })`; sem elas, `capi: null`.

- [ ] **Step 1: Testes que falham**, com um `MetaConversionRepo` falso em memória (só os métodos usados), um `capi` falso e um `fakeLog` (o mesmo helper dos outros testes de serviço):
  - sucesso: `capi.send` recebe um evento com `event_name: "Purchase"`, `event_id: "purchase:pay-1"`, `event_time` = segundos do `eventTime`, `action_source: "website"`, `custom_data: { value: 39.9, currency: "BRL" }` e `user_data.em` com o hash do e-mail do paciente; depois, `markSent`; log `meta.purchase.sent` com `{ conversionId, paymentId }` e nenhum campo de dado pessoal.
  - `retryable` com `attempts: 0` → `markRetry(id, now + jobBackoffMs(1), lastError)` e log `warn` `meta.purchase.retry`; sem aviso ao admin.
  - `retryable` com `attempts: 7` → `markFailed` + `alertAdmin` com `kind: "meta_conversion"`, `id: <conversionId>`, `error.step: "meta_capi"`, `error.attempt: 8`.
  - `retryable` com `eventTime` há 7 dias + 1 min → `markFailed` + aviso.
  - `fatal` com `attempts: 0` → `markFailed` + aviso na hora.
  - `claim` falso → nem `loadPayload` nem `send`.
  - **Review Focus 2:** `loadPayload` null → `markFailed(id, { message: "dados ausentes", ... })` + aviso; não lança.
  - **Review Focus 5:** `enabled: false` (ou `capi: null`) → nenhum método do repo é chamado.
  - `capi.send` que lança → log `error`, `markRetry` com o backoff e a promessa resolve.
- [ ] **Step 2:** `npx vitest run tests/lib/services/send-meta-conversion.test.ts` → FAIL.
- [ ] **Step 3: Implementar** seguindo a spec §7.2. `lastError` no formato `LastError` (`step: "meta_capi"`, `httpStatus`, `message`, `attempt`, `at`). O `patientName` do `alertAdmin` é o nome do paciente do payload (ou `"-"` quando o payload é null): o e-mail ao admin já leva nome hoje e não sai do app.
- [ ] **Step 4: Wiring no container** e teste em `container.wiring.test.ts`: `expect(c.sendMetaConversion).toBeTypeOf("function")`, com e sem `META_TRACKING_ENABLED=true` + id + token.
- [ ] **Step 5:** `npx vitest run tests/lib/services tests/lib/container.wiring.test.ts` → PASS; `npx tsc --noEmit` → limpo.
- [ ] **Step 6:** Commit: `feat: envio do Purchase à Meta com novas tentativas e aviso ao admin`.

---

### Task 8: Atribuição gravada no envio do quiz

**Files:**
- Modify: `lib/services/submit-quiz.ts`, `lib/http/handlers/submit-quiz.ts`, `app/api/submit-quiz/route.ts` (se ela montar `deps`), `lib/container.ts`
- Test: `tests/lib/services/submit-quiz.test.ts`, `tests/lib/http/handlers.test.ts` (ou o arquivo que testa `createSubmitQuizHandler`)

**Interfaces:**
- Consumes: `ParsedSubmission.meta` (Task 4), `MetaAttributionRepo` (Task 5).
- Produces: `export type SubmitContext = { clientIp?: string; userAgent?: string }`; `SubmitQuiz = (input: ParsedSubmission, ctx?: SubmitContext) => Promise<SubmitResult>`; `createSubmitQuiz` recebe `metaAttributions: MetaAttributionRepo` e `config.metaEnabled: boolean`.

- [ ] **Step 1: Testes que falham** (`submit-quiz.test.ts`, com os repos de memória):
  - `metaEnabled: true`, `input.meta = { fbp: "fb.1.1.1", externalId }`, `ctx = { clientIp: "1.2.3.4", userAgent: "UA" }` → `metaAttributions.save` chamado com `(quizResponseId, { externalId, fbp: "fb.1.1.1", fbc: null, clientIp: "1.2.3.4", userAgent: "UA", eventSourceUrl: null }, now())`.
  - `clientIp: "unknown"` vira `clientIp: null`; `userAgent` com 600 caracteres é cortado em 500.
  - sem `meta`, ou com `metaEnabled: false` → `save` não é chamado.
  - `save` que rejeita → o resultado é o mesmo do caso sem atribuição (`link`) e há log `warn` `submit.meta_attribution_failed` com `{ submissionId, quizResponseId }` apenas.
- [ ] **Step 2: Teste que falha** no handler: um pedido com `x-forwarded-for: 9.9.9.9, 10.0.0.1` e `user-agent: UA-X` faz o `submitQuiz` falso receber `ctx = { clientIp: "9.9.9.9", userAgent: "UA-X" }`. O handler de `/api/renewals` continua chamando `submitQuiz(parsed.value)` sem `ctx`.
- [ ] **Step 3:** `npx vitest run tests/lib/services/submit-quiz.test.ts tests/lib/http` → FAIL.
- [ ] **Step 4: Implementar.** Em `createSubmitQuiz`, a gravação fica logo depois do `if (!ref)`, antes de "Os dados já estão salvos", num `try/catch` próprio (spec §8.3). No handler, `d.submitQuiz(parsed.value, { clientIp: clientIp(req), userAgent: req.headers.get("user-agent") ?? undefined })`. No container, `metaAttributions: repos.metaAttributions` e `metaEnabled: env.META_TRACKING_ENABLED`.
- [ ] **Step 5:** `npx vitest run` → tudo PASS; `npx tsc --noEmit` → limpo.
- [ ] **Step 6:** Commit: `feat: envio do quiz grava a atribuição da Meta com IP e User-Agent`.

---

### Task 9: Webhook, job, retry e purge

**Files:**
- Modify: `lib/services/handle-asaas-event.ts`, `lib/http/handlers/asaas-webhook.ts`, `app/api/webhooks/asaas/route.ts`, `lib/jobs/run-jobs.ts`, `lib/jobs/retry-failed.ts`, `lib/http/handlers/jobs.ts`, `lib/jobs/purge-observability.ts`, `lib/container.ts`
- Test: `tests/lib/services/handle-asaas-event.test.ts`, `tests/lib/http/asaas-webhook.test.ts`, `tests/lib/jobs/run-jobs.test.ts`, `tests/lib/jobs/retry-failed.test.ts`, `tests/lib/jobs/purge-observability.test.ts`, o teste de `createJobsRetryHandler` em `tests/lib/http`

**Interfaces:**
- Consumes: `PaymentEventResult.pendingConversion` (Task 6), `SendMetaConversion` (Task 7), `MetaConversionRepo.listDue/reopen` (Task 6), `MetaAttributionRepo.purgeOlderThan` (Task 5).
- Produces: `HandledEvent.pendingConversion: { id: string } | null`; `createAsaasWebhookHandler` recebe `sendMetaConversion: SendMetaConversion`; `createRunJobs` recebe `metaConversions: Pick<MetaConversionRepo, "listDue">`, `sendMetaConversion`, `metaEnabled: boolean` e `limits.conversions`; `RunSummary.conversions: number`; `RetryTarget` ganha `{ metaConversionId: string }`, e `{ allFailed: true }` também reabre as conversões, por `metaConversions.reopenAllFailed()` (Task 6); `createPurgeObservability` recebe `metaAttributions: Pick<MetaAttributionRepo, "purgeOlderThan">`; `META_ATTRIBUTION_RETENTION_DAYS = 90`.

- [ ] **Step 1: Testes que falham:**
  - `handle-asaas-event`: resultado `processed` com `pendingConversion: { id: "mc-1" }` sai em `HandledEvent.pendingConversion`; `duplicate`/`ignored` → `null`.
  - `asaas-webhook`: com `pendingConversion: { id: "mc-1" }`, a resposta é 200 e, ao rodar os `deferred`, `sendMetaConversion("mc-1")` é chamado uma vez; sem `pendingConversion`, não é chamado; `sendMetaConversion` que rejeita não muda o 200 e gera log `error` `webhook.asaas.conversion_failed`.
  - `run-jobs`: com `metaEnabled: true`, os ids de `listDue(now, 20)` passam por `sendMetaConversion` depois das notificações e antes do purge (verifique a ordem com um array de chamadas); `summary.conversions` conta; `listDue` que rejeita conta em `errors` com log `job.conversions.list_failed`. **Review Focus 5:** com `metaEnabled: false`, `listDue` nem é chamado e `summary.conversions === 0`.
  - `retry-failed`: `{ metaConversionId: "mc-1" }` → `reopened: 1` quando `reopen` devolve `true`; `allFailed` soma `metaConversions.reopenAllFailed()`.
  - handler de retry: aceita `{ metaConversionId: "<uuid>" }`, e `{ metaConversionId: "x", paymentId: "y" }` → 400 (o `.strict()` atual).
  - `purge-observability`: chama `metaAttributions.purgeOlderThan(now - 90 dias, limit)` e soma ao total; uma falha só nela ainda deixa as outras duas rodarem e depois rejeita.
- [ ] **Step 2:** `npx vitest run tests/lib/services tests/lib/http tests/lib/jobs` → FAIL.
- [ ] **Step 3: Implementar.** No webhook, o `defer` da conversão vem logo depois do da geração, no mesmo formato. No `run-jobs`, a lista de conversões não entra no helper `list(kind)` genérico (que usa `repos[kind]`); um bloco próprio, no mesmo estilo. No container, monte `createRunJobs` com `metaConversions: repos.metaConversions`, `sendMetaConversion`, `metaEnabled: env.META_TRACKING_ENABLED`, `limits: { ...JOB_LIMITS }` (com `conversions: 20` em `JOB_LIMITS`), `createRetryFailed` com `metaConversions` e o purge com `metaAttributions`. Na rota do webhook, passe `sendMetaConversion: c.sendMetaConversion`.
- [ ] **Step 4:** `npx vitest run` → tudo PASS; `npx tsc --noEmit` → limpo.
- [ ] **Step 5:** Commit: `feat: webhook e job enviam o Purchase da fila; retry e purge da atribuição`.

---

### Task 10: `POST /api/meta/events`

**Files:**
- Create: `lib/http/handlers/meta-events.ts`, `app/api/meta/events/route.ts`
- Modify: `lib/container.ts`
- Test: `tests/lib/http/meta-events.test.ts`, `tests/lib/container.wiring.test.ts`

**Interfaces:**
- Consumes: `parseBrowserMetaEvent`, `EVENT_ID_PREFIX` (Task 4); `buildUserData` (Task 2); `MetaCapiClient` (Task 3); `clientIp` (`lib/http/handlers/submit-quiz.ts`); `readJsonBody` (`lib/http/read-json.ts`).
- Produces:

```ts
export const META_EVENTS_MAX_BODY_BYTES = 4 * 1024
export function createMetaEventsHandler(d: {
  capi: MetaCapiClient | null       // null = rastreamento desligado
  amount: string                    // PAYMENT_AMOUNT
  rateLimiter: { hit(k: string): boolean }
  defer: (fn: () => Promise<void>) => void
  log: Logger
  now: () => Date
}): (req: Request) => Promise<Response>
```

- `Container` ganha `metaCapi: MetaCapiClient | null` (o mesmo cliente da Task 7) e `metaEventsRateLimiter: RateLimiter` (`{ limit: 60, windowMs: 60_000 }`).

- [ ] **Step 1: Testes que falham:**
  - `capi: null` → 204, sem `defer`.
  - válido (`Lead`, com e-mail, `x-forwarded-for: 1.2.3.4`, `user-agent: UA`) → 204; ao rodar o `defer`, `capi.send` recebe `[{ event_name: "Lead", event_id, event_time: <segundos de now>, action_source: "website", event_source_url, user_data }]`, com `user_data.client_ip_address === "1.2.3.4"`, `client_user_agent === "UA"` e `em` com hash; sem `custom_data`.
  - `InitiateCheckout` → `custom_data: { value: 39.9, currency: "BRL" }`, vindo de `amount: "39.90"` e não do corpo, mesmo que o corpo traga `value: 9999`.
  - sem `x-forwarded-for` (`clientIp` → `"unknown"`) → `user_data` sem `client_ip_address`.
  - corpo com mais de 4 KB, JSON inválido, evento inválido e rate limit estourado → 204, sem `defer`, com log `warn` `meta.events.invalid` / `meta.events.rate_limited` sem nenhum valor do corpo.
  - `capi.send` devolvendo `retryable` ou `fatal` → log `warn` `meta.events.send_failed` com `{ eventName, kind, status }`; `send` que rejeita → mesmo log, sem lançar.
- [ ] **Step 2:** `npx vitest run tests/lib/http/meta-events.test.ts` → FAIL.
- [ ] **Step 3: Implementar** seguindo a ordem da spec §6.1. A resposta é `new Response(null, { status: 204 })`. A rota fica igual a `app/api/events/route.ts`, mais `defer: (fn) => after(fn)`, `capi: c.metaCapi`, `amount: c.env.PAYMENT_AMOUNT` e `rateLimiter: c.metaEventsRateLimiter`.
- [ ] **Step 4:** Wiring e `expect(c.metaEventsRateLimiter).toBeDefined()` no teste do container. `npx vitest run` → PASS; `npx tsc --noEmit` → limpo.
- [ ] **Step 5:** Commit: `feat: endpoint que espelha na API de Conversões os eventos do Pixel`.

---

### Task 11: `lib/client/meta.ts`

**Files:**
- Create: `lib/client/meta.ts`
- Test: `tests/lib/client/meta.test.ts`

**Interfaces:**
- Consumes: `BrowserEventName`, `BrowserMetaEvent`, `SubmitMetaInput`, `EVENT_ID_PREFIX`, `FBP_RE` e `FBC_RE`, importados de `lib/meta/shared.ts` (Task 4) e nunca de `lib/meta/events.ts`, para não levar o zod para o bundle do quiz. `getTracker` vem de `lib/client/track.ts`.
- Produces:

```ts
export type MetaConfig = { pixelId: string; value: string }
export type MetaUser = { email?: string; phone?: string; name?: string }
export type Meta = {
  trackingAllowed(): boolean
  event(name: BrowserEventName, opts: { user?: MetaUser }): void   // eventId derivado do sessionId
  attributionForSubmit(): SubmitMetaInput | undefined
}
export type MetaDeps = {
  config?: MetaConfig | null
  sessionId?: string
  cookie?: string                 // document.cookie
  search?: string                 // location.search
  href?: string                   // location.href
  storage?: Pick<Storage, "getItem" | "setItem"> | null
  fbq?: ((...args: unknown[]) => void) | null
  fetchImpl?: typeof fetch
  sendBeacon?: ((url: string, data: Blob) => boolean) | null
  nowMs?: () => number
  endpoint?: string               // padrão "/api/meta/events"
}
export const META_SENT_KEY = "tf_meta_sent"
export const META_FBC_KEY = "tf_meta_fbc"
export function createMeta(d: MetaDeps): Meta
export function getMeta(): Meta   // lê window.__TF_META__, getTracker().sessionId, window.fbq na hora de cada chamada
```

- [ ] **Step 1: Testes que falham:**
  - `config: null` → `trackingAllowed()` falso; `event("Lead", ...)` não chama `fbq`, `sendBeacon` nem `fetchImpl`; `attributionForSubmit()` → `undefined`.
  - **Review Focus 3:** `sessionId: ""` → `event` não faz nada.
  - `event("ViewContent", {})` → `fbq("track", "ViewContent", {}, { eventID: "vc:<sid>" })`; o beacon recebe um `Blob` cujo JSON tem `eventName`, `eventId`, `eventSourceUrl: href` e `externalId: sid`.
  - `event("InitiateCheckout", { user: { email, phone, name } })` → `fbq(..., { value: 39.9, currency: "BRL" }, { eventID: "ic:<sid>" })`, e o corpo tem `email`, `phone` e `name`.
  - o mesmo evento duas vezes → um só `fbq` e um só envio; com o `storage` guardando `tf_meta_sent`, uma nova instância com o mesmo storage também não reenvia.
  - `sendBeacon` que devolve `false` → `fetchImpl(endpoint, { method: "POST", keepalive: true, ... })`.
  - `fbq: null` → o espelho ainda sai.
  - cookie `"_fbp=fb.1.1700000000000.123; _fbc=fb.1.1700000000000.abc"` → `attributionForSubmit()` traz os dois; `_fbp=lixo` é ignorado.
  - sem `_fbc` e com `search: "?fbclid=XYZ"`, `nowMs: () => 1700000000000` → `fbc === "fb.1.1700000000000.XYZ"`, gravado em `tf_meta_fbc`; uma nova instância sem `fbclid` no `search` lê o valor do storage.
  - `storage` cujos métodos lançam, `fbq` que lança e `fetchImpl` que lança → nada escapa; a deduplicação vira só em memória.
- [ ] **Step 2:** `npx vitest run tests/lib/client/meta.test.ts` → FAIL.
- [ ] **Step 3: Implementar** no estilo de `lib/client/track.ts`: comentário de cabeçalho, `try/catch` em cada função exportada e `getMeta()` que devolve um objeto no-op fora do navegador. O `getMeta()` cria uma única instância e lê `config`, `sessionId` e `fbq` de forma preguiçosa (o `fbq` pode ainda não existir na primeira chamada). `declare global { interface Window { __TF_META__?: MetaConfig; fbq?: (...args: unknown[]) => void } }`.
- [ ] **Step 4:** `npx vitest run tests/lib/client` → PASS.
- [ ] **Step 5:** Commit: `feat: Pixel da Meta no navegador com espelho no servidor e deduplicação`.

---

### Task 12: Snippet no `<head>`, gatilhos no quiz e `meta` no envio

**Files:**
- Create: `components/meta-pixel-head.tsx`
- Modify: `app/layout.tsx`, `app/page.tsx`, `lib/client/submit-quiz.ts`, `components/loading-screen.tsx`
- Test: `tests/lib/client/submit-quiz.test.ts`, `tests/components/meta-pixel-head.test.ts` (novo; função pura, sem DOM)

**Interfaces:**
- Consumes: `getMeta()` (Task 11), `SubmitMetaInput` (Task 4).
- Produces: `export function metaHeadScripts(env: Record<string, string | undefined>): { config: string; pixel: string; pixelId: string } | null` em `components/meta-pixel-head.tsx` (pura e testável), e `export default async function MetaPixelHead()`, que chama `await connection()` e renderiza os `<script dangerouslySetInnerHTML>` + `<noscript><img .../></noscript>`. `submitQuizRequest` aceita `meta?: SubmitMetaInput`.

- [ ] **Step 1: Testes que falham:**
  - `metaHeadScripts({})` e `metaHeadScripts({ META_TRACKING_ENABLED: "true", META_PIXEL_ID: "abc" })` → `null`.
  - `metaHeadScripts({ META_TRACKING_ENABLED: "true", META_PIXEL_ID: "123", PAYMENT_AMOUNT: "39.90" })` → `config` contém `window.__TF_META__=` e `{"pixelId":"123","value":"39.90"}`; `pixel` contém `fbq('init','123')` (ou com aspas duplas), `fbq('track','PageView')` e `https://connect.facebook.net/en_US/fbevents.js`.
  - sem `PAYMENT_AMOUNT` → `value: "39.90"`.
  - `<` no valor vira `<` no `config`.
  - `submit-quiz.test.ts`: com `meta: { fbp: "fb.1.1.1" }`, o corpo enviado é `{ submissionId, answers, meta: { fbp: "fb.1.1.1" } }`; sem `meta`, o corpo não tem a chave `meta`.
- [ ] **Step 2:** `npx vitest run tests/components tests/lib/client/submit-quiz.test.ts` → FAIL (o `vitest.config.ts` inclui `tests/**/*.test.ts`).
- [ ] **Step 3: Implementar.**
  - `layout.tsx`: `<MetaPixelHead />` dentro do `<head>`, depois do GTM. O `RootLayout` continua síncrono; quem é `async` é o `MetaPixelHead`.
  - `loading-screen.tsx`: `submitQuizRequest({ submissionId, answers, meta: getMeta().attributionForSubmit() })`.
  - `page.tsx`, com `const meta = useRef(getMeta()).current`:
    - `useEffect(() => { meta.event("ViewContent", {}) }, [meta])`;
    - no efeito de troca de etapa, antes de `stepRef.current = ...`: `if (stepRef.current?.step === 23 && currentStep === 24) meta.event("Lead", { user: { email: answersRef.current.email } })`;
    - na primeira linha de `handleFinalRedirect`: `meta.event("InitiateCheckout", { user: { email: answers.email, phone: answers.whatsapp, name: answers.nome_completo } })`.
- [ ] **Step 4:** `npx vitest run` → tudo PASS; `npx tsc --noEmit` → limpo; `npx next build` → sem erro. O build roda sem env e o `MetaPixelHead` só lê o env no pedido.
- [ ] **Step 5: Teste manual** (skill `run` ou `npx next dev -p 5000`) com `META_TRACKING_ENABLED=true` e `META_PIXEL_ID=123` no `.env.local`:
  1. O HTML de `/` tem `window.__TF_META__` e o `fbq`.
  2. Ao abrir o quiz, sai um `POST /api/meta/events` com `ViewContent` (aba Network).
  3. Avançar do e-mail gera `Lead`, e o botão final gera `InitiateCheckout`.
  4. Recarregar não reenvia `ViewContent`.
  5. Com `META_TRACKING_ENABLED=false`, nada da Meta aparece no HTML nem na rede.
- [ ] **Step 6:** Commit: `feat: quiz dispara ViewContent, Lead e InitiateCheckout e envia a atribuição`.

---

### Task 13: README e verificação final

**Files:**
- Modify: `README.md`

- [ ] **Step 1:** No README, uma seção "Pixel da Meta e API de Conversões" com a tabela de variáveis da spec §4, os quatro eventos e o checklist da spec §10 (copiado e adaptado ao formato do README), mais o `curl` de `POST /api/jobs/retry` com `{ "metaConversionId": "<id>" }` no mesmo formato dos que já existem.
- [ ] **Step 2:** `npx vitest run` → todos passam (871 + os novos), 0 falhas; `npx tsc --noEmit` → limpo; `npx next build` → ok.
- [ ] **Step 3:** Commit: `docs: Pixel da Meta, API de Conversões e checklist de ativação`.
