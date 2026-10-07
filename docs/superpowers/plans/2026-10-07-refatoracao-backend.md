# Refatoração do backend (n8n → Next.js + MySQL + Asaas): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Substituir o webhook do n8n por um backend dentro do próprio Next.js. Ele grava o envio no MySQL, cria cliente e cobrança no Asaas, devolve um dos 3 desfechos e cuida do reprocessamento e das notificações por e-mail e WhatsApp.

**Architecture:**
- Rotas finas chamam serviços que recebem as dependências (repositórios, cliente Asaas, notificadores, relógio) por parâmetro.
- O Asaas é chamado na própria requisição, com retry.
- O que falha ou fica pendente (cobranças `PENDING_ASAAS` e notificações da outbox) é concluído por um job interno a cada 2 min, iniciado pelo `instrumentation.ts`.
- `sync-payment` é o único ponto que cria recursos no Asaas e é idempotente (sempre busca antes de criar).

**Tech Stack:** Next.js 16 (route handlers, `after()`, `instrumentation.ts`), TypeScript, Drizzle ORM + `mysql2`, zod 3, nodemailer, Vitest.

**Spec:** [docs/superpowers/specs/2026-10-07-refatoracao-backend-design.md](../specs/2026-10-07-refatoracao-backend-design.md). Leia o spec inteiro antes de começar qualquer tarefa. Este plano referencia as seções dele (§N) e não repete o que já está lá.

## Global Constraints

- Gerenciador de pacotes: **pnpm 9.15.0** (lockfile `pnpm-lock.yaml`). Localmente ele não está no PATH: use `corepack pnpm …` em todos os comandos deste plano.
- Node 24 local. Os testes rodam com `corepack pnpm vitest run <arquivo>`.
- Front: **nenhuma mudança visual nem de texto.** Só `components/loading-screen.tsx` muda (lógica, §9), além das anotações de tipo em `app/page.tsx` (Task 15).
- Mensagem de erro exibida à pessoa, em todos os casos de erro da API: `"Houve um problema ao registrar seus dados. Por favor, aguarde alguns instantes e tente novamente ou entre em contato com o suporte."`
- Contrato de resposta do `POST /api/submit-quiz`: `{ sucesso: boolean, linkPagamento?: string, mensagemErro?: string }`.
- Variáveis de ambiente: exatamente as de §10. Nenhuma `NEXT_PUBLIC_*`. Leitura **lazy** (`getEnv()` na hora do uso), para que `next build` funcione sem env.
- Rotas de API: `export const runtime = "nodejs"` e `export const dynamic = "force-dynamic"`.
- Valores fixos:
  - timeout HTTP 8 s, 3 tentativas, backoff base 500 ms;
  - orçamento da requisição 20 s; deadline de cobrança no job 30 s;
  - job a cada 120 000 ms, lotes de 20 cobranças e 50 notificações;
  - backoff do job `min(2^n, 60)` minutos;
  - no máximo 8 tentativas de cobrança e 5 de notificação;
  - lock TTL 2 min;
  - rate limit de 5 por 60 s por IP;
  - corpo máximo de 64 KB;
  - intervalo de 3 s entre partes do WhatsApp;
  - `last_error.responseBody` truncado em 2048 caracteres.
- Logs nunca contêm CPF, e-mail ou telefone sem máscara, nem chaves ou tokens.
- Toda mensagem de commit termina com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **CPF e telefone em formatos variados** (`529.982.247-25`, `(44) 9 9165-1250`, `+55 44 99165-1250`): devem ser normalizados para só dígitos e aceitos. O teste fica na Task 2.
2. **Duplo clique ou duas requisições simultâneas com o mesmo `submissionId`:** devem resultar em exatamente uma resposta gravada e uma cobrança. Os testes ficam na Task 8 (contrato) e na Task 12 (serviço).
3. **Processo reiniciado no meio de um sync (lock órfão):** a reserva expira sozinha e o job volta a processar a linha. O teste fica na Task 8 (contrato).
4. **Asaas responde 200 sem `invoiceUrl`:** o sistema não pode marcar a cobrança como sincronizada sem link; deve tratar como erro transitório. O teste fica na Task 5.
5. **Nome com emoji ou acentos** (`Ana Souza 💚`): deve ser gravado e lido sem corromper (`utf8mb4`). O teste fica na Task 8 (contrato, que também roda contra o MySQL).

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `lib/env.ts` | schema zod das envs, `parseEnv`, `getEnv` |
| `lib/quiz/validation.ts`, `lib/quiz/messages.ts` | validação/normalização do payload; mensagem padrão |
| `lib/log.ts` | logger JSON + máscaras |
| `lib/time.ts` | datas no fuso de São Paulo |
| `lib/jobs/backoff.ts` | backoff do job e limites de tentativas |
| `lib/http/retry.ts` | `fetchWithRetry`, `HttpError` |
| `lib/http/rate-limit.ts`, `lib/http/auth.ts`, `lib/http/read-json.ts` | utilitários das rotas |
| `lib/asaas/client.ts` | cliente HTTP do Asaas |
| `lib/notify/templates.ts`, `lib/notify/email.ts`, `lib/notify/whatsapp.ts` | conteúdo e envio |
| `lib/db/schema.ts`, `lib/db/client.ts`, `lib/db/migrate.ts`, `lib/db/migrations/` | banco |
| `lib/db/repos/types.ts` | interfaces dos repositórios (contrato) |
| `lib/db/repos/mysql.ts` | implementação MySQL |
| `lib/services/*.ts` | `last-error`, `alert-admin`, `sync-payment`, `dispatch-notification`, `submit-quiz` |
| `lib/jobs/run-jobs.ts`, `lib/jobs/retry-failed.ts`, `lib/jobs/scheduler.ts` | job |
| `lib/http/handlers/*.ts` | handlers testáveis das rotas |
| `lib/container.ts`, `lib/boot.ts`, `instrumentation.ts` | composição e inicialização |
| `app/api/{submit-quiz,jobs/run,jobs/retry,health}/route.ts` | rotas (só ligam handler + container) |
| `tests/**` | testes; `tests/fakes/memory-repos.ts` e `tests/fakes/fake-asaas.ts` são dublês compartilhados |

---

### Task 1: Ferramentas, dependências e variáveis de ambiente

**Files:**
- Modify: `package.json`, `.gitignore`
- Create: `vitest.config.ts`, `lib/env.ts`, `.env.example`
- Test: `tests/lib/env.test.ts`

**Interfaces:**
- Produces:
  - `type Env` com as chaves de §10, todas em MAIÚSCULAS como no spec. Tipos:
    - `PAYMENT_AMOUNT: string` (regex `^\d+(\.\d{1,2})?$`, default `"39.90"`);
    - `PAYMENT_DUE_DAYS: number` (default 2);
    - `SMTP_PORT: number`;
    - `ASAAS_ENV: "sandbox" | "production"`;
    - `JOBS_ENABLED`, `NOTIFY_EMAIL_ENABLED`, `NOTIFY_WHATSAPP_ENABLED: boolean` (default `true`; strings `"true"`/`"false"`);
    - `JOBS_TOKEN` com no mínimo 32 caracteres;
    - `PAYMENT_SUCCESS_URL` e `EVOLUTION_API_URL` são URLs; `ADMIN_ALERT_EMAIL` é e-mail.
  - `parseEnv(raw: Record<string, string | undefined>): Env`: lança `Error` cuja mensagem lista o nome de cada variável inválida ou ausente.
  - `getEnv(): Env`: lê `process.env` e guarda o resultado em cache.

- [ ] **Step 1: Instalar e conferir o build de base**

```bash
corepack pnpm install
corepack pnpm add drizzle-orm mysql2 nodemailer
corepack pnpm add -D drizzle-kit vitest @types/nodemailer
corepack pnpm build
```
Esperado: o build termina sem erro. O `node_modules` atual foi instalado com npm, e o `pnpm install` o recria.

- [ ] **Step 2: Configurar scripts e Vitest**

No `package.json`, adicione os scripts:
- `"test": "vitest run"`
- `"test:watch": "vitest"`
- `"typecheck": "tsc --noEmit"`
- `"db:generate": "drizzle-kit generate"`

Crie o `vitest.config.ts` com `test.environment = "node"`, `test.include = ["tests/**/*.test.ts"]` e o alias `@` → raiz do projeto (`path.resolve(__dirname)`).

- [ ] **Step 3: Escrever o teste que falha**

`tests/lib/env.test.ts`, usando um objeto `valid` com todas as obrigatórias (`DATABASE_URL: "mysql://u:p@localhost:3306/db"`, `JOBS_TOKEN` com 32 `"x"` etc.):
- `parseEnv(valid)` → `PAYMENT_AMOUNT === "39.90"`, `PAYMENT_DUE_DAYS === 2`, `JOBS_ENABLED === true`, `NOTIFY_EMAIL_ENABLED === true`, `NOTIFY_WHATSAPP_ENABLED === true`.
- `parseEnv({ ...valid, JOBS_ENABLED: "false" }).JOBS_ENABLED === false`.
- `parseEnv({ ...valid, DATABASE_URL: undefined, JOBS_TOKEN: undefined })` lança um erro cuja mensagem contém `"DATABASE_URL"` e `"JOBS_TOKEN"`.
- `ASAAS_ENV: "prod"` → lança; `JOBS_TOKEN: "curto"` → lança; `PAYMENT_AMOUNT: "39,90"` → lança.

- [ ] **Step 4: Rodar e ver falhar**

Run: `corepack pnpm vitest run tests/lib/env.test.ts`
Expected: FAIL (módulo `@/lib/env` não existe).

- [ ] **Step 5: Implementar `lib/env.ts`**

Use zod com `z.coerce.number()` para as portas e números. Para os booleanos, use `z.enum(["true","false"]).default("true").transform(v => v === "true")`.

- [ ] **Step 6: Rodar e ver passar**

Run: `corepack pnpm vitest run tests/lib/env.test.ts`
Expected: PASS.

- [ ] **Step 7: Criar `.env.example` e liberar no `.gitignore`**

`.env.example` lista todas as variáveis de §10 com valores de exemplo, sem segredos reais. No `.gitignore`, adicione `!.env.example` logo abaixo de `.env*`.

- [ ] **Step 8: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts lib/env.ts tests/lib/env.test.ts .env.example .gitignore
git commit -m "chore: vitest, dependências do backend e validação de env"
```

---

### Task 2: Validação e normalização do envio

**Files:**
- Create: `lib/quiz/validation.ts`, `lib/quiz/messages.ts`
- Test: `tests/lib/quiz/validation.test.ts`

**Interfaces:**
- Produces:
  - `MENSAGEM_ERRO_PADRAO: string`, com o texto exato de Global Constraints.
  - `isValidCpf(raw: string): boolean`: aceita com ou sem máscara.
  - `normalizePhone(raw: string): string | null`: tira tudo que não é dígito. Se sobrarem 12 ou 13 dígitos começando com `55`, remove o `55`. Válido só com 10 ou 11 dígitos; senão `null`.
  - `type ParsedSubmission = { submissionId: string; patient: { name: string; cpf: string; email: string; phone: string }; answers: Record<string, unknown> }`
  - `parseSubmitRequest(body: unknown): { ok: true; value: ParsedSubmission } | { ok: false; issues: string[] }`:
    - lê `body.submissionId` (UUID) e `body.answers` (objeto com `nome_completo`, `email`, `whatsapp`, `cpf`);
    - `name` sai com trim; `email` com trim e em minúsculas; `cpf` e `phone` só com dígitos;
    - `answers` é o objeto original completo.

- [ ] **Step 1: Escrever o teste que falha**

Casos:
- `isValidCpf`:
  - `"529.982.247-25"` → true; `"52998224725"` → true; `"123.456.789-09"` → true;
  - `"529.982.247-24"` → false; `"111.111.111-11"` → false; `"123"` → false.
- `normalizePhone`:
  - `"(44) 9 9165-1250"` → `"44991651250"`; `"+55 44 99165-1250"` → `"44991651250"`;
  - `"(44) 3025-1234"` → `"4430251234"`; `"9165-1250"` → `null`.
- `parseSubmitRequest` com `submissionId: "3f1c2d4e-5b6a-4c7d-8e9f-0a1b2c3d4e5f"` e answers `{ nome_completo: "  Ana Souza 💚 ", email: " Ana@Gmail.COM ", whatsapp: "(44) 9 9165-1250", cpf: "529.982.247-25", faixa_etaria: "25-34 anos" }`:
  - `ok === true`;
  - `patient` igual a `{ name: "Ana Souza 💚", email: "ana@gmail.com", phone: "44991651250", cpf: "52998224725" }`;
  - `answers.faixa_etaria === "25-34 anos"`.
- `parseSubmitRequest` com `ok === false` para:
  - sem `submissionId`;
  - `submissionId: "abc"`;
  - CPF inválido;
  - e-mail `"ana@"`;
  - `nome_completo: "   "`;
  - `body` igual a `null`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `corepack pnpm vitest run tests/lib/quiz/validation.test.ts`
Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `lib/quiz/validation.ts` e `lib/quiz/messages.ts`**

O algoritmo de CPF é o mesmo de `validateCPF` em `app/page.tsx:106`: dois dígitos verificadores e rejeição de dígitos todos iguais. Monte o schema com zod e use `.passthrough()` em `answers`.

- [ ] **Step 4: Rodar e ver passar**

Run: `corepack pnpm vitest run tests/lib/quiz/validation.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/quiz tests/lib/quiz
git commit -m "feat: validação e normalização do envio do quiz"
```

---

### Task 3: Utilitários: logger, datas, backoff, rate limit, auth

**Files:**
- Create: `lib/log.ts`, `lib/time.ts`, `lib/jobs/backoff.ts`, `lib/http/rate-limit.ts`, `lib/http/auth.ts`
- Test: `tests/lib/log.test.ts`, `tests/lib/time.test.ts`, `tests/lib/jobs/backoff.test.ts`, `tests/lib/http/rate-limit.test.ts`, `tests/lib/http/auth.test.ts`

**Interfaces:**
- Produces:
  - **Logger:**
    - `type Logger = { info(event: string, fields?: Record<string, unknown>): void; warn(…): void; error(…): void }`;
    - `createLogger(write?: (line: string) => void): Logger`: escreve uma linha JSON com `ts` (ISO), `level`, `event` e os campos; o default é `console.log`;
    - `maskCpf(cpf: string): string`, `maskEmail(email: string): string`, `maskPhone(phone: string): string`.
  - **Datas:** `todayInSaoPaulo(now: Date): string` (`YYYY-MM-DD`); `addDaysISO(date: string, days: number): string`.
  - **Backoff:** `jobBackoffMs(attempt: number): number`; `MAX_PAYMENT_ATTEMPTS = 8`; `MAX_NOTIFICATION_ATTEMPTS = 5`.
  - **Rate limit:** `createRateLimiter(opts: { limit: number; windowMs: number; now?: () => number }): { hit(key: string): boolean }`. Retorna `true` quando a chamada é permitida; usa janela deslizante.
  - **Auth:** `isBearerAuthorized(header: string | null, token: string): boolean`. Compara em tempo constante (`timingSafeEqual` sobre o sha256 dos dois lados).

- [ ] **Step 1: Escrever os testes que falham**

- **Logger e máscaras:**
  - `maskCpf("05687104950") === "***.***.*49-50"`;
  - `maskEmail("alex@gmail.com") === "a***@gmail.com"`;
  - `maskPhone("41999679512") === "***9512"`;
  - `createLogger(w).info("x", { a: 1 })`: chama `w` com um JSON que, depois do parse, tem `level: "info"`, `event: "x"`, `a: 1` e `ts` como string ISO.
- **Datas:**
  - `todayInSaoPaulo(new Date("2026-10-08T02:30:00Z")) === "2026-10-07"`;
  - `addDaysISO("2026-12-31", 2) === "2027-01-02"`.
- **Backoff:** `jobBackoffMs` de 1, 2, 3, 4, 5, 6 e 10 → `[2, 4, 8, 16, 32, 60, 60]` minutos, em ms.
- **Rate limit:** com `limit: 5`, `windowMs: 60000` e `now` controlado:
  - 5 `hit("ip")` → true; a 6ª → false;
  - `hit("outro")` → true;
  - depois de avançar 60 001 ms → `hit("ip")` → true.
- **Auth:**
  - `isBearerAuthorized("Bearer " + T, T)` → true;
  - token errado → false;
  - `null` → false;
  - `T` sem o prefixo `Bearer` → false;
  - `"Bearer x"` (tamanho diferente) → false, sem lançar.

- [ ] **Step 2: Rodar e ver falhar**

Run: `corepack pnpm vitest run tests/lib/log.test.ts tests/lib/time.test.ts tests/lib/jobs/backoff.test.ts tests/lib/http/rate-limit.test.ts tests/lib/http/auth.test.ts`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar os cinco módulos**

`todayInSaoPaulo` usa `Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" })`. `addDaysISO` faz aritmética em UTC sobre a data `YYYY-MM-DD`.

- [ ] **Step 4: Rodar e ver passar**

Run: o mesmo comando do Step 2.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/log.ts lib/time.ts lib/jobs/backoff.ts lib/http/rate-limit.ts lib/http/auth.ts tests/lib
git commit -m "feat: logger com máscaras, datas SP, backoff, rate limit e auth"
```

---

### Task 4: `fetchWithRetry`

**Files:**
- Create: `lib/http/retry.ts`
- Test: `tests/lib/http/retry.test.ts`

**Interfaces:**
- Produces:
  - `class HttpError extends Error { status?: number; body?: string; transient: boolean }`
  - `type RetryOptions = { timeoutMs?: number /*8000*/; attempts?: number /*3*/; baseDelayMs?: number /*500*/; deadline?: number /*epoch ms*/; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void>; random?: () => number; now?: () => number }`
  - `fetchWithRetry(url: string, init: RequestInit, opts?: RetryOptions): Promise<Response>`:
    - 2xx: devolve a `Response`.
    - 4xx exceto 429: lança na hora `HttpError{ transient: false, status, body }`. O `body` é o texto truncado em 2048 caracteres.
    - 5xx, 429, erro de rede e timeout: repetem. A espera antes da tentativa `i + 1` (com `i` a partir de 0) é `baseDelayMs * 2 ** i * (0.8 + 0.4 * random())`.
    - Esgotadas as tentativas, lança o último `HttpError{ transient: true }`.
    - **Deadline:** o timeout de cada tentativa é `min(timeoutMs, deadline - now())`. Se o tempo restante for ≤ 0, ou se a espera ultrapassaria o deadline, lança `HttpError{ transient: true, message: "deadline exceeded" }` sem chamar o fetch de novo.
    - O timeout usa `AbortController`; a mensagem do erro contém `"timeout"`.

- [ ] **Step 1: Escrever o teste que falha**

Use um `fetchImpl` falso com fila de respostas, `sleep` que registra os ms recebidos e `random: () => 0.5`:
- 503, 503, 200 → resolve com status 200; fetch chamado 3 vezes; sleeps `[500, 1000]`.
- 400 com corpo `'{"errors":[{"code":"invalid_cpfCnpj"}]}'` → rejeita com `HttpError` (`transient === false`, `status === 400`, `body` contendo `invalid_cpfCnpj`); fetch chamado 1 vez.
- 429, 429, 429 → rejeita com `transient === true` e `status === 429`; 3 chamadas.
- `TypeError("fetch failed")` seguido de 200 → resolve.
- `fetchImpl` que só termina ao receber o abort, com `timeoutMs: 20` e `attempts: 1`, usando timers reais → rejeita com `transient === true` e mensagem contendo `"timeout"`.
- `deadline: now() - 1` → rejeita com `"deadline exceeded"`; fetch nunca chamado.

- [ ] **Step 2: Rodar e ver falhar**

Run: `corepack pnpm vitest run tests/lib/http/retry.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `lib/http/retry.ts`**

- [ ] **Step 4: Rodar e ver passar**

Run: `corepack pnpm vitest run tests/lib/http/retry.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/http/retry.ts tests/lib/http/retry.test.ts
git commit -m "feat: fetch com timeout, retry exponencial e deadline"
```

---

### Task 5: Cliente Asaas

**Files:**
- Create: `lib/asaas/client.ts`
- Test: `tests/lib/asaas/client.test.ts`

**Interfaces:**
- Consumes: `fetchWithRetry` e `HttpError` (Task 4).
- Produces:
  - **Tipos:**
    - `type AsaasPayment = { id: string; status: string; invoiceUrl: string; invoiceNumber: string | null; billingType: string | null; dueDate: string }`
    - `type CreateCustomerInput = { name: string; cpfCnpj: string; email: string; mobilePhone: string; externalReference: string }`
    - `type CreatePaymentInput = { customer: string; billingType: "UNDEFINED"; value: number; dueDate: string; description: string; externalReference: string; callback: { successUrl: string } }`
    - `type CallOpts = { deadline: number }`
  - **Interface `AsaasClient`:**
    - `findCustomerByCpf(cpf, o: CallOpts): Promise<{ id: string } | null>`
    - `createCustomer(i: CreateCustomerInput, o): Promise<{ id: string }>`
    - `findPaymentByExternalReference(ref, o): Promise<AsaasPayment | null>`
    - `createPayment(i: CreatePaymentInput, o): Promise<AsaasPayment>`
  - **Fábrica:** `createAsaasClient(cfg: { env: "sandbox" | "production"; apiKey: string; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void> }): AsaasClient`.
    - URL base: `https://api-sandbox.asaas.com/v3` ou `https://api.asaas.com/v3`.
    - Headers: `access_token`, `Content-Type: application/json`, `User-Agent: tami-forms`.
    - Buscas: `GET /customers?cpfCnpj=…` e `GET /payments?externalReference=…`, com parâmetros codificados por `URLSearchParams`. Lêem `data[0]`.
    - Uma resposta de cobrança sem `id` ou sem `invoiceUrl` lança `HttpError{ transient: true, message: "invalid asaas response" }`.

- [ ] **Step 1: Escrever o teste que falha**

Use um `fetchImpl` falso que registra `url`, `method`, `headers` e `body` e devolve um JSON programado:
- **sandbox:** `findCustomerByCpf("52998224725")`:
  - chama `GET https://api-sandbox.asaas.com/v3/customers?cpfCnpj=52998224725` com header `access_token` igual à chave;
  - com `{ data: [{ id: "cus_1" }] }` → `{ id: "cus_1" }`; com `{ data: [] }` → `null`.
- **production:** a URL começa com `https://api.asaas.com/v3/`.
- **`createPayment`:**
  - entrada `{ customer: "cus_1", billingType: "UNDEFINED", value: 39.9, dueDate: "2026-10-09", description: "Plano Alimentar Personalizado - Ana Souza - 30 dias", externalReference: "pay-uuid", callback: { successUrl: "https://forms.nutritamilivalle.com.br/confirmationPayment" } }`;
  - o POST para `/payments` deve ter exatamente esse body;
  - a resposta `{ id: "pay_1", status: "PENDING", invoiceUrl: "https://asaas/i/1", invoiceNumber: "123", billingType: "UNDEFINED", dueDate: "2026-10-09" }` volta mapeada.
- **`findPaymentByExternalReference("pay-uuid")`:** `data[0]` mapeado, ou `null`.
- **Review Focus 4:** `createPayment` com resposta 200 `{ id: "pay_1", status: "PENDING" }` (sem `invoiceUrl`) → rejeita com `HttpError` e `transient === true`.
- **400:** rejeita com `HttpError` e `transient === false`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `corepack pnpm vitest run tests/lib/asaas/client.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `lib/asaas/client.ts`**

- [ ] **Step 4: Rodar e ver passar**

Run: `corepack pnpm vitest run tests/lib/asaas/client.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/asaas tests/lib/asaas
git commit -m "feat: cliente Asaas com busca antes de criar"
```

---

### Task 6: Notificações: templates, e-mail e WhatsApp

**Files:**
- Create: `lib/notify/templates.ts`, `lib/notify/email.ts`, `lib/notify/whatsapp.ts`
- Test: `tests/lib/notify/templates.test.ts`, `tests/lib/notify/email.test.ts`, `tests/lib/notify/whatsapp.test.ts`

**Interfaces:**
- Consumes: `fetchWithRetry` (Task 4).
- Produces:
  - **Templates:**
    - `PAYMENT_LINK_TITLE = "✅ Recebemos seu cadastro! Seu plano alimentar está pronto"`
    - `renderPaymentLink(d: { name: string; link: string }): { subject: string; html: string; text: string }`
    - `toWhatsAppParts(title: string, html: string): string[]`
  - **E-mail:**
    - `interface EmailSender { send(m: { to: string; subject: string; html: string; text: string }): Promise<void> }`
    - `createSmtpEmailSender(cfg: { host: string; port: number; user: string; pass: string; from: string }, createTransport?: typeof nodemailer.createTransport): EmailSender`, com `secure` igual a `port === 465`.
  - **WhatsApp:**
    - `interface WhatsAppSender { sendText(number: string, text: string): Promise<void> }`
    - `createEvolutionWhatsAppSender(cfg: { baseUrl: string; apiKey: string; instance: string; fetchImpl?: typeof fetch; sleep?: (ms: number) => Promise<void> }): WhatsAppSender`. Faz `POST {baseUrl}/message/sendText/{encodeURIComponent(instance)}` com header `apikey` e body `{ number, text }`.

O `html` de `renderPaymentLink` é o texto exato abaixo, igual ao do n8n. `{nome}` entra com escape de HTML; `{link}` entra literal.
```
Olá {nome}! 👋 <br>Recebemos seu cadastro com sucesso! 🎉 Seu <strong>Plano Alimentar Personalizado já está pronto</strong> e aguardando apenas a confirmação do pagamento. <br><br>Para liberar seu acesso, basta efetuar o pagamento pelo link abaixo: <br>
{link} <br><br>
Assim que o pagamento for confirmado, você receberá as informações de acesso para fazer login e visualizar seu Plano Alimentar Personalizado. 💚
```
O `text` sai do mesmo html: `<br>` vira `\n` e as demais tags são removidas.

`toWhatsAppParts` porta o node `textoFormatado` do n8n:
1. `<strong>` e `</strong>` viram `*`.
2. O texto é dividido em `<br><br>`.
3. Os `<br>` restantes viram `\n`.
4. Cada parte recebe trim; as vazias são descartadas.
5. A primeira parte ganha o prefixo `*{title}*\n`.

- [ ] **Step 1: Escrever os testes que falham**

- **templates:**
  - `renderPaymentLink({ name: "Ana <b>", link: "https://asaas/i/1" })`: `html` contém `"Olá Ana &lt;b&gt;!"` e `"https://asaas/i/1"`; `subject === PAYMENT_LINK_TITLE`; `text` não contém `"<"`.
  - `toWhatsAppParts(PAYMENT_LINK_TITLE, renderPaymentLink({ name: "Ana", link: "https://asaas/i/1" }).html)` tem 3 partes:
    - `parts[0]` começa com `"*✅ Recebemos seu cadastro! Seu plano alimentar está pronto*\nOlá Ana! 👋"` e contém `"*Plano Alimentar Personalizado já está pronto*"`;
    - `parts[1]` contém `"https://asaas/i/1"`;
    - `parts[2]` termina com `"💚"`;
    - nenhuma parte contém `"<"`.
- **email:**
  - com um `createTransport` falso, `send(...)` chama `sendMail` com `{ from: cfg.from, to, subject, html, text }`;
  - a fábrica recebe `secure: true` com a porta 465 e `secure: false` com a 587.
- **whatsapp:**
  - `sendText("5544991651250", "oi")` faz POST para `https://evo.example/message/sendText/Suporte%20Nutri%20Tamili%20Valle` com header `apikey` e body JSON `{ number: "5544991651250", text: "oi" }`;
  - uma resposta 400 rejeita com `HttpError` e `transient === false`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `corepack pnpm vitest run tests/lib/notify`
Expected: FAIL.

- [ ] **Step 3: Implementar os três módulos**

- [ ] **Step 4: Rodar e ver passar**

Run: `corepack pnpm vitest run tests/lib/notify`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/notify tests/lib/notify
git commit -m "feat: templates e envio de e-mail (SMTP) e WhatsApp (Evolution)"
```

---

### Task 7: Schema do banco, migration e conexão

**Files:**
- Create: `lib/db/schema.ts`, `lib/db/client.ts`, `lib/db/migrate.ts`, `drizzle.config.ts`, `lib/db/migrations/*` (gerado)

**Interfaces:**
- Produces:
  - Tabelas Drizzle `patients`, `quizResponses`, `payments` e `notifications`, exatamente como em §4: colunas, tipos, `UNIQUE`s e índices. Ids `char(36)`; datas `datetime({ fsp: 3, mode: "date" })`; `due_date` como `date({ mode: "string" })`; `amount` como `decimal({ precision: 10, scale: 2 })`; `created_at` e `updated_at` em todas.
  - `type Db = MySql2Database<typeof schema>`
  - `createDb(url: string): { db: Db; pool: mysql.Pool }`: pool `mysql2/promise` com `timezone: "Z"`. Cada nova conexão executa `SET time_zone = '+00:00'`, para que `NOW(3)` seja UTC.
  - `getDb(): Db`: singleton a partir de `getEnv().DATABASE_URL`.
  - `runMigrations(db: Db): Promise<void>`: usa o `migrate` de `drizzle-orm/mysql2/migrator` com `migrationsFolder: path.join(process.cwd(), "lib/db/migrations")`.

- [ ] **Step 1: Escrever `lib/db/schema.ts` e `drizzle.config.ts`**

Config: `dialect: "mysql"`, `schema: "./lib/db/schema.ts"`, `out: "./lib/db/migrations"`.

- [ ] **Step 2: Gerar a migration**

Run: `corepack pnpm db:generate`
Expected: cria `lib/db/migrations/0000_*.sql`. Abra o arquivo e confira que ele tem:
- `UNIQUE` em `patients.cpf`, `quiz_responses.submission_id` e `payments.asaas_id`;
- `UNIQUE` em `(quiz_response_id, channel, kind)`;
- índices em `(status, next_sync_at)` e `(status, next_attempt_at)`.

- [ ] **Step 3: Escrever `lib/db/client.ts` e `lib/db/migrate.ts`**

- [ ] **Step 4: Typecheck**

Run: `corepack pnpm typecheck`
Expected: só os 3 erros pré-existentes em `app/page.tsx` (734, 844, 900); nenhum erro em `lib/`.

- [ ] **Step 5: Commit**

```bash
git add lib/db drizzle.config.ts
git commit -m "feat: schema MySQL, migration inicial e conexão"
```

O teste real do schema acontece na Task 9: as migrations rodam duas vezes contra o MySQL e o contrato inteiro passa.

---

### Task 8: Contrato dos repositórios + fake em memória

**Files:**
- Create: `lib/db/repos/types.ts`, `tests/fakes/memory-repos.ts`, `tests/db/repos.contract.ts`
- Test: `tests/db/repos.memory.test.ts`

**Interfaces:**
- Produces (em `lib/db/repos/types.ts`; todas as datas são `Date`):
  - **Tipos de apoio:**
    - `type Channel = "email" | "whatsapp"`
    - `type LastError = { step: string; httpStatus?: number; responseBody?: string; message: string; attempt: number; at: string }`
    - `type SubmissionRef = { quizResponseId: string; paymentId: string }`
    - `type NewSubmission = { submissionId: string; patient: { name; cpf; email; phone }; answers: Record<string, unknown>; amount: string; todaySP: string }`
  - **`SubmissionRepo`:**
    - `findBySubmissionId(id: string): Promise<SubmissionRef | null>`
    - `create(s: NewSubmission): Promise<SubmissionRef | "duplicate">`: uma transação que segue o passo 4 de §5 e a regra de reaproveitamento de §4, usando `todaySP` como "hoje". A nova cobrança nasce com `status "PENDING_ASAAS"`, `sync_attempts 0` e `next_sync_at` = agora.
  - **`PaymentView`:** `{ id; patientId; status: string; amount: string; asaasId: string | null; paymentUrl: string | null; syncAttempts: number; patient: { id; name; cpf; email; phone; asaasCustomerId: string | null } }`
  - **`PaymentRepo`:**
    - `get(id): Promise<PaymentView | null>`
    - `tryLock(id, ttlMs: number): Promise<boolean>`; `unlock(id): Promise<void>`
    - `setPatientAsaasCustomer(patientId, customerId): Promise<void>`
    - `markSynced(id, d: { asaasId; asaasCustomerId; status; paymentUrl; invoiceNumber: string | null; billingType: string | null; dueDate: string }): Promise<void>`: limpa o lock e o `last_error`.
    - `markSyncFailure(id, d: { attempts: number; nextSyncAt: Date | null; failed: boolean; error: LastError }): Promise<void>`: com `failed`, o status vira `ASAAS_FAILED`; sempre limpa o lock.
    - `listDue(now: Date, limit: number): Promise<string[]>`
    - `reopen(id): Promise<boolean>`; `reopenAllFailed(): Promise<number>`
  - **`NotificationView`:** `{ id; quizResponseId; paymentId; channel: Channel; kind: "payment_link"; recipient; status: "pending" | "sent" | "failed"; partsSent: number; attempts: number; patientName: string; paymentUrl: string | null }`
  - **`NotificationRepo`:**
    - `enqueuePaymentLink(filter: { paymentId: string } | { quizResponseId: string }, channels: Channel[]): Promise<void>`:
      - cria, para cada `quiz_response` do filtro e cada canal, uma linha `pending` com `next_attempt_at` = agora;
      - o `recipient` é o e-mail do paciente ou `"55" + phone`;
      - linhas já existentes são ignoradas (`INSERT IGNORE`).
    - `listPendingIdsForQuizResponse(quizResponseId): Promise<string[]>`
    - `get(id): Promise<NotificationView | null>`
    - `tryLock(id, ttlMs): Promise<boolean>`
    - `markPartSent(id, partsSent: number): Promise<void>`
    - `markSent(id): Promise<void>`: limpa o lock.
    - `markFailure(id, d: { attempts; nextAttemptAt: Date | null; failed: boolean; error: LastError }): Promise<void>`: limpa o lock.
    - `listDue(now, limit): Promise<string[]>`
    - `reopen(id): Promise<boolean>` (mantém `parts_sent`); `reopenAllFailed(): Promise<number>`
  - **Agregado e helpers de teste:**
    - `type Repos = { submissions: SubmissionRepo; payments: PaymentRepo; notifications: NotificationRepo }`
    - `createMemoryRepos(): Repos`, em `tests/fakes/memory-repos.ts`, usando o relógio real.
    - `defineRepoContract(name: string, setup: () => Promise<Repos>): void`, em `tests/db/repos.contract.ts`, usando `describe`/`it` do Vitest.

- [ ] **Step 1: Escrever `lib/db/repos/types.ts`**

- [ ] **Step 2: Escrever o contrato (`tests/db/repos.contract.ts`)**

O helper `newSub(overrides)` gera um `NewSubmission` válido com `amount: "39.90"`, `todaySP: "2026-10-07"`, um CPF válido e um `submissionId` aleatório. O contrato tem um `it` por item:
1. **Criar:**
   - retorna um ref;
   - `payments.get` → `status "PENDING_ASAAS"`, `amount "39.90"`, `syncAttempts 0`, `patient` com os dados normalizados;
   - `listDue(new Date(), 20)` inclui a cobrança.
2. **Mesmo CPF, segundo envio** com nome e e-mail diferentes:
   - mesmo `patientId` e mesmo `paymentId` (reaproveitada);
   - `patient.name` e `email` atualizados.
3. **Mesmo `submissionId` duas vezes:** a segunda chamada → `"duplicate"`; `findBySubmissionId` devolve o ref da primeira.
4. **Review Focus 2:** `Promise.all` de dois `create` com o mesmo `submissionId` → exatamente um ref e um `"duplicate"`.
5. **Reaproveitamento:**
   - cobrança com `markSynced(status "PENDING", dueDate "2026-10-07")` → reaproveitada com `todaySP "2026-10-07"`;
   - com `dueDate "2026-10-06"` → nova cobrança;
   - `ASAAS_FAILED` → nova; `"RECEIVED"` → nova.
6. **Locks:**
   - `tryLock` → true; de novo → false; `unlock` → true outra vez;
   - **Review Focus 3:** `tryLock(id, 1)` e, após esperar 10 ms, `tryLock(id, 60000)` → true.
7. **Falhas e reabertura:**
   - `markSyncFailure(failed false, nextSyncAt +2 min)` → some de `listDue(agora)` e aparece em `listDue(agora + 3 min)`;
   - `failed true` → `status "ASAAS_FAILED"` e fora de `listDue`;
   - `reopen` → `PENDING_ASAAS`, `syncAttempts 0`, de volta em `listDue`;
   - `reopenAllFailed` retorna a contagem.
8. **Fila de notificações:**
   - dois envios ligados à mesma cobrança, depois `enqueuePaymentLink({ paymentId }, ["email", "whatsapp"])` duas vezes → 4 linhas;
   - `recipient` igual ao e-mail ou a `"55" + phone`;
   - `listPendingIdsForQuizResponse` → 2 por envio;
   - `enqueuePaymentLink({ quizResponseId }, ["email"])` de um terceiro envio cria só 1 linha.
9. **Notificação, ciclo de vida:**
   - `get` traz `patientName` e `paymentUrl` (depois de `markSynced`);
   - `markPartSent(id, 2)` → `partsSent 2`;
   - `markFailure(failed false)` seguido de `reopen` mantém `partsSent 2`;
   - `markSent` → fora de `listDue`.
10. **Review Focus 5:** nome `"Ana Souza 💚"` volta idêntico em `payments.get(...).patient.name` e em `notifications.get(...).patientName`.

- [ ] **Step 3: Rodar contra o fake (ainda inexistente) e ver falhar**

Crie `tests/db/repos.memory.test.ts` com `defineRepoContract("memory", async () => createMemoryRepos())`.
Run: `corepack pnpm vitest run tests/db/repos.memory.test.ts`
Expected: FAIL (`createMemoryRepos` inexistente).

- [ ] **Step 4: Implementar `tests/fakes/memory-repos.ts`**

Use `Map`s, um por tabela. O `create` é atômico porque é síncrono até o primeiro `await`: faça todas as checagens e escritas sem `await` no meio, para o caso 4 se comportar como o `UNIQUE` do MySQL.

- [ ] **Step 5: Rodar e ver passar**

Run: `corepack pnpm vitest run tests/db/repos.memory.test.ts`
Expected: PASS (todos os itens).

- [ ] **Step 6: Commit**

```bash
git add lib/db/repos/types.ts tests/fakes/memory-repos.ts tests/db
git commit -m "test: contrato dos repositórios e fake em memória"
```

---

### Task 9: Repositórios MySQL

**Files:**
- Create: `lib/db/repos/mysql.ts`
- Test: `tests/db/repos.mysql.test.ts`

**Interfaces:**
- Consumes: `Db`, `createDb` e `runMigrations` (Task 7); os tipos e o contrato (Task 8); `MAX_*` não é usado aqui.
- Produces: `createMysqlRepos(db: Db): Repos`.

Notas de implementação, que não estão no spec:
- **`create`:**
  - `db.transaction`;
  - upsert do paciente com `.onDuplicateKeyUpdate({ set: { name, email, phone, updatedAt } })`;
  - em seguida `SELECT … FROM patients WHERE cpf = ? FOR UPDATE`, que serializa envios do mesmo CPF;
  - o `first_quiz` é calculado contando as respostas do paciente antes do insert.
- **`"duplicate"`:** capture o erro com `errno === 1062` no insert de `quiz_responses`. Deixe a transação fazer rollback e retorne `"duplicate"` fora dela.
- **Locks:** `UPDATE … SET locked_until = DATE_ADD(NOW(3), INTERVAL ? MICROSECOND) WHERE id = ? AND (locked_until IS NULL OR locked_until < NOW(3))`, com `ttlMs * 1000`; o lock vale se `affectedRows === 1`.
- **Fila:** `enqueuePaymentLink` usa `db.insert(notifications).ignore().values([...])`.

- [ ] **Step 1: Escrever o teste**

`tests/db/repos.mysql.test.ts`:
- `describe.skipIf(!process.env.TEST_DATABASE_URL)`;
- `beforeAll`: `createDb(TEST_DATABASE_URL)` e `runMigrations` **duas vezes**, para provar a idempotência;
- `beforeEach`: `SET FOREIGN_KEY_CHECKS=0`, `TRUNCATE` das 4 tabelas e `SET FOREIGN_KEY_CHECKS=1`;
- `afterAll`: `pool.end()`;
- chama `defineRepoContract("mysql", async () => createMysqlRepos(db))`.

- [ ] **Step 2: Rodar e ver falhar**

É preciso um MySQL 8 de teste. Pode ser local ou um banco separado no Easypanel, criado com `CREATE DATABASE tami_forms_test CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`.
Run: `TEST_DATABASE_URL=mysql://… corepack pnpm vitest run tests/db/repos.mysql.test.ts`
Expected: FAIL (`createMysqlRepos` inexistente).

- [ ] **Step 3: Implementar `lib/db/repos/mysql.ts`**

- [ ] **Step 4: Rodar e ver passar**

Run: o mesmo comando do Step 2.
Expected: PASS em todos os itens do contrato.

Se não houver MySQL disponível, **pare e peça um `TEST_DATABASE_URL` à pessoa responsável**. Esta tarefa não fica concluída sem que o contrato rode contra o MySQL.

- [ ] **Step 5: Commit**

```bash
git add lib/db/repos/mysql.ts tests/db/repos.mysql.test.ts
git commit -m "feat: repositórios MySQL validados pelo contrato"
```

---

### Task 10: `sync-payment` e alerta ao admin

**Files:**
- Create: `lib/services/last-error.ts`, `lib/services/alert-admin.ts`, `lib/services/sync-payment.ts`, `tests/fakes/fake-asaas.ts`
- Test: `tests/lib/services/sync-payment.test.ts`, `tests/lib/services/alert-admin.test.ts`

**Interfaces:**
- Consumes:
  - `PaymentRepo`, `NotificationRepo`, `Channel` e `LastError` (Task 8);
  - `AsaasClient` (Task 5); `HttpError` (Task 4); `EmailSender` (Task 6);
  - `jobBackoffMs`, `MAX_PAYMENT_ATTEMPTS`, `todayInSaoPaulo`, `addDaysISO` e `Logger` (Task 3).
- Produces:
  - `toLastError(step: string, err: unknown, attempt: number, at: Date): LastError`: tira `httpStatus` e `responseBody` de um `HttpError`, truncando o corpo em 2048 caracteres.
  - **Alerta:**
    - `type AdminAlert = { kind: "payment" | "notification"; id: string; patientName: string; error: LastError }`
    - `type AlertAdmin = (a: AdminAlert) => Promise<void>`
    - `createAlertAdmin(d: { email: EmailSender; to: string; log: Logger }): AlertAdmin`: nunca lança; uma falha no envio vira `log.error`. Assunto: `"[tami-forms] Falha definitiva: {kind} {id}"`.
  - **Sync:**
    - `type SyncResult = { status: "synced"; paymentUrl: string } | { status: "busy" | "retry_scheduled" | "failed" | "not_found" }`
    - `type SyncPayment = (paymentId: string, opts: { deadline: number }) => Promise<SyncResult>`
    - `createSyncPayment(d: { payments: PaymentRepo; notifications: NotificationRepo; asaas: AsaasClient; alertAdmin: AlertAdmin; log: Logger; now: () => Date; config: { dueDays: number; successUrl: string; channels: Channel[] } }): SyncPayment`
  - **Dublê:** `createFakeAsaas()` retorna `AsaasClient & { calls: string[]; customers: Map; payments: Map; failNext(method: string, err: Error): void }`. O fake grava o que cria, para que as buscas o encontrem depois.

**Algoritmo** (§6). A ordem e as etapas (`step`) são decisões fixas:
1. `get`. Não existe → `not_found`.
2. Se o status ≠ `PENDING_ASAAS`: com `paymentUrl` → `synced`; sem → `failed`. Não chama o Asaas.
3. `tryLock(id, 120000)`. Falhou → `busy`.
4. Cliente: `asaas.find_customer`, depois `asaas.create_customer`, depois `setPatientAsaasCustomer`. Só roda se `patient.asaasCustomerId` for nulo.
5. Cobrança: `asaas.find_payment`, depois `asaas.create_payment`.
   - `dueDate = addDaysISO(todayInSaoPaulo(now()), dueDays)`;
   - `value = Number(amount)`;
   - `description = "Plano Alimentar Personalizado - {patient.name} - 30 dias"`;
   - `externalReference = payment.id`.
6. Sucesso: `markSynced`, depois `enqueuePaymentLink({ paymentId }, channels)` → `synced`.
7. Erro:
   - `attempts = syncAttempts + 1`;
   - `failed = (err instanceof HttpError && !err.transient) || attempts >= MAX_PAYMENT_ATTEMPTS`;
   - `markSyncFailure` com `nextSyncAt = failed ? null : now() + jobBackoffMs(attempts)`;
   - se `failed`, chama `alertAdmin({ kind: "payment", … })` e retorna `failed`; senão retorna `retry_scheduled`.

- [ ] **Step 1: Escrever os testes que falham**

Base: memory repos + fake Asaas, `now` fixo em `2026-10-07T15:00:00Z`, `dueDays 2`, `channels ["email", "whatsapp"]` e uma cobrança criada via `submissions.create`.
- **Feliz:**
  - resultado `{ status: "synced", paymentUrl }`;
  - `createPayment` recebeu `dueDate "2026-10-09"`, `value 39.9`, `description "Plano Alimentar Personalizado - Ana Souza - 30 dias"`, `externalReference` igual ao id da cobrança e `callback.successUrl`;
  - o paciente ficou com o `asaasCustomerId`;
  - há 2 notificações pendentes para o envio.
- **Cliente já existe no Asaas pelo CPF:** `calls` não contém `createCustomer`.
- **Paciente já tem `asaasCustomerId`:** `calls` não contém `findCustomerByCpf` nem `createCustomer`.
- **Timeout depois de criar:** a cobrança já existe no fake com esse `externalReference` → `calls` não contém `createPayment`; resultado `synced`.
- **503 transitório em `createPayment`:**
  - resultado `retry_scheduled`;
  - `syncAttempts 1`;
  - `listDue(now + 1 min)` não inclui a cobrança; `listDue(now + 2 min)` inclui;
  - `last_error.step === "asaas.create_payment"` e `httpStatus === 503`, verificados pelo `last_error` que o fake guarda;
  - `alertAdmin` não foi chamado;
  - `tryLock` funciona depois (o lock foi liberado).
- **400 permanente:**
  - resultado `failed`; status `ASAAS_FAILED`;
  - `alertAdmin` chamado 1 vez com `kind "payment"` e `error.httpStatus 400`.
- **8ª falha transitória** (cobrança preparada com `syncAttempts 7`): resultado `failed` e alerta.
- **Locked:** com `tryLock` feito antes → `busy`; `calls` vazio.
- **Já sincronizada:** `synced` com a mesma URL; `calls` vazio.
- **`ASAAS_FAILED`:** `failed`; `calls` vazio.
- **alert-admin:**
  - envia para `to` com o assunto exato;
  - quando o `EmailSender` lança, resolve sem lançar e chama `log.error`.

O fake de repositório precisa expor `last_error` para o teste do 503. Adicione `state` ao retorno de `createMemoryRepos` (somente leitura, só para testes).

- [ ] **Step 2: Rodar e ver falhar**

Run: `corepack pnpm vitest run tests/lib/services/sync-payment.test.ts tests/lib/services/alert-admin.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `last-error.ts`, `alert-admin.ts`, `sync-payment.ts` e `tests/fakes/fake-asaas.ts`**

- [ ] **Step 4: Rodar e ver passar**

Run: o mesmo comando do Step 2.
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/services tests/lib/services tests/fakes
git commit -m "feat: sync-payment idempotente com falha definitiva e alerta"
```

---

### Task 11: `dispatch-notification`

**Files:**
- Create: `lib/services/dispatch-notification.ts`
- Test: `tests/lib/services/dispatch-notification.test.ts`

**Interfaces:**
- Consumes:
  - `NotificationRepo` (Task 8);
  - `EmailSender`, `WhatsAppSender`, `renderPaymentLink`, `toWhatsAppParts` e `PAYMENT_LINK_TITLE` (Task 6);
  - `AlertAdmin` e `toLastError` (Task 10);
  - `jobBackoffMs` e `MAX_NOTIFICATION_ATTEMPTS` (Task 3).
- Produces:
  - `type DispatchResult = "sent" | "retry_scheduled" | "failed" | "busy" | "skipped"`
  - `type DispatchNotification = (id: string) => Promise<DispatchResult>`
  - `createDispatchNotification(d: { notifications: NotificationRepo; email: EmailSender; whatsapp: WhatsAppSender; alertAdmin: AlertAdmin; log: Logger; now: () => Date; sleep: (ms: number) => Promise<void> }): DispatchNotification`

**Algoritmo:**
1. `get`: inexistente ou status ≠ `pending` → `skipped`.
2. `tryLock(id, 120000)`: falhou → `busy`.
3. Sem `paymentUrl`: trate como erro de etapa `notify.{channel}` com a mensagem `"payment without url"`.
4. **email:** `send` (step `notify.email`) e depois `markSent`.
5. **whatsapp:**
   - calcula as partes com `toWhatsAppParts(PAYMENT_LINK_TITLE, html)`;
   - para `i` de `partsSent` até o fim: se `i > partsSent`, espera `sleep(3000)`; depois `sendText(recipient, parts[i])` e `markPartSent(id, i + 1)`;
   - ao final, `markSent`.
6. **Erro:**
   - `attempts + 1`;
   - `failed = (HttpError && !transient) || attempts >= MAX_NOTIFICATION_ATTEMPTS`;
   - `markFailure`; se `failed`, chama `alertAdmin({ kind: "notification", … })`.

- [ ] **Step 1: Escrever os testes que falham**

Base: memory repos com uma cobrança sincronizada e as notificações enfileiradas; `sleep` registra os ms; os senders são falsos e registram as chamadas.
- **email:** `send` recebe `{ to: "ana@gmail.com", subject: PAYMENT_LINK_TITLE }` com o link no `html` → `"sent"`.
- **whatsapp:** `sendText` chamado 3 vezes com `"5544991651250"`; sleeps `[3000, 3000]` → `"sent"`.
- **WhatsApp parcial:**
  - na 1ª execução, a parte 2 lança `HttpError` transitório → `"retry_scheduled"`, `partsSent 1`, `attempts 1`;
  - depois de `reopen` ou de avançar o relógio, a 2ª execução envia só as partes 2 e 3, e a parte 1 não é reenviada → `"sent"`.
- **5ª falha** (notificação com `attempts 4` e falha transitória) → `"failed"` e alerta com `kind "notification"`.
- **WhatsApp 400** → `"failed"` na hora, com alerta.
- **Já `sent`** → `"skipped"`. **Locked** → `"busy"`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `corepack pnpm vitest run tests/lib/services/dispatch-notification.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `lib/services/dispatch-notification.ts`**

- [ ] **Step 4: Rodar e ver passar**

Run: `corepack pnpm vitest run tests/lib/services/dispatch-notification.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/services/dispatch-notification.ts tests/lib/services/dispatch-notification.test.ts
git commit -m "feat: envio de notificações com retomada por parte"
```

---

### Task 12: `submit-quiz` (os 3 desfechos)

**Files:**
- Create: `lib/services/submit-quiz.ts`
- Test: `tests/lib/services/submit-quiz.test.ts`

**Interfaces:**
- Consumes:
  - `ParsedSubmission` (Task 2); `SubmissionRepo`, `PaymentRepo` e `NotificationRepo` (Task 8);
  - `SyncPayment` (Task 10); `todayInSaoPaulo` e `Logger` (Task 3).
- Produces:
  - `type SubmitResult = { kind: "link"; link: string; quizResponseId: string } | { kind: "pending"; quizResponseId: string } | { kind: "db_error" }`
  - `type SubmitQuiz = (input: ParsedSubmission) => Promise<SubmitResult>`
  - `createSubmitQuiz(d: { submissions: SubmissionRepo; payments: PaymentRepo; notifications: NotificationRepo; syncPayment: SyncPayment; log: Logger; now: () => Date; config: { amount: string; channels: Channel[]; requestBudgetMs: number /*20000*/ } }): SubmitQuiz`

**Algoritmo** (§5, passos 3 a 7):
1. **Ref:**
   - `findBySubmissionId`; se não houver, `create`;
   - se `create` devolver `"duplicate"`, faz `findBySubmissionId` de novo;
   - qualquer exceção nesta fase → `db_error`.
2. A partir daqui, qualquer exceção é logada e devolve `pending`, porque os dados já estão salvos e o job conclui.
3. `payments.get(ref.paymentId)`:
   - com `paymentUrl` → `enqueuePaymentLink({ quizResponseId }, channels)` e devolve `link`;
   - senão chama `syncPayment(paymentId, { deadline: now().getTime() + requestBudgetMs })`: `synced` → `link`; qualquer outro resultado → `pending`.

- [ ] **Step 1: Escrever os testes que falham**

Base: memory repos + `createSyncPayment` real com o fake Asaas (Task 10) e um `ParsedSubmission` válido.
- **Desfecho 1:** `{ kind: "link", link: <invoiceUrl do fake> }`.
- **Desfecho 2:** o fake falha toda chamada com 503 → `{ kind: "pending" }`; a cobrança continua `PENDING_ASAAS` e entra em `listDue(now + 2 min)`.
- **Desfecho 3:** `submissions.create` sobrescrito para lançar → `{ kind: "db_error" }`.
- **Mesmo `submissionId` duas vezes:** as duas → `link` com a mesma URL; o fake registra `createPayment` 1 vez; existe 1 `quiz_response`.
- **Review Focus 2:** `Promise.all` de 2 chamadas com o mesmo `submissionId` → nenhuma `db_error`; 1 `quiz_response`; `createPayment` 1 vez.
- **Cliente recorrente:**
  - 2º envio com `submissionId` novo e o mesmo CPF, depois do 1º sincronizado → `link` com a mesma URL;
  - nenhuma chamada nova ao Asaas;
  - `listPendingIdsForQuizResponse(novo)` tem 2 ids.
- **Exceção depois de gravar** (`payments.get` sobrescrito para lançar) → `pending`, não `db_error`.
- **Deadline:** um `syncPayment` espião recebe `deadline === now + 20000`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `corepack pnpm vitest run tests/lib/services/submit-quiz.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `lib/services/submit-quiz.ts`**

- [ ] **Step 4: Rodar e ver passar**

Run: `corepack pnpm vitest run tests/lib/services/submit-quiz.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/services/submit-quiz.ts tests/lib/services/submit-quiz.test.ts
git commit -m "feat: serviço de envio com os 3 desfechos e idempotência"
```

---

### Task 13: Job: rodada, retry e agendador

**Files:**
- Create: `lib/jobs/run-jobs.ts`, `lib/jobs/retry-failed.ts`, `lib/jobs/scheduler.ts`
- Test: `tests/lib/jobs/run-jobs.test.ts`, `tests/lib/jobs/retry-failed.test.ts`, `tests/lib/jobs/scheduler.test.ts`

**Interfaces:**
- Consumes: `PaymentRepo` e `NotificationRepo` (Task 8); `SyncPayment` (Task 10); `DispatchNotification` (Task 11); `Logger` (Task 3).
- Produces:
  - **Rodada:**
    - `type RunSummary = { payments: number; notifications: number; errors: number }`
    - `createRunJobs(d: { payments; notifications; syncPayment; dispatchNotification; log; now: () => Date; paymentDeadlineMs: number /*30000*/; limits: { payments: number /*20*/; notifications: number /*50*/ } }): () => Promise<RunSummary>`. Processa as cobranças primeiro e só depois lista as notificações, para que um link criado na mesma rodada já seja enviado. A exceção de um item é logada, conta em `errors` e não interrompe os demais.
  - **Retry:**
    - `type RetryTarget = { paymentId: string } | { notificationId: string } | { allFailed: true }`
    - `createRetryFailed(d: { payments; notifications }): (t: RetryTarget) => Promise<{ reopened: number }>`. Com `allFailed`, soma as duas reaberturas.
  - **Agendador:**
    - `createExclusiveRunner(fn: () => Promise<unknown>): () => Promise<"ran" | "skipped">`. Se já houver uma execução em andamento, devolve `"skipped"`.
    - `startScheduler(d: { run: () => Promise<unknown>; intervalMs: number; log: Logger }): { stop(): void }`

- [ ] **Step 1: Escrever os testes que falham**

- **run-jobs** (memory repos, fake Asaas, `createSyncPayment` e `createDispatchNotification` reais, senders falsos):
  - uma cobrança `PENDING_ASAAS` vencida → após uma rodada, a cobrança está sincronizada e as 2 notificações estão `sent`;
  - `RunSummary` = `{ payments: 1, notifications: 2, errors: 0 }`;
  - com um `syncPayment` que lança na 1ª cobrança de 2 → `errors 1`, e a 2ª foi processada.
- **retry-failed:**
  - `{ paymentId }` de uma `ASAAS_FAILED` → `{ reopened: 1 }` e a cobrança entra em `listDue`;
  - `{ allFailed: true }` com 1 cobrança e 1 notificação falhadas → `{ reopened: 2 }`.
- **scheduler:**
  - `createExclusiveRunner`: duas chamadas concorrentes com `fn` lento → `["ran", "skipped"]`;
  - `startScheduler` com `vi.useFakeTimers()` e `intervalMs 120000`: avançar 120 000 → `run` chamado 1 vez; avançar mais 120 000 → 2 vezes; após `stop()` e mais 120 000 → continua 2.

- [ ] **Step 2: Rodar e ver falhar**

Run: `corepack pnpm vitest run tests/lib/jobs`
Expected: FAIL nos três arquivos novos.

- [ ] **Step 3: Implementar os três módulos**

- [ ] **Step 4: Rodar e ver passar**

Run: `corepack pnpm vitest run tests/lib/jobs`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/jobs tests/lib/jobs
git commit -m "feat: rodada do job, reabertura de falhas e agendador"
```

---

### Task 14: Handlers HTTP, container, rotas e boot

**Files:**
- Create:
  - `lib/http/read-json.ts`, `lib/http/handlers/submit-quiz.ts`, `lib/http/handlers/jobs.ts`, `lib/http/handlers/health.ts`
  - `lib/container.ts`, `lib/boot.ts`, `instrumentation.ts`
  - `app/api/jobs/run/route.ts`, `app/api/jobs/retry/route.ts`, `app/api/health/route.ts`
- Modify: `app/api/submit-quiz/route.ts` (substituição completa)
- Test: `tests/lib/http/handlers.test.ts`

**Interfaces:**
- Consumes: tudo das Tasks 1 a 13.
- Produces:
  - `readJsonBody(req: Request, maxBytes: number): Promise<{ ok: true; value: unknown } | { ok: false; status: 400 | 413 }>`
  - **Handlers:**
    - `createSubmitQuizHandler(d: { submitQuiz: SubmitQuiz; dispatchForQuizResponse: (quizResponseId: string) => Promise<void>; rateLimiter: { hit(k: string): boolean }; defer: (fn: () => Promise<void>) => void; log: Logger }): (req: Request) => Promise<Response>`. A chave do rate limit é o primeiro IP de `x-forwarded-for`, ou `"unknown"`.
    - `createJobsRunHandler(d: { token: string; runner: () => Promise<"ran" | "skipped"> }): (req: Request) => Promise<Response>`
    - `createJobsRetryHandler(d: { token: string; retryFailed; runner; defer }): (req: Request) => Promise<Response>`
    - `createHealthHandler(d: { ping: () => Promise<void> }): () => Promise<Response>`
  - **Container e boot:**
    - `getContainer()`: singleton com `env`, `log`, `repos` (MySQL), `asaas`, `email`, `whatsapp`, `submitQuiz`, `syncPayment`, `dispatchNotification`, `dispatchForQuizResponse`, `runner` (exclusivo sobre `runJobs`), `retryFailed`, `rateLimiter` e `ping`.
    - `channels`: `["email", "whatsapp"]`, filtrado por `NOTIFY_*_ENABLED`.
    - `boot(): Promise<void>`:
      - roda `getEnv()` e `runMigrations(getDb())`;
      - se `JOBS_ENABLED`, chama `startScheduler({ run: runner, intervalMs: 120000 })`, uma vez só, com a guarda `globalThis.__tamiFormsScheduler`;
      - qualquer erro → `log.error("boot.failed", …)` e `process.exit(1)`.
  - **Respostas HTTP:**

    | situação | status | corpo |
    |---|---|---|
    | submit, link | 200 | `{ sucesso: true, linkPagamento }` |
    | submit, pending | 200 | `{ sucesso: true }` |
    | submit, db_error | 500 | `{ sucesso: false, mensagemErro: MENSAGEM_ERRO_PADRAO }` |
    | submit, JSON inválido / validação | 400 | idem |
    | submit, corpo > 64 KB | 413 | idem |
    | submit, rate limit | 429 | idem |
    | jobs, sem token válido | 401 | `{ ok: false }` |
    | jobs/run | 200 | `{ ok: true, resultado: "ran" \| "skipped" }` |
    | jobs/retry, corpo inválido | 400 | `{ ok: false }` |
    | jobs/retry | 200 | `{ ok: true, reopened }`, e um `defer(runner)` |
    | health | 200 / 503 | `{ ok: true }` / `{ ok: false }` |

- [ ] **Step 1: Escrever o teste que falha**

`tests/lib/http/handlers.test.ts`, com dependências falsas:
- **Submit, respostas por caso:**
  - corpo `"{"` → 400 com a mensagem padrão;
  - string de 70 000 bytes → 413;
  - CPF inválido → 400;
  - 6ª requisição do mesmo IP com um limiter real (limit 5) → 429.
- **Submit, resultado do serviço:**
  - `link` → 200 `{ sucesso: true, linkPagamento }`, e `defer` recebeu uma função que, ao rodar, chama `dispatchForQuizResponse(quizResponseId)`;
  - `pending` → 200, com o corpo exatamente igual a `{ sucesso: true }` (sem a chave `linkPagamento`);
  - `db_error` → 500, e `defer` não foi chamado.
- **jobs/run:** sem header → 401; com `Bearer <token>` → 200 `{ ok: true, resultado: "ran" }`.
- **jobs/retry:**
  - corpo `{}` → 400;
  - `{ paymentId: "x" }` → 200 `{ ok: true, reopened: 1 }`; `retryFailed` recebeu `{ paymentId: "x" }`; `defer` chamado.
- **health:** `ping` ok → 200 `{ ok: true }`; `ping` lança → 503 `{ ok: false }`.

- [ ] **Step 2: Rodar e ver falhar**

Run: `corepack pnpm vitest run tests/lib/http/handlers.test.ts`
Expected: FAIL.

- [ ] **Step 3: Implementar `read-json.ts` e os três arquivos de handlers**

- [ ] **Step 4: Rodar e ver passar**

Run: `corepack pnpm vitest run tests/lib/http/handlers.test.ts`
Expected: PASS.

- [ ] **Step 5: Escrever `lib/container.ts`, `lib/boot.ts`, `instrumentation.ts` e as quatro rotas**

- Cada `route.ts` só exporta `runtime`, `dynamic` e `POST` ou `GET`, que delegam ao handler montado com `getContainer()` na hora da chamada.
- No submit, `defer` é o `after` de `next/server`.
- O `instrumentation.ts` exporta `register()`, que só age quando `process.env.NEXT_RUNTIME === "nodejs"` e faz `await import("./lib/boot")` antes de chamar `boot()`.

- [ ] **Step 6: Verificar typecheck, testes e build**

Run: `corepack pnpm typecheck && corepack pnpm test && corepack pnpm build`
Expected:
- typecheck só com os 3 erros pré-existentes de `app/page.tsx`;
- testes PASS (os do MySQL ficam *skipped* sem `TEST_DATABASE_URL`);
- build termina **sem env configurada** (prova de que a leitura é lazy).

- [ ] **Step 7: Smoke test local (se houver MySQL)**

1. Crie um `.env.local` com `ASAAS_ENV=sandbox` e a chave do sandbox, e rode `corepack pnpm dev`.
2. `curl localhost:5000/api/health` → `{"ok":true}`.
3. `curl -X POST localhost:5000/api/submit-quiz -H 'content-type: application/json' -d '{"submissionId":"<uuid>","answers":{"nome_completo":"Ana Teste","email":"<seu e-mail>","whatsapp":"<seu número>","cpf":"529.982.247-25"}}'` → `{"sucesso":true,"linkPagamento":"https://sandbox.asaas.com/i/…"}`.
4. Repetir o mesmo comando → mesmo link, e nenhuma cobrança nova no painel do sandbox.

- [ ] **Step 8: Commit**

```bash
git add lib/http lib/container.ts lib/boot.ts instrumentation.ts app/api tests/lib/http/handlers.test.ts
git commit -m "feat: rotas da API, container e boot com migrations e agendador"
```

---

### Task 15: Front: `loading-screen` passa a usar a API

**Files:**
- Modify: `components/loading-screen.tsx:23-87` (`submitToWebhook`), `components/loading-screen.tsx:150` e `:156` (atrasos), `app/page.tsx:734`, `:844` e `:900` (anotações de tipo)

**Interfaces:**
- Consumes: o contrato HTTP do `POST /api/submit-quiz` (Task 14).

Mudanças (§9). Nenhum JSX, classe CSS ou texto muda:
1. `const submissionIdRef = useRef(crypto.randomUUID())`, criado no corpo do componente. Ao remontar, um id novo é gerado.
2. Em `submitToWebhook`:
   - remover as URLs do n8n, a detecção de `"test"` e o bloco `if (!WEBHOOK_URL_NOVO_FORMULARIO)`;
   - chamar `sessionStorage.removeItem("linkPagamento")` antes do fetch;
   - fazer `fetch("/api/submit-quiz", { method: "POST", headers, body: JSON.stringify({ submissionId: submissionIdRef.current, answers }), signal: AbortSignal.timeout(30000) })`;
   - manter o tratamento da resposta como está (`sucesso`, `linkPagamento`, `mensagemErro`) e o `catch`, que já cobre o timeout;
   - remover o `console.log` com a URL.
3. `startProgressAnimation(16000, 12000)` → `(16000, 0)`; no `handleRetry`, `(8000, 3000)` → `(8000, 0)`.
4. Em `app/page.tsx`, anotar `(item: string)` nos três `.filter((item) => …)` apontados pelo typecheck. Não muda nada em tempo de execução.

- [ ] **Step 1: Aplicar as mudanças 1 a 4**

- [ ] **Step 2: Verificar typecheck e build**

Run: `corepack pnpm typecheck && corepack pnpm build`
Expected: typecheck com **0 erros**; build ok.

- [ ] **Step 3: Conferir que nada visual mudou**

Run: `git diff --stat components/loading-screen.tsx app/page.tsx && git diff app/page.tsx`
Expected:
- o diff de `app/page.tsx` tem só as 3 anotações de tipo;
- o diff de `loading-screen.tsx` não toca em nada a partir do `return (` do componente (o JSX).

- [ ] **Step 4: Verificação manual (com o smoke da Task 14 rodando)**

Abra `localhost:5000` e use o atalho de dados de teste (`app/page.tsx:78-103`), ou preencha o quiz até a etapa 27:
- a barra leva cerca de 16 s;
- no fim, o botão leva ao link do sandbox.

Depois, pare o MySQL e repita: a tela de erro aparece, e o "Tentar novamente" funciona quando o MySQL volta, sem duplicar nada no banco.

- [ ] **Step 5: Commit**

```bash
git add components/loading-screen.tsx app/page.tsx
git commit -m "feat(front): envio para /api/submit-quiz com submissionId e timeout"
```

---

### Task 16: Limpeza, README e verificação final

**Files:**
- Delete: `lib/supabase/client.ts`, `lib/supabase/server.ts`, `lib/config.ts`, `Dockerfile`, `.dockerignore`, `.github/workflows/docker-publish.yml`, `configEasypanel.md`
- Modify: `package.json` (remover deps), `next.config.mjs`, `README.md`, `.env.example`

- [ ] **Step 1: Remover os arquivos e as dependências**

```bash
git rm lib/supabase/client.ts lib/supabase/server.ts lib/config.ts Dockerfile .dockerignore .github/workflows/docker-publish.yml configEasypanel.md
corepack pnpm remove @supabase/ssr @supabase/supabase-js @aws-sdk/client-ssm
```

- [ ] **Step 2: Ajustar o `next.config.mjs`**

- Remover `output: 'standalone'`: só servia para a imagem Docker, e o Easypanel vai rodar `next start`, que não usa essa saída.
- Remover `typescript.ignoreBuildErrors`: o typecheck agora tem 0 erros, e erros de tipo devem quebrar o build.

- [ ] **Step 3: Reescrever o `README.md`**

Seções:
1. O que é o projeto.
2. Requisitos: Node 24 e pnpm via corepack.
3. Setup local: `corepack pnpm install`, `.env.local` a partir do `.env.example` e criação do banco com `CREATE DATABASE … CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci`.
4. Variáveis de ambiente: a tabela de §10.
5. Deploy no Easypanel:
   - app a partir do GitHub;
   - build `pnpm build`, start `pnpm start` (porta 5000);
   - serviço MySQL 8;
   - health check em `/api/health`;
   - as migrations rodam sozinhas no boot.
6. Operação:
   - `curl` de `/api/jobs/run` e `/api/jobs/retry` (os três formatos de corpo);
   - consultas SQL para listar `ASAAS_FAILED` e notificações `failed` com o `last_error`.
7. Testes: `pnpm test` e `TEST_DATABASE_URL` para os testes de MySQL.
8. Roteiro manual no sandbox, com os itens de §13.
9. Nota sobre a Evolution API: o corpo `{ number, text }` é o da v2. Confirme a versão da sua instância no primeiro teste.
10. Lembrete de gerar uma nova chave de produção do Asaas.

- [ ] **Step 4: Verificação final**

Run:
```bash
corepack pnpm typecheck && corepack pnpm test && corepack pnpm build
git grep -n -i -E "n8n|supabase|easypanel.host|aact_" -- . ':!docs' ':!pnpm-lock.yaml'
```
Expected:
- typecheck com 0 erros; testes PASS; build ok;
- o `git grep` não retorna nada.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: remove Supabase, AWS SSM e Docker; README de deploy no Easypanel"
```

- [ ] **Step 6: Roteiro no sandbox do Asaas, com a pessoa responsável**

Execute o roteiro de §13 num deploy de teste no Easypanel, com `ASAAS_ENV=sandbox`:
- desfecho 1;
- desfecho 2: chave inválida, depois corrigir a env e esperar o job, ou chamar `/api/jobs/run`;
- desfecho 3: MySQL parado;
- retry da tela de erro;
- recebimento do e-mail e do WhatsApp;
- alerta de falha definitiva com `/api/jobs/retry`.

Registre o resultado de cada item na descrição do PR.
