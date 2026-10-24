# Observabilidade: funil do quiz e erros de integração

**Data:** 2026-10-24
**Branch:** `feature/observabilidade`
**Status:** design aprovado em conversa; aguardando revisão do spec

## 1. Contexto e objetivo

Hoje o quiz (29 etapas, estado só no React em `app/page.tsx`) não registra nada sobre o caminho de quem preenche: não dá para saber até onde cada pessoa chegou, onde desistiu, quanto tempo ficou em cada pergunta nem de onde veio. O GTM está instalado no `layout.tsx`, mas o código não envia nenhum evento para ele.

O backend já tem logs estruturados (`lib/log.ts`, JSON no stdout, com máscara de CPF, e-mail e telefone) para cerca de 60 eventos: Asaas, SMTP, WhatsApp (Evolution), Anthropic, webhook e envio do quiz. Só que o stdout do container se perde a cada deploy no Easypanel e não permite consulta.

**Objetivo:** encontrar padrões de comportamento que apontem melhorias no quiz. Concretamente:

1. funil por etapa: quantas sessões chegaram a cada etapa e quantas saíram em cada uma;
2. recortes por origem do tráfego (UTM e referrer), por aparelho e por respostas não sensíveis;
3. erros de comunicação: do navegador com a nossa API e do servidor com as APIs externas;
4. tudo num painel, sem escrever SQL no dia a dia.

### Restrições

- Ferramentas gratuitas e auto-hospedadas no Easypanel. O servidor tem 8 GB de RAM (~25% em uso), 2 cores e 100 GB de disco (~20% em uso).
- O app continua do jeito que é publicado hoje (Easypanel, `next start`, MySQL 8). O único serviço novo é o Metabase.
- LGPD: os eventos de comportamento são anônimos. Nome, CPF, e-mail, telefone, peso, altura, meta e IMC numérico nunca saem do navegador como evento, e o IP não é gravado.

## 2. Decisões tomadas

| Tema | Decisão |
|---|---|
| Onde guardar | Tabelas no MySQL que já existe, não em arquivo: as perguntas são agregações (funil, recortes), o arquivo do container se perde no deploy e o MySQL já tem backup |
| Painel | Metabase (open source) pelo template do Easypanel, com o banco interno dele num database `metabase` no mesmo MySQL |
| Acesso do painel | Usuário MySQL `metabase_ro`, só com `SELECT` nas tabelas e views de observabilidade |
| Identidade | `sessionId` UUID aleatório no `sessionStorage` (um por aba, sobrevive ao reload), sem vínculo com o paciente |
| Etapas | Slug estável por etapa em `lib/quiz/steps.ts`; os eventos gravam o índice e o slug |
| Respostas | Só as chaves de uma lista permitida, aplicada no cliente e de novo no servidor; IMC só como faixa |
| Abandono | Calculado na consulta: sessão sem `checkout_click` e com o último evento há mais de 30 min; a etapa é a última vista |
| Envio dos eventos | Fila no cliente, lote a cada ~1 s em `POST /api/events`, `sendBeacon` ao sair da página |
| Erros do backend | Destino extra no logger que grava `warn`/`error` e alguns `info` de sucesso em `app_logs`, em lote e sem bloquear |
| Retenção | Funil: 12 meses. `app_logs`: 90 dias. A limpeza roda na rodada do job que já existe |

### Fora de escopo

- Funil depois do envio (pagamento confirmado, plano gerado, mensagem entregue). Esses dados já estão em `payments`, `plan_generations` e `notifications`; o evento não guarda o `submissionId`, então não há vínculo.
- Gravação de sessão e mapa de calor (Microsoft Clarity ou similares).
- Visitante recorrente entre abas e dias (id no `localStorage` ou cookie).
- Envio dos eventos para o GTM/GA4.
- Alertas automáticos a partir do painel (o alerta ao admin por e-mail que já existe continua igual).

## 3. Arquitetura

```
Navegador (quiz)
  lib/client/track.ts ── fila ── lote a cada ~1 s / sendBeacon ao sair
        │
        └─POST /api/events ─> handler (rate limit, 16 KB, zod, lista permitida, UA → aparelho)
                                 └─> AnalyticsRepo.recordBatch  (uma transação)
                                        ├─ upsert funnel_sessions
                                        └─ insert funnel_events

Servidor (qualquer módulo que usa c.log)
  createLogger(write, persist) ── stdout (tudo, como hoje)
                               └─ persist (warn/error + lista de info) ─> buffer ─> AppLogRepo.insertMany a cada ~2 s

Rodada do job (a cada 2 min) ── purge em lotes: funnel_* > 12 meses, app_logs > 90 dias

Metabase (Easypanel) ──metabase_ro (SELECT)──> funnel_sessions, funnel_events, app_logs, vw_*
```

### Módulos novos

| Arquivo | Papel |
|---|---|
| `lib/quiz/steps.ts` | `QUIZ_STEPS`: índice → `{ slug, answerKey? }`; `ALLOWED_ANSWER_KEYS`; `bmiBand(imc)` |
| `lib/quiz/step-validation.ts` | `stepValidation(step, answers)` → `null` ou `{ message, reason }` (substitui as duas cópias do `switch` de mensagens em `page.tsx`) |
| `lib/client/track.ts` | Sessão, fila, lote, `sendBeacon` com fallback para `fetch` com `keepalive`; nunca lança |
| `lib/analytics/events.ts` | Schema zod do lote, filtro da lista permitida, tipos dos eventos |
| `lib/analytics/user-agent.ts` | `parseUserAgent(ua)` → `{ deviceType, os, browser, isBot }` |
| `lib/http/handlers/events.ts` | `createEventsHandler(d)` no padrão dos outros handlers |
| `app/api/events/route.ts` | Rota fina que pega o container e chama o handler |
| `lib/log-persist.ts` | `createLogPersister(d)`: filtro, buffer, lote, descarte |
| `lib/jobs/purge-observability.ts` | Limpeza por data em lotes |

### Módulos alterados

- `lib/log.ts`: `createLogger` aceita um segundo argumento opcional `persist?: (entry: LogEntry) => void`, chamado depois do `redact` com `{ ts, level, event, fields }`. Exceção dentro de `persist` é engolida.
- `lib/container.ts`: monta o logger com o persister, cria `eventsRateLimiter` separado, inclui `analytics` e `appLogs` em `repos`, expõe `eventsRateLimiter` e passa `purgeObservability` para o `createRunJobs`.
- `lib/jobs/run-jobs.ts`: etapa nova de limpeza no fim da rodada, que conta em `errors` se falhar.
- `lib/db/repos/types.ts`, `lib/db/repos/mysql.ts`, `tests/fakes/memory-repos.ts`, `tests/db/repos.contract.ts`: `AnalyticsRepo` e `AppLogRepo`.
- `lib/db/schema.ts` + migrations `0004` (tabelas) e `0005` (views, migration personalizada).
- `app/page.tsx`: rastreamento centralizado (seção 5.3) e uso de `stepValidation`.
- `components/loading-screen.tsx` e `lib/client/submit-quiz.ts`: `submit_result` com o tipo do erro.
- `README.md`: seção do Metabase, grants e SQL dos painéis.

## 4. Etapas do quiz

`QUIZ_STEPS` fixa um slug por índice. Quando entrar uma pergunta nova, ela ganha um slug novo e as outras mantêm o seu; a comparação ao longo do tempo é feita pelo slug.

| # | slug | answerKey |
|---|---|---|
| 0 | `faixa_etaria` | `faixa_etaria` |
| 1 | `sexo_biologico` | `sexo_biologico` |
| 2 | `tipo_fisico` | `tipo_fisico` |
| 3 | `info_expectativa` | — |
| 4 | `peso_comportamento` | `peso_comportamento` |
| 5 | `info_prepare_se` | — |
| 6 | `cafe_manha` | `breakfast_foods` |
| 7 | `almoco` | `almoco` |
| 8 | `lanche_tarde` | `lanche_tarde` |
| 9 | `jantar` | `jantar` |
| 10 | `sobremesa` | `sobremesa` |
| 11 | `info_equilibrio` | — |
| 12 | `rotina_dia` | `rotina_dia` |
| 13 | `sono` | `sono` |
| 14 | `agua` | `agua` |
| 15 | `habitos` | `habitos` |
| 16 | `info_resultados` | — |
| 17 | `info_nutricionista` | — |
| 18 | `altura` | — |
| 19 | `peso` | — |
| 20 | `meta_peso` | — |
| 21 | `perfil_imc` | `imc_faixa` (derivada) |
| 22 | `info_rumo_objetivo` | — |
| 23 | `email` | — |
| 24 | `whatsapp` | — |
| 25 | `nome` | — |
| 26 | `cpf` | — |
| 27 | `envio` | — |
| 28 | `checkout` | — |

`ALLOWED_ANSWER_KEYS` = os `answerKey` da tabela. `bmiBand(imc)`: `< 18.5` → `abaixo`, `< 25` → `normal`, `< 30` → `sobrepeso`, `>= 30` → `obesidade`; valor ausente ou inválido → sem resposta.

Valores de resposta aceitos: string de até 80 caracteres ou array de até 15 strings de até 80 caracteres. Qualquer outra coisa é descartada.

## 5. Eventos do navegador

### 5.1 Catálogo

Todo evento tem `event`, `ts` (ISO do relógio do cliente), `step` (0–28) e `stepSlug`, exceto o `session_start`, que não tem etapa.

| `event` | Quando | Campos extras |
|---|---|---|
| `session_start` | `sessionId` recém-criado nesta aba | `utm: { source, medium, campaign, content, term }` (cada um ≤ 100), `referrerHost` (≤ 100, só o host), `viewport: { w, h }` |
| `step_view` | entrou na etapa | — |
| `step_answer` | avançou a partir da etapa | `durationMs`, `answer?` (só se `answerKey` existir e o valor passar no filtro) |
| `validation_error` | mostrou o modal de "responda antes de continuar" | `reason`: `vazio` \| `email_invalido` \| `telefone_invalido` \| `cpf_invalido` |
| `step_back` | voltou a partir da etapa | — |
| `submit_result` | terminou uma tentativa de envio (etapa 27) | `outcome`: `ok` \| `http_4xx` \| `http_5xx` \| `timeout` \| `rede` \| `resposta_invalida` \| `storage`; `durationMs`; `attempt` (1, 2…) |
| `checkout_click` | clicou em "Garantir Meu Plano Alimentar Agora" | `hasPaymentLink` (bool) |
| `page_hide` | `pagehide`, ou `visibilitychange` para `hidden` | `msOnStep` |

### 5.2 `lib/client/track.ts`

- `getSessionId()`: lê `sessionStorage["tf_session_id"]`; se não houver, cria com `newSubmissionId()` (o gerador de UUID que já existe, com fallbacks), grava e enfileira `session_start`. Se o `sessionStorage` estiver bloqueado, usa um id em memória para a vida da página.
- `track(event)`: põe na fila e agenda o envio em ~1 s (um só timer). A fila tem no máximo 100 eventos; além disso, descarta os mais antigos.
- `flush({ beacon })`: manda até 25 eventos por requisição. Com `beacon`, usa `navigator.sendBeacon` (Blob `application/json`); sem `sendBeacon` ou se ele recusar, usa `fetch(..., { keepalive: true })`. Erro de rede descarta o lote, sem tentar de novo.
- No `pagehide` e no `visibilitychange` → `hidden`: enfileira o `page_hide` e faz `flush({ beacon: true })`.
- Nenhuma função exportada lança. Tudo fica dentro de `try/catch`; o quiz não depende do rastreamento.
- Recebe `fetch`, `sendBeacon`, `storage` e o relógio por injeção, para os testes.

### 5.3 Onde o quiz chama o `track`

- **Um `useEffect` em `currentStep`** em `page.tsx`, com uma ref para a etapa anterior e o instante em que entrou nela:
  - se avançou (`novo > anterior`): `step_answer` da anterior (com `durationMs` e a resposta de `answers[answerKey]`, ou `bmiBand(answers.imc)` na etapa 21), depois `step_view` da nova;
  - se voltou: `step_back` da anterior, depois `step_view` da nova;
  - na primeira montagem: só `step_view` da etapa 0.
- **`validation_error`**: `handleContinue` e `handleNext` passam a usar `stepValidation(currentStep, answers)`, que devolve a mensagem que já é exibida e o `reason`. O `reason` vai para o evento; a mensagem para o modal, sem mudar o texto.
- **`submit_result`**: `submitQuizRequest` passa a devolver também `failure` (`http_4xx` \| `http_5xx` \| `timeout` \| `rede` \| `resposta_invalida`) quando `ok: false`. A `LoadingScreen` mede a duração, conta as tentativas e manda o evento; a falha de `sessionStorage` ao guardar o link vira `storage`.
- **`checkout_click`**: no `handleFinalRedirect`, antes de mudar `window.location`, seguido de `flush({ beacon: true })`.

Recarregar a página volta o quiz para a etapa 0 (o estado é só do React), mas mantém o `sessionId`: a sessão continua a mesma e o `max_step` não diminui.

## 6. `POST /api/events`

Ordem do handler:

1. **Rate limit**: `eventsRateLimiter` próprio (120 requisições/min por IP, mesmo `clientIp` do submit), separado do limite do `submit-quiz`. Estourou → `429`.
2. **Corpo**: `readJsonBody(req, 16 * 1024)` → `413`/`400` como hoje.
3. **Validação** (`lib/analytics/events.ts`): `{ sessionId: uuid, events: Event[1..25] }`, união discriminada por `event`, campos desconhecidos removidos. `answer` só passa se `stepSlug` tiver `answerKey` na tabela da seção 4 e o valor estiver no formato da seção 4; senão o campo some e o evento continua. Lote inválido → `400` com corpo vazio.
4. **User-Agent**: `parseUserAgent(req.headers.get("user-agent"))`. Se `isBot` (`bot`, `crawler`, `spider`, `headless`, `lighthouse`, sem UA), responde `204` sem gravar.
5. **Gravação**: `analytics.recordBatch(...)`. Erro → `log.error("events.record_failed", { message })` e `204` (o navegador não reage a erro de rastreamento).
6. Sucesso → `204`.

O `log.warn` de `400`/`413`/`429` registra só o status e o caminho do problema, nunca os valores recebidos, como no `submit-quiz`.

`parseUserAgent` com expressões simples, sem dependência nova:
- `deviceType`: `tablet` (`iPad`, ou `Android` sem `Mobile`), `mobile` (`Mobi`, `iPhone`, `Android`), senão `desktop`;
- `os`: `iOS`, `Android`, `Windows`, `macOS`, `Linux`, `outro`;
- `browser`: `Instagram`, `Facebook` (`FBAN`/`FBAV`), `Edge`, `Samsung`, `Chrome`, `Firefox`, `Safari`, `outro`, testados nessa ordem. Os navegadores internos do Instagram e do Facebook vêm primeiro de propósito, porque é por eles que chega o tráfego de anúncio.

## 7. Modelo de dados

### `funnel_sessions`

| Coluna | Tipo | Nota |
|---|---|---|
| `session_id` | `char(36)` PK | |
| `started_at` | `datetime(3)` | primeiro evento recebido |
| `last_event_at` | `datetime(3)` | maior `created_at` recebido |
| `last_step` / `last_step_slug` | `tinyint` / `varchar(40)` nulos | última `step_view` |
| `max_step` / `max_step_slug` | `tinyint` / `varchar(40)` nulos | só aumenta |
| `checkout_clicked` | `boolean` default `false` | vira `true` e não volta |
| `utm_source`, `utm_medium`, `utm_campaign`, `utm_content`, `utm_term` | `varchar(100)` nulos | do `session_start` |
| `referrer_host` | `varchar(100)` nulo | |
| `device_type`, `os`, `browser` | `varchar(20)` | do UA da primeira requisição |
| `viewport_w`, `viewport_h` | `smallint` nulos | |
| `answers` | `json` default `{}` | merge das respostas permitidas |

Índices: `(started_at)`, `(last_event_at)`.

### `funnel_events`

| Coluna | Tipo |
|---|---|
| `id` | `bigint` auto-increment PK |
| `session_id` | `char(36)` |
| `event` | `varchar(32)` |
| `step` / `step_slug` | `tinyint` / `varchar(40)` nulos |
| `props` | `json` (campos extras da seção 5.1, menos `answer`, que vai para `funnel_sessions.answers`) |
| `client_ts` | `datetime(3)` |
| `created_at` | `datetime(3)` |

Índices: `(session_id)`, `(event, created_at)`, `(created_at)`. Sem chave estrangeira para `funnel_sessions`, para o purge em lotes não depender de ordem.

### `app_logs`

| Coluna | Tipo |
|---|---|
| `id` | `bigint` auto-increment PK |
| `ts` | `datetime(3)` |
| `level` | `varchar(5)` |
| `event` | `varchar(100)` |
| `area` | `varchar(40)` (texto antes do primeiro `.` do evento) |
| `fields` | `json` (já passado pelo `redact`) |

Índices: `(ts)`, `(area, level, ts)`.

### `AnalyticsRepo.recordBatch`

Uma transação:
1. `INSERT ... ON DUPLICATE KEY UPDATE` em `funnel_sessions`: na criação, grava `started_at`, aparelho e (se o lote tiver `session_start`) UTMs, referrer e viewport; sempre atualiza `last_event_at`, `last_step*` (último `step_view` do lote), `max_step*` (`GREATEST`), `checkout_clicked` (`OR`) e `answers` (`JSON_MERGE_PATCH`). UTMs e referrer só são gravados se ainda estiverem nulos.
2. `INSERT` dos eventos em `funnel_events`.

`purgeOlderThan(cutoff, limit)` em `funnel_events` (por `created_at`) e em `funnel_sessions` (por `last_event_at`); `AppLogRepo.purgeOlderThan` por `ts`. Cada um usa `DELETE ... ORDER BY ... LIMIT`.

### Views (migration `0005`, personalizada)

- `vw_funnel_steps`: para cada etapa 0–28 (CTE recursiva), o slug, `sessions` (sessões com `max_step >= etapa`) e `pct_of_start`.
- `vw_abandonment`: sessões com `checkout_clicked = false` e `last_event_at < NOW() - INTERVAL 30 MINUTE`, com `abandon_step`, `abandon_step_slug` e as colunas de origem e aparelho.
- `vw_session_answers`: `session_id`, colunas de origem e aparelho, `max_step`, `checkout_clicked` e uma coluna por chave de `ALLOWED_ANSWER_KEYS` (`JSON_UNQUOTE(JSON_EXTRACT(...))`; os arrays ficam como texto JSON).
- `vw_step_durations`: `step`, `step_slug`, `durationMs` de cada `step_answer` (o Metabase calcula mediana e percentil).
- `vw_api_errors`: por dia (`DATE(ts)`), `area`, `event` e `level`, com `total`.

## 8. Logs do backend em `app_logs`

### 8.1 Logger

`createLogger(write = console.log, persist?)`. Depois de montar a linha do stdout (comportamento de hoje, sem mudança), chama `persist?.({ ts, level, event, fields: redact(fields) })` dentro de `try/catch`.

### 8.2 `createLogPersister({ repo, now, setTimer, write, intervalMs = 2000, batchSize = 100, maxBuffer = 1000 })`

- **Filtro**: grava todo `warn` e `error`, e de `info` só `PERSISTED_INFO_EVENTS` = `submit.done`, `webhook.asaas.received`, `plan.generation.done`, `notification.dispatch.sent` (denominadores para a taxa de falha).
- **Buffer**: entra no array em memória e agenda um flush em `intervalMs`, se não houver um agendado. Com o buffer cheio, descarta a linha nova e conta.
- **Flush**: tira até `batchSize` linhas e chama `repo.insertMany`. Erro → escreve uma linha `log.persist_failed` (com `dropped` e `message`) **direto no `write`**, nunca pelo logger, e descarta o lote. Sobrou linha → agenda outro flush. Nunca dois flushes ao mesmo tempo.
- `area` = `event.split(".")[0]`.

O container monta `createLogger(console.log, persister.push)`. O logger do `boot()` continua sem persistência (o banco pode não estar pronto).

## 9. Limpeza

`createPurgeObservability({ analytics, appLogs, now, log })` roda no fim de cada rodada do job: `funnel_events` e `funnel_sessions` com mais de 365 dias, `app_logs` com mais de 90 dias, até 1.000 linhas por tabela por rodada. Erro → `log.error("job.purge.error")` e conta em `errors`. O total apagado entra no `job.round.done` como `purged`.

## 10. Metabase e Easypanel

Passo a passo que vai no README:

1. No MySQL do Easypanel: `CREATE DATABASE metabase CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;`, mais um usuário `metabase_app` com todos os privilégios só nesse database.
2. Usuário de leitura:
   ```sql
   CREATE USER 'metabase_ro'@'%' IDENTIFIED BY '<senha forte>';
   GRANT SELECT ON tami_forms.funnel_sessions TO 'metabase_ro'@'%';
   GRANT SELECT ON tami_forms.funnel_events TO 'metabase_ro'@'%';
   GRANT SELECT ON tami_forms.app_logs TO 'metabase_ro'@'%';
   GRANT SELECT ON tami_forms.vw_funnel_steps TO 'metabase_ro'@'%';
   -- idem para as outras views vw_*
   ```
3. Serviço novo pelo template **Metabase** do Easypanel, com `MB_DB_TYPE=mysql`, `MB_DB_HOST` (host interno do MySQL), `MB_DB_PORT=3306`, `MB_DB_DBNAME=metabase`, `MB_DB_USER=metabase_app`, `MB_DB_PASS`, `JAVA_OPTS=-Xmx1g` e limite de memória de 1,5 GB.
4. Domínio próprio (ex.: `painel.nutritamilivalle.com.br`) no proxy do Easypanel. Criar o usuário admin no primeiro acesso.
5. No Metabase: adicionar o banco `tami_forms` com o usuário `metabase_ro` e o fuso `America/Sao_Paulo` no relatório.
6. Criar as perguntas da seção 11 colando o SQL do README e montar um painel com elas, com filtros de período, `utm_source`, `utm_campaign` e `device_type`.

## 11. Painéis

O README traz o SQL de cada um:

1. **Funil por etapa** (`vw_funnel_steps`, visualização de funil): sessões por etapa e % de queda.
2. **Onde abandonam** (`vw_abandonment`): quantidade por etapa de abandono.
3. **Tempo por etapa** (`vw_step_durations`): mediana e p90 por slug.
4. **Erros de validação** (`funnel_events`, `event = 'validation_error'`): por etapa e `reason`.
5. **Conversão por origem** (`funnel_sessions`): `utm_source`/`utm_campaign` × sessões × % com `checkout_clicked`.
6. **Conversão por aparelho** (`funnel_sessions`): `device_type`, `os`, `browser` × sessões × % de checkout.
7. **Respostas × abandono** (`vw_session_answers` + `vw_abandonment`): ex. `tipo_fisico` × etapa de abandono.
8. **Falhas de envio no navegador** (`funnel_events`, `event = 'submit_result'`): por `outcome` e por dia.
9. **Saúde das integrações** (`vw_api_errors`): erros por `area` e por dia, com os sucessos ao lado.

## 12. Segurança e privacidade

- Nenhum dado pessoal nos eventos: o cliente só monta respostas da lista permitida, e o servidor filtra de novo.
- IP só no rate limit em memória; UA bruto não é gravado.
- `metabase_ro` não lê `patients`, `payments`, `quiz_responses` nem `notifications`.
- `app_logs` recebe o que já vai para o stdout, já mascarado; nenhuma chamada de log nova.
- O endpoint não exige token (é chamado pelo navegador). Os riscos são lixo e volume, e ficam limitados pelo rate limit, pelo tamanho do corpo e do lote e pelo filtro de bot. O app continua acessível só pelo proxy do Easypanel (README, seção de segurança).

## 13. Testes (Vitest)

- `tests/lib/quiz/steps.test.ts`: 29 slugs únicos cobrindo 0–28; `answerKey` só nas etapas da tabela; `bmiBand` nos limites (18.49, 18.5, 24.99, 25, 29.99, 30, inválido).
- `tests/lib/quiz/step-validation.test.ts`: mensagem e `reason` por etapa, com os mesmos textos de hoje.
- `tests/lib/analytics/events.test.ts`: lote válido; `sessionId` inválido; 0 e 26 eventos; `answer` fora da lista removido; `answer` em formato inválido removido; campos desconhecidos removidos; limites de tamanho das UTMs.
- `tests/lib/analytics/user-agent.test.ts`: UAs reais de iPhone Safari, Android Chrome, Instagram in-app, Facebook in-app, iPad, Windows Edge, macOS Safari e Googlebot.
- `tests/lib/http/events.test.ts`: `204`, `400`, `413`, `429`, bot sem gravação, erro do repo vira `204` + `log.error`.
- `tests/lib/client/track.test.ts`: `session_start` só no id novo; lote a cada intervalo; até 25 por requisição; `sendBeacon` e fallback para `fetch`; fila limitada a 100; `storage` bloqueado; nunca lança.
- `tests/lib/log-persist.test.ts`: filtro por nível e por evento; lote de até 100; buffer cheio descarta; falha do repo escreve `log.persist_failed` no `write` e não chama o logger; nunca dois flushes juntos.
- `tests/lib/log.test.ts`: `persist` recebe os campos já mascarados; exceção do `persist` não afeta o stdout.
- `tests/lib/jobs/purge-observability.test.ts` e o caso novo em `run-jobs`.
- `tests/db/repos.contract.ts`: `recordBatch` (cria, `max_step` não diminui, `checkout_clicked` não volta, UTMs não são sobrescritas, `answers` faz merge) e `purgeOlderThan` nos três repositórios, rodando no fake em memória e no MySQL.
- `tests/lib/client/submit-quiz.test.ts`: o `failure` certo para 4xx, 5xx, timeout, rede e JSON inválido.

## 14. Critérios de sucesso

- Um preenchimento completo no navegador gera uma linha em `funnel_sessions` com `max_step = 28` e `checkout_clicked = true`, e os eventos `step_view`/`step_answer` de todas as etapas em `funnel_events`.
- Fechar a aba na etapa 15 deixa a sessão em `vw_abandonment` com `abandon_step = 15` depois de 30 min, e gera um `page_hide`.
- Nenhuma linha de `funnel_*` contém nome, CPF, e-mail, telefone, peso, altura ou meta.
- Um erro forçado do Asaas no sandbox aparece em `app_logs` e em `vw_api_errors` em poucos segundos.
- Com o banco fora do ar, o quiz continua funcionando, e o stdout mostra `log.persist_failed` sem loop.
- O Metabase abre os 9 painéis com o usuário `metabase_ro` e não lista as tabelas de pacientes.
- `pnpm test`, `pnpm typecheck` e `pnpm build` passam.
