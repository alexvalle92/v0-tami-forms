# Webhook do Asaas, plano alimentar por IA e primeiro acesso: plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Receber o webhook de pagamento do Asaas e, a partir dele, gerar o plano alimentar por IA, gravá-lo, criar a senha de acesso ao PlanA (só para quem não tem) e enviar os dados de acesso por e-mail e WhatsApp, sem n8n.

**Architecture:**
- A rota do webhook valida o token, grava o evento e seus efeitos em uma transação e responde 200. A geração do plano roda depois da resposta (`after()`).
- O que falhar ou ficar pendente é repetido pelo job interno de 2 minutos, com o mesmo padrão de lock, backoff, alerta e reabertura das cobranças e notificações.
- A fila de trabalho é a tabela `plan_generations`. A tabela `meal_plans` só recebe plano pronto, no formato que o PlanA lê.
- A IA fica atrás da interface `MealPlanGenerator`; só `lib/meal-plan/anthropic-generator.ts` conhece o SDK.

**Tech Stack:** Next.js 16 (route handlers, `after()`), TypeScript, Drizzle ORM + `mysql2`, zod 3, `@anthropic-ai/sdk`, `node:crypto` (HMAC, scrypt), nodemailer, Vitest.

**Spec:** [docs/superpowers/specs/2026-10-11-webhook-asaas-plano-alimentar-design.md](../specs/2026-10-11-webhook-asaas-plano-alimentar-design.md). Leia o spec inteiro antes de começar qualquer tarefa. Este plano referencia as seções dele (§N) e não repete o que já está lá.

## Global Constraints

- Gerenciador de pacotes: **pnpm 9.15.0**, sempre como `corepack pnpm …`. Node 24. Um teste: `corepack pnpm vitest run <arquivo>`.
- Siga os padrões do código existente: fábricas `createX(d)` com dependências por parâmetro, comentários em português, sem ponto e vírgula, relógio da aplicação (`now`) em vez do relógio do banco, todo `UPDATE` define `updatedAt`.
- **Nenhuma mudança no front** (`app/page.tsx`, `components/`, páginas) e **nenhuma mudança no repositório `../dieta-app`**.
- Rotas de API: `export const runtime = "nodejs"` e `export const dynamic = "force-dynamic"`. Leitura de env sempre lazy (`getEnv()` na hora do uso), para o `next build` rodar sem env.
- Variáveis novas, exatamente as de §10: `ASAAS_WEBHOOK_TOKEN`, `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `ACCESS_PASSWORD_SECRET`, `PLANA_APP_URL`.
- Valores fixos:
  - corpo máximo do webhook: 256 KB;
  - lock da geração: 300 000 ms; no máximo 5 tentativas; até 3 gerações por rodada do job;
  - IA: `max_tokens` 16000, `effort` `"high"`, tempo limite 120 000 ms, `maxRetries` 1;
  - validade do plano: 30 dias;
  - pisos: 1200 kcal (Feminino) e 1500 kcal (Masculino); déficit 770 kcal; fator de atividade 1,2;
  - tolerâncias: soma das refeições a até 10% do total; total entre `max(piso, 85% da meta)` e `115% da meta`;
  - senha temporária: 10 caracteres do alfabeto `23456789ABCDEFGHJKLMNPQRSTUVWXYZ`;
  - scrypt: `N` 16384, `r` 8, `p` 1, salt de 16 bytes, hash de 32 bytes.
- Nunca vão para log, `last_error` ou e-mail ao admin: respostas do quiz, conteúdo do plano, senha temporária, token do webhook, chaves de API (§12).
- Os testes de MySQL só rodam com `TEST_DATABASE_URL` apontando para um banco descartável. **Nunca use o `DATABASE_URL` do `.env.local`:** esses testes apagam as tabelas.
- Nenhum teste chama a API real da Anthropic nem o Asaas.
- Toda mensagem de commit termina com a linha `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Respostas do quiz com texto arbitrário.** `answers` aceita qualquer JSON vindo da internet. Um campo com milhares de caracteres, com instruções para a IA ou com objeto aninhado não pode chegar inteiro ao prompt: cada campo é reduzido a texto de até 200 caracteres. Teste na Task 4.
2. **Peso e altura em formato inesperado** (`"70,5"`, `"165 cm"`, vazio, `"abc"`, fora da faixa): vírgula decimal e sufixo são aceitos; o resto vira falha definitiva com alerta, nunca um plano com meta absurda. Testes nas Tasks 4 e 11.
3. **Dois eventos do mesmo pagamento chegando ao mesmo tempo** (`CONFIRMED` e `RECEIVED`, ou o mesmo evento duas vezes): uma geração só, nenhuma resposta 500. Teste na Task 8 (contrato, que também roda no MySQL).
4. **Duas gerações do mesmo paciente terminando juntas** (duas cobranças pagas): o paciente fica com exatamente um plano `active` e uma única credencial. Teste na Task 9.
5. **Senha trocada entre o enfileiramento e o envio,** inclusive pelo PlanA em outro formato de hash (SHA-512): a mensagem não pode levar uma senha temporária que já não vale. Teste na Task 12.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `lib/env.ts`, `.env.example` | variáveis novas |
| `lib/db/schema.ts`, `lib/db/migrations/0001_*.sql` | colunas e tabelas de §4 |
| `lib/db/repos/types.ts` | contratos `WebhookRepo`, `PlanGenerationRepo`, `MealPlanRepo` e visões |
| `lib/db/repos/mysql.ts`, `tests/fakes/memory-repos.ts` | as duas implementações dos contratos |
| `lib/asaas/webhook-event.ts` | leitura e classificação do evento |
| `lib/meal-plan/answers.ts` | os 17 campos do quiz, normalizados |
| `lib/meal-plan/targets.ts` | TMB, GET, meta calórica, proteína |
| `lib/meal-plan/plan.ts` | schema do plano gerado, validação, conversão para `plan_data` |
| `lib/meal-plan/prompt.ts` | prompt de sistema e mensagem do usuário |
| `lib/meal-plan/generator.ts` | interface do gerador e erro de domínio |
| `lib/meal-plan/anthropic-generator.ts` | chamada ao SDK da Anthropic |
| `lib/access/temp-password.ts`, `lib/access/password-hash.ts` | senha temporária e scrypt |
| `lib/services/generate-plan.ts` | processa uma geração; `runPlanGeneration` |
| `lib/services/handle-asaas-event.ts` | aplica um evento e diz o que fazer depois |
| `lib/services/alert-admin.ts` | alerta de falha de plano; avisos de reversão |
| `lib/http/handlers/asaas-webhook.ts`, `app/api/webhooks/asaas/route.ts` | HTTP do webhook |
| `lib/notify/templates.ts`, `lib/services/dispatch-notification.ts` | textos e envio de `plan_ready` |
| `lib/jobs/*`, `lib/http/handlers/jobs.ts` | etapa de planos no job e reabertura |
| `lib/container.ts`, `README.md` | ligação final e documentação |

---

### Task 1: Variáveis de ambiente e SDK

**Files:**
- Modify: `lib/env.ts`, `.env.example`, `package.json`, `pnpm-lock.yaml`
- Test: `tests/lib/env.test.ts`

**Interfaces:**
- Produces: `Env` com `ASAAS_WEBHOOK_TOKEN: string`, `ANTHROPIC_API_KEY: string`, `ANTHROPIC_MODEL: string`, `ACCESS_PASSWORD_SECRET: string`, `PLANA_APP_URL: string`.

- [ ] **Step 1: Escreva os testes que falham.** Acrescente ao objeto `valid` do arquivo de teste `ASAAS_WEBHOOK_TOKEN: "w".repeat(32)`, `ANTHROPIC_API_KEY: "sk-ant-test"` e `ACCESS_PASSWORD_SECRET: "p".repeat(32)`, e adicione:

```ts
it("aplica os defaults das variáveis novas", () => {
  const env = parseEnv(valid)
  expect(env.ANTHROPIC_MODEL).toBe("claude-opus-5-5")
  expect(env.PLANA_APP_URL).toBe("https://plana.nutritamilivalle.com.br/")
})
it.each(["ASAAS_WEBHOOK_TOKEN", "ACCESS_PASSWORD_SECRET"])("%s com menos de 32 caracteres é inválida", (name) => {
  expect(() => parseEnv({ ...valid, [name]: "x".repeat(31) })).toThrow(name)
})
it("ANTHROPIC_API_KEY ausente é inválida", () => {
  expect(() => parseEnv({ ...valid, ANTHROPIC_API_KEY: undefined })).toThrow("ANTHROPIC_API_KEY")
})
it("PLANA_APP_URL precisa ser URL", () => {
  expect(() => parseEnv({ ...valid, PLANA_APP_URL: "nao-e-url" })).toThrow("PLANA_APP_URL")
})
```

- [ ] **Step 2: Rode e veja falhar.** `corepack pnpm vitest run tests/lib/env.test.ts` → FAIL nos testes novos.
- [ ] **Step 3: Acrescente as cinco variáveis ao `envSchema`** em `lib/env.ts`, com os mínimos e defaults dos testes.
- [ ] **Step 4: Atualize `.env.example`** com as cinco variáveis, em blocos comentados como os existentes ("Webhook do Asaas", "IA (Anthropic)", "Acesso ao PlanA"), sem valores reais.
- [ ] **Step 5: Instale o SDK.** `corepack pnpm add @anthropic-ai/sdk@^0.133.0`.
- [ ] **Step 6: Rode os testes.** `corepack pnpm vitest run tests/lib/env.test.ts` → PASS. `corepack pnpm typecheck` → sem erros.
- [ ] **Step 7: Commit.** `chore: variáveis do webhook, da IA e do acesso; SDK da Anthropic`

---

### Task 2: Schema e migration

**Files:**
- Modify: `lib/db/schema.ts`, `tests/db/repos.mysql.test.ts`
- Create: `lib/db/migrations/0001_*.sql` e metadados (gerados)

**Interfaces:**
- Produces: tabelas Drizzle `asaasWebhookEvents`, `planGenerations`, `mealPlans`; colunas novas em `payments` (`paidAt`, `paymentDate`, `lastEvent`) e `patients` (`passwordHash`, `mustChangePassword`, `passwordSetAt`).

- [ ] **Step 1: Escreva o schema** exatamente como as tabelas de §4, com os helpers `dateTime`, `createdAt` e `updatedAt` já existentes. Decisões que §4 não fixa:
  - `payments.paymentDate` e as datas de `meal_plans`: `date(..., { mode: "string" })`.
  - `patients.mustChangePassword`: `boolean().notNull().default(false)`.
  - `asaasWebhookEvents`: `id varchar(128)` como chave primária; `outcome` `mysqlEnum(["processed", "ignored"])`; sem `updated_at` (linha nunca muda).
  - `planGenerations.status`: `mysqlEnum(["pending", "done", "failed"])`; `uniqueIndex("plan_generations_payment_id_unique")`; `index("plan_generations_status_next_attempt_at_idx")`.
  - `mealPlans`: `status varchar(32) notNull default "active"`; `planData json notNull`; `uniqueIndex("meal_plans_payment_id_unique")`; `index("meal_plans_patient_id_status_idx")`.
- [ ] **Step 2: Gere a migration.** `corepack pnpm db:generate`. Confira o SQL gerado: só `ALTER TABLE … ADD` e `CREATE TABLE`, nenhum `DROP` nem alteração de coluna existente.
- [ ] **Step 3: Atualize `tests/db/repos.mysql.test.ts`:**
  - lista do `TRUNCATE`: `["notifications", "plan_generations", "meal_plans", "asaas_webhook_events", "quiz_responses", "payments", "patients"]`;
  - teste de idempotência: tabelas esperadas `["__drizzle_migrations", "asaas_webhook_events", "meal_plans", "notifications", "patients", "payments", "plan_generations", "quiz_responses"]`, contagem de migrations `2`, e o título passa a dizer "7 tabelas".
- [ ] **Step 4: Verifique.** `corepack pnpm typecheck` → sem erros. `corepack pnpm vitest run tests/db` → PASS (o arquivo de MySQL é pulado sem `TEST_DATABASE_URL`; com ela, deve passar).
- [ ] **Step 5: Commit.** `feat: schema e migration de eventos do Asaas, gerações e planos alimentares`

---

### Task 3: Evento do Asaas: leitura e classificação

**Files:**
- Create: `lib/asaas/webhook-event.ts`
- Modify: `lib/db/repos/types.ts` (só os dois tipos abaixo)
- Test: `tests/lib/asaas/webhook-event.test.ts`

**Interfaces:**
- Produces, em `lib/db/repos/types.ts`:

```ts
export type PaymentEventGroup = "paid" | "reversal" | "pre_payment" | "other"
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
```

- Produces, em `lib/asaas/webhook-event.ts`: `parseAsaasEvent(body: unknown): PaymentEventInput | null`.

- [ ] **Step 1: Escreva os testes que falham.** Use como base o JSON de exemplo de §5.

```ts
it("lê o evento de exemplo", () => {
  expect(parseAsaasEvent(example)).toEqual({
    eventId: "evt_05b708f961d739ea7eba7e4db318f621&368604920", event: "PAYMENT_RECEIVED", group: "paid",
    asaasPaymentId: "pay_080225913252", externalReference: REF, status: "RECEIVED",
    billingType: "PIX", invoiceNumber: "00005101", paymentDate: "2026-10-11",
  })
})
it.each(["PAYMENT_CONFIRMED", "PAYMENT_RECEIVED"])("%s é do grupo paid", …)
it.each(["PAYMENT_REFUNDED", "PAYMENT_PARTIALLY_REFUNDED", "PAYMENT_REFUND_IN_PROGRESS", "PAYMENT_CHARGEBACK_REQUESTED",
  "PAYMENT_CHARGEBACK_DISPUTE", "PAYMENT_AWAITING_CHARGEBACK_REVERSAL", "PAYMENT_RECEIVED_IN_CASH_UNDONE"])("%s é reversal", …)
it.each(["PAYMENT_OVERDUE", "PAYMENT_DELETED", "PAYMENT_RESTORED"])("%s é pre_payment", …)
it("PAYMENT_CREATED e eventos que não são de cobrança são other", …) // INVOICE_CREATED sem `payment` → campos da cobrança nulos
it("PAYMENT_DELETED sempre tem status DELETED", …)                   // mesmo com payment.status "PENDING"
it("data: clientPaymentDate, senão paymentDate, senão confirmedDate; formato inválido vira null", …)
it("ignora campos desconhecidos", …)                                 // creditCard, split, account
it.each([null, "texto", 42, [], {}, { id: "evt_1" }, { event: "PAYMENT_RECEIVED" },
  { id: "x".repeat(129), event: "PAYMENT_RECEIVED", payment: { id: "pay_1" } },
  { id: "evt_1", event: "PAYMENT_RECEIVED" },                        // evento de cobrança sem `payment`
  { id: "evt_1", event: "PAYMENT_RECEIVED", payment: { status: "RECEIVED" } }])("corpo inválido %j → null", …)
```

- [ ] **Step 2: Rode e veja falhar.** `corepack pnpm vitest run tests/lib/asaas/webhook-event.test.ts` → FAIL (módulo inexistente).
- [ ] **Step 3: Implemente `parseAsaasEvent`** com zod (`.passthrough()` nos objetos). Regras além dos testes: `event` com até 64 caracteres; evento que começa com `PAYMENT_` exige `payment.id` texto não vazio; `externalReference`, `billingType` e `invoiceNumber` ausentes ou não textuais viram `null`; datas só no formato `YYYY-MM-DD`.
- [ ] **Step 4: Rode os testes.** → PASS.
- [ ] **Step 5: Commit.** `feat: leitura e classificação do evento de cobrança do Asaas`

---

### Task 4: Respostas do quiz e metas nutricionais

**Files:**
- Create: `lib/meal-plan/answers.ts`, `lib/meal-plan/targets.ts`
- Test: `tests/lib/meal-plan/answers.test.ts`, `tests/lib/meal-plan/targets.test.ts`

**Interfaces:**
- Produces:

```ts
// answers.ts
export type AgeRange = "18-24 anos" | "25-34 anos" | "35-44 anos" | "45-59 anos"
export type Sex = "Masculino" | "Feminino"
export type PlanAnswers = {
  faixaEtaria: AgeRange
  sexo: Sex
  alturaCm: number
  pesoKg: number
  /** Os 17 campos, na ordem de ANSWER_FIELDS, prontos para o prompt. */
  fields: { label: string; value: string }[]
}
export const ANSWER_FIELDS: readonly { key: string; label: string }[]
export function parsePlanAnswers(answers: Record<string, unknown>): { ok: true; value: PlanAnswers } | { ok: false; issues: string[] }

// targets.ts
export const CALORIE_FLOOR = { Feminino: 1200, Masculino: 1500 } as const
export const DAILY_DEFICIT_KCAL = 770
export const ACTIVITY_FACTOR = 1.2
export type Targets = { age: number; tmb: number; get: number; calories: number; calorieFloor: number; proteinMinG: number; proteinMaxG: number }
export function computeTargets(a: Pick<PlanAnswers, "faixaEtaria" | "sexo" | "alturaCm" | "pesoKg">): Targets
```

- `ANSWER_FIELDS`, nesta ordem (chave → rótulo, os do fluxo n8n):

| chave | rótulo |
|---|---|
| `faixa_etaria` | Faixa etária |
| `sexo_biologico` | Sexo biológico |
| `tipo_fisico` | Tipo físico atual |
| `peso_comportamento` | Comportamento do peso ao longo do tempo |
| `breakfast_foods` | Café da manhã |
| `almoco` | Almoço |
| `lanche_tarde` | Lanche da tarde |
| `jantar` | Jantar |
| `sobremesa` | Sobremesa |
| `rotina_dia` | Rotina diária |
| `sono` | Horas de sono por dia |
| `agua` | Consumo médio de água por dia |
| `habitos` | Hábitos Alimentares |
| `altura_cm` | Altura em centímetros |
| `peso_kg` | Peso atual |
| `imc` | IMC atual |
| `meta_peso_30d` | Meta de peso |

- [ ] **Step 1: Escreva os testes de `answers` que falham.**

```ts
const raw = { faixa_etaria: "25-34 anos", sexo_biologico: "Feminino", tipo_fisico: "Gordinho(a)",
  breakfast_foods: ["Pão francês", "Café com leite"], altura_cm: "165", peso_kg: "75", imc: "27.55",
  nome_completo: "Ana Souza", cpf: "52998224725", email: "ana@example.com", whatsapp: "44991651250" }

it("normaliza os campos de cálculo", …)            // alturaCm 165, pesoKg 75, faixaEtaria, sexo
it("devolve os 17 campos na ordem de ANSWER_FIELDS", …) // fields.map(f => f.label) igual aos rótulos da tabela
it("lista vira texto separado por vírgula", …)     // "Pão francês, Café com leite"
it("campo ausente, vazio, objeto ou lista vazia vira 'não informado'", …)
it("texto longo é cortado em 200 caracteres e quebras de linha viram espaço", …)
it("nenhum valor de fields contém nome, CPF, e-mail ou telefone", …)
it.each([["70,5", 70.5], ["165 cm", 165], [80, 80]])("número %j → %d", …)
it.each([
  [{ faixa_etaria: "60+ anos" }, "faixa_etaria"], [{ sexo_biologico: "Outro" }, "sexo_biologico"],
  [{ altura_cm: "abc" }, "altura_cm"], [{ altura_cm: "119" }, "altura_cm"], [{ altura_cm: "231" }, "altura_cm"],
  [{ peso_kg: "" }, "peso_kg"], [{ peso_kg: "29" }, "peso_kg"], [{ peso_kg: "301" }, "peso_kg"],
])("inválido %j → issue %s, sem ecoar o valor", …) // issues só com nomes de campo
```

- [ ] **Step 2: Escreva os testes de `targets` que falham.**

```ts
it("mulher, 25-34, 165 cm, 75 kg: meta cai no piso", () => {
  expect(computeTargets({ faixaEtaria: "25-34 anos", sexo: "Feminino", alturaCm: 165, pesoKg: 75 }))
    .toEqual({ age: 30, tmb: 1537, get: 1845, calories: 1200, calorieFloor: 1200, proteinMinG: 113, proteinMaxG: 150 })
})
it("homem, 35-44, 180 cm, 95 kg: meta arredondada para múltiplo de 50", () => {
  expect(computeTargets({ faixaEtaria: "35-44 anos", sexo: "Masculino", alturaCm: 180, pesoKg: 95 }))
    .toEqual({ age: 40, tmb: 2003, get: 2404, calories: 1650, calorieFloor: 1500, proteinMinG: 143, proteinMaxG: 190 })
})
it.each([["18-24 anos", 21], ["25-34 anos", 30], ["35-44 anos", 40], ["45-59 anos", 52]])("%s → idade %d", …)
```

- [ ] **Step 3: Rode e veja falhar.** `corepack pnpm vitest run tests/lib/meal-plan` → FAIL.
- [ ] **Step 4: Implemente `parsePlanAnswers`.** Número: `Number.parseFloat(String(v).replace(",", "."))`, finito, altura de 120 a 230 e peso de 30 a 300. Texto: só `string`, `number` e lista de `string`; `trim`, espaços e quebras colapsados em um espaço, corte em 200 caracteres.
- [ ] **Step 5: Implemente `computeTargets`** com as fórmulas de §6.2. `tmb` e `get` arredondados com `Math.round` (o `get` a partir do TMB sem arredondar); `calories = max(piso, round((get − 770) / 50) × 50)`; proteínas com `Math.round`.
- [ ] **Step 6: Rode os testes.** → PASS.
- [ ] **Step 7: Commit.** `feat: respostas do quiz para a IA e cálculo das metas nutricionais`

---

### Task 5: Plano gerado: schema, validação e conversão

**Files:**
- Create: `lib/meal-plan/plan.ts`
- Modify: `lib/db/repos/types.ts` (só o tipo `PlanData`)
- Test: `tests/lib/meal-plan/plan.test.ts`

**Interfaces:**
- Consumes: `Targets` (Task 4).
- Produces, em `lib/db/repos/types.ts`:

```ts
export type PlanData = {
  meals: { name: string; time: string; foods: string; calories: string }[]
  calories: number
  observations: string
}
```

- Produces, em `lib/meal-plan/plan.ts`:

```ts
export const generatedPlanSchema: z.ZodType<GeneratedPlan> // meals[{ name, time, foods, calories: number }], calories: number, observations
export type GeneratedPlan = { meals: { name: string; time: string; foods: string; calories: number }[]; calories: number; observations: string }
export type PlanIssue = "meals_count" | "meal_fields" | "food_without_quantity" | "meals_sum_mismatch" | "calories_out_of_range" | "observations_empty"
export function validatePlan(plan: GeneratedPlan, targets: Pick<Targets, "calories" | "calorieFloor">): PlanIssue[]
export function toPlanData(plan: GeneratedPlan): PlanData
```

- [ ] **Step 1: Escreva os testes que falham.** Base: meta 1650, piso 1500, quatro refeições de 400, 600, 250 e 400 kcal (total 1650), `foods` no formato do exemplo CORRETO do prompt.

```ts
it("plano válido não tem problemas", …)                                   // []
it.each([1, 7])("%d refeições → meals_count", …)
it("refeição sem nome, horário ou alimentos, ou com calorias <= 0 → meal_fields", …)
it("linha de alimento sem quantidade → food_without_quantity", …)          // "Ovos mexidos"
it.each(["Salada à vontade", "Legume sem amido a vontade", "SALADA À VONTADE"])("%s é aceita sem dígito", …)
it("soma das refeições a mais de 10% do total → meals_sum_mismatch", …)    // total 1650, soma 1400
it("soma a exatamente 10% do total passa", …)                              // total 1650, soma 1485
it.each([[1400, ["calories_out_of_range"]], [1500, []], [1897, []], [1900, ["calories_out_of_range"]]])
  ("meta 1650 e piso 1500: total %d → %j", …)                              // faixa [1500, 1897,5]
it("meta igual ao piso (1200): 1199 falha, 1380 passa, 1381 falha", …)
it("observations vazio ou só espaços → observations_empty", …)
it("toPlanData: calorias da refeição viram texto inteiro e o total vira inteiro", () => {
  expect(toPlanData({ ...valid, meals: [{ name: " Café ", time: "07:00", foods: "Ovo — 50 g (1 un)\n", calories: 349.6 }], calories: 349.6 }))
    .toEqual({ meals: [{ name: "Café", time: "07:00", foods: "Ovo — 50 g (1 un)", calories: "350" }], calories: 350, observations: valid.observations.trim() })
})
```

- [ ] **Step 2: Rode e veja falhar.** `corepack pnpm vitest run tests/lib/meal-plan/plan.test.ts` → FAIL.
- [ ] **Step 3: Implemente o schema, `validatePlan` e `toPlanData`.** Uma linha de `foods` é cada trecho separado por `\n`, ignorando as vazias. Os testes de soma devem ajustar o total e as refeições de modo que só a regra em teste falhe.
- [ ] **Step 4: Rode os testes.** → PASS.
- [ ] **Step 5: Commit.** `feat: schema, validação e conversão do plano gerado`

---

### Task 6: Prompt e mensagem para a IA

**Files:**
- Create: `lib/meal-plan/prompt.ts`
- Test: `tests/lib/meal-plan/prompt.test.ts`

**Interfaces:**
- Consumes: `PlanAnswers`, `parsePlanAnswers` (Task 4), `Targets`, `computeTargets` (Task 4).
- Produces: `SYSTEM_PROMPT: string`; `buildUserMessage(answers: PlanAnswers, targets: Targets): string`.

- [ ] **Step 1: Escreva os testes que falham.**

```ts
it("o prompt de sistema é o da nutricionista", () => {
  expect(SYSTEM_PROMPT.startsWith("# Agent — Nutricionista Especialista em Emagrecimento")).toBe(true)
  expect(SYSTEM_PROMPT).toContain("Equação de Harris-Benedict")
  expect(SYSTEM_PROMPT).toContain("- Rap10 com proteína (carne)")
  expect(SYSTEM_PROMPT).toContain("e sim pular linha (\\n)") // barra invertida + n, literais
  expect(SYSTEM_PROMPT.trimEnd().endsWith("Café sem açúcar — 200 ml")).toBe(true)
})
it("a mensagem traz os 17 campos, um por linha, na ordem", …) // começa com "Parâmetros fornecidos do paciente:"; contém "Café da manhã: Pão francês, Café com leite"
it("a mensagem traz as metas calculadas", () => {
  expect(msg).toContain("Metas calculadas (use estes valores; não recalcule):")
  expect(msg).toContain("Taxa Metabólica Basal (TMB): 1537 kcal")
  expect(msg).toContain("Gasto Energético Total (GET, sedentário): 1845 kcal")
  expect(msg).toContain("Meta calórica diária do plano: 1200 kcal")
  expect(msg).toContain("Proteína diária: de 113 g a 150 g")
})
it("a mensagem não contém nome, CPF, e-mail nem telefone do paciente", …) // a partir do `raw` da Task 4
```

- [ ] **Step 2: Rode e veja falhar.** → FAIL.
- [ ] **Step 3: Crie `SYSTEM_PROMPT`** copiando, sem alterar o conteúdo, o arquivo [2026-10-11-prompt-nutricionista.md](2026-10-11-prompt-nutricionista.md). Em template literal, o trecho `(\n)` precisa ser escrito `(\\n)`. Comente no código que aquele arquivo é só a cópia de referência do fluxo n8n e que a fonte que vale é `prompt.ts`.
- [ ] **Step 4: Implemente `buildUserMessage`:** a linha `Parâmetros fornecidos do paciente:`, as 17 linhas `Rótulo: valor`, uma linha em branco, o bloco de metas dos testes e, por fim, a frase `O total de calorias do plano deve ser a soma das refeições e ficar próximo da meta calórica diária.`
- [ ] **Step 5: Rode os testes.** → PASS.
- [ ] **Step 6: Commit.** `feat: prompt da nutricionista e mensagem com as metas calculadas`

---

### Task 7: Senha temporária e hash

**Files:**
- Create: `lib/access/temp-password.ts`, `lib/access/password-hash.ts`
- Test: `tests/lib/access/temp-password.test.ts`, `tests/lib/access/password-hash.test.ts`

**Interfaces:**
- Produces:

```ts
export function deriveTempPassword(secret: string, patientId: string): string
export function hashPassword(password: string): Promise<string>
/** `false` para senha errada e para qualquer valor fora do formato scrypt de §8. Nunca lança. */
export function verifyPassword(password: string, stored: string): Promise<boolean>
```

- [ ] **Step 1: Escreva os testes que falham.**

```ts
const ID = "5c5c73f0-325c-414c-b007-ca7b2471b8be"
it("vetores fixos", () => {
  expect(deriveTempPassword("s".repeat(32), ID)).toBe("SWSC8VWD8T")
  expect(deriveTempPassword("s".repeat(32), "00000000-0000-4000-8000-000000000001")).toBe("UKAMSUGHTA")
  expect(deriveTempPassword("t".repeat(32), ID)).toBe("D5TZDT93C3")
})
it("10 caracteres do alfabeto, sem 0, 1, I e O", () => {
  expect(deriveTempPassword("s".repeat(32), ID)).toMatch(/^[2-9A-HJ-NP-Z]{10}$/)
})

it("o hash tem o formato de §8", async () => {
  expect(await hashPassword("SWSC8VWD8T")).toMatch(/^scrypt\$16384\$8\$1\$[A-Za-z0-9+/]{22}==\$[A-Za-z0-9+/]{43}=$/)
})
it("confere a senha certa e recusa a errada", …)
it("o mesmo texto gera hashes diferentes (salt aleatório)", …)
it.each(["", "abc", "scrypt$16384$8$1$x", "scrypt$abc$8$1$AAAA$AAAA", "scrypt$1073741824$8$1$AAAA$AAAA",
  createHash("sha512").update("SWSC8VWD8T").digest("base64")])("valor fora do formato %j → false", …)
```

- [ ] **Step 2: Rode e veja falhar.** `corepack pnpm vitest run tests/lib/access` → FAIL.
- [ ] **Step 3: Implemente `deriveTempPassword`** como em §8: HMAC-SHA256 de `"temp-password:v1:" + patientId`, os 10 primeiros bytes, cada um como `alfabeto[byte % 32]`.
- [ ] **Step 4: Implemente `hashPassword` e `verifyPassword`** com `scrypt` de `node:crypto` (versão com Promise) e `timingSafeEqual`. `verifyPassword` recusa parâmetros acima de `N` 131072, `r` 16 ou `p` 4, para que um valor adulterado no banco não trave o processo.
- [ ] **Step 5: Rode os testes.** → PASS.
- [ ] **Step 6: Commit.** `feat: senha temporária derivada e hash scrypt`

---

### Task 8: Repositório do webhook

**Files:**
- Modify: `lib/db/repos/types.ts`, `lib/db/repos/mysql.ts`, `tests/fakes/memory-repos.ts`, `tests/db/repos.contract.ts`

**Interfaces:**
- Consumes: `PaymentEventInput` (Task 3); tabelas da Task 2.
- Produces, em `types.ts`:

```ts
export type PaymentEventResult =
  | { outcome: "duplicate" }
  | { outcome: "ignored"; reason: "unknown_payment" | "asaas_id_mismatch" | "already_paid" | "event_not_handled" }
  | {
      outcome: "processed"
      paymentId: string
      patientName: string
      /** Geração da cobrança, se existe e ainda está `pending`. */
      pendingGeneration: { id: string; quizResponseId: string } | null
      /** Evento pago de uma cobrança sem envio do quiz ligado: nenhuma geração foi criada. */
      missingQuizResponse: boolean
    }

export interface WebhookRepo {
  /** Uma transação: grava o evento (idempotente pelo `eventId`) e aplica a regra do grupo (§5). */
  applyPaymentEvent(e: PaymentEventInput, now: Date): Promise<PaymentEventResult>
}
```

- `PaymentView` ganha `paidAt: Date | null`. `Repos` ganha `webhooks: WebhookRepo`.
- `MemoryState` ganha `patients`, `webhookEvents`, `planGenerations` e `mealPlans` (mapas somente leitura), para os testes de serviço.

**Regras de `applyPaymentEvent`** (as de §5, na ordem):

1. Insere o evento; se o `eventId` já existe → `duplicate`, sem nenhum efeito.
2. Grupo `other` → grava `outcome = ignored` → `event_not_handled`.
3. Busca a cobrança por `externalReference`. Não achou (inclusive `externalReference` nulo ou que não é um id nosso) → `unknown_payment`.
4. `asaas_id` da cobrança diferente de `asaasPaymentId` → `asaas_id_mismatch`. `asaas_id` nulo → aceita e grava.
5. `paid`: `status`, `paidAt` (só se nulo), `paymentDate`, `billingType`, `invoiceNumber`, `lastEvent`. Cria a geração (`pending`, `attempts` 0, `nextAttemptAt = now`) com o `quiz_response` mais recente da cobrança, se ainda não há geração. Sem `quiz_response` → `missingQuizResponse: true`.
6. `reversal`: `status` e `lastEvent`. Nada mais.
7. `pre_payment`: com `paidAt` preenchido → `already_paid`; senão `status` e `lastEvent`.

- [ ] **Step 1: Escreva os testes de contrato que falham** em `tests/db/repos.contract.ts`, continuando a numeração. Helper sugerido: `paidPayment(repos)` cria o envio, chama `payments.markSynced` e devolve `{ ref, asaasId }`; `ev(group, over)` monta um `PaymentEventInput` com `eventId` aleatório.

```ts
it("13. evento pago: cobrança paga e geração pendente do envio", …)
  // processed; payments.get → status "RECEIVED", paidAt = now; pendingGeneration.quizResponseId === ref.quizResponseId; missingQuizResponse false
it("14. o mesmo evento duas vezes: o segundo é duplicate e nada muda", …)
it("15. CONFIRMED e depois RECEIVED: uma geração só; paidAt não muda; status vira RECEIVED", …)
it("16. cobrança desconhecida, externalReference nulo e asaas_id divergente são ignorados", …)
it("17. cobrança ainda sem asaas_id: o evento pago é aceito e grava o asaas_id", …)
it("18. OVERDUE antes de pagar muda o status e a cobrança deixa de ser reaproveitada", …)
  // novo envio do mesmo CPF recebe outro paymentId
it("19. OVERDUE depois de pago é ignorado (already_paid) e o status fica", …)
it("20. reversão muda o status e não cria nem altera geração", …)
it("21. grupo other é ignorado (event_not_handled)", …)
it("22. dois envios na mesma cobrança: a geração usa o envio mais recente", …)
it("23. concorrência: dois eventos pagos diferentes ao mesmo tempo → a mesma geração", …)
  // Promise.all; os dois processed; pendingGeneration.id iguais
it("24. concorrência: o mesmo evento duas vezes ao mesmo tempo → um processed e um duplicate", …)
```

- [ ] **Step 2: Rode e veja falhar.** `corepack pnpm vitest run tests/db/repos.memory.test.ts` → FAIL.
- [ ] **Step 3: Implemente no fake em memória.** Sem `await` no meio, como `create`, para ser atômico. As linhas novas (`PaymentRow.paidAt`/`paymentDate`/`lastEvent`, `PatientRow.passwordHash`/`mustChangePassword`/`passwordSetAt`, evento, geração, plano) seguem as colunas da Task 2.
- [ ] **Step 4: Implemente no MySQL** em uma transação, com o mesmo laço de novas tentativas em deadlock que `submissions.create` usa. O evento entra com `INSERT IGNORE` (linhas afetadas 0 = duplicata); a cobrança é lida com `FOR UPDATE`; a geração entra com `INSERT IGNORE` pela chave única de `payment_id`.
- [ ] **Step 5: Rode os testes.** `corepack pnpm vitest run tests/db` → PASS. `corepack pnpm typecheck` → sem erros (os pontos que montam `Repos` ou `PaymentView` à mão precisam do campo novo).
- [ ] **Step 6: Commit.** `feat: repositório do webhook com evento idempotente e regras por grupo`

---

### Task 9: Repositório de gerações, planos e visão da notificação

**Files:**
- Modify: `lib/db/repos/types.ts`, `lib/db/repos/mysql.ts`, `tests/fakes/memory-repos.ts`, `tests/db/repos.contract.ts`

**Interfaces:**
- Consumes: `applyPaymentEvent` (Task 8) para criar gerações nos testes; `PlanData` (Task 5).
- Produces, em `types.ts`:

```ts
export type NotificationKind = "payment_link" | "plan_ready"

export type PlanGenerationView = {
  id: string
  paymentId: string
  quizResponseId: string
  status: "pending" | "done" | "failed"
  attempts: number
  answers: Record<string, unknown>
  patient: { id: string; name: string; hasPassword: boolean }
}

export type MealPlanView = {
  id: string
  patientId: string
  paymentId: string | null
  title: string
  startDate: string
  endDate: string | null
  status: string
  planData: PlanData
}

export interface PlanGenerationRepo {
  get(id: string): Promise<PlanGenerationView | null>
  tryLock(id: string, ttlMs: number): Promise<boolean>
  unlock(id: string): Promise<void>
  /**
   * Uma transação (§6, passo 8). Lança, sem gravar nada, se a geração não está `pending`.
   * `passwordHash` só é gravado se o paciente ainda não tem credencial.
   */
  complete(
    id: string,
    d: {
      title: string
      startDate: string
      endDate: string
      planData: PlanData
      generation: Record<string, unknown>
      passwordHash: string | null
      channels: Channel[]
    },
  ): Promise<{ mealPlanId: string }>
  /** Com `failed`, o status vira `failed`; senão segue `pending` em `nextAttemptAt`. Limpa o lock. */
  markFailure(id: string, d: { attempts: number; nextAttemptAt: Date | null; failed: boolean; error: LastError }): Promise<void>
  /** `pending` com `next_attempt_at <= now` e não reservadas, por `next_attempt_at` crescente. */
  listDue(now: Date, limit: number): Promise<string[]>
  /** Só age em `failed`: volta a `pending`, `attempts` 0, `next_attempt_at` = agora. */
  reopen(id: string): Promise<boolean>
  reopenAllFailed(): Promise<number>
}

export interface MealPlanRepo {
  /** Planos do paciente, do mais antigo ao mais novo. */
  listByPatient(patientId: string): Promise<MealPlanView[]>
}
```

- `NotificationView`: `kind: NotificationKind`; campos novos `patientId: string` e `patientPasswordHash: string | null`.
- `Repos` ganha `planGenerations: PlanGenerationRepo` e `mealPlans: MealPlanRepo`.

**Regras de `complete`:** insere o plano `active`; passa para `completed` os outros planos `active` do paciente; grava `passwordHash`, `mustChangePassword = true` e `passwordSetAt` só se `password_hash` é nulo; cria as notificações `plan_ready` do `quiz_response_id` para cada canal (destinatário como em `enqueuePaymentLink`, ignorando as que já existem); marca a geração `done` com `mealPlanId` e `generation`, limpa `lastError` e o lock.

- [ ] **Step 1: Escreva os testes de contrato que falham.** Helper sugerido: `paidGeneration(repos, over?)` devolve `{ ref, generationId, patientId }`; `done(over?)` monta o argumento de `complete` com um `PlanData` de uma refeição.

```ts
it("25. get devolve respostas, paciente e estado; id desconhecido → null", …)
it("26. locks de geração: exclusivo, liberável; lock expirado volta a aparecer em listDue", …) // TTL 50 ms + espera
it("27. complete: plano active, geração done, credencial e notificações plan_ready", …)
  // listByPatient: 1 plano com title, datas e planData; listDue vazio;
  // notifications.get: kind "plan_ready", recipient (e-mail e "55"+telefone), patientId, patientPasswordHash === hash
it("28. segunda compra: plano anterior completed, novo active, credencial intacta", …)
  // passwordHash diferente no segundo complete; o hash continua o do primeiro
it("29. complete com passwordHash null não cria credencial", …)
it("30. complete em geração que não está pending lança e não grava nada", …)
it("31. duas gerações do mesmo paciente concluídas ao mesmo tempo: um plano active e uma credencial", …)
  // Promise.all; exatamente 1 plano active; patientPasswordHash é um dos dois e é igual nas notificações das duas
it("32. markFailure agenda nova tentativa; failed sai da fila; reopen e reopenAllFailed devolvem", …)
it("33. listDue de gerações: ordenado por next_attempt_at e respeita o limite", …)
it("34. payment_link e plan_ready do mesmo envio coexistem", …)
  // enqueuePaymentLink e depois complete, com 2 canais: 4 notificações pendentes no envio, 2 de cada kind
```

- [ ] **Step 2: Rode e veja falhar.** `corepack pnpm vitest run tests/db/repos.memory.test.ts` → FAIL.
- [ ] **Step 3: Implemente no fake em memória** (`complete` sem `await` no meio). `NotificationRow.kind` passa a ser `NotificationKind`.
- [ ] **Step 4: Implemente no MySQL.** `complete` em uma transação que começa com `SELECT … FROM patients WHERE id = ? FOR UPDATE`: essa trava serializa as conclusões do mesmo paciente e é o que garante o teste 31. A credencial usa `UPDATE patients … WHERE id = ? AND password_hash IS NULL`. `notifications.get` passa a devolver o `kind` gravado e os dois campos novos.
- [ ] **Step 5: Rode os testes.** `corepack pnpm vitest run tests/db` → PASS. `corepack pnpm test` → PASS (os testes existentes de notificação continuam verdes). `corepack pnpm typecheck` → sem erros.
- [ ] **Step 6: Commit.** `feat: repositório de gerações de plano, planos e credencial`

---

### Task 10: Gerador de plano (Anthropic)

**Files:**
- Create: `lib/meal-plan/generator.ts`, `lib/meal-plan/anthropic-generator.ts`
- Test: `tests/lib/meal-plan/anthropic-generator.test.ts`

**Interfaces:**
- Consumes: `generatedPlanSchema`, `GeneratedPlan` (Task 5).
- Produces:

```ts
// generator.ts
export class PlanGenerationError extends Error {
  constructor(message: string, readonly transient: boolean) // name = "PlanGenerationError"
}
export type GeneratorResult = { plan: GeneratedPlan; model: string; inputTokens: number; outputTokens: number }
export interface MealPlanGenerator {
  generate(i: { system: string; user: string }): Promise<GeneratorResult>
}

// anthropic-generator.ts
export type ParseCall = (params: Record<string, unknown>) => Promise<{
  parsed_output: unknown
  stop_reason: string | null
  model: string
  usage: { input_tokens: number; output_tokens: number }
}>
export function createAnthropicGenerator(cfg: { apiKey: string; model: string; parse?: ParseCall }): MealPlanGenerator
```

- [ ] **Step 1: Escreva os testes que falham,** sempre com `parse` falso.

```ts
it("devolve o plano, o modelo que respondeu e os tokens", …)
it("envia os parâmetros fixos", () => {
  expect(params).toMatchObject({ model: "claude-opus-5-5", max_tokens: 16000, system: "SYS",
    messages: [{ role: "user", content: "USER" }], output_config: { effort: "high" } })
  expect((params.output_config as { format?: unknown }).format).toBeDefined()
  expect(params).not.toHaveProperty("thinking")
})
it.each(["refusal", "max_tokens"])("stop_reason %s → erro temporário", …)
it("parsed_output nulo ou fora do schema → erro temporário", …)
it.each([400, 401, 403, 404])("HTTP %d → erro definitivo", …)
it.each([408, 409, 429, 500, 529])("HTTP %d → erro temporário", …)
it("erro de conexão ou tempo limite → erro temporário", …)
it("erro desconhecido → erro temporário", …)
it("a mensagem do erro não traz o corpo da resposta nem o texto enviado", …) // ex.: "anthropic HTTP 401"
```

  Construa os erros do SDK com `Anthropic.APIError.generate(status, undefined, "x", new Headers())` e `new Anthropic.APIConnectionError({ message: "x" })`. Se a versão instalada tiver outra assinatura, ajuste só a construção no teste.

- [ ] **Step 2: Rode e veja falhar.** → FAIL.
- [ ] **Step 3: Implemente `generator.ts`** (só o erro, o tipo e a interface).
- [ ] **Step 4: Implemente `createAnthropicGenerator`.**
  - Cliente padrão: `new Anthropic({ apiKey, timeout: 120_000, maxRetries: 1 })`, criado na primeira chamada.
  - Parâmetros: os do teste, com `output_config.format = zodOutputFormat(generatedPlanSchema)` (de `@anthropic-ai/sdk/helpers/zod`). Não envie `thinking`: o padrão do modelo já é o raciocínio adaptativo.
  - Fallback (§6.3): confira nos tipos do SDK instalado se `client.beta.messages.parse` existe e aceita `fallbacks`. Se sim, o `parse` padrão é ele, com `betas: ["server-side-fallback-2026-07-01"]` e `fallbacks: "default"`. Se não, o `parse` padrão é `client.messages.parse`, sem fallback. Registre no corpo do commit qual dos dois ficou.
  - Classificação: `Anthropic.APIConnectionError` → temporário; `Anthropic.APIError` com status 408, 409, 429 ou ≥ 500 → temporário, outro status → definitivo; qualquer outra exceção → temporário.
  - O plano devolvido passa por `generatedPlanSchema.safeParse(parsed_output)`.
  - Se `zodOutputFormat` não aceitar o schema do zod 3 na checagem de tipos, declare `generatedPlanSchema` importando `z` de `"zod/v4"` em `lib/meal-plan/plan.ts` e ajuste só esse import.
- [ ] **Step 5: Rode os testes.** `corepack pnpm vitest run tests/lib/meal-plan` → PASS. `corepack pnpm typecheck` → sem erros.
- [ ] **Step 6: Commit.** `feat: gerador de plano com o SDK da Anthropic e saída estruturada`

---

### Task 11: Serviço de geração do plano

**Files:**
- Create: `lib/services/generate-plan.ts`
- Modify: `lib/jobs/backoff.ts`, `lib/services/alert-admin.ts`
- Test: `tests/lib/services/generate-plan.test.ts`, `tests/lib/services/alert-admin.test.ts`, `tests/lib/jobs/backoff.test.ts`

**Interfaces:**
- Consumes: `PlanGenerationRepo` (Task 9); `parsePlanAnswers`, `computeTargets` (Task 4); `validatePlan`, `toPlanData` (Task 5); `SYSTEM_PROMPT`, `buildUserMessage` (Task 6); `MealPlanGenerator`, `PlanGenerationError` (Task 10); `todayInSaoPaulo`, `addDaysISO`, `jobBackoffMs`, `toLastError`, `safeErrorMessage` (existentes).
- Produces:

```ts
// backoff.ts
export const MAX_PLAN_ATTEMPTS = 5

// alert-admin.ts: AdminAlert["kind"] passa a ser "payment" | "notification" | "meal_plan"

// generate-plan.ts
export type GeneratePlanResult =
  | { status: "done"; quizResponseId: string }
  | { status: "busy" | "skipped" | "retry_scheduled" | "failed" }
export type GeneratePlan = (generationId: string) => Promise<GeneratePlanResult>

export function createGeneratePlan(d: {
  planGenerations: PlanGenerationRepo
  generator: MealPlanGenerator
  hashPassword: (password: string) => Promise<string>
  tempPassword: (patientId: string) => string
  alertAdmin: AlertAdmin
  log: Logger
  now: () => Date
  config: { channels: Channel[] }
}): GeneratePlan

/** Gera e, se concluiu, despacha as notificações do envio. Nunca lança. */
export function createRunPlanGeneration(d: {
  generatePlan: GeneratePlan
  dispatchForQuizResponse: (quizResponseId: string) => Promise<void>
  log: Logger
}): (generationId: string) => Promise<void>
```

- Etapas gravadas em `last_error.step`: `plan.answers`, `plan.generate`, `plan.validate`, `access.hash`, `db.complete`.
- Eventos de log: `plan.generation.done` (`generationId`, `mealPlanId`, `model`, `inputTokens`, `outputTokens`, `durationMs`), `plan.generation.retry_scheduled`, `plan.generation.failed` (`generationId`, `step`, `attempt`, `message`).

- [ ] **Step 1: Escreva os testes que falham.** Monte o cenário com `createMemoryRepos()`: envio com respostas válidas, `markSynced`, `applyPaymentEvent` do grupo `paid`. O gerador é um dublê que devolve um plano válido para a meta do paciente. `NOW = 2026-10-11T15:00:00Z`.

```ts
it("sucesso: plano active com título e datas, credencial, notificações e geração done", …)
  // result { status: "done", quizResponseId }; title "Plano Alimentar 10/2026"; startDate "2026-10-11"; endDate "2026-11-10";
  // planData.meals[0].calories é texto; hashPassword chamado com tempPassword(patientId);
  // 2 notificações plan_ready pendentes; generation com model, inputTokens, outputTokens e targets
it("fuso: 2026-11-01T01:30:00Z é 31/10 em São Paulo", …) // startDate "2026-10-31", título "Plano Alimentar 10/2026", endDate "2026-11-30"
it("o gerador recebe o prompt de sistema e a mensagem com as metas", …)
it("paciente que já tem senha: hashPassword não é chamado e o hash fica", …)
it.each([{ peso_kg: "abc" }, { altura_cm: "" }, { faixa_etaria: "60+ anos" }])
  ("respostas inválidas %j: failed na primeira vez, alerta meal_plan, IA não chamada", …) // step "plan.answers"
it("plano inválido: retry_scheduled, attempts 1, próxima tentativa em NOW + 2 min, nenhum plano gravado", …) // step "plan.validate"
it("erro temporário da IA agenda nova tentativa; o definitivo vira failed com alerta na primeira vez", …)
it("a 5ª falha vira failed com alerta", …)
it("last_error e logs não contêm respostas do quiz nem alimentos do plano", …)
it("geração reservada → busy, IA não chamada", …)
it("geração done ou inexistente → skipped", …)
it("complete falha: retry_scheduled e o lock é solto", …)
it("runPlanGeneration: done despacha as notificações do envio; falha não despacha; exceção não vaza", …)
```

  Em `alert-admin.test.ts`: o alerta `meal_plan` sai com assunto `[tami-forms] Falha definitiva: meal_plan <id>`. Em `backoff.test.ts`: `MAX_PLAN_ATTEMPTS` é 5.

- [ ] **Step 2: Rode e veja falhar.** `corepack pnpm vitest run tests/lib/services/generate-plan.test.ts` → FAIL.
- [ ] **Step 3: Implemente `createGeneratePlan`** seguindo §6 e a estrutura de `sync-payment.ts`: `get`, `tryLock` (300 000 ms), releitura, `try/catch` com `recordFailure`, `finally` que solta o lock se ele ainda estiver preso.
  - Falha definitiva: respostas inválidas, `PlanGenerationError` com `transient` falso, ou `attempts >= MAX_PLAN_ATTEMPTS`.
  - Plano inválido: lance `new PlanGenerationError("invalid plan: " + issues.join(","), true)`.
  - Título: `Plano Alimentar MM/AAAA` a partir de `startDate`.
  - `generation`: `{ model, inputTokens, outputTokens, targets }`.
  - O hash só é calculado quando `patient.hasPassword` é falso.
- [ ] **Step 4: Implemente `createRunPlanGeneration`** no mesmo arquivo.
- [ ] **Step 5: Rode os testes.** `corepack pnpm vitest run tests/lib/services tests/lib/jobs/backoff.test.ts` → PASS.
- [ ] **Step 6: Commit.** `feat: serviço de geração do plano com metas, validação e credencial`

---

### Task 12: Notificação `plan_ready`

**Files:**
- Modify: `lib/notify/templates.ts`, `lib/services/dispatch-notification.ts`
- Test: `tests/lib/notify/templates.test.ts`, `tests/lib/services/dispatch-notification.test.ts`, `tests/lib/jobs/run-jobs.test.ts` (só o `setup`)

**Interfaces:**
- Consumes: `NotificationView` com `kind`, `patientId` e `patientPasswordHash` (Task 9); `verifyPassword`, `hashPassword` (Task 7).
- Produces:

```ts
// templates.ts
export const FIRST_ACCESS_TITLE = "Primeiro Acesso App PlanA"
export const PLAN_READY_TITLE = "Seu novo Plano Alimentar está pronto"
export function renderFirstAccess(d: { name: string; appUrl: string; tempPassword: string }): { subject: string; html: string; text: string }
export function renderPlanReady(d: { name: string; appUrl: string }): { subject: string; html: string; text: string }

// dispatch-notification.ts: createDispatchNotification ganha duas dependências
//   access: { tempPassword: (patientId: string) => string; verifyPassword: (password: string, stored: string) => Promise<boolean> }
//   appUrl: string
```

- [ ] **Step 1: Escreva os testes de template que falham.** Os dois HTML, exatos, em uma linha cada (como `renderPaymentLink`):

```ts
const URL = "https://plana.nutritamilivalle.com.br/"
it("primeiro acesso", () => {
  expect(renderFirstAccess({ name: "Ana Souza", appUrl: URL, tempPassword: "SWSC8VWD8T" }).html).toBe(
    "Olá Ana Souza! 👋 <br>Seu pagamento foi confirmado e seu <strong>Plano Alimentar Personalizado está pronto</strong>! 🎉 <br><br>" +
    "Utilize os dados abaixo para realizar seu <strong>primeiro login</strong>: <br>Link: https://plana.nutritamilivalle.com.br/ <br>" +
    "🔐 <strong>Usuário:</strong> seu CPF (somente números) <br>🔑 <strong>Senha temporária:</strong> SWSC8VWD8T <br><br>" +
    "Por segurança, recomendamos que você <strong>troque a senha</strong> após o primeiro acesso.")
})
it("plano novo disponível", () => {
  expect(renderPlanReady({ name: "Ana Souza", appUrl: URL }).html).toBe(
    "Olá Ana Souza! 👋 <br>Recebemos seu pagamento e seu <strong>novo Plano Alimentar Personalizado já está disponível</strong>. 🎉 <br><br>" +
    "Acesse com seu CPF e a senha que você já usa: <br>https://plana.nutritamilivalle.com.br/")
})
it("os assuntos são os títulos", …)
it("o nome é escapado no HTML e volta legível no texto", …)       // "Ana <b> & Cia"
it("o texto puro não tem tags e mantém as quebras de linha", …)
it("WhatsApp do primeiro acesso: 3 partes, título em negrito na primeira, senha na segunda", …)
  // toWhatsAppParts(FIRST_ACCESS_TITLE, html)[1] contém "*Senha temporária:* SWSC8VWD8T"
it("WhatsApp do plano novo: 2 partes", …)
```

- [ ] **Step 2: Escreva os testes de envio que falham.** Cenário: envio, `markSynced`, evento pago, `complete` com `passwordHash` = `await hashPassword(tempPassword(patientId))`.

```ts
it("e-mail de primeiro acesso: assunto e senha temporária no corpo", …)
it("WhatsApp de primeiro acesso: as 3 partes, com 3 s entre elas", …)
it("senha já trocada: sai o texto de plano novo, sem a senha temporária", …)   // hash de outra senha
it("hash em outro formato (SHA-512 base64): sai o texto de plano novo", …)
it("paciente sem hash: nova tentativa agendada, nada é enviado", …)
it("plan_ready não exige payment_url", …)
it("nenhum log contém a senha temporária", …)                                   // JSON.stringify das chamadas do log
it("payment_link continua igual", …)                                            // os testes existentes, com as dependências novas
```

  Atualize o `setup` dos testes existentes (`dispatch-notification.test.ts` e `run-jobs.test.ts`) para passar `access` e `appUrl`.

- [ ] **Step 3: Rode e veja falhar.** `corepack pnpm vitest run tests/lib/notify tests/lib/services/dispatch-notification.test.ts` → FAIL.
- [ ] **Step 4: Implemente os dois templates,** reusando `escapeHtml` e a conversão para texto de `renderPaymentLink`.
- [ ] **Step 5: Altere o envio.** O conteúdo passa a depender de `n.kind`:
  - `payment_link`: como hoje (inclusive o erro quando falta `paymentUrl`).
  - `plan_ready`: sem `patientPasswordHash` → erro (vira nova tentativa). Senão, `verifyPassword(tempPassword(n.patientId), n.patientPasswordHash)`: verdadeiro → `renderFirstAccess`; falso → `renderPlanReady`. As partes do WhatsApp usam o título do texto escolhido.
- [ ] **Step 6: Rode os testes.** `corepack pnpm test` → PASS.
- [ ] **Step 7: Commit.** `feat: mensagens de primeiro acesso e de plano novo disponível`

---

### Task 13: Webhook: serviço, avisos ao admin e handler

**Files:**
- Create: `lib/services/handle-asaas-event.ts`, `lib/http/handlers/asaas-webhook.ts`
- Modify: `lib/services/alert-admin.ts`, `lib/http/auth.ts`
- Test: `tests/lib/services/handle-asaas-event.test.ts`, `tests/lib/http/asaas-webhook.test.ts`, `tests/lib/services/alert-admin.test.ts`, `tests/lib/http/auth.test.ts`

**Interfaces:**
- Consumes: `parseAsaasEvent` (Task 3); `WebhookRepo` (Task 8); `readJsonBody` (existente).
- Produces:

```ts
// auth.ts
/** Compara o valor do header com o token em tempo constante. Token esperado vazio nunca autoriza. */
export function isTokenAuthorized(header: string | null, token: string): boolean

// alert-admin.ts
export type AdminNotice = {
  kind: "payment_reversal" | "payment_without_quiz"
  paymentId: string
  patientName: string
  event: string
  asaasPaymentId: string | null
}
export type NoticeAdmin = (n: AdminNotice) => Promise<void>
export function createNoticeAdmin(d: { email: EmailSender; to: string; log: Logger }): NoticeAdmin // nunca lança

// handle-asaas-event.ts
export type HandledEvent = {
  outcome: "duplicate" | "ignored" | "processed"
  pendingGeneration: { id: string; quizResponseId: string } | null
  notice: AdminNotice | null
}
export function createHandleAsaasEvent(d: { webhooks: WebhookRepo; log: Logger; now: () => Date }): (e: PaymentEventInput) => Promise<HandledEvent>

// asaas-webhook.ts
export const WEBHOOK_MAX_BODY_BYTES = 256 * 1024
export function createAsaasWebhookHandler(d: {
  token: string
  handleEvent: (e: PaymentEventInput) => Promise<HandledEvent>
  runPlanGeneration: (generationId: string) => Promise<void>
  noticeAdmin: NoticeAdmin
  defer: (fn: () => Promise<void>) => void
  log: Logger
}): (req: Request) => Promise<Response>
```

- Assuntos dos avisos: `[tami-forms] Pagamento revertido: <paymentId>` e `[tami-forms] Pagamento sem envio do quiz: <paymentId>`. Corpo: tipo, evento, id da cobrança no Asaas e nome do paciente.
- Eventos de log: `webhook.asaas.unauthorized`, `webhook.asaas.unreadable`, `webhook.asaas.received`, `webhook.asaas.duplicate`, `webhook.asaas.ignored` (com `reason`), `webhook.asaas.failed`. Campos: `eventId`, `event`, `paymentId`. Nunca o token nem o corpo.

- [ ] **Step 1: Escreva os testes do serviço que falham** (repositório em memória e, para `missingQuizResponse`, um `WebhookRepo` falso).

```ts
it("evento pago: processed com a geração pendente e sem aviso", …)
it("duplicado: outcome duplicate, sem geração e sem aviso", …)
it("ignorado: outcome ignored e log com o motivo", …)
it("reversão: aviso payment_reversal com evento, cobrança e nome do paciente", …)
it("pago sem envio do quiz: aviso payment_without_quiz e nenhuma geração", …)
it("erro do repositório é propagado", …)
```

- [ ] **Step 2: Escreva os testes do handler e dos utilitários que falham.**

```ts
it("sem o header asaas-access-token → 401 e o evento não é tratado", …)
it("token errado → 401", …)
it.each(["{", "", "[]", '{"id":"evt_1"}'])("corpo ilegível %j → 200, log unreadable, evento não tratado", …)
it("corpo acima de 256 KB → 200 e evento não tratado", …)
it("evento pago → 200 { ok: true } e a geração roda depois da resposta", …)   // defer coleta a função; ao executá-la, runPlanGeneration(id)
it("reversão → 200 e o aviso ao admin sai depois da resposta", …)
it("duplicado → 200 e nada é adiado", …)
it("falha ao tratar o evento → 500 { ok: false }", …)
it("erro dentro da tarefa adiada não vaza", …)
it("isTokenAuthorized: igual autoriza; diferente, nulo ou token esperado vazio não", …)
it("createNoticeAdmin: assunto de cada tipo; falha no envio só gera log", …)
```

- [ ] **Step 3: Rode e veja falhar.** → FAIL.
- [ ] **Step 4: Implemente `isTokenAuthorized`, `createNoticeAdmin` e `createHandleAsaasEvent`.**
- [ ] **Step 5: Implemente o handler** na ordem de §5: token → `readJsonBody` (256 KB) → `parseAsaasEvent` → `handleEvent` → resposta → `defer`. Respostas: `{ ok: true }` com 200; `{ ok: false }` com 401 e 500.
- [ ] **Step 6: Rode os testes.** `corepack pnpm vitest run tests/lib/http tests/lib/services` → PASS.
- [ ] **Step 7: Commit.** `feat: webhook do Asaas com token, idempotência e avisos de reversão`

---

### Task 14: Job e reabertura

**Files:**
- Modify: `lib/jobs/run-jobs.ts`, `lib/jobs/retry-failed.ts`, `lib/http/handlers/jobs.ts`
- Test: `tests/lib/jobs/run-jobs.test.ts`, `tests/lib/jobs/retry-failed.test.ts`, `tests/lib/http/handlers.test.ts`

**Interfaces:**
- Consumes: `PlanGenerationRepo` (Task 9); `GeneratePlan` (Task 11).
- Produces:

```ts
// run-jobs.ts
export type RunSummary = { payments: number; plans: number; notifications: number; errors: number }
// createRunJobs ganha: planGenerations: PlanGenerationRepo; generatePlan: GeneratePlan; limits: { payments: number; plans: number; notifications: number }

// retry-failed.ts
export type RetryTarget = { paymentId: string } | { notificationId: string } | { planGenerationId: string } | { allFailed: true }
// createRetryFailed ganha: planGenerations: PlanGenerationRepo
```

- [ ] **Step 1: Escreva os testes que falham.**

```ts
// run-jobs
it("a rodada processa cobranças, depois gerações, depois notificações", …)
  // a notificação plan_ready criada na etapa de gerações é enviada na mesma rodada
it("no máximo `limits.plans` gerações por rodada", …)             // 4 pendentes, limite 3 → generatePlan 3 vezes
it("exceção em uma geração conta em errors e não interrompe as demais", …)
it("falha ao listar gerações conta em errors e a rodada segue para as notificações", …)
// retry-failed
it("{ planGenerationId } reabre uma geração failed e ela volta a listDue", …)
it("{ planGenerationId } de geração que não está failed → reopened 0", …)
it("{ allFailed } soma cobranças, notificações e gerações", …)
// handlers
it('POST /api/jobs/retry aceita { "planGenerationId": "…" }', …)
```

- [ ] **Step 2: Rode e veja falhar.** → FAIL.
- [ ] **Step 3: Implemente** a etapa de gerações em `run-jobs` (evento de log `job.plan.error`), o novo alvo em `retry-failed` e o novo formato em `retryTargetSchema`.
- [ ] **Step 4: Rode os testes.** `corepack pnpm vitest run tests/lib/jobs tests/lib/http` → PASS.
- [ ] **Step 5: Commit.** `feat: gerações de plano no job e na reabertura de falhas`

---

### Task 15: Ligação final, rota e README

**Files:**
- Create: `app/api/webhooks/asaas/route.ts`
- Modify: `lib/container.ts`, `README.md`
- Test: `tests/lib/container.test.ts` (segue passando sem mudanças)

**Interfaces:**
- Consumes: tudo o que as tarefas anteriores produziram.
- Produces: `Container` com `handleAsaasEvent`, `runPlanGeneration` e `noticeAdmin`; rota `POST /api/webhooks/asaas`.

- [ ] **Step 1: Ligue as dependências em `lib/container.ts`.**
  - `JOB_LIMITS = { payments: 20, plans: 3, notifications: 50 }`.
  - `tempPassword = (patientId) => deriveTempPassword(env.ACCESS_PASSWORD_SECRET, patientId)`.
  - `generator = createAnthropicGenerator({ apiKey: env.ANTHROPIC_API_KEY, model: env.ANTHROPIC_MODEL })`.
  - `dispatchNotification` recebe `access: { tempPassword, verifyPassword }` e `appUrl: env.PLANA_APP_URL`.
  - `generatePlan`, `runPlanGeneration`, `handleAsaasEvent`, `noticeAdmin`; `runJobs` e `retryFailed` com as dependências novas.
- [ ] **Step 2: Crie a rota** no molde de `app/api/submit-quiz/route.ts`: `runtime`, `dynamic`, `getContainer()`, `createAsaasWebhookHandler` com `token: c.env.ASAAS_WEBHOOK_TOKEN` e `defer: (fn) => after(fn)`.
- [ ] **Step 3: Atualize o `README.md`,** em português simples, como o restante do arquivo:
  - **Seção 1:** o que acontece depois do pagamento (plano, senha, mensagens).
  - **Seção 4:** as cinco variáveis novas na tabela, e como gerar os dois segredos (o mesmo comando do `JOBS_TOKEN`). Avise que `ACCESS_PASSWORD_SECRET` não deve ser trocado depois.
  - **Seção nova "Webhook do Asaas":** a URL (`https://SEU-DOMINIO/api/webhooks/asaas`); onde cadastrar no painel; o token (igual a `ASAAS_WEBHOOK_TOKEN`, nunca a chave de API); os eventos a marcar (os grupos `paid`, `reversal` e `pre_payment` de §5); o que fazer se a fila for pausada. Confira os nomes dos campos do painel em https://docs.asaas.com/docs/sobre-os-webhooks antes de escrever; não invente rótulos.
  - **Seção 6 (Operação):** a etapa de planos do job (até 3 por rodada, 5 tentativas); a consulta `SELECT id, attempts, last_error FROM plan_generations WHERE status = 'failed'`; o `curl` de retry com `planGenerationId`.
  - **Seção nova "Integração com o PlanA":** o resumo de §11, o formato do hash de §8 e a dependência: o webhook de produção só é cadastrado depois que o PlanA estiver lendo este MySQL e validando o novo hash.
  - **Seção 9 (Checklist):** os itens do roteiro manual de §13.
- [ ] **Step 4: Verificação completa.**
  - `corepack pnpm test` → todos os testes passam.
  - `corepack pnpm typecheck` → sem erros.
  - `corepack pnpm build` → build concluído, com a rota `/api/webhooks/asaas` listada.
- [ ] **Step 5: Commit.** `feat: rota do webhook do Asaas, container e README`
- [ ] **Step 6: Avise quem pediu o trabalho** do que depende dele: acrescentar as variáveis novas no `.env.local` e no Easypanel; cadastrar o webhook no sandbox do Asaas; rodar o roteiro manual; confirmar com a nutricionista a fórmula e os pisos (§6.2).
