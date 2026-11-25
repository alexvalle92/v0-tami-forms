# Conversões do Google Ads (tag + Data Manager API)

**Data:** 2026-11-25
**Branch da implementação:** `feature/google-ads`
**Status:** implementado; aguardando ativação (README, seção "Google Ads")

## 1. Contexto e objetivo

O Meta já recebe `ViewContent`, `Lead`, `InitiateCheckout` e `Purchase` (spec `2026-10-24-meta-pixel-capi`). O Google Ads não recebe nada: uma campanha de pesquisa ou Performance Max só otimizaria por clique. O objetivo é preparar o mesmo circuito para o Google, para a campanha otimizar pela compra:

| Conversão | Quando | Por onde | Papel na campanha |
|---|---|---|---|
| `page_view` | Abriu a página | `gtag('config', AW-…)` | Grava o cookie `_gcl_aw` (vinculador) |
| Lead | Etapa 23 → 24 (e-mail validado) | `gtag('event','conversion')` | Secundária |
| Início de checkout | Botão final | `gtag('event','conversion')`, com `PAYMENT_AMOUNT` | Secundária |
| Compra | Webhook de pagamento do Asaas | Servidor, Data Manager API | **Principal** |

### Restrições (as mesmas do Meta)

- O quiz nunca depende do rastreamento; nenhuma falha do Google quebra etapa, envio ou webhook.
- Uma falha do Google nunca vira 500 para o Asaas.
- Sem banner de consentimento: `trackingAllowed()` em `lib/client/google-ads.ts` é o ponto único.
- Dados pessoais só com hash SHA-256, só pelo servidor e só com `GOOGLE_ADS_ENHANCED_CONVERSIONS=true`. Nome e CPF nunca saem. Logs só com ids.

## 2. Decisões

| Tema | Decisão |
|---|---|
| API do Purchase | **Data Manager API** (`POST https://datamanager.googleapis.com/v1/events:ingest`). Desde 15/06/2026 o `UploadClickConversions` da Google Ads API devolve `CUSTOMER_NOT_ALLOWLISTED_FOR_THIS_FEATURE` para quem não importava antes. A Data Manager não pede *developer token* |
| Autenticação | Conta de serviço (JWT RS256 assinado com `node:crypto`, trocado em `oauth2.googleapis.com/token`, escopo `datamanager`), sem biblioteca. Token em cache até 1 min antes de vencer. Escolhida em vez de refresh token de usuário porque um app OAuth em modo "Teste" tem refresh token que vence em 7 dias, e publicar o app pede verificação do escopo sensível |
| Tag | `gtag.js` direto no `<head>` (`components/google-ads-tag-head.tsx`), como o Pixel. O GTM não deve ter tag de conversão do Google Ads |
| Chaves | Duas: `GOOGLE_ADS_TRACKING_ENABLED` (tag + gravação do clique) e `GOOGLE_ADS_UPLOAD_ENABLED` (envio do Purchase). A tag pode ir ao ar antes da conta de serviço; as linhas esperam na fila |
| Identificador | Um por evento, na ordem `gclid > gbraid > wbraid` |
| Conversões otimizadas | Desligadas por padrão. Ligadas, e-mail e telefone (E.164) com hash vão só junto do `gclid`: pedem os termos de dados do cliente aceitos, e o Google não documenta a mistura com `gbraid`/`wbraid` |
| Deduplicação | `transactionId = purchase:<payments.id>`; no navegador, `lead:<sessionId>` e `ic:<sessionId>` (+ registro em `sessionStorage`) |
| Janela | 90 dias (validade do clique). Linha mais velha vira `failed` sem chamar o Google e sem e-mail |
| `validateOnly` | Com `GOOGLE_ADS_VALIDATE_ONLY=true`, um envio aceito vira `failed` com a mensagem "validateOnly: aceito na validação…" e sem aviso ao admin, para ser reaberto por `/api/jobs/retry` quando o envio real for ligado |
| Consentimento (DMA) | Não enviado: o público é brasileiro, fora do EEE. Se a campanha passar a atingir o EEE, `consent.adUserData`/`adPersonalization` precisam entrar no evento |
| Processamento assíncrono | 200 do Google = aceito. O `requestId` fica em `google_ads_conversions.request_id`; a consulta em `requestStatus:retrieve` é manual (README). Automatizar fica para depois |

### Fora de escopo

- Compra no navegador (`/confirmationPayment`).
- Ajustes de conversão (estorno) e compras de renovação.
- Consulta automática de `requestStatus:retrieve`.
- GA4 (a página já tem GTM; se o GA4 for usado, as conversões do Ads não devem ser importadas dele).

## 3. Arquitetura

```
Navegador
  layout.tsx ── <GoogleAdsTagHead/>: window.__TF_GADS__ = { tagId, value, leadLabel?, checkoutLabel? }
                                     + gtag.js + gtag('config', AW-…)
  lib/client/google-ads.ts ── captureClick(): gclid/gbraid/wbraid da URL → sessionStorage (fallback: _gcl_aw/_gcl_gb)
                          └─ conversion("Lead" | "InitiateCheckout") → gtag('event','conversion', { send_to, transaction_id })
  lib/client/submit-quiz.ts ── body.googleAds = { gclid?, gbraid?, wbraid? }
                                 └─> POST /api/submit-quiz → google_ads_attributions

Asaas ─> POST /api/webhooks/asaas
           └─ applyPaymentEvent (transação): 1º evento pago + clique ─> INSERT IGNORE google_ads_conversions
           └─ resposta 200 ─> defer ─> sendGoogleAdsConversion(id) ─> Data Manager API
Rodada do job (2 min) ─> google_ads_conversions vencidas ─> sendGoogleAdsConversion(id)
                      └─> purge: google_ads_attributions > 90 dias
```

### Módulos novos

| Arquivo | Papel |
|---|---|
| `lib/google-ads/shared.ts` | Nomes, regex e tipos usados no navegador e no servidor |
| `lib/google-ads/attribution.ts` | `parseSubmitGoogleAds`: lê o `googleAds` do envio; inválido vira ausente |
| `lib/google-ads/head-scripts.ts` | Scripts do `<head>` (função pura) |
| `lib/google-ads/user-data.ts` | Normalização do Google (Gmail sem pontos e sem `+sufixo`; telefone E.164) e SHA-256 |
| `lib/google-ads/auth.ts` | `parseServiceAccountKey` (JSON cru ou base64) e `createServiceAccountTokenProvider` |
| `lib/google-ads/data-manager.ts` | `createDataManagerClient(...).ingest(events)` → `ok` (com `requestId`) / `retryable` / `fatal` |
| `lib/client/google-ads.ts` | Lado do navegador; nunca lança |
| `lib/services/send-google-ads-conversion.ts` | Trava, monta, envia e registra o Purchase; nunca lança |
| `components/google-ads-tag-head.tsx` | Componente de servidor do `<head>` |
| `lib/db/migrations/0008_google_ads_tracking.sql` | `google_ads_attributions` e `google_ads_conversions` |

### Módulos alterados

`lib/env.ts`, `lib/container.ts`, `app/layout.tsx`, `components/quiz-page.tsx`, `components/loading-screen.tsx`, `lib/client/submit-quiz.ts`, `lib/quiz/validation.ts`, `lib/services/submit-quiz.ts`, `lib/db/schema.ts`, `lib/db/repos/{types,mysql}.ts`, `lib/services/handle-asaas-event.ts`, `lib/http/handlers/asaas-webhook.ts`, `app/api/webhooks/asaas/route.ts`, `lib/jobs/{run-jobs,retry-failed,purge-observability}.ts`, `lib/http/handlers/jobs.ts`, `lib/services/alert-admin.ts`, `tests/fakes/memory-repos.ts`, `tests/db/repos.contract.ts`, `README.md`, `.env.example`.

## 4. Configuração

| Variável | Padrão | Regra com a chave ligada |
|---|---|---|
| `GOOGLE_ADS_TRACKING_ENABLED` | `false` | — |
| `GOOGLE_ADS_TAG_ID` | — | Obrigatória, `^AW-\d+$` |
| `GOOGLE_ADS_LEAD_LABEL`, `GOOGLE_ADS_CHECKOUT_LABEL` | — | Opcionais, `^[A-Za-z0-9_-]{1,100}$` |
| `GOOGLE_ADS_UPLOAD_ENABLED` | `false` | — |
| `GOOGLE_ADS_CUSTOMER_ID` | — | Obrigatória, 10 dígitos (hífens aceitos) |
| `GOOGLE_ADS_LOGIN_CUSTOMER_ID` | — | Opcional, 10 dígitos |
| `GOOGLE_ADS_PURCHASE_CONVERSION_ACTION_ID` | — | Obrigatória, só dígitos |
| `GOOGLE_ADS_SERVICE_ACCOUNT_JSON` | — | Obrigatória, JSON com `client_email` e `private_key` (cru ou base64) |
| `GOOGLE_ADS_ENHANCED_CONVERSIONS` | `false` | — |
| `GOOGLE_ADS_VALIDATE_ONLY` | `false` | — |

Em branco conta como ausente, e o formato só é conferido com a chave ligada (mesma regra das `META_*`).

## 5. Pedido à Data Manager API

```json
{
  "destinations": [{
    "operatingAccount": { "accountType": "GOOGLE_ADS", "accountId": "1234567890" },
    "loginAccount":     { "accountType": "GOOGLE_ADS", "accountId": "1234567890" },
    "productDestinationId": "987654321"
  }],
  "encoding": "HEX",
  "events": [{
    "transactionId": "purchase:<payments.id>",
    "eventTimestamp": "2026-11-25T15:00:00.000Z",
    "eventSource": "WEB",
    "conversionValue": 39.9,
    "currency": "BRL",
    "adIdentifiers": { "gclid": "…" },
    "userData": { "userIdentifiers": [{ "emailAddress": "<sha256>" }, { "phoneNumber": "<sha256>" }] }
  }]
}
```

Resultado: 2xx → `ok`; rede, timeout, 5xx, 429, 408 → `retryable`; 401 → descarta o token e `retryable`; outro 4xx → `fatal`. A mensagem leva `error.status` e `error.message` do Google (até 200 caracteres), nunca o token nem a chave.

## 6. Dados

`google_ads_attributions` (PK `quiz_response_id` → `quiz_responses`; `gclid`, `gbraid`, `wbraid` `VARCHAR(255)`; índice em `created_at`) e `google_ads_conversions` (espelho de `meta_conversions`, com `transaction_id` no lugar de `event_id` e a coluna `request_id`; `UNIQUE (payment_id)`; sem FK para `quiz_responses`, para o purge não depender dela).

## 7. Testes

- `tests/lib/google-ads/*`: tag, parse do envio, normalização com o hash de exemplo da documentação do Google, assinatura JWT conferida com a chave pública, cache e erros do token, corpo e classificação de erros da Data Manager.
- `tests/lib/client/google-ads.test.ts`: captura do clique (URL, sessão, cookies), conversões uma vez por sessão, falhas que não escapam.
- `tests/lib/services/send-google-ads-conversion.test.ts`: sucesso com `requestId`, retry, fatal com aviso, 90 dias, dados ausentes, `validateOnly`, logs sem dado pessoal.
- Contrato dos repositórios (memória e MySQL): seção 46b.
- Ajustes em webhook, handle-asaas-event, run-jobs, retry, purge, submit-quiz, validação, env e container.
