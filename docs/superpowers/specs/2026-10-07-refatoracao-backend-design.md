# Refatoração do backend: n8n → Next.js + MySQL + Asaas

**Data:** 2026-10-07
**Branch:** `feature/refatoracao`
**Status:** design aprovado em conversa; aguardando revisão do spec

## 1. Contexto e objetivo

O `v0-tami-forms` é um quiz (Next.js 16) que coleta dados de comportamento, peso/altura e dados pessoais de quem quer um plano alimentar personalizado. Hoje, ao final do quiz, o navegador chama direto um webhook do n8n, que orquestra cinco fluxos: Supabase (paciente + resposta), Asaas (cliente + cobrança) e "Comunicar Cliente" (e-mail Gmail + WhatsApp Evolution API).

**Objetivo:** remover o n8n e implementar todo o backend dentro deste projeto, com boas práticas (validação, idempotência, retry com backoff, reprocessamento automático, observabilidade), mantendo o front **visualmente e em conteúdo idêntico**.

### Desfechos exigidos após o envio

| # | Situação | Comportamento no front (já existe) |
|---|---|---|
| 1 | Banco ok + Asaas ok | Redireciona para o link de pagamento do Asaas |
| 2 | Banco ok + Asaas falhou | Vai para `/confirmation` ("logo enviaremos o link") |
| 3 | Banco falhou | Mensagem de erro na tela com "Tentar novamente" |

### Restrições

- Deploy direto do GitHub no **Easypanel, sem Docker** (`next build` / `next start`, porta 5000).
- Front: só mudanças de lógica; nenhuma mudança visual ou de texto.
- Banco: **MySQL 8**, começando do zero (o Supabase sai do projeto; o app PlanA ainda não existe e não depende dele).

## 2. Decisões tomadas

| Tema | Decisão |
|---|---|
| Banco | MySQL 8, schema novo, sem migração de dados do Supabase |
| Escopo | Envio do formulário + notificações (e-mail + WhatsApp) + reprocessamento automático |
| Fora de escopo | Webhook de pagamento do Asaas (`PAYMENT_RECEIVED`/`CONFIRMED`), mensagem de "Primeiro Acesso App PlanA", senha do paciente, tela de admin |
| E-mail | SMTP genérico (nodemailer), configurável por env |
| WhatsApp | Evolution API via HTTP |
| Identidade do paciente | **CPF** (único). E-mail não é único. Paciente existente é reaproveitado e tem nome/e-mail/telefone atualizados com o envio mais recente |
| Cliente recorrente | Reaproveita cobrança pendente e não vencida; senão cria nova |
| CPF no formulário | Mantido. Alternativa via Asaas Checkout documentada como experimento futuro (seção 12) |
| Abordagem | **Síncrona + outbox + job interno** (Asaas chamado na requisição com retry; falhas e notificações tratadas por um job) |
| Stack | Drizzle ORM + `mysql2`, migrations SQL versionadas, zod, nodemailer, `fetch` com wrapper de retry, Vitest |

## 3. Arquitetura e módulos

```
app/api/submit-quiz/route.ts            → recebe o formulário (parse + chama o serviço)
app/api/jobs/run/route.ts               → dispara o job manualmente (Bearer token)
app/api/jobs/retry/route.ts             → reabre itens em falha definitiva (Bearer token)
app/api/health/route.ts                 → health check (testa conexão MySQL)
instrumentation.ts                      → no boot: aplica migrations e inicia o agendador

lib/env.ts                              → variáveis de ambiente validadas com zod
lib/db/                                 → conexão mysql2, schema Drizzle, migrations SQL, repositórios
lib/http/retry.ts                       → fetch com timeout + retry exponencial com jitter
lib/asaas/                              → cliente Asaas: buscar/criar cliente, buscar/criar cobrança
lib/notify/                             → e-mail (nodemailer), WhatsApp (Evolution API), templates
lib/quiz/validation.ts                  → schema zod do payload + CPF/telefone/e-mail
lib/log.ts                              → logger JSON com mascaramento de dados pessoais
lib/rate-limit.ts                       → limite de taxa em memória por IP
lib/services/submit-quiz.ts             → orquestra o envio (os 3 desfechos)
lib/services/sync-payment.ts            → garante cliente + cobrança no Asaas (envio e job)
lib/services/dispatch-notifications.ts  → envia notificações pendentes
lib/services/alert-admin.ts             → e-mail de alerta para falhas definitivas
lib/jobs/scheduler.ts                   → loop a cada 2 min, sem sobreposição
lib/jobs/run-jobs.ts                    → uma rodada do job (cobranças + notificações)
```

**Regras de fronteira**

- Rotas não têm regra de negócio: validam a entrada, chamam um serviço e traduzem o resultado em HTTP.
- Serviços recebem dependências (repositórios, cliente Asaas, notificadores, relógio) por parâmetro, para serem testáveis com dublês e sem rede.
- `sync-payment` é o **único** ponto que cria recursos no Asaas. Envio e job usam o mesmo caminho, que é idempotente.

### Limpeza

Remover: `lib/supabase/`, `lib/config.ts` (AWS SSM), `app/api/submit-quiz/route.ts` atual (substituído), `Dockerfile`, `.dockerignore`, `.github/workflows/docker-publish.yml`, `configEasypanel.md`. Remover as dependências usadas só por eles (`@supabase/ssr`, `@supabase/supabase-js`, `@aws-sdk/client-ssm`). Reescrever o `README.md` com setup local, variáveis de ambiente, deploy no Easypanel, operação (retry, consultas SQL de falhas) e roteiro de teste no sandbox.

## 4. Modelo de dados (MySQL 8)

**Convenções:** ids `CHAR(36)` (UUID gerado na aplicação), `utf8mb4`, datas `DATETIME(3)` em UTC, `created_at`/`updated_at` em todas as tabelas. CPF e telefone gravados só com dígitos; e-mail em minúsculas e sem espaços.

### `patients`

| coluna | tipo | notas |
|---|---|---|
| id | CHAR(36) PK | |
| name | VARCHAR(200) | |
| cpf | CHAR(11) **UNIQUE** | identidade do paciente |
| email | VARCHAR(254) | indexado, não único |
| phone | VARCHAR(13) | dígitos, com DDD |
| asaas_customer_id | VARCHAR(64) NULL | |

### `quiz_responses`

| coluna | tipo | notas |
|---|---|---|
| id | CHAR(36) PK | |
| submission_id | CHAR(36) **UNIQUE** | chave de idempotência gerada pelo front |
| patient_id | CHAR(36) FK → patients | |
| answers | JSON | payload completo do quiz |
| first_quiz | BOOLEAN | paciente não tinha respostas anteriores |
| payment_id | CHAR(36) NULL FK → payments | cobrança usada por este envio |

### `payments`

| coluna | tipo | notas |
|---|---|---|
| id | CHAR(36) PK | enviado como `externalReference` no Asaas |
| patient_id | CHAR(36) FK → patients | |
| amount | DECIMAL(10,2) | |
| due_date | DATE NULL | definido na criação no Asaas |
| status | VARCHAR(32) | `PENDING_ASAAS`, `ASAAS_FAILED` ou o status retornado pelo Asaas (`PENDING`, …) |
| asaas_id | VARCHAR(64) **UNIQUE** NULL | |
| asaas_customer_id | VARCHAR(64) NULL | |
| payment_url | VARCHAR(500) NULL | `invoiceUrl` do Asaas |
| invoice_number | VARCHAR(32) NULL | |
| billing_type | VARCHAR(32) NULL | |
| sync_attempts | INT default 0 | |
| next_sync_at | DATETIME(3) NULL | |
| locked_until | DATETIME(3) NULL | reserva para processamento |
| last_error | JSON NULL | ver seção 7 |

Índice em `(status, next_sync_at)` e em `patient_id`.

### `notifications` (outbox)

| coluna | tipo | notas |
|---|---|---|
| id | CHAR(36) PK | |
| quiz_response_id | CHAR(36) FK | |
| payment_id | CHAR(36) FK | |
| channel | ENUM('email','whatsapp') | |
| kind | VARCHAR(32) | `payment_link` (único tipo por ora) |
| recipient | VARCHAR(254) | e-mail ou telefone no formato de envio |
| status | ENUM('pending','sent','failed') | |
| parts_sent | INT default 0 | partes de WhatsApp já enviadas |
| attempts | INT default 0 | |
| next_attempt_at | DATETIME(3) | |
| locked_until | DATETIME(3) NULL | |
| last_error | JSON NULL | |
| sent_at | DATETIME(3) NULL | |

`UNIQUE(quiz_response_id, channel, kind)`: um envio nunca gera duas mensagens iguais. Índice em `(status, next_attempt_at)`.

### Regras

- **Reaproveitamento de cobrança:** cobrança do mesmo paciente com `status IN ('PENDING_ASAAS','PENDING')` e (`due_date IS NULL` ou `due_date >= hoje`). Se houver mais de uma, usa a mais recente.
- **Reserva (lock):** `UPDATE … SET locked_until = NOW(3) + INTERVAL 2 MINUTE WHERE id = ? AND (locked_until IS NULL OR locked_until < NOW(3))`; só processa se `affectedRows = 1`. Ao terminar, `locked_until = NULL`. O TTL de 2 min é maior que o orçamento de qualquer processamento, então uma reserva órfã (processo morto) expira sozinha.
- **Migrations:** geradas pelo `drizzle-kit` e versionadas em `lib/db/migrations/`. Aplicadas no boot pelo `instrumentation.ts` (migrator do Drizzle). Falha na migration encerra o processo com log claro.

## 5. Fluxo do envio: `POST /api/submit-quiz`

**Entrada:** `{ submissionId: uuid, answers: { nome_completo, email, whatsapp, cpf, ...demais respostas } }`. Corpo limitado a 64 KB.

1. **Limite de taxa:** 5 requisições por minuto por IP (`x-forwarded-for`). Excedido → `429 { sucesso:false, mensagemErro }`.
2. **Validação (zod):** `submissionId` UUID; nome não vazio; e-mail válido; WhatsApp com 10 ou 11 dígitos (DDD + número); CPF com 11 dígitos e dígitos verificadores válidos. Demais respostas aceitas como objeto JSON. Inválido → `400 { sucesso:false, mensagemErro }`.
3. **Idempotência:** se `submission_id` já existe, pula para o passo 5 usando a cobrança daquele envio. Se a inserção do passo 4 falhar por `UNIQUE(submission_id)` (requisições concorrentes), também cai neste caminho.
4. **Transação:**
   1. Upsert de `patients` pelo CPF (`INSERT … ON DUPLICATE KEY UPDATE name, email, phone`).
   2. Insert de `quiz_responses` (`first_quiz` = paciente sem respostas anteriores).
   3. Seleciona cobrança reaproveitável (regra da seção 4) ou cria uma `payments` com `status = 'PENDING_ASAAS'`, `amount = PAYMENT_AMOUNT`, `next_sync_at = NOW()`.
   4. Grava `quiz_responses.payment_id`.

   Erro → `500 { sucesso:false, mensagemErro }` → **desfecho 3**.
5. **Se a cobrança já tem `payment_url`:** garante as notificações deste envio (`INSERT IGNORE`, como no passo 4 da seção 6) e responde direto com o link (desfecho 1).
6. **Senão, `sync-payment(paymentId)`** com orçamento de ~20 s (seção 6).
7. **Resposta:**
   - link disponível → `200 { sucesso:true, linkPagamento }` → **desfecho 1**;
   - sem link (falha ou orçamento esgotado) → `200 { sucesso:true }` → **desfecho 2**. O job conclui depois.
8. **Após a resposta** (`after()` do Next 16): se houver notificações pendentes deste envio, dispara `dispatch-notifications` para elas.

**Mensagem de erro para a pessoa:** a mesma usada hoje ("Houve um problema ao registrar seus dados. Por favor, aguarde alguns instantes e tente novamente ou entre em contato com o suporte."). Nenhum detalhe técnico vai para o navegador.

## 6. `sync-payment(paymentId, { deadline })`

1. Reserva a cobrança (lock). Não conseguiu → retorna "em processamento" (o chamador trata como sem link).
2. **Cliente Asaas:** se `patients.asaas_customer_id` é nulo:
   - `GET /customers?cpfCnpj={cpf}`; se encontrar, usa o primeiro;
   - senão `POST /customers` com `name`, `cpfCnpj`, `email`, `mobilePhone`, `externalReference = patient.id`;
   - grava `asaas_customer_id` no paciente e na cobrança.
3. **Cobrança Asaas:** se `payments.asaas_id` é nulo:
   - `GET /payments?externalReference={payment.id}`; se encontrar, usa (cobre o caso "timeout mas foi criada");
   - senão `POST /payments` com `customer`, `billingType: UNDEFINED`, `value = amount`, `dueDate = hoje + PAYMENT_DUE_DAYS` (calculado agora, fuso America/Sao_Paulo), `description = "Plano Alimentar Personalizado - {nome} - 30 dias"`, `externalReference = payment.id`, `callback.successUrl = PAYMENT_SUCCESS_URL`.
4. **Sucesso:** grava `asaas_id`, `status`, `payment_url` (`invoiceUrl`), `invoice_number`, `billing_type`, `due_date`; insere as notificações `email` e `whatsapp` (`kind = payment_link`) para **todos os `quiz_responses` ligados à cobrança que ainda não as têm** (`INSERT IGNORE`); libera o lock.
5. **Falha:**
   - erro transitório (rede, timeout, 5xx, 429): `sync_attempts += 1`, `next_sync_at = agora + backoff`, `last_error`; se `sync_attempts >= 8` → `ASAAS_FAILED` + alerta;
   - erro permanente (4xx exceto 429): vai direto para `ASAAS_FAILED` + alerta.
   - Em ambos libera o lock.

**HTTP (`lib/http/retry.ts`):** timeout de 8 s por chamada; até 3 tentativas com backoff exponencial (500 ms, 1 s) + jitter; repete só em erro de rede, timeout, 5xx e 429; nunca ultrapassa o `deadline` recebido. URL base por `ASAAS_ENV`: `https://api-sandbox.asaas.com/v3` ou `https://api.asaas.com/v3`; header `access_token`.

## 7. Job e falhas definitivas

**Agendador:** iniciado pelo `instrumentation.ts` apenas no runtime Node, protegido contra dupla inicialização (flag global). Roda a cada 2 min se `JOBS_ENABLED=true`; nunca sobrepõe rodadas.

**Uma rodada (`run-jobs`):**

1. **Cobranças:** até 20 com `status = 'PENDING_ASAAS'`, `next_sync_at <= agora` e não reservadas → `sync-payment` (deadline de 30 s cada).
2. **Notificações:** até 50 com `status = 'pending'`, `next_attempt_at <= agora` e não reservadas → `dispatch-notifications`.

**Backoff do job:** 2, 4, 8, 16, 32 min, depois teto de 60 min entre tentativas. Limites: **8 tentativas** para cobrança (~3 h no total) e **5** para notificação. O teto de 1 h é o intervalo máximo entre tentativas, não um prazo.

**Falha definitiva:**

- Estado explícito: cobrança `ASAAS_FAILED`; notificação `failed`.
- `last_error` (JSON): `{ step, httpStatus, responseBody (truncado em 2 KB), message, attempt, at }`. Etapas: `asaas.find_customer`, `asaas.create_customer`, `asaas.find_payment`, `asaas.create_payment`, `notify.email`, `notify.whatsapp`. Chaves de API nunca são gravadas.
- **Alerta:** e-mail para `ADMIN_ALERT_EMAIL` com tipo, id, nome do paciente, etapa e erro. Falha no envio do alerta só gera log (não bloqueia nada).

**Reenvio: `POST /api/jobs/retry`** (Bearer `JOBS_TOKEN`), corpo `{ paymentId }`, `{ notificationId }` ou `{ allFailed: true }`:

- cobrança: `status = 'PENDING_ASAAS'`, `sync_attempts = 0`, `next_sync_at = agora`;
- notificação: `status = 'pending'`, `attempts = 0`, `next_attempt_at = agora` (mantém `parts_sent`);
- em seguida dispara uma rodada do job.

É seguro reenviar porque `sync-payment` busca antes de criar.

**`POST /api/jobs/run`** (Bearer `JOBS_TOKEN`): executa uma rodada sob demanda (útil para cron externo ou testes). Tokens comparados em tempo constante; token ausente ou errado → 401.

## 8. Notificações

- **Template `payment_link`:** igual ao do n8n.
  - Título: "✅ Recebemos seu cadastro! Seu plano alimentar está pronto"
  - Corpo: saudação com o nome, aviso de que o plano aguarda o pagamento, link de pagamento e aviso de que o acesso chega após a confirmação.
- **Renderização na hora do envio,** a partir de `kind` + dados atuais do banco (nome, link). Correções de texto valem para reenvios.
- **E-mail:** nodemailer via SMTP (`SMTP_*`), com HTML e texto puro, remetente `SMTP_FROM`.
- **WhatsApp:** `POST {EVOLUTION_API_URL}/message/sendText/{EVOLUTION_INSTANCE}`, header `apikey`, corpo `{ number: "55" + telefone, text }`. Conversão como no n8n:
  - `<strong>` vira `*`;
  - `<br>` vira quebra de linha;
  - o texto é dividido em partes a cada `<br><br>`;
  - o título vai em negrito na primeira parte;
  - há 3 s de intervalo entre as partes.

  Cada parte enviada incrementa `parts_sent`; o retry continua da próxima parte.
- **Canais independentes:** cada um tem sua linha, suas tentativas e seu estado.
- `NOTIFY_EMAIL_ENABLED` / `NOTIFY_WHATSAPP_ENABLED` (default `true`) permitem desligar um canal; quando desligado, a notificação não é criada.

## 9. Mudanças no front (só lógica)

Arquivo: `components/loading-screen.tsx`.

1. Chamar `POST /api/submit-quiz` com `{ submissionId, answers }` no lugar das URLs do n8n. Remover as URLs fixas e a detecção de ambiente "test" (cada app no Easypanel tem suas próprias variáveis).
2. `submissionId`: `crypto.randomUUID()` gerado ao montar o componente (entrada na etapa 27) e guardado em `useRef`; o "Tentar novamente" reusa o mesmo. Voltar e mudar dados remonta o componente e gera id novo.
3. Remover `linkPagamento` do `sessionStorage` antes de cada envio.
4. Disparar a requisição no início da animação: `startProgressAnimation(16000, 0)` e, no retry, `(8000, 0)`. Duração e aparência da barra continuam iguais.
5. Timeout de 30 s no `fetch` (`AbortController`); estourou → tela de erro existente.

O contrato de resposta `{ sucesso, linkPagamento?, mensagemErro? }` e o tratamento em `app/page.tsx` não mudam.

## 10. Configuração (variáveis de ambiente)

| variável | obrigatória | exemplo / default |
|---|---|---|
| `DATABASE_URL` | sim | `mysql://user:pass@host:3306/tami_forms` |
| `ASAAS_ENV` | sim | `sandbox` \| `production` |
| `ASAAS_API_KEY` | sim | chave do ambiente correspondente |
| `PAYMENT_AMOUNT` | não | `39.90` |
| `PAYMENT_DUE_DAYS` | não | `2` |
| `PAYMENT_SUCCESS_URL` | sim | `https://forms.nutritamilivalle.com.br/confirmationPayment` |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `SMTP_FROM` | sim | |
| `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE` | sim | instância "Suporte Nutri Tamili Valle" |
| `ADMIN_ALERT_EMAIL` | sim | |
| `JOBS_TOKEN` | sim | segredo longo aleatório |
| `JOBS_ENABLED` | não | `true` |
| `NOTIFY_EMAIL_ENABLED`, `NOTIFY_WHATSAPP_ENABLED` | não | `true` |

Validadas por `lib/env.ts` no boot; ausência ou formato inválido derruba o processo com mensagem listando o que falta. Nenhuma é `NEXT_PUBLIC_*`.

## 11. Observabilidade e segurança

- **Logs:** uma linha JSON por evento (`level`, `event`, `submissionId`/`paymentId`/`notificationId`, `step`, `durationMs`, `error`).
  - CPF mascarado (`***.***.*49-50`), e-mail parcial (`a***@gmail.com`), telefone com só os 4 últimos dígitos.
  - Chaves e tokens nunca são logados.
- **`GET /api/health`:** `SELECT 1` no MySQL → 200 `{ ok: true }` ou 503.
- **Segurança:**
  - chave do Asaas apenas no servidor;
  - limite de taxa e de tamanho de corpo no envio;
  - endpoints de job exigem token.
- **Ação recomendada fora do código:** gerar uma nova chave de produção do Asaas, já que a atual esteve em JSON do n8n e em conversa.

## 12. Experimento futuro: remover CPF do formulário (fora deste escopo)

O Asaas Checkout permite que a pessoa informe nome/CPF na página de pagamento (`customerData` opcional), o que tiraria a etapa de CPF do quiz.

- **Antes de decidir:** medir no GTM o abandono na etapa 26 (CPF).
- **Impactos se adotado:**
  - a identidade do paciente deixaria de ser o CPF no momento do envio;
  - o CPF passaria a vir do webhook do Asaas, que também está fora deste escopo.

## 13. Testes (Vitest)

- **Unitários:**
  - validação de CPF/telefone/e-mail;
  - wrapper de retry (repete em rede/5xx/429/timeout; não repete em 4xx; respeita deadline);
  - cálculo de backoff;
  - templates e conversão para WhatsApp;
  - mascaramento de logs.
- **Serviços com dublês:**
  - desfechos 1, 2 e 3;
  - mesmo `submissionId` duas vezes → uma gravação e mesma resposta;
  - reaproveitamento de cobrança pendente (e não reaproveitamento de vencida/paga);
  - timeout após criação no Asaas → retry encontra por `externalReference` e não duplica;
  - cliente já existente no Asaas encontrado por CPF;
  - 4xx → `ASAAS_FAILED` + alerta;
  - 8ª falha transitória → `ASAAS_FAILED` + alerta;
  - WhatsApp parcial continua da parte certa;
  - retry reabre falha;
  - job não processa item reservado.
- **Repositórios contra MySQL real:** executados quando `TEST_DATABASE_URL` está definido (pulados caso contrário). Cobrem:
  - transação do envio;
  - `UNIQUE` de `submission_id`, CPF e notificações;
  - reserva por `locked_until`.
- **Roteiro manual no sandbox do Asaas** (documentado no README), antes de ir para produção:
  - desfecho 1;
  - desfecho 2 (chave inválida → job conclui após corrigir);
  - desfecho 3 (banco fora);
  - retry da tela de erro;
  - recebimento do e-mail e do WhatsApp.

## 14. Critérios de sucesso

- O front funciona sem nenhuma chamada ao n8n e sem mudança visual.
- Os 3 desfechos ocorrem conforme a tabela da seção 1.
- "Tentar novamente" nunca gera paciente, resposta, cobrança ou mensagem duplicada.
- Uma cobrança que falhou no Asaas é criada automaticamente pelo job quando o Asaas volta, e a pessoa recebe o link por e-mail e WhatsApp.
- Falhas definitivas geram alerta por e-mail e podem ser reenviadas via `/api/jobs/retry` após correção.
- Testes passam; `next build` passa; deploy no Easypanel só com variáveis de ambiente + MySQL.
