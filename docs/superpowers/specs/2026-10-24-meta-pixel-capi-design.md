# Pixel da Meta e API de Conversões

**Data:** 2026-10-24
**Branch da implementação:** `feature/meta-pixel-capi` (o spec é commitado na `develop`)
**Status:** design aprovado em conversa; aguardando revisão do spec

## 1. Contexto e objetivo

O quiz já registra a UTM e o caminho etapa por etapa (`funnel_sessions` e `funnel_events`, lidos no Metabase). Mas o código não tem Pixel da Meta nem API de Conversões (CAPI). Sem isso, a Meta não sabe quem chegou ao fim do quiz nem quem pagou, e entrega o anúncio para quem só clica.

**Objetivo:** mandar para a Meta quatro eventos, para a campanha otimizar por quem converte:

| Evento | Quando dispara | Navegador (Pixel) | Servidor (CAPI) |
|---|---|---|---|
| `ViewContent` | Abriu o quiz | sim | sim (espelho) |
| `Lead` | Informou o e-mail (etapa 24, índice 23) | sim | sim (espelho) |
| `InitiateCheckout` | Clicou em "Garantir Meu Plano Alimentar Agora" | sim | sim (espelho) |
| `Purchase` (R$ 39,90) | Chegou o webhook de pagamento do Asaas | não | sim, com nova tentativa |

O `Purchase` sai só do servidor: o pagamento acontece no domínio do Asaas, e muita gente não volta para `/confirmationPayment`.

### Restrições

- O quiz nunca depende do rastreamento: bloqueador, Pixel fora do ar ou Meta com erro não podem quebrar nenhuma etapa, o envio nem o webhook.
- O webhook do Asaas mantém o contrato atual (spec `2026-10-11-webhook-asaas-plano-alimentar`): uma falha da Meta nunca vira 500 para o Asaas.
- LGPD: sem banner por enquanto. A chave `META_TRACKING_ENABLED` liga e desliga tudo, e um único ponto no cliente (`trackingAllowed()`) decide se rastreia; é ali que o consentimento entra no futuro. E-mail, telefone e nome só saem do servidor com SHA-256. CPF não é enviado. Logs nunca levam dado pessoal, token nem corpo.

## 2. Decisões tomadas

| Tema | Decisão |
|---|---|
| Onde fica o Pixel | Direto no código (`fbq` no `layout.tsx`), não no GTM. O GTM não deve ter nenhuma tag da Meta |
| Redundância | `ViewContent`, `Lead` e `InitiateCheckout` saem pelo Pixel e pela CAPI com o mesmo `event_id`; a Meta deduplica |
| Purchase | Fila persistida `meta_conversions`. A linha entra na transação do webhook, o envio é tentado logo depois da resposta e o job repete com backoff por até 7 dias |
| Espelho do navegador | `POST /api/meta/events`, uma tentativa, nada gravado (o Pixel já cobre a perda) |
| Identidade | `external_id` = `sessionId` do funil (`tf_session_id`); o mesmo valor vai nos quatro eventos |
| Atribuição do Purchase | `meta_attributions`, uma linha por envio do quiz: `fbp`, `fbc`, IP, User-Agent, URL e `external_id`, gravada no envio do quiz |
| Renovações | Não geram `Purchase`: o PlanA chama `/api/renewals` sem o campo `meta`, então não existe atribuição |
| Valor | Do servidor: `payments.amount` no `Purchase` e `PAYMENT_AMOUNT` no `InitiateCheckout`. O cliente nunca informa o valor |
| Liga/desliga | Variáveis lidas na hora do pedido (não no build): trocar no Easypanel e reiniciar basta |
| Retenção | `meta_attributions` com mais de 90 dias é apagada pelo purge que já existe |

### Fora de escopo

- Banner de consentimento.
- `Purchase` no navegador, inclusive em `/confirmationPayment` (só o servidor envia; não há deduplicação a fazer).
- Eventos de estorno ou chargeback para a Meta (a CAPI não tem evento negativo).
- `Purchase` das renovações.
- Correspondência avançada automática do Pixel no navegador (`fbq('init', id, { em })`): os dados hasheados vão só pela CAPI.
- Outras plataformas (Google Ads, TikTok).

## 3. Arquitetura

```
Navegador (quiz)
  layout.tsx ── <head>: window.__TF_META__ = { pixelId, value } + snippet do fbq + PageView
  lib/client/meta.ts ── trackingAllowed() ── fbq('track', nome, dados, { eventID })
                     └─ sendBeacon/fetch keepalive ─> POST /api/meta/events
                                                         └─ defer ─> CAPI (uma tentativa)
  lib/client/submit-quiz.ts ── body.meta = { fbp, fbc, eventSourceUrl, externalId }
                                  └─> POST /api/submit-quiz ─> meta_attributions (+ IP, User-Agent)

Asaas ─> POST /api/webhooks/asaas
           └─ applyPaymentEvent (transação)
                 └─ 1º evento pago + atribuição ─> INSERT IGNORE meta_conversions
           └─ resposta 200 ─> defer ─> sendMetaConversion(id) ─> CAPI
Rodada do job (a cada 2 min) ─> meta_conversions vencidas ─> sendMetaConversion(id)
                            └─> purge: meta_attributions > 90 dias
```

### Módulos novos

| Arquivo | Papel |
|---|---|
| `lib/meta/user-data.ts` | `buildUserData(input)`: normaliza, aplica SHA-256 e monta o `user_data` da CAPI. Função pura |
| `lib/meta/capi.ts` | `createMetaCapiClient(d)`: `send(events)` → `{ kind: "ok" } \| { kind: "retryable" \| "fatal", status?, message }` |
| `lib/meta/events.ts` | Schema zod do `POST /api/meta/events`, do campo `meta` do envio do quiz e os tipos compartilhados |
| `lib/client/meta.ts` | Pixel no navegador: config, cookies, `fbc` pelo `fbclid`, `metaEvent(...)`, uma vez por sessão; nunca lança |
| `lib/services/send-meta-conversion.ts` | `createSendMetaConversion(d)`: trava, monta e envia o `Purchase`, registra o resultado; nunca lança |
| `lib/http/handlers/meta-events.ts` | `createMetaEventsHandler(d)` no padrão dos outros handlers |
| `app/api/meta/events/route.ts` | Rota fina que pega o container e chama o handler |
| `components/meta-pixel-head.tsx` | Componente de servidor que renderiza o config e o snippet do `fbq` no `<head>` |

### Módulos alterados

- `lib/env.ts`: variáveis da seção 4.
- `app/layout.tsx`: `await connection()` (leitura do env na hora do pedido) e `<MetaPixelHead />` no `<head>`.
- `app/page.tsx`: os três eventos da seção 5.3.
- `lib/client/submit-quiz.ts`: campo `meta` no corpo.
- `lib/quiz/validation.ts`: `parseSubmitRequest` lê `meta` opcional; inválido vira ausente, sem derrubar o envio.
- `lib/http/handlers/submit-quiz.ts`: passa IP e User-Agent do pedido para o serviço.
- `lib/services/submit-quiz.ts`: grava `meta_attributions` depois que o envio está salvo.
- `lib/db/repos/mysql.ts` (`applyPaymentEvent`): insere a linha de `meta_conversions` (seção 7.1).
- `lib/db/repos/types.ts`: `MetaAttributionRepo`, `MetaConversionRepo` e `pendingConversion` em `PaymentEventResult`.
- `lib/services/handle-asaas-event.ts` e `lib/http/handlers/asaas-webhook.ts`: repassam `pendingConversion` e chamam o envio no `defer`.
- `lib/jobs/run-jobs.ts`: passo `conversions`, depois das notificações e antes do purge.
- `lib/jobs/retry-failed.ts` e `app/api/jobs/retry/route.ts`: alvo `{ metaConversionId }`.
- `lib/jobs/purge-observability.ts`: apaga `meta_attributions` com mais de 90 dias.
- `lib/services/alert-admin.ts`: `AdminAlert.kind` ganha `"meta_conversion"`.
- `lib/container.ts`: monta o cliente da CAPI, o serviço, o rate limiter próprio e o handler.
- `lib/db/schema.ts` + migration `0006`.
- `tests/fakes/memory-repos.ts`, `tests/db/repos.contract.ts`: os dois repositórios novos e a regra do `Purchase`.
- `README.md`: variáveis da Meta e checklist de ativação (seção 10).

## 4. Configuração

| Variável | Tipo | Padrão | Uso |
|---|---|---|---|
| `META_TRACKING_ENABLED` | `"true"`/`"false"` | `"false"` | Liga Pixel, espelho, gravação de atribuição e envio do `Purchase` |
| `META_PIXEL_ID` | só dígitos | — | Obrigatória se ligado |
| `META_CAPI_TOKEN` | texto | — | Obrigatória se ligado. Nunca logada |
| `META_API_VERSION` | `vNN.N` | `v24.0` | Versão da Graph API (conferir a vigente na ativação) |
| `META_TEST_EVENT_CODE` | texto | — | Opcional. Se presente, vai como `test_event_code` em todo envio da CAPI |

O schema do `lib/env.ts` usa `superRefine`: com `META_TRACKING_ENABLED=true`, faltar `META_PIXEL_ID` ou `META_CAPI_TOKEN` é erro de env, como as outras variáveis. Com `false`, as duas podem faltar.

O `layout.tsx` não usa `getEnv()` (que exige o env inteiro): `components/meta-pixel-head.tsx` lê `META_TRACKING_ENABLED`, `META_PIXEL_ID` e `PAYMENT_AMOUNT` de `process.env` depois de `await connection()` e não renderiza nada se o rastreamento estiver desligado ou se o id não for só dígitos.

## 5. Navegador

### 5.1 Snippet no `<head>`

Com o rastreamento ligado, o `<head>` recebe dois `<script>` inline, que rodam antes da hidratação:

1. `window.__TF_META__ = { pixelId: "<id>", value: "39.90" }` (JSON serializado com `JSON.stringify` e `<` escapado).
2. O snippet base do `fbq` (cria a fila, carrega `https://connect.facebook.net/en_US/fbevents.js` com `async`), `fbq('init', '<id>')` e `fbq('track', 'PageView')`.

Mais o `<noscript>` com o `<img>` do `PageView`. O `PageView` é só do navegador e não tem espelho.

### 5.2 `lib/client/meta.ts`

Mesmo estilo do `lib/client/track.ts`: sem React, toda função exportada dentro de `try/catch`, dependências do navegador por injeção (`createMeta(deps)`) e um `getMeta()` único do navegador que, fora dele (SSR, testes), não faz nada.

- `trackingAllowed()`: `true` se `window.__TF_META__.pixelId` existe. Ponto único para o consentimento futuro.
- `readFbp()`: cookie `_fbp`, se casar com `^fb\.\d\.\d+\.\d+$`.
- `readFbc()`: cookie `_fbc`, se casar com `^fb\.\d\.\d+\..+$`. Se não houver e a URL tiver `fbclid`, monta `fb.1.<Date.now()>.<fbclid>`. O valor montado fica no `sessionStorage` (`tf_meta_fbc`) para as etapas seguintes e para o envio do quiz, já que o `fbclid` só está na URL da primeira página.
- `metaEvent(name, { eventId, user? })`, com `name` em `ViewContent | Lead | InitiateCheckout`:
  1. Se `!trackingAllowed()` ou se o `eventId` já está em `tf_meta_sent` (`sessionStorage`, lista; em memória se o storage estiver bloqueado), não faz nada.
  2. `fbq('track', name, customData, { eventID: eventId })`, só se `window.fbq` for função. Para `InitiateCheckout`, `customData = { value: Number(config.value), currency: "BRL" }`; nos outros, `{}`.
  3. Corpo para `POST /api/meta/events`: `{ eventName, eventId, eventSourceUrl: location.href, externalId, fbp?, fbc?, email?, phone?, name? }`. Envio por `sendBeacon` com `Blob` JSON; se não houver ou devolver `false`, `fetch` com `keepalive`. Erro descartado.
  4. Registra o `eventId` em `tf_meta_sent`.
- `attributionForSubmit()`: `{ fbp?, fbc?, eventSourceUrl, externalId }` para o envio do quiz, ou `undefined` se `!trackingAllowed()`.
- `externalId` = `getTracker().sessionId`. Se vier vazio (tracker no-op), os eventos saem sem `externalId`.

### 5.3 Gatilhos em `app/page.tsx`

| Evento | Gatilho | `eventId` | `user` |
|---|---|---|---|
| `ViewContent` | `useEffect` de montagem | `vc:<sessionId>` | — |
| `Lead` | No efeito de troca de etapa, quando `stepRef.current.step === 23` e `currentStep === 24` | `lead:<sessionId>` | `{ email }` |
| `InitiateCheckout` | Início de `handleFinalRedirect`, antes do `window.location.href` | `ic:<sessionId>` | `{ email, phone: whatsapp, name: nome_completo }` |

O e-mail já passou por `stepValidation` quando a etapa 23 avança. O `fillTestData` pula direto para a etapa 27 e por isso não gera `Lead`; o `InitiateCheckout` do teste só sai se alguém clicar no botão final, como hoje acontece com o `checkout_click`. O `sessionId` vazio impede os três eventos (sem `eventId` estável não há deduplicação).

### 5.4 Envio do quiz

`submitQuizRequest` recebe `meta?: MetaAttributionInput` e manda `{ submissionId, answers, meta }`. O chamador (`components/loading-screen.tsx`) passa `getMeta().attributionForSubmit()`.

## 6. Servidor: espelho dos eventos do navegador

### 6.1 `POST /api/meta/events`

Ordem: rastreamento ligado → rate limit (60/min por IP, limiter próprio) → corpo (4 KB) → zod → resposta 204 → `defer` envio.

- Desligado: 204 sem ler o corpo.
- Rate limit estourado, corpo grande ou inválido: 204 também, com log `warn` (`meta.events.rate_limited` / `meta.events.invalid`, só com o motivo). O navegador não faz nada com a resposta, e 4xx só gera ruído no console.
- Schema (`lib/meta/events.ts`):
  - `eventName`: `ViewContent | Lead | InitiateCheckout`.
  - `eventId`: `^(vc|lead|ic):<uuid>$`, e o prefixo tem de bater com o `eventName`.
  - `externalId`: UUID, opcional.
  - `eventSourceUrl`: URL `http(s)`, até 500 caracteres.
  - `fbp`, `fbc`: mesmos regex da 5.2, até 500 caracteres, opcionais.
  - `email` (até 254), `phone` (até 20), `name` (até 200): opcionais; formato inválido vira ausente.
- O servidor completa com `client_ip_address` (`clientIp(req)`, omitido se `"unknown"`), `client_user_agent` (até 500), `event_time` = agora e, no `InitiateCheckout`, `custom_data = { value: Number(PAYMENT_AMOUNT), currency: "BRL" }`.
- Envio: `capi.send([evento])`, uma tentativa. Falha vira log `warn` `meta.events.send_failed` com `{ eventName, status, kind }`.

### 6.2 `lib/meta/user-data.ts`

`buildUserData({ email?, phone?, name?, externalId?, ip?, userAgent?, fbp?, fbc? })`:

| Campo CAPI | Origem | Normalização antes do SHA-256 |
|---|---|---|
| `em` | e-mail | `trim` + minúsculas |
| `ph` | telefone | só dígitos; com 10 ou 11 dígitos, recebe `55` na frente; com 12 ou 13 começando por `55`, fica como está; outro tamanho é descartado |
| `fn`, `ln` | nome | `trim`, minúsculas, sem acento (NFD sem marcas); `fn` = primeira palavra, `ln` = última (nome de uma palavra só: só `fn`) |
| `external_id` | `sessionId` | `trim` + minúsculas |
| `country` | fixo | `"br"` |
| `client_ip_address`, `client_user_agent`, `fbp`, `fbc` | pedido / atribuição | sem hash |

Os campos com hash vão como array de um elemento (`em: ["<hex>"]`). Campo vazio depois da normalização é omitido.

### 6.3 `lib/meta/capi.ts`

`createMetaCapiClient({ pixelId, token, apiVersion, testEventCode?, fetchImpl?, timeoutMs = 10_000 })`:

- `POST https://graph.facebook.com/<apiVersion>/<pixelId>/events`, corpo JSON `{ data: events, access_token, test_event_code? }`.
- Cada evento: `{ event_name, event_time (segundos Unix), event_id, action_source: "website", event_source_url, user_data, custom_data? }`.
- Resultado: 2xx → `ok`; rede, timeout, 5xx e 429 → `retryable`; outro status → `fatal`. A mensagem leva o status e, se houver, `error.message` da resposta da Meta cortado em 200 caracteres. O token nunca entra na mensagem.

## 7. Servidor: Purchase

### 7.1 Inserção na transação do webhook

Em `applyEventOnce` (`lib/db/repos/mysql.ts`), no bloco `e.group === "paid"`, quando `p.paidAt === null` (primeira vez que a cobrança é paga):

1. Busca o envio mais recente da cobrança que tem atribuição: `quiz_responses` com `payment_id = p.id` junto de `meta_attributions`, por `quiz_responses.created_at` desc, `LIMIT 1`.
2. Se existir: `INSERT IGNORE INTO meta_conversions` com `id` novo, `payment_id = p.id`, `quiz_response_id`, `event_id = "purchase:<p.id>"`, `event_time = now`, `status = "pending"`, `next_attempt_at = now`.
3. O resultado `processed` ganha `pendingConversion: { id } | null`: o `id` da linha inserida, ou null se a busca não achou nada ou se o `INSERT IGNORE` não inseriu nada (a chave única em `payment_id` cobre corrida e reprocessamento).

`PAYMENT_CONFIRMED` seguido de `PAYMENT_RECEIVED`: o segundo evento já encontra `paidAt` preenchido, então não insere. Reversão e eventos antes do pagamento nunca inserem. A gravação não depende de `META_TRACKING_ENABLED`: sem atribuição não há linha, e a atribuição só existe se o rastreamento estava ligado no envio do quiz.

### 7.2 `sendMetaConversion(id)`

`createSendMetaConversion({ conversions, capi, enabled, alertAdmin, log, now })` devolve uma função que nunca lança:

1. Desligado (`enabled === false`) ou sem cliente: não faz nada (a linha fica `pending` e sai quando religar, se ainda estiver dentro dos 7 dias).
2. `conversions.claim(id, now)`: trava por 60 s (`locked_until`) se `status = "pending"`, `next_attempt_at <= now` e sem lock vigente. Não conseguiu: sai.
3. `conversions.loadPayload(id)`: junta `meta_conversions`, `payments` (`amount`), `patients` (`email`, `phone`, `name`) e `meta_attributions` (`fbp`, `fbc`, `client_ip`, `user_agent`, `event_source_url`, `external_id`). Se a conversão, a cobrança, o paciente ou a atribuição não forem encontrados (atribuição já apagada pelo purge, por exemplo), devolve null e a linha vira `failed` com `last_error = { message: "dados ausentes" }`.
4. Evento: `event_name: "Purchase"`, `event_id`, `event_time` = `meta_conversions.event_time`, `event_source_url`, `user_data` pela 6.2, `custom_data = { value: Number(amount), currency: "BRL" }`.
5. Resultado:
   - `ok` → `markSent(id, now)` (`status = "sent"`, `sent_at`, `attempts + 1`, sem lock). Log `info` `meta.purchase.sent` com `{ conversionId, paymentId }`.
   - `retryable` com `attempts + 1 < MAX_META_CONVERSION_ATTEMPTS` (8) e `event_time` há menos de 7 dias → `markRetry(id, now + jobBackoffMs(attempts + 1), lastError)`. Log `warn` `meta.purchase.retry`.
   - Qualquer outro caso (`fatal`, tentativas esgotadas, mais de 7 dias) → `markFailed(id, lastError)`, log `error` `meta.purchase.failed` e `alertAdmin({ kind: "meta_conversion", ... })` com o `paymentId` e a mensagem segura.
   - Exceção inesperada: log `error` e solta o lock (`markRetry` com o mesmo backoff), sem lançar.

### 7.3 Quem chama

- Handler do webhook: se `handled.pendingConversion`, `d.defer(() => sendMetaConversion(id))`, igual à geração do plano.
- Rodada do job: `conversions.listDue(now, limit = 20)` → `sendMetaConversion(id)` em sequência; conta em `RunSummary.conversions`. Falha ao listar conta em `errors`.
- `POST /api/jobs/retry` com `{ metaConversionId }`: `conversions.reopen(id)` volta uma linha `failed` para `pending`, `attempts = 0`, `next_attempt_at = now`.

## 8. Dados

### 8.1 Migration `0006`

```sql
CREATE TABLE meta_attributions (
  quiz_response_id CHAR(36) PRIMARY KEY,
  external_id      CHAR(36) NULL,
  fbp              VARCHAR(500) NULL,
  fbc              VARCHAR(500) NULL,
  client_ip        VARCHAR(45) NULL,
  user_agent       VARCHAR(500) NULL,
  event_source_url VARCHAR(500) NULL,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  CONSTRAINT meta_attributions_quiz_response_fk FOREIGN KEY (quiz_response_id) REFERENCES quiz_responses(id),
  INDEX meta_attributions_created_at_idx (created_at)
);

CREATE TABLE meta_conversions (
  id               CHAR(36) PRIMARY KEY,
  payment_id       CHAR(36) NOT NULL,
  quiz_response_id CHAR(36) NOT NULL,
  event_id         VARCHAR(80) NOT NULL,
  event_time       DATETIME(3) NOT NULL,
  status           ENUM('pending','sent','failed') NOT NULL,
  attempts         INT NOT NULL DEFAULT 0,
  next_attempt_at  DATETIME(3) NOT NULL,
  locked_until     DATETIME(3) NULL,
  last_error       JSON NULL,
  sent_at          DATETIME(3) NULL,
  created_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at       DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY meta_conversions_payment_id_unique (payment_id),
  INDEX meta_conversions_status_next_attempt_at_idx (status, next_attempt_at),
  CONSTRAINT meta_conversions_payment_fk FOREIGN KEY (payment_id) REFERENCES payments(id)
);
```

A migration é gerada pelo `drizzle-kit generate` a partir do `schema.ts`; o SQL acima é a referência do resultado esperado.

`meta_conversions.quiz_response_id` não tem FK de propósito: o purge apaga `meta_attributions` e não deve depender de `meta_conversions`. A linha de `meta_conversions` não tem dado pessoal e não é apagada.

### 8.2 Repositórios (`lib/db/repos/types.ts`)

```ts
export type MetaAttributionInput = {
  externalId: string | null
  fbp: string | null
  fbc: string | null
  clientIp: string | null
  userAgent: string | null
  eventSourceUrl: string | null
}

export interface MetaAttributionRepo {
  /** INSERT IGNORE: a primeira gravação do envio vale (reenvio com o mesmo submissionId não troca). */
  save(quizResponseId: string, a: MetaAttributionInput): Promise<void>
  purgeOlderThan(cutoff: Date, limit: number): Promise<number>
}

export type MetaConversionPayload = {
  id: string
  paymentId: string
  eventId: string
  eventTime: Date
  attempts: number
  amount: string
  patient: { email: string; phone: string; name: string }
  attribution: MetaAttributionInput
}

export interface MetaConversionRepo {
  listDue(now: Date, limit: number): Promise<string[]>
  claim(id: string, now: Date): Promise<boolean>
  loadPayload(id: string): Promise<MetaConversionPayload | null>
  markSent(id: string, now: Date): Promise<void>
  markRetry(id: string, nextAttemptAt: Date, lastError: unknown): Promise<void>
  markFailed(id: string, lastError: unknown): Promise<void>
  reopen(id: string): Promise<boolean>
}
```

`Repos` ganha `metaAttributions` e `metaConversions`. Os dois entram no `memory-repos` e no contrato.

### 8.3 Gravação no envio do quiz

`ParsedSubmission` ganha `meta?: { externalId?, fbp?, fbc?, eventSourceUrl? }`, e `SubmitQuiz` passa a receber `(input, ctx?: { clientIp?: string; userAgent?: string })`. Em `createSubmitQuiz`, logo depois de obter o `ref`, se `input.meta` existir e o rastreamento estiver ligado: `metaAttributions.save(ref.quizResponseId, ...)` dentro de `try/catch`. Uma falha vira log `warn` `submit.meta_attribution_failed` e o envio segue normalmente. O handler de `/api/renewals` não passa `ctx` e o PlanA não manda `meta`.

## 9. Testes

Vitest, no padrão dos testes atuais, com os fakes de `tests/fakes`.

- `tests/lib/meta/user-data.test.ts`: e-mail com maiúsculas e espaços; telefone com máscara, com e sem `55`, tamanho inválido; nome com acento, composto e de uma palavra; hash conhecido de um valor fixo; campos vazios omitidos.
- `tests/lib/meta/capi.test.ts`: URL, corpo e `test_event_code`; 200 → `ok`; 400 → `fatal` com a mensagem da Meta; 500, 429, erro de rede e timeout → `retryable`; o token nunca aparece no resultado.
- `tests/lib/meta/events.test.ts`: schema do espelho (prefixo do `eventId` × `eventName`, campos opcionais inválidos viram ausentes) e o `meta` do envio do quiz.
- `tests/lib/client/meta.test.ts`: `trackingAllowed()` falso não chama nada; cookies lidos e validados; `fbc` montado a partir do `fbclid` e guardado; `fbq` chamado com o `eventID`; beacon com fallback para `fetch`; mesmo `eventId` não sai duas vezes; `fbq` ausente ainda envia o espelho; exceção do navegador não escapa.
- `tests/lib/http/meta-events.test.ts`: desligado → 204 sem envio; válido → 204 e um envio com IP, User-Agent e, no `InitiateCheckout`, o valor do servidor; corpo grande, inválido e rate limit → 204 sem envio.
- `tests/lib/services/send-meta-conversion.test.ts`: sucesso; `retryable` agenda pelo `jobBackoffMs`; a 8ª falha e o evento com mais de 7 dias viram `failed` com aviso ao admin; `fatal` vira `failed` na hora; `claim` falso não envia; desligado não faz nada; exceção não escapa.
- `tests/lib/services/submit-quiz.test.ts`: grava a atribuição com IP e User-Agent; falha ao gravar não muda o resultado; sem `meta` não grava.
- `tests/lib/services/handle-asaas-event.test.ts` e o teste do handler do webhook: `pendingConversion` chega ao `defer`.
- `tests/lib/jobs/run-jobs.test.ts`, `retry-failed.test.ts`, `purge-observability.test.ts`: passo `conversions`, alvo novo e purge da atribuição.
- `tests/db/repos.contract.ts` (memória e MySQL): primeiro evento pago com atribuição cria uma linha; `PAYMENT_CONFIRMED` + `PAYMENT_RECEIVED` cria só uma; sem atribuição (renovação) não cria; reversão não cria; evento duplicado não cria; `claim` exclusivo; `listDue` respeita `next_attempt_at` e o lock; `reopen` só em `failed`.
- `tests/lib/env.test.ts`: ligado sem `META_PIXEL_ID` ou sem `META_CAPI_TOKEN` falha; desligado sem eles passa.

## 10. Ativação

1. No Gerenciador de Eventos da Meta: anotar o id do Pixel, gerar o token de acesso da API de Conversões e conferir a versão vigente da Graph API.
2. No GTM (`GTM-PPXNWRMB`): conferir que não existe tag da Meta; se existir, pausar antes de publicar.
3. No Easypanel: `META_TRACKING_ENABLED=true`, `META_PIXEL_ID`, `META_CAPI_TOKEN`, `META_API_VERSION` e `META_TEST_EVENT_CODE` (o código da aba "Testar eventos"). Rodar a migration `0006` e reiniciar.
4. Passar o quiz no celular, entrando por um link com `?fbclid=teste`. Em "Testar eventos", conferir `PageView`, `ViewContent`, `Lead` e `InitiateCheckout`, cada um recebido pelo navegador e pelo servidor e marcado como desduplicado.
5. Pagar uma cobrança no sandbox do Asaas e conferir o `Purchase` de R$ 39,90 vindo do servidor, sem abrir `/confirmationPayment`.
6. Remover `META_TEST_EVENT_CODE`, reiniciar e configurar a campanha para otimizar por `Purchase` (ou `InitiateCheckout` enquanto o volume de compras for baixo para sair da fase de aprendizado).
