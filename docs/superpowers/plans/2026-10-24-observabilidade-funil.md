# Observabilidade do funil e dos erros de integração: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** registrar o caminho anônimo de cada sessão no quiz e os erros do backend em tabelas do MySQL, para analisá-los num Metabase no Easypanel.

**Architecture:** o navegador junta os eventos (`lib/client/track.ts`) e manda em lote para `POST /api/events`, que valida, filtra as respostas permitidas e grava em `funnel_sessions` e `funnel_events`. O logger do container ganha um destino que grava `warn`/`error` (e alguns `info`) em `app_logs`, em lote e sem bloquear. A rodada do job apaga o que passou da retenção. Views SQL deixam tudo pronto para o Metabase.

**Tech Stack:** Next.js 16 (App Router), React 18, TypeScript, zod 3, Drizzle ORM + mysql2 (MySQL 8), Vitest 5, pnpm.

**Spec:** `docs/superpowers/specs/2026-10-24-observabilidade-funil-design.md`. Leia o spec antes de cada tarefa; as seções citadas abaixo (§N) são dele.

## Global Constraints

- Nenhuma dependência nova no `package.json`.
- Nenhuma variável de ambiente nova.
- Textos, nomes de evento de log e comentários em português, no estilo do código vizinho.
- Datas em `Date` UTC; colunas `datetime(3)` via o helper `dateTime` de `lib/db/schema.ts`.
- Os eventos do funil nunca carregam nome, CPF, e-mail, WhatsApp, peso, altura, meta nem IMC numérico. As respostas passam pela lista permitida no cliente e de novo no servidor.
- O IP não é gravado, e o User-Agent bruto também não.
- O rastreamento nunca lança nem muda o comportamento do quiz para quem preenche.
- Constantes: lote ≤ 25 eventos; corpo ≤ 16 KB (`16 * 1024`); rate limit de 120 requisições por 60.000 ms por IP; fila do cliente ≤ 100; envio a cada 1.000 ms; persister de logs a cada 2.000 ms, lote de 100, buffer de 1.000; retenção de 365 dias (funil) e 90 dias (`app_logs`); purge de 1.000 linhas por tabela por rodada; abandono após 30 min.
- `PERSISTED_INFO_EVENTS` = `submit.done`, `webhook.asaas.received`, `plan.generation.done`, `notification.dispatch.sent`.
- Comandos de verificação: `pnpm test`, `pnpm typecheck`, `pnpm build`. O contrato MySQL só roda com `TEST_DATABASE_URL`; sem ela, o arquivo é pulado.

## Review Focus

1. **Lote do cliente acima de 16 KB.** Com 25 `step_answer` de arrays longos, o JSON passa do limite e o servidor responde 413, e o lote se perde. Esperado: o cliente divide o envio para que nenhuma requisição passe de 15.000 bytes. Teste na Tarefa 8.
2. **UTM ou referrer maior que 100 caracteres.** Esperado: o valor é cortado em 100 e o lote é aceito, não recusado (senão perde-se o `session_start`). Teste na Tarefa 2.
3. **Relógio do celular errado** (`ts` inválido, ou longe da hora do servidor). Esperado: `client_ts` fica com a hora do servidor quando o `ts` não é uma data ou está a mais de 24 h dela. Teste na Tarefa 5.
4. **Campos de log não serializáveis** (`Error`, `bigint`, referência circular) indo para o `persist`. Esperado: `Error` vira `{ name, message, stack }`, `bigint` vira string, circular vira `{ logError: true }`, e nada lança. Teste na Tarefa 6.
5. **IMC em string ou inválido.** O quiz guarda `imc` como `"24.99"`. Esperado: `bmiBand("24.99") === "normal"`; `"abc"`, `NaN`, `0` e `undefined` → `undefined`. Teste na Tarefa 1.

---

## Mapa de arquivos

| Arquivo | Tarefa | Responsabilidade |
|---|---|---|
| `lib/quiz/steps.ts` | 1 | slugs das etapas, chaves permitidas, `bmiBand`, `sanitizeAnswer` |
| `lib/quiz/step-validation.ts` | 1 | regra de "pode avançar" + mensagem + motivo (sai do `page.tsx`) |
| `lib/quiz/step-events.ts` | 1 | eventos de transição entre etapas (função pura) |
| `lib/analytics/events.ts` | 2 | schema zod do lote, tipos dos eventos |
| `lib/analytics/user-agent.ts` | 2 | UA → aparelho, sistema e navegador, bot |
| `lib/analytics/record.ts` | 2 | lote validado → patch da sessão + linhas de evento |
| `lib/db/schema.ts`, `lib/db/migrations/0004_*` | 3 | tabelas `funnel_sessions`, `funnel_events`, `app_logs` |
| `lib/db/repos/types.ts`, `mysql.ts`, `tests/fakes/memory-repos.ts`, `tests/db/repos.contract.ts` | 3 | `AnalyticsRepo`, `AppLogRepo` |
| `lib/db/migrations/0005_*` | 4 | views `vw_*` |
| `lib/http/handlers/events.ts`, `app/api/events/route.ts`, `lib/container.ts` | 5 | `POST /api/events` |
| `lib/log.ts`, `lib/log-persist.ts`, `lib/container.ts` | 6 | destino `persist` e `app_logs` |
| `lib/jobs/purge-observability.ts`, `lib/jobs/run-jobs.ts`, `lib/container.ts` | 7 | retenção |
| `lib/client/track.ts` | 8 | fila e envio no navegador |
| `lib/client/submit-quiz.ts`, `components/loading-screen.tsx`, `app/page.tsx` | 9 | ligar o quiz ao rastreamento |
| `README.md` | 10 | Metabase, grants e SQL dos painéis |

---

### Task 1: Etapas, validação e eventos de transição

**Files:**
- Create: `lib/quiz/steps.ts`, `lib/quiz/step-validation.ts`, `lib/quiz/step-events.ts`
- Modify: `app/page.tsx` (tira `validateCPF`, `canProceed` e as duas cópias do `switch` de mensagens em `handleContinue`/`handleNext`; passa a usar `stepValidation`. Sem rastreamento ainda.)
- Test: `tests/lib/quiz/steps.test.ts`, `tests/lib/quiz/step-validation.test.ts`, `tests/lib/quiz/step-events.test.ts`

**Interfaces:**
- Produces (`lib/quiz/steps.ts`):
  - `type QuizStepDef = { slug: string; answerKey?: string }`
  - `const QUIZ_STEPS: readonly QuizStepDef[]` (29 itens, tabela do §4)
  - `const LAST_STEP = 28`
  - `const ALLOWED_ANSWER_KEYS: readonly string[]` (os `answerKey` do §4, na ordem das etapas)
  - `function stepSlug(step: number): string | undefined`
  - `function answerKeyForSlug(slug: string): string | undefined`
  - `type BmiBand = "abaixo" | "normal" | "sobrepeso" | "obesidade"`
  - `function bmiBand(imc: unknown): BmiBand | undefined`. Aceita number ou string numérica; `<= 0` ou não finito → `undefined`.
  - `function sanitizeAnswer(value: unknown): string | string[] | undefined`. Aceita string de 1 a 80 caracteres, ou array de 1 a 15 strings de 1 a 80; qualquer outra coisa → `undefined`.
- Produces (`lib/quiz/step-validation.ts`):
  - `type ValidationReason = "vazio" | "email_invalido" | "telefone_invalido" | "cpf_invalido"`
  - `function validateCPF(cpf: string): boolean` (movida do `page.tsx` sem mudança)
  - `function stepValidation(step: number, answers: Record<string, any>): { message: string; reason: ValidationReason } | null`. `null` = pode avançar. Mesmas regras do `canProceed` atual e mesmos textos do `switch` atual.
- Produces (`lib/quiz/step-events.ts`):
  - `type StepTrackEvent = { event: "step_view" | "step_back"; step: number; stepSlug: string } | { event: "step_answer"; step: number; stepSlug: string; durationMs: number; answer?: string | string[] }`
  - `function stepTransitionEvents(prev: { step: number; enteredAtMs: number } | null, next: number, answers: Record<string, unknown>, nowMs: number): StepTrackEvent[]`

- [ ] **Step 1: Escrever os testes que falham**

`steps.test.ts`:
- `QUIZ_STEPS` tem 29 itens, slugs únicos, e `stepSlug(18) === "altura"`, `stepSlug(26) === "cpf"`, `stepSlug(28) === "checkout"`, `stepSlug(29) === undefined`.
- `ALLOWED_ANSWER_KEYS` é exatamente `["faixa_etaria","sexo_biologico","tipo_fisico","peso_comportamento","breakfast_foods","almoco","lanche_tarde","jantar","sobremesa","rotina_dia","sono","agua","habitos","imc_faixa"]`, e nenhuma etapa de 18 a 20 nem de 23 a 26 tem `answerKey`.
- `answerKeyForSlug("cafe_manha") === "breakfast_foods"`, `answerKeyForSlug("perfil_imc") === "imc_faixa"`, `answerKeyForSlug("cpf") === undefined`.
- `bmiBand`: `18.49 → "abaixo"`, `18.5 → "normal"`, `24.99 → "normal"`, `"24.99" → "normal"`, `25 → "sobrepeso"`, `29.99 → "sobrepeso"`, `30 → "obesidade"`; `"abc"`, `NaN`, `0`, `-1`, `undefined` → `undefined`.
- `sanitizeAnswer`: `"Sim" → "Sim"`, `["a","b"] → ["a","b"]`, `"" → undefined`, `"x".repeat(81) → undefined`, array com 16 itens → `undefined`, `["a", 1] → undefined`, `[] → undefined`, `{}` → `undefined`, `42 → undefined`.

`step-validation.test.ts`:
- `stepValidation(0, {}) → { reason: "vazio", message: "Por favor, selecione uma opção antes de continuar." }`; `stepValidation(0, { faixa_etaria: "25-34 anos" }) → null`.
- etapas 3, 5, 11, 16, 17, 21, 22, 27, 28 com `{}` → `null`.
- `6`/`7`/`9` com `[]` → as mensagens de café da manhã, almoço e jantar; `15` com `[]` → a de hábitos.
- `23`: sem e-mail → `vazio` + "Por favor, informe seu e-mail para continuar."; `"a@b"` → `email_invalido` + a mensagem de e-mail válido; `"a@b.co"` → `null`.
- `24`: sem número → `vazio`; `"(11) 9876"` → `telefone_invalido`; `"(11) 98765-4321"` → `null`.
- `25`: `"   "` → `vazio` + a mensagem do nome.
- `26`: sem CPF → `vazio`; `"123"` → `cpf_invalido` + "Por favor, insira um CPF válido com 11 dígitos."; `"111.111.111-11"` → `cpf_invalido` + "CPF inválido. Por favor, verifique os dados e tente novamente."; `"529.982.247-25"` → `null`.
- `18`/`19`/`20` com `{}` → as mensagens de altura, peso e meta.

`step-events.test.ts`:
- `stepTransitionEvents(null, 0, {}, 1000)` → `[{ event: "step_view", step: 0, stepSlug: "faixa_etaria" }]`.
- avançar de `{ step: 0, enteredAtMs: 1000 }` para 1 em `nowMs` 4000, com `{ faixa_etaria: "25-34 anos" }` → `[{ event: "step_answer", step: 0, stepSlug: "faixa_etaria", durationMs: 3000, answer: "25-34 anos" }, { event: "step_view", step: 1, stepSlug: "sexo_biologico" }]`.
- avançar de 21 com `{ imc: "27.10" }` → `step_answer` com `answer: "sobrepeso"`.
- avançar de 26 com `{ cpf: "529.982.247-25" }` → `step_answer` **sem** a chave `answer`.
- avançar de 6 com `breakfast_foods: []` → `step_answer` sem `answer`.
- voltar de 5 para 4 → `[{ event: "step_back", step: 5, stepSlug: "info_prepare_se" }, { event: "step_view", step: 4, stepSlug: "peso_comportamento" }]`.
- mesma etapa → `[]`.
- pular de 0 para 27 → `step_answer` da 0 e `step_view` da 27.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm vitest run tests/lib/quiz/steps.test.ts tests/lib/quiz/step-validation.test.ts tests/lib/quiz/step-events.test.ts`
Expected: FAIL (módulos não existem).

- [ ] **Step 3: Implementar os três módulos**

Em `step-validation.ts`, um único `switch` por etapa substitui o `canProceed` e as duas cópias das mensagens. Copie os textos literalmente do `page.tsx` atual (linhas 167–227 e 326–394). O comentário de cabeçalho diz que a regra e a mensagem ficam juntas para o modal e o evento `validation_error` não divergirem.

- [ ] **Step 4: Trocar no `app/page.tsx`**

`canProceed()` vira `stepValidation(currentStep, answers) === null`, nos lugares que o usam. `handleContinue` e `handleNext` viram:

```ts
const v = stepValidation(currentStep, answers)
if (v) {
  setErrorModal({ isOpen: true, message: v.message })
  return
}
nextStep()
```

Remova `validateCPF` e as cópias do `switch` do arquivo.

- [ ] **Step 5: Rodar os testes e o typecheck**

Run: `pnpm vitest run tests/lib/quiz && pnpm typecheck`
Expected: PASS, sem erros de tipo.

- [ ] **Step 6: Commit**

```bash
git add lib/quiz/steps.ts lib/quiz/step-validation.ts lib/quiz/step-events.ts app/page.tsx tests/lib/quiz/steps.test.ts tests/lib/quiz/step-validation.test.ts tests/lib/quiz/step-events.test.ts
git commit -m "feat: etapas do quiz com slug fixo e validação num só lugar"
```

---

### Task 2: Schema do lote, User-Agent e conversão para gravação

**Files:**
- Create: `lib/analytics/events.ts`, `lib/analytics/user-agent.ts`, `lib/analytics/record.ts`
- Test: `tests/lib/analytics/events.test.ts`, `tests/lib/analytics/user-agent.test.ts`, `tests/lib/analytics/record.test.ts`

**Interfaces:**
- Consumes: `LAST_STEP`, `answerKeyForSlug`, `sanitizeAnswer` (Task 1); `ValidationReason` (Task 1).
- Produces (`lib/analytics/events.ts`):
  - `const EVENTS_MAX_BATCH = 25`
  - `type SubmitFailure = "http_4xx" | "http_5xx" | "timeout" | "rede" | "resposta_invalida"`
  - `type SubmitOutcome = "ok" | SubmitFailure | "storage"`
  - `type Utm = { source?: string; medium?: string; campaign?: string; content?: string; term?: string }`
  - `type FunnelEvent` = união discriminada por `event`, com os campos do §5.1. Base com etapa: `{ ts: string; step: number; stepSlug: string }`. O `session_start` é `{ event: "session_start"; ts: string; utm: Utm; referrerHost?: string; viewport?: { w: number; h: number } }`.
  - `type FunnelEventInput` = `FunnelEvent` sem `ts`, distribuído pela união (`FunnelEvent extends infer E ? (E extends unknown ? Omit<E, "ts"> : never) : never`).
  - `type EventsBatch = { sessionId: string; events: FunnelEvent[] }`
  - `function parseEventsBatch(raw: unknown): { ok: true; value: EventsBatch } | { ok: false; issues: { path: string; message: string }[] }`
- Produces (`lib/analytics/user-agent.ts`):
  - `type DeviceInfo = { deviceType: "mobile" | "tablet" | "desktop"; os: string; browser: string; isBot: boolean }`
  - `function parseUserAgent(ua: string | null | undefined): DeviceInfo`
- Produces (`lib/analytics/record.ts`), com os tipos que a Task 3 coloca em `lib/db/repos/types.ts`, importados de lá:
  - `function buildRecord(batch: EventsBatch, device: DeviceInfo, now: Date): { session: FunnelSessionPatch; events: FunnelEventRow[] }`

> Para não haver dependência circular entre tarefas, a Task 2 define `FunnelSessionPatch` e `FunnelEventRow` em `lib/db/repos/types.ts` (só os tipos, abaixo); a Task 3 acrescenta as interfaces dos repositórios ao lado.

```ts
export type FunnelSessionPatch = {
  sessionId: string
  device: { deviceType: string; os: string; browser: string }
  /** Presente quando o lote tem `session_start`. */
  start?: { utm: Utm; referrerHost: string | null; viewportW: number | null; viewportH: number | null }
  /** Último `step_view` do lote. */
  lastStep?: { step: number; slug: string }
  /** Maior `step` entre os `step_view` do lote. */
  maxStep?: { step: number; slug: string }
  checkoutClicked: boolean
  /** answerKey → valor, só chaves permitidas. */
  answers: Record<string, string | string[]>
}
export type FunnelEventRow = {
  sessionId: string
  event: string
  step: number | null
  stepSlug: string | null
  props: Record<string, unknown>
  clientTs: Date
  createdAt: Date
}
```

- [ ] **Step 1: Escrever os testes que falham**

`events.test.ts`:
- um lote válido com um evento de cada tipo passa, e o valor devolvido mantém os campos.
- `sessionId: "abc"` → `ok: false`; `events: []` → `ok: false`; 26 eventos → `ok: false`.
- `step: 29`, `step: -1`, `step: 1.5` → `ok: false`; `stepSlug` com 41 caracteres → `ok: false`.
- `event: "foo"` → `ok: false`; `reason: "outro"` → `ok: false`; `outcome: "x"` → `ok: false`.
- `step_answer` com `stepSlug: "cpf"` e `answer: "529..."` → passa, **sem** `answer`.
- `step_answer` com `stepSlug: "tipo_fisico"` e `answer: 42` → passa, sem `answer`.
- campo desconhecido (`nome: "Ana"`) no evento → removido.
- `utm.source` com 300 caracteres → passa, cortado em 100; `referrerHost` com 300 → cortado em 100 (Review Focus 2).
- `durationMs`/`msOnStep` negativos ou acima de 86.400.000 → `ok: false`; `attempt` 0 → `ok: false`.
- `ts` é string de até 40 caracteres (a validade da data é tratada no handler, Task 5).
- `viewport: { w: 0, h: 0 }` → `ok: false` (aceita inteiros de 1 a 10.000).

`user-agent.test.ts` (UAs reais escritos no teste):
- iPhone Safari → `mobile`/`iOS`/`Safari`; Android Chrome → `mobile`/`Android`/`Chrome`; Instagram in-app no iPhone → `browser: "Instagram"`; Facebook in-app (`FBAN`) → `"Facebook"`; iPad → `tablet`/`iOS`; Android tablet sem `Mobile` → `tablet`; Windows Edge → `desktop`/`Windows`/`Edge`; macOS Safari → `desktop`/`macOS`/`Safari`; Samsung Internet → `"Samsung"`; Firefox Linux → `desktop`/`Linux`/`Firefox`.
- Googlebot, `HeadlessChrome`, Lighthouse, `""` e `null` → `isBot: true`.

`record.test.ts`:
- lote com `session_start` + `step_view` 0 + `step_answer` 0 (`answer: "25-34 anos"`) + `step_view` 1 → `session.start` preenchido, `lastStep: { step: 1, slug: "sexo_biologico" }`, `maxStep` igual, `answers: { faixa_etaria: "25-34 anos" }`, `checkoutClicked: false`, 4 linhas de evento.
- a resposta da etapa 21 vai para `answers.imc_faixa`.
- `step_view` 5 seguido de `step_view` 3 → `lastStep.step === 3`, `maxStep.step === 5`.
- `checkout_click` → `checkoutClicked: true`.
- linhas de evento: `props` sem `event`, `ts`, `step`, `stepSlug` nem `answer`; `session_start` com `step: null`, `stepSlug: null` e `props: { utm, referrerHost, viewport }`; `createdAt === now`; `clientTs` = `new Date(ts)`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm vitest run tests/lib/analytics`
Expected: FAIL (módulos não existem).

- [ ] **Step 3: Implementar**

`events.ts`: `z.discriminatedUnion("event", [...])`, com objetos `.strip()` (o padrão do zod 3, que remove campos desconhecidos); strings opcionais com `.transform(s => s.slice(0, 100))`. O `answer` passa por um `.transform` no objeto do `step_answer`: só sobrevive se `answerKeyForSlug(stepSlug)` existir e `sanitizeAnswer(answer)` não for `undefined`. `issues` no mesmo formato de `lib/quiz/validation.ts` (caminho + mensagem, sem valores).

`user-agent.ts`: expressões na ordem do §6.

`record.ts`: `clientTs = new Date(e.ts)` sem correção; a correção de relógio é do handler (Task 5), que passa o `ts` já normalizado.

- [ ] **Step 4: Rodar os testes**

Run: `pnpm vitest run tests/lib/analytics && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/analytics lib/db/repos/types.ts tests/lib/analytics
git commit -m "feat: schema do lote de eventos do funil, leitura do User-Agent e conversão para gravação"
```

---

### Task 3: Tabelas e repositórios do funil e dos logs

**Files:**
- Modify: `lib/db/schema.ts` (tabelas `funnelSessions`, `funnelEvents` e `appLogs`, conforme o §7)
- Create: `lib/db/migrations/0004_*.sql` via `pnpm db:generate --name observability_tables` (com o snapshot e o `_journal.json` que o drizzle-kit atualiza)
- Modify: `lib/db/repos/types.ts`, `lib/db/repos/mysql.ts`, `tests/fakes/memory-repos.ts`, `tests/db/repos.contract.ts`

**Interfaces:**
- Consumes: `FunnelSessionPatch`, `FunnelEventRow` (Task 2).
- Produces (`lib/db/repos/types.ts`):

```ts
export type FunnelSessionView = {
  sessionId: string
  startedAt: Date
  lastEventAt: Date
  lastStep: number | null
  lastStepSlug: string | null
  maxStep: number | null
  maxStepSlug: string | null
  checkoutClicked: boolean
  utm: Utm
  referrerHost: string | null
  deviceType: string
  os: string
  browser: string
  viewportW: number | null
  viewportH: number | null
  answers: Record<string, string | string[]>
}
export interface AnalyticsRepo {
  /** Uma transação: upsert da sessão (§7) e insert dos eventos. */
  recordBatch(session: FunnelSessionPatch, events: FunnelEventRow[], now: Date): Promise<void>
  /** Apaga até `limit` eventos (`created_at < cutoff`) e até `limit` sessões (`last_event_at < cutoff`); devolve o total. */
  purgeOlderThan(cutoff: Date, limit: number): Promise<number>
  /** Leitura para os testes de contrato. */
  getSession(sessionId: string): Promise<FunnelSessionView | null>
  listEvents(sessionId: string): Promise<FunnelEventRow[]>
}
export type AppLogRow = { ts: Date; level: "info" | "warn" | "error"; event: string; area: string; fields: Record<string, unknown> }
export interface AppLogRepo {
  insertMany(rows: AppLogRow[]): Promise<void>
  purgeOlderThan(cutoff: Date, limit: number): Promise<number>
  /** Leitura para os testes de contrato: linhas com o `event` dado, por `ts`. */
  listByEvent(event: string): Promise<AppLogRow[]>
}
```

- `Repos` ganha `analytics: AnalyticsRepo` e `appLogs: AppLogRepo`.
- `Utm` é importado de `lib/analytics/events.ts` (só o tipo).

- [ ] **Step 1: Escrever os casos de contrato que falham**

Em `tests/db/repos.contract.ts`, um `describe` novo, numerado em sequência depois do último que existe, com `sessionId` `randomUUID()` por teste:
- **cria a sessão**: `recordBatch` com `start` (utm `{ source: "ig" }`), `lastStep`/`maxStep` 2, `answers: { tipo_fisico: "Gordinho(a)" }` e 3 eventos → `getSession` traz tudo, `startedAt` e `lastEventAt` = `now`, e `listEvents` tem 3 linhas na ordem enviada, com `props` iguais.
- **`max_step` não diminui**: segundo lote com `maxStep` 1 → `maxStep` continua 2; `lastStep` vira 1.
- **`checkout_clicked` não volta**: lote com `true` e depois outro com `false` → `true`.
- **UTMs não são sobrescritas**: segundo lote com `start.utm.source: "fb"` → continua `"ig"`.
- **`answers` faz merge**: segundo lote com `{ sono: "6h" }` → `{ tipo_fisico: "Gordinho(a)", sono: "6h" }`; um terceiro com `{ sono: "8h" }` substitui só `sono`.
- **lote sem `lastStep`** preserva o `lastStep` anterior.
- **`lastEventAt`** passa a ser o `now` do lote mais recente.
- **aparelho** é gravado na criação e não muda depois.
- **purge do funil**: eventos e sessão com `now` de 400 dias atrás e outros de agora; `purgeOlderThan(365 dias atrás, 1000)` remove só os antigos e devolve o total; com `limit: 1`, remove no máximo 1 por tabela.
- **`appLogs`**: `insertMany` com duas linhas de `event` único → `listByEvent` devolve as duas por `ts` com `fields` iguais; `purgeOlderThan` apaga só as anteriores ao corte.
- **`insertMany([])`** não lança.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm vitest run tests/db/repos.memory.test.ts`
Expected: FAIL (`repos.analytics` indefinido).

- [ ] **Step 3: Schema e migration**

Tabelas, colunas e índices do §7, em `lib/db/schema.ts`, depois de `appSettings`, com um comentário de uma linha cada. `funnel_events.id` e `app_logs.id` com `bigint("id", { mode: "number", unsigned: true }).autoincrement().primaryKey()`. `answers` com default `(JSON_OBJECT())`. Rode `pnpm db:generate --name observability_tables` e confira que o SQL gerado só cria as três tabelas e os índices.

- [ ] **Step 4: Implementar o fake em memória**

Um `Map` de sessões, um array de eventos e um array de logs, com a mesma semântica do contrato. Sem `await` no meio do `recordBatch`, como os outros métodos atômicos do fake.

- [ ] **Step 5: Rodar o contrato em memória**

Run: `pnpm vitest run tests/db/repos.memory.test.ts`
Expected: PASS.

- [ ] **Step 6: Implementar no MySQL**

O `recordBatch` roda em `db.transaction`. Na sessão, `insert(...).onDuplicateKeyUpdate({ set: {...} })` com:
- `last_event_at = VALUES(last_event_at)`
- `max_step = GREATEST(COALESCE(max_step, -1), VALUES(max_step))`, e `max_step_slug` acompanha com `IF(VALUES(max_step) > COALESCE(max_step, -1), VALUES(max_step_slug), max_step_slug)`; **a ordem das atribuições importa no MySQL**: atribua `max_step_slug` antes de `max_step`
- `last_step`/`last_step_slug` = `COALESCE(VALUES(x), x)`
- `checkout_clicked = checkout_clicked OR VALUES(checkout_clicked)`
- `answers = JSON_MERGE_PATCH(answers, VALUES(answers))`
- UTMs, referrer e viewport = `COALESCE(x, VALUES(x))`

Os eventos vão num único `insert(...).values([...])` quando não estão vazios. Os purges usam `DELETE ... ORDER BY <coluna> LIMIT ?` com `sql`, e a contagem vem de `affectedRows`.

- [ ] **Step 7: Rodar o contrato no MySQL (se houver `TEST_DATABASE_URL`) e o resto**

Run: `pnpm vitest run tests/db && pnpm typecheck`
Expected: PASS. Sem `TEST_DATABASE_URL`, o arquivo MySQL aparece como pulado; registre isso no relatório da tarefa.

- [ ] **Step 8: Commit**

```bash
git add lib/db tests/fakes/memory-repos.ts tests/db/repos.contract.ts
git commit -m "feat: tabelas e repositórios do funil do quiz e dos logs do app"
```

---

### Task 4: Views para o Metabase

**Files:**
- Create: `lib/db/migrations/0005_*.sql` via `pnpm db:generate --custom --name observability_views`
- Test: `tests/lib/quiz/steps-migration.test.ts`; Modify: `tests/db/repos.mysql.test.ts` (um caso novo)

**Interfaces:**
- Consumes: `QUIZ_STEPS`, `ALLOWED_ANSWER_KEYS` (Task 1); tabelas da Task 3.
- Produces: views `vw_funnel_steps(step, step_slug, sessions, pct_of_start)`, `vw_abandonment(session_id, abandon_step, abandon_step_slug, started_at, last_event_at, utm_source, utm_medium, utm_campaign, referrer_host, device_type, os, browser)`, `vw_session_answers(session_id, started_at, utm_source, utm_campaign, device_type, os, browser, max_step, checkout_clicked, <uma coluna por ALLOWED_ANSWER_KEYS>)`, `vw_step_durations(session_id, created_at, step, step_slug, duration_ms)`, `vw_api_errors(day, area, event, level, total)`.

- [ ] **Step 1: Escrever o teste de deriva que falha**

`steps-migration.test.ts` lê o arquivo `0005_*.sql` de `lib/db/migrations`:
- extrai os pares com `/SELECT (\d+)(?: AS step)?, '([a-z_]+)'(?: AS step_slug)?/g` e compara com `QUIZ_STEPS.map((s, i) => [i, s.slug])`;
- dentro do statement do `vw_session_answers` (o trecho entre `CREATE VIEW \`vw_session_answers\`` e o próximo `--> statement-breakpoint`), extrai as chaves com `/'\$\.([a-z_]+)'/g` e compara com `ALLOWED_ANSWER_KEYS`.

A mensagem de falha deve dizer que, quando entrar uma etapa nova, é preciso criar uma migration que recria as views.

Em `repos.mysql.test.ts`, dentro do bloco que já roda `runMigrations`: `SELECT * FROM <view> LIMIT 1` para as cinco views, sem erro.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm vitest run tests/lib/quiz/steps-migration.test.ts`
Expected: FAIL (arquivo da migration não encontrado).

- [ ] **Step 3: Escrever as views**

Cada `CREATE VIEW` separado por `--> statement-breakpoint`. As etapas vêm de uma tabela derivada literal, no formato que o teste lê:

```sql
CREATE VIEW `vw_funnel_steps` AS
SELECT s.step, s.step_slug,
       COUNT(f.session_id) AS sessions,
       ROUND(100 * COUNT(f.session_id) / NULLIF((SELECT COUNT(*) FROM funnel_sessions WHERE max_step >= 0), 0), 1) AS pct_of_start
FROM (
  SELECT 0 AS step, 'faixa_etaria' AS step_slug
  UNION ALL SELECT 1, 'sexo_biologico'
  -- ... até 28, 'checkout'
) s
LEFT JOIN funnel_sessions f ON f.max_step >= s.step
GROUP BY s.step, s.step_slug
```

- `vw_abandonment`: `funnel_sessions` com `checkout_clicked = false AND last_event_at < UTC_TIMESTAMP(3) - INTERVAL 30 MINUTE AND last_step IS NOT NULL`; `abandon_step = last_step`. As datas estão em UTC, por isso `UTC_TIMESTAMP`.
- `vw_session_answers`: `JSON_UNQUOTE(JSON_EXTRACT(answers, '$.<chave>')) AS <chave>` para cada chave, na ordem de `ALLOWED_ANSWER_KEYS`.
- `vw_step_durations`: `funnel_events` com `event = 'step_answer'`, `CAST(JSON_EXTRACT(props, '$.durationMs') AS UNSIGNED) AS duration_ms`.
- `vw_api_errors`: `app_logs` agrupado por `DATE(ts)`, `area`, `event`, `level`, com `COUNT(*) AS total`.

- [ ] **Step 4: Rodar os testes**

Run: `pnpm vitest run tests/lib/quiz tests/db`
Expected: PASS (o MySQL é pulado sem `TEST_DATABASE_URL`).

- [ ] **Step 5: Commit**

```bash
git add lib/db/migrations tests/lib/quiz/steps-migration.test.ts tests/db/repos.mysql.test.ts
git commit -m "feat: views do funil, do abandono e dos erros para o Metabase"
```

---

### Task 5: `POST /api/events`

**Files:**
- Create: `lib/http/handlers/events.ts`, `app/api/events/route.ts`
- Modify: `lib/container.ts` (repos novos já vêm de `createMysqlRepos`; acrescenta `eventsRateLimiter`), `tests/lib/container.wiring.test.ts` (o container expõe `eventsRateLimiter` diferente de `rateLimiter`)
- Test: `tests/lib/http/events.test.ts`

**Interfaces:**
- Consumes: `parseEventsBatch` (Task 2), `parseUserAgent`, `buildRecord` (Task 2), `AnalyticsRepo` (Task 3), `readJsonBody`, `clientIp` (de `lib/http/handlers/submit-quiz.ts`), `safeErrorMessage`.
- Produces:
  - `const EVENTS_MAX_BODY_BYTES = 16 * 1024`
  - `function createEventsHandler(d: { analytics: Pick<AnalyticsRepo, "recordBatch">; rateLimiter: { hit(k: string): boolean }; log: Logger; now: () => Date }): (req: Request) => Promise<Response>`
  - `Container.eventsRateLimiter: RateLimiter`, com `EVENTS_RATE_LIMIT = { limit: 120, windowMs: 60_000 }`

- [ ] **Step 1: Escrever os testes que falham**

Com o `fakeLog` no molde de `tests/lib/http/handlers.test.ts` e um `analytics` fake que guarda as chamadas:
- lote válido com UA de iPhone → `204`, corpo vazio, uma chamada a `recordBatch` com `session.device.deviceType === "mobile"`.
- limiter que recusa → `429` e `log.warn("events.rate_limited")`; `recordBatch` não é chamado.
- corpo com 16 * 1024 + 1 bytes → `413`; JSON quebrado → `400`, ambos com `events.bad_body` + `status`.
- lote inválido → `400` com `events.invalid` + `issues`, e nenhum valor recebido aparece nas linhas de log (procure o `sessionId` e um `answer` enviado no `JSON.stringify(log.lines)`).
- UA `Googlebot` → `204` sem chamar `recordBatch`.
- `recordBatch` lança → `204` e `log.error("events.record_failed", { message })`.
- **relógio** (Review Focus 3): `ts: "não é data"` → `clientTs` igual a `now`; `ts` 25 h antes de `now` → `now`; `ts` 1 h antes → mantido.
- o IP de `x-forwarded-for` vai para `rateLimiter.hit` e não aparece em `recordBatch`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm vitest run tests/lib/http/events.test.ts`
Expected: FAIL (módulo não existe).

- [ ] **Step 3: Implementar o handler, a rota e a ligação no container**

O handler segue a ordem do §6 e normaliza o `ts` de cada evento (regra das 24 h) antes do `buildRecord`. A rota fica no molde de `app/api/submit-quiz/route.ts` (`runtime = "nodejs"`, `dynamic = "force-dynamic"`), passando `c.repos.analytics`, `c.eventsRateLimiter`, `c.log` e `() => new Date()`.

- [ ] **Step 4: Rodar os testes**

Run: `pnpm vitest run tests/lib/http tests/lib/container.wiring.test.ts tests/lib/container.test.ts && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/http/handlers/events.ts app/api/events/route.ts lib/container.ts tests/lib/http/events.test.ts tests/lib/container.wiring.test.ts
git commit -m "feat: endpoint que grava os eventos do funil do quiz"
```

---

### Task 6: Logs do backend em `app_logs`

**Files:**
- Modify: `lib/log.ts`, `lib/container.ts`
- Create: `lib/log-persist.ts`
- Test: `tests/lib/log.test.ts` (casos novos), `tests/lib/log-persist.test.ts`

**Interfaces:**
- Consumes: `AppLogRepo`, `AppLogRow` (Task 3).
- Produces:
  - `lib/log.ts`: `type LogLevel = "info" | "warn" | "error"`; `type LogEntry = { ts: Date; level: LogLevel; event: string; fields: Record<string, unknown> }`; `createLogger(write?: (line: string) => void, persist?: (entry: LogEntry) => void): Logger`
  - `lib/log-persist.ts`: `const PERSISTED_INFO_EVENTS: ReadonlySet<string>`; `function createLogPersister(d: { repo: Pick<AppLogRepo, "insertMany">; write: (line: string) => void; setTimer?: (fn: () => void, ms: number) => unknown; intervalMs?: number; batchSize?: number; maxBuffer?: number }): { push(entry: LogEntry): void; flush(): Promise<void> }`

- [ ] **Step 1: Escrever os testes que falham**

`log.test.ts`:
- `createLogger(write, persist).warn("x.y", { cpf: "05687104950", n: 1 })` → `persist` recebe `{ level: "warn", event: "x.y", fields: { cpf: "***.***.*49-50", n: 1 } }` com `ts` sendo `Date`, e o stdout continua igual ao de hoje.
- Review Focus 4: `fields` com `new Error("boom")` → `fields.err` é `{ name: "Error", message: "boom", stack: <string> }`; `bigint` `10n` → `"10"`; objeto circular → `fields` igual a `{ logError: true }`; nenhum desses lança, e o stdout é escrito uma vez.
- `persist` que lança → nada sobe e o stdout é escrito.

`log-persist.test.ts` (com `vi.useFakeTimers()` e `setTimer` padrão do `setTimeout`):
- `info` de `job.round.done` não entra; `info` de `submit.done` entra; `warn` e `error` sempre entram.
- três `push` seguidos → um só `insertMany` depois de 2.000 ms, com `area` = `"payment"` para `payment.sync.failed`.
- 250 linhas → `insertMany` de 100, 100 e 50, nunca dois ao mesmo tempo (o fake do repo resolve com atraso e conta as chamadas simultâneas).
- `maxBuffer: 3` e 5 `push` → 3 gravadas; no flush seguinte, o `write` recebe uma única linha `log.persist_dropped` com `level: "warn"` e `dropped: 2`, e o contador volta a zero.
- `insertMany` rejeita → o `write` recebe uma linha JSON com `event: "log.persist_failed"`, `level: "error"`, `dropped` (tamanho do lote) e `message`, e **nenhuma** linha nova entra no buffer (o persister não chama o logger).

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm vitest run tests/lib/log.test.ts tests/lib/log-persist.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

`log.ts`: os campos do `persist` são `JSON.parse(JSON.stringify(redact(fields), replacer))` dentro de `try`; se falhar, `{ logError: true }`. O caminho do stdout não muda.

`log-persist.ts`: buffer, um timer só, flag `flushing`; `flush()` exportado para os testes. As linhas de `write` são JSON no mesmo formato do logger (`ts`, `level`, `event`).

`container.ts`: monte `repos` antes do logger, e então `const persister = createLogPersister({ repo: repos.appLogs, write: console.log })` e `const log = createLogger(console.log, persister.push)`. O `boot()` continua com `createLogger()` sem persistência.

- [ ] **Step 4: Rodar os testes**

Run: `pnpm vitest run tests/lib && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/log.ts lib/log-persist.ts lib/container.ts tests/lib/log.test.ts tests/lib/log-persist.test.ts
git commit -m "feat: avisos e erros do app gravados em app_logs, em lote e sem bloquear"
```

---

### Task 7: Limpeza por retenção na rodada do job

**Files:**
- Create: `lib/jobs/purge-observability.ts`
- Modify: `lib/jobs/run-jobs.ts`, `lib/container.ts`
- Test: `tests/lib/jobs/purge-observability.test.ts`, `tests/lib/jobs/run-jobs.test.ts` (casos novos)

**Interfaces:**
- Consumes: `AnalyticsRepo.purgeOlderThan`, `AppLogRepo.purgeOlderThan` (Task 3).
- Produces:
  - `const FUNNEL_RETENTION_DAYS = 365`, `const APP_LOG_RETENTION_DAYS = 90`, `const PURGE_BATCH = 1000`
  - `function createPurgeObservability(d: { analytics: Pick<AnalyticsRepo, "purgeOlderThan">; appLogs: Pick<AppLogRepo, "purgeOlderThan">; now: () => Date; limit?: number }): () => Promise<number>`
  - `createRunJobs(d)` aceita `purge?: () => Promise<number>`. O `RunSummary` **não muda**; o `job.round.done` ganha `purged` só quando `purge` foi passado.

- [ ] **Step 1: Escrever os testes que falham**

- `purge-observability`: com `now` fixo, chama `analytics.purgeOlderThan(now - 365 dias, 1000)` e `appLogs.purgeOlderThan(now - 90 dias, 1000)` e devolve a soma; se um rejeita, a promessa rejeita.
- `run-jobs`: com `purge` que devolve 7 → `job.round.done` tem `purged: 7`, e o summary é igual ao de hoje; `purge` que rejeita → `summary.errors` +1 e `log.error("job.purge.error", { message })`; sem `purge`, o `job.round.done` não tem `purged`. Os `toEqual` que já existem continuam passando sem mudança.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm vitest run tests/lib/jobs`
Expected: FAIL nos casos novos.

- [ ] **Step 3: Implementar e ligar no container**

O purge roda depois das notificações. No container, `purge: createPurgeObservability({ analytics: repos.analytics, appLogs: repos.appLogs, now })`.

- [ ] **Step 4: Rodar os testes**

Run: `pnpm vitest run tests/lib && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/jobs/purge-observability.ts lib/jobs/run-jobs.ts lib/container.ts tests/lib/jobs
git commit -m "feat: rodada do job apaga eventos do funil e logs fora da retenção"
```

---

### Task 8: Rastreador no navegador

**Files:**
- Create: `lib/client/track.ts`
- Test: `tests/lib/client/track.test.ts`

**Interfaces:**
- Consumes: `FunnelEventInput` (Task 2, só o tipo); `newSubmissionId` de `lib/client/submit-quiz.ts`.
- Produces:
  - `type Tracker = { readonly sessionId: string; track(e: FunnelEventInput): void; flush(opts?: { beacon?: boolean }): void }`
  - `function createTracker(d: { storage?: Pick<Storage, "getItem" | "setItem"> | null; fetchImpl?: typeof fetch; sendBeacon?: ((url: string, data: Blob) => boolean) | null; now?: () => Date; setTimer?: (fn: () => void, ms: number) => unknown; search?: string; referrer?: string; ownHost?: string; viewport?: { w: number; h: number } | null; endpoint?: string }): Tracker`
  - `function getTracker(): Tracker`: singleton do navegador montado com `window`; fora do navegador (`typeof window === "undefined"`), devolve um rastreador que não faz nada.
  - constantes `TRACK_SESSION_KEY = "tf_session_id"`, `TRACK_FLUSH_DELAY_MS = 1000`, `TRACK_MAX_QUEUE = 100`, `TRACK_MAX_PER_REQUEST = 25`, `TRACK_MAX_BYTES = 15_000`, `endpoint` padrão `"/api/events"`

- [ ] **Step 1: Escrever os testes que falham**

Todos com dependências injetadas e `vi.useFakeTimers()`:
- `storage` vazio → cria o id, grava em `tf_session_id` e o primeiro envio tem `session_start` com `utm` lido de `search: "?utm_source=ig&utm_campaign=c1&x=1"` (`{ source: "ig", campaign: "c1" }`), `referrerHost` do `referrer` quando o host é diferente de `ownHost` (e ausente quando é igual), e `viewport`.
- `storage` com id → reaproveita e **não** manda `session_start`.
- `storage.getItem` que lança → id em memória, e `track` continua funcionando.
- três `track` → um só `fetch` depois de 1.000 ms, com `{ sessionId, events }` e `ts` ISO em cada evento.
- 30 eventos → duas requisições (25 + 5).
- Review Focus 1: 25 `step_answer` com `answer` de 15 strings de 80 caracteres → nenhuma requisição tem corpo acima de 15.000 bytes, e todos os eventos são enviados.
- 120 `track` sem envio → a fila guarda os 100 mais recentes.
- `flush({ beacon: true })` usa `sendBeacon` com um `Blob` `application/json`; se `sendBeacon` devolver `false` ou não existir, usa `fetch` com `keepalive: true`.
- `fetch` que rejeita → nada lança, e o lote é descartado (o envio seguinte não o repete).
- `track` com `fetchImpl` que lança de forma síncrona → nada lança.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm vitest run tests/lib/client/track.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar**

Cabeçalho no estilo de `lib/client/submit-quiz.ts`: módulo sem React, que nunca lança. A divisão por bytes mede `JSON.stringify({ sessionId, events })` à medida que adiciona eventos ao lote. Um evento que sozinho passa de 15.000 bytes é descartado.

- [ ] **Step 4: Rodar os testes**

Run: `pnpm vitest run tests/lib/client && pnpm typecheck`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/client/track.ts tests/lib/client/track.test.ts
git commit -m "feat: rastreador do funil no navegador com envio em lote e sendBeacon"
```

---

### Task 9: Ligar o quiz ao rastreador

**Files:**
- Modify: `lib/client/submit-quiz.ts`, `components/loading-screen.tsx`, `app/page.tsx`
- Test: `tests/lib/client/submit-quiz.test.ts`

**Interfaces:**
- Consumes: `getTracker` (Task 8), `stepTransitionEvents`, `stepValidation`, `stepSlug` (Task 1), `SubmitFailure` (Task 2).
- Produces: `SubmitQuizResult` vira `{ ok: true; linkPagamento?: string } | { ok: false; message: string; failure: SubmitFailure }`.

- [ ] **Step 1: Escrever os testes que falham**

Em `submit-quiz.test.ts`, os casos de erro que já existem passam a conferir também `failure`:
- resposta 400 → `http_4xx`; 500 e 503 → `http_5xx`; timeout (o teste de `timeoutMs` que já existe) → `timeout`; `fetch` que rejeita com `TypeError` → `rede`; JSON inválido com 200 → `resposta_invalida`; `{ sucesso: false, mensagemErro: "x" }` com 200 → `resposta_invalida`, com `message: "x"`.

Atualize os `toEqual` antigos de erro para incluir `failure`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `pnpm vitest run tests/lib/client/submit-quiz.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar o `failure` em `submitQuizRequest`**

No `catch`, `controller.signal.aborted` → `timeout`. Separe o `JSON.parse` num `try` próprio para devolver `resposta_invalida`. Fora desses casos, é `rede`.

- [ ] **Step 4: Ligar a `LoadingScreen`**

Em `submitToWebhook`: guarde `performance.now()` no início e mantenha uma ref de tentativas (1, 2…). Ao terminar, faça `getTracker().track({ event: "submit_result", step: 27, stepSlug: "envio", outcome, durationMs, attempt })`, em que `outcome` é `"ok"`, `result.failure` ou `"storage"` (a falha do `sessionStorage.setItem` que já existe).

- [ ] **Step 5: Ligar o `page.tsx`**

- `const tracker = useRef(getTracker()).current` e `const stepRef = useRef<{ step: number; enteredAtMs: number } | null>(null)`.
- `useEffect` em `[currentStep]`: `stepTransitionEvents(stepRef.current, currentStep, answers, performance.now())` → `tracker.track` em cada um; depois `stepRef.current = { step: currentStep, enteredAtMs: performance.now() }`. As `answers` são lidas por uma ref atualizada a cada render, para o efeito não depender delas.
- `handleContinue`/`handleNext`: quando `stepValidation` devolve um motivo, `tracker.track({ event: "validation_error", step: currentStep, stepSlug: stepSlug(currentStep)!, reason: v.reason })` antes do modal.
- `handleFinalRedirect`: `tracker.track({ event: "checkout_click", step: 28, stepSlug: "checkout", hasPaymentLink: !!linkPagamento })` e `tracker.flush({ beacon: true })` **antes** de mudar `window.location.href`.
- `useEffect` de montagem: ouvintes de `pagehide` e `visibilitychange`. Quando a página fica oculta, e só uma vez por período oculto (a flag volta ao estado inicial quando a página fica visível de novo), faça `track({ event: "page_hide", step, stepSlug, msOnStep })` com os dados de `stepRef`, depois `flush({ beacon: true })`. Remova os ouvintes no cleanup.

- [ ] **Step 6: Rodar testes, typecheck e build**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: tudo PASS e o build conclui.

- [ ] **Step 7: Verificar no navegador**

Com `pnpm dev` e um MySQL local (`.env.local`), responda até a etapa 3 e feche a aba. Em `funnel_events` devem aparecer `session_start`, `step_view` 0–3, `step_answer` 0–2 e `page_hide`. Em `funnel_sessions`, `max_step = 3` e nenhuma coluna com dado pessoal. Registre o resultado no relatório da tarefa; se não houver banco local, diga isso explicitamente.

- [ ] **Step 8: Commit**

```bash
git add lib/client/submit-quiz.ts components/loading-screen.tsx app/page.tsx tests/lib/client/submit-quiz.test.ts
git commit -m "feat: quiz envia etapas, validações, envio, checkout e saída da página para o funil"
```

---

### Task 10: README do Metabase e dos painéis

**Files:**
- Modify: `README.md`, numa seção nova "Observabilidade (funil e erros)", depois da seção de deploy no Easypanel

**Interfaces:**
- Consumes: as tabelas e views das Tasks 3 e 4.

- [ ] **Step 1: Escrever a seção**

Conteúdo:
1. O que é gravado e o que nunca é gravado (§1, §12), em 5 a 8 linhas.
2. Passo a passo do Metabase (§10), com os comandos SQL de `CREATE DATABASE`, `CREATE USER` e de todos os `GRANT SELECT` (as 3 tabelas e as 5 views, um por linha) e as variáveis `MB_DB_*`/`JAVA_OPTS`.
3. Os 9 painéis do §11: para cada um, o objetivo em uma frase, o SQL pronto para colar e a visualização sugerida no Metabase. O tempo por etapa usa `ROW_NUMBER()`/`COUNT()` por `step_slug` para a mediana e o p90 (o MySQL não tem `MEDIAN`). Os filtros de período usam a variável `{{periodo}}` do Metabase sobre `started_at`/`created_at`/`ts`.
4. Aviso: quando uma etapa do quiz mudar, é preciso uma migration que recria as views (o teste `steps-migration` falha até isso ser feito).
5. Retenção (365 e 90 dias) e onde mudar (`lib/jobs/purge-observability.ts`).

- [ ] **Step 2: Conferir o SQL**

Com `TEST_DATABASE_URL` ou um MySQL local com as migrations aplicadas: rode cada SQL do README e confirme que executa sem erro (o resultado vazio é aceitável). Sem banco, registre que não foi executado.

- [ ] **Step 3: Verificação final**

Run: `pnpm test && pnpm typecheck && pnpm build`
Expected: tudo PASS.

- [ ] **Step 4: Commit**

```bash
git add README.md
git commit -m "docs: Metabase no Easypanel, permissões de leitura e SQL dos painéis do funil"
```
