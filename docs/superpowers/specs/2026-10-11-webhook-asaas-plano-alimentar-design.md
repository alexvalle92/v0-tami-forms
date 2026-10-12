# Webhook do Asaas, plano alimentar por IA e primeiro acesso

**Data:** 2026-10-11
**Branch:** `feature/refatoracao`
**Status:** design aprovado em conversa; aguardando revisão do spec

## 1. Contexto e objetivo

Hoje o `v0-tami-forms` recebe o quiz, cria a cobrança no Asaas e envia o link de pagamento. O que acontece **depois do pagamento** ainda está em quatro fluxos do n8n, que nunca foram para produção: `[Webhook] Apos Pagamento`, `Criar Dieta`, `Primeiro Acesso App` e `Comunicar Cliente`.

**Objetivo:** trazer esse pós-pagamento para dentro deste projeto e desligar o n8n. Quando o Asaas avisa que a cobrança foi paga, o app:

1. registra o pagamento no MySQL;
2. gera o plano alimentar por IA a partir das respostas do quiz;
3. grava o plano, que substitui o plano ativo anterior do paciente;
4. cria a senha de acesso ao PlanA, só para quem ainda não tem;
5. envia os dados de acesso por e-mail e WhatsApp.

**URL a cadastrar no Asaas:** `https://<domínio do app>/api/webhooks/asaas`.

### Restrições

- Mesmo deploy de hoje: Easypanel sem Docker, `next start`, MySQL 8. Nenhum serviço novo de infraestrutura.
- Reaproveitar o que já existe: outbox de notificações, job a cada 2 minutos, locks, backoff, alerta ao admin e `/api/jobs/retry`.
- O PlanA (repositório `../dieta-app`) lê `patients` e `meal_plans`. Ele ainda não está em produção, hoje usa PostgreSQL e será migrado para este MySQL e refatorado depois (seção 11).

## 2. Decisões tomadas

| Tema | Decisão |
|---|---|
| Provedor de IA | Anthropic (Claude), SDK oficial `@anthropic-ai/sdk` |
| Modelo | `claude-opus-5-5` por padrão, configurável por `ANTHROPIC_MODEL` |
| Onde roda a geração | Webhook grava e responde; a geração roda depois da resposta, com o job interno como rede de segurança |
| Liberação do plano | Automática, sem revisão humana |
| Acesso | Senha temporária, criada só se o paciente não tem credencial |
| Hash da senha | scrypt com salt por paciente |
| Compra repetida | O plano novo fica `active`; os outros planos ativos do paciente passam para `completed` |
| Validade | 30 dias: `start_date` = dia da geração, `end_date` = `start_date` + 30 |
| Estorno e chargeback | Atualiza o status e avisa o admin por e-mail; plano e acesso não mudam |
| Metas nutricionais | Calculadas no código e entregues prontas à IA |
| Piso de calorias | 1.200 kcal (feminino) e 1.500 kcal (masculino) |
| CPF na mensagem | Não é repetido; o texto diz "seu CPF (somente números)" |
| Cadastro do webhook | Manual, pelo painel do Asaas, com passo a passo no README |

### Fora de escopo

- Aviso de vencimento do plano e fluxo de renovação. As colunas `due_date_new_meal_plan` e `payment_url_new_meal_plan` são criadas vazias para o PlanA, mas nada as preenche aqui.
- Qualquer mudança no repositório do PlanA.
- Tela de administração e revisão manual do plano antes da liberação.
- Envio do plano completo no corpo do e-mail.
- Consulta periódica ao Asaas para descobrir pagamentos cujo webhook se perdeu (o Asaas guarda os eventos por 14 dias e reenvia quando a fila é reativada).

## 3. Arquitetura e módulos

```
Asaas ──POST──> /api/webhooks/asaas
                  │ valida o token
                  │ uma transação: grava o evento, atualiza a cobrança,
                  │                cria a geração "pending"
                  └─> 200

depois da resposta (o job de 2 min repete o que ficar pendente):
  geração pending ─> calcula metas ─> IA gera ─> valida
                       └─> uma transação: plano "active", plano anterior "completed",
                           credencial (se não houver), notificações no outbox
                             └─> envio por e-mail e WhatsApp
```

Arquivos novos:

```
app/api/webhooks/asaas/route.ts        → rota (monta o handler com o container)
lib/http/handlers/asaas-webhook.ts     → autenticação, leitura do corpo, resposta HTTP
lib/asaas/webhook-event.ts             → schema zod do evento e classificação por tipo
lib/services/handle-asaas-event.ts     → aplica um evento (chama o repositório)
lib/services/generate-plan.ts          → processa uma geração de plano
lib/meal-plan/prompt.ts                → prompt da nutricionista e montagem da mensagem
lib/meal-plan/answers.ts               → schema zod dos 17 campos do quiz usados pela IA
lib/meal-plan/targets.ts               → TMB, GET, meta calórica e faixa de proteína
lib/meal-plan/plan.ts                  → schema do plano gerado, validação e conversão para plan_data
lib/meal-plan/generator.ts             → interface do gerador e erro de domínio
lib/meal-plan/anthropic-generator.ts   → implementação com o SDK da Anthropic
lib/access/temp-password.ts            → derivação da senha temporária
lib/access/password-hash.ts            → hash e verificação scrypt
```

Arquivos alterados: `lib/db/schema.ts` e nova migration, `lib/db/repos/types.ts`, `lib/db/repos/mysql.ts`, `tests/fakes/memory-repos.ts`, `tests/db/repos.contract.ts`, `lib/notify/templates.ts`, `lib/services/dispatch-notification.ts`, `lib/services/alert-admin.ts`, `lib/jobs/run-jobs.ts`, `lib/jobs/retry-failed.ts`, `lib/jobs/backoff.ts`, `lib/http/handlers/jobs.ts`, `lib/env.ts`, `lib/container.ts`, `.env.example`, `README.md`.

**Regras de fronteira** (as mesmas do spec anterior)

- A rota não tem regra de negócio: valida a entrada, chama um serviço e traduz o resultado em HTTP.
- Serviços recebem dependências por parâmetro e são testados com dublês, sem rede.
- `generate-plan` depende da interface `MealPlanGenerator`, nunca do SDK. Trocar de provedor é trocar um arquivo.
- `handle-asaas-event` é o único ponto que muda o estado de uma cobrança a partir de um evento do Asaas.

## 4. Modelo de dados

Convenções do spec anterior: ids `CHAR(36)` gerados na aplicação, datas `DATETIME(3)` em UTC, `created_at` e `updated_at` em todas as tabelas. Uma migration nova, gerada pelo `drizzle-kit`.

### `payments` (colunas novas)

| coluna | tipo | notas |
|---|---|---|
| paid_at | DATETIME(3) NULL | preenchido uma única vez, no primeiro evento de pagamento |
| payment_date | DATE NULL | data informada pelo Asaas |
| last_event | VARCHAR(64) NULL | último evento aplicado |

### `patients` (colunas novas)

| coluna | tipo | notas |
|---|---|---|
| password_hash | VARCHAR(255) NULL | formato da seção 8 |
| must_change_password | BOOLEAN default false | `true` ao criar a senha temporária; o PlanA zera ao trocar |
| password_set_at | DATETIME(3) NULL | |

### `asaas_webhook_events` (nova)

| coluna | tipo | notas |
|---|---|---|
| id | VARCHAR(128) PK | `id` do evento do Asaas (`evt_…`); é a chave de idempotência |
| event | VARCHAR(64) | ex.: `PAYMENT_RECEIVED` |
| asaas_payment_id | VARCHAR(64) NULL | |
| payment_id | CHAR(36) NULL FK → payments | nulo se a cobrança não é nossa |
| outcome | ENUM('processed','ignored') | |

O corpo completo do evento **não** é gravado: ele traz o token e o final do cartão de crédito.

### `plan_generations` (nova, fila de trabalho)

| coluna | tipo | notas |
|---|---|---|
| id | CHAR(36) PK | |
| payment_id | CHAR(36) **UNIQUE** FK → payments | uma geração por cobrança paga |
| patient_id | CHAR(36) FK → patients | |
| quiz_response_id | CHAR(36) FK → quiz_responses | envio mais recente ligado à cobrança, fixado na criação |
| status | ENUM('pending','done','failed') | |
| meal_plan_id | CHAR(36) NULL FK → meal_plans | preenchido ao concluir |
| attempts | INT default 0 | |
| next_attempt_at | DATETIME(3) NULL | |
| locked_until | DATETIME(3) NULL | |
| last_error | JSON NULL | mesmo formato de `payments.last_error` |
| generation | JSON NULL | modelo, tokens de entrada e saída, metas calculadas |

Índice em `(status, next_attempt_at)`.

### `meal_plans` (nova, no formato que o PlanA lê)

| coluna | tipo | notas |
|---|---|---|
| id | CHAR(36) PK | |
| patient_id | CHAR(36) FK → patients | |
| payment_id | CHAR(36) NULL **UNIQUE** FK → payments | nulo em planos criados à mão pelo admin do PlanA |
| quiz_response_id | CHAR(36) NULL FK → quiz_responses | |
| title | VARCHAR(200) | "Plano Alimentar MM/AAAA" |
| description | TEXT NULL | não preenchido aqui |
| start_date | DATE | |
| end_date | DATE NULL | |
| due_date_new_meal_plan | DATE NULL | renovação, fora de escopo |
| payment_url_new_meal_plan | VARCHAR(500) NULL | renovação, fora de escopo |
| status | VARCHAR(32) default 'active' | `active`, `completed` ou `cancelled` |
| plan_data | JSON | formato abaixo |

Índice em `(patient_id, status)`. Esta tabela só recebe plano pronto: nunca tem linha em andamento ou com falha.

**Formato de `plan_data`**, igual ao que a tela do PlanA lê:

```json
{
  "meals": [
    { "name": "Café da manhã", "time": "07:00 - 08:00", "foods": "Pão francês — 50 g (1 unidade)\nOvos mexidos — 100 g (2 unidades)", "calories": "350" }
  ],
  "calories": 1800,
  "observations": "texto com quebras de linha"
}
```

`meals[].calories` é texto e `calories` é número, como no n8n.

### `notifications`

Sem mudança de estrutura. `kind` ganha o valor `plan_ready`. A chave única `(quiz_response_id, channel, kind)` garante uma mensagem por envio e canal.

## 5. Webhook: `POST /api/webhooks/asaas`

**Formato do evento** (campos lidos; os demais são ignorados sem erro):

```json
{
  "id": "evt_05b708f961d739ea7eba7e4db318f621&368604920",
  "event": "PAYMENT_RECEIVED",
  "payment": {
    "id": "pay_080225913252",
    "externalReference": "<payments.id>",
    "status": "RECEIVED",
    "billingType": "PIX",
    "invoiceNumber": "00005101",
    "paymentDate": "2026-10-11",
    "clientPaymentDate": "2026-10-11",
    "confirmedDate": "2026-10-11"
  }
}
```

**Passos**

1. **Autenticação.** O Asaas envia o token no header `asaas-access-token`. O app compara com `ASAAS_WEBHOOK_TOKEN` em tempo constante. Ausente ou diferente → `401`.
2. **Leitura.** Corpo limitado a 256 KB e validado com zod. Corpo ilegível, grande demais ou fora do formato → `200` e log `webhook.asaas.unreadable`. Reenviar não resolveria, e 15 falhas seguidas fazem o Asaas pausar a fila da conta.
3. **Transação** (`handle-asaas-event`):
   1. Insere em `asaas_webhook_events`. Chave duplicada → o evento já foi tratado; encerra sem efeito.
   2. Localiza a cobrança por `payment.externalReference` = `payments.id`.
      - Não encontrada → `outcome = ignored`.
      - Encontrada com `asaas_id` diferente de `payment.id` → `ignored` e log de aviso.
      - Encontrada com `asaas_id` nulo → aceita e grava o `asaas_id` do evento.
   3. Aplica a regra do tipo de evento (tabela abaixo).
4. **Resposta `200`.** Falha de banco em qualquer ponto → `500`, o único caso em que o app pede reenvio.
5. **Depois da resposta** (`after()` do Next): se há geração `pending` para a cobrança, executa `generate-plan` e, em seguida, despacha as notificações pendentes daquele envio. Em estorno ou chargeback, envia o e-mail de aviso ao admin.

**Regras por tipo de evento**

| Grupo | Eventos | Efeito |
|---|---|---|
| Pago | `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED` | `status` = status do evento; `paid_at` = agora, se ainda nulo; `payment_date` = `clientPaymentDate`, senão `paymentDate`, senão `confirmedDate`; `billing_type`, `invoice_number`, `last_event`. Cria a linha de `plan_generations` (`pending`, `next_attempt_at` = agora) se não existir para a cobrança. |
| Reversão | `PAYMENT_REFUNDED`, `PAYMENT_PARTIALLY_REFUNDED`, `PAYMENT_REFUND_IN_PROGRESS`, `PAYMENT_CHARGEBACK_REQUESTED`, `PAYMENT_CHARGEBACK_DISPUTE`, `PAYMENT_AWAITING_CHARGEBACK_REVERSAL`, `PAYMENT_RECEIVED_IN_CASH_UNDONE` | `status` = status do evento; `last_event`. E-mail de aviso ao admin. Plano, geração e credencial não mudam. |
| Antes de pagar | `PAYMENT_OVERDUE`, `PAYMENT_DELETED`, `PAYMENT_RESTORED` | Só se `paid_at` é nulo: `status` = status do evento (`DELETED` em `PAYMENT_DELETED`); `last_event`. |
| Demais | qualquer outro | `outcome = ignored`. |

**Casos de borda**

- **Cartão de crédito:** o Asaas envia `PAYMENT_CONFIRMED` na hora e `PAYMENT_RECEIVED` cerca de 32 dias depois. O primeiro cria a geração; o segundo só atualiza o status, porque `plan_generations.payment_id` é único.
- **Evento fora de ordem:** eventos do grupo "antes de pagar" não alteram uma cobrança com `paid_at` preenchido.
- **Cobrança paga sem envio do quiz ligado** (não deveria ocorrer): o pagamento é registrado, a geração não é criada, e o admin recebe um e-mail de aviso com o id da cobrança.
- **Efeito na regra de reaproveitamento:** uma cobrança `OVERDUE` ou `DELETED` deixa de ser reaproveitada em novos envios do quiz, o que corrige a entrega de link morto quando a cobrança é apagada no painel do Asaas.
- **Webhook perdido:** se a fila do Asaas for pausada, os eventos ficam guardados por 14 dias. Reativar a fila no painel reenvia tudo; a idempotência por `id` do evento torna o reenvio seguro.

## 6. Geração do plano: `generate-plan(generationId)`

1. **Reserva** a geração (lock de 5 minutos). Não conseguiu → retorna "em processamento".
2. **Relê** a geração. Se não está `pending`, encerra.
3. **Carrega e valida as respostas** do `quiz_response_id` (schema da seção 6.1). Inválidas → falha definitiva, etapa `plan.answers`.
4. **Calcula as metas** (seção 6.2).
5. **Chama o gerador** com o prompt e a mensagem (seção 6.3).
6. **Valida o plano** (seção 6.4). Inválido → erro temporário, etapa `plan.validate`.
7. **Prepara a credencial:** se o paciente não tem `password_hash`, deriva a senha temporária e calcula o hash scrypt (seção 8), fora da transação.
8. **Transação de conclusão:**
   1. insere `meal_plans` (`active`, título, datas, `plan_data`);
   2. passa para `completed` os outros planos `active` do mesmo paciente, inclusive os criados à mão no PlanA;
   3. grava a credencial com `UPDATE patients … WHERE id = ? AND password_hash IS NULL`;
   4. enfileira as notificações `plan_ready` do envio, uma por canal ativo (`INSERT IGNORE`);
   5. marca a geração como `done`, com `meal_plan_id` e `generation`, e solta o lock.
9. **Falha** em qualquer etapa: grava `attempts`, `last_error` e `next_attempt_at`, e solta o lock.

Datas: `start_date` = hoje no fuso `America/Sao_Paulo`; `end_date` = `start_date` + 30 dias; título com mês e ano de `start_date`.

Se o processo cair entre a resposta da IA e a transação, a próxima tentativa gera o plano de novo. O custo é uma chamada extra à IA; nada fica duplicado.

### 6.1 Respostas usadas

Os mesmos 17 campos do n8n: `faixa_etaria`, `sexo_biologico`, `tipo_fisico`, `peso_comportamento`, `breakfast_foods`, `almoco`, `lanche_tarde`, `jantar`, `sobremesa`, `rotina_dia`, `sono`, `agua`, `habitos`, `altura_cm`, `peso_kg`, `imc`, `meta_peso_30d`.

- Obrigatórios para o cálculo: `faixa_etaria` (uma das quatro faixas do quiz), `sexo_biologico` (`Masculino` ou `Feminino`), `altura_cm` (120 a 230) e `peso_kg` (30 a 300).
- Os demais são aceitos como texto ou lista de textos; ausentes viram "não informado".
- **Nome, CPF, e-mail e telefone nunca são enviados à IA.**

### 6.2 Metas calculadas no código

| Meta | Cálculo |
|---|---|
| Idade | ponto médio da faixa: 18-24 → 21; 25-34 → 30; 35-44 → 40; 45-59 → 52 |
| TMB | Harris-Benedict original (1919). Homem: `66,47 + 13,75·peso + 5,003·altura − 6,755·idade`. Mulher: `655,1 + 9,563·peso + 1,850·altura − 4,676·idade` |
| GET | `TMB × 1,2` (sedentário) |
| Meta calórica | `GET − 770`, nunca abaixo do piso (1.200 feminino, 1.500 masculino), arredondada para múltiplo de 50 |
| Proteína | de `1,5 × peso` a `2,0 × peso` gramas por dia |

Peso em kg e altura em cm. Os pisos, o déficit de 770 kcal e o fator 1,2 ficam como constantes nomeadas em `lib/meal-plan/targets.ts`.

**A confirmar com a nutricionista:** a versão da equação (original de 1919 ou revisada de 1984) e os dois pisos. Trocar é mudar constantes.

### 6.3 Chamada à IA

- **Prompt de sistema:** o texto da nutricionista, copiado do fluxo `Criar Dieta` sem alterar o conteúdo, em `lib/meal-plan/prompt.ts`.
- **Mensagem do usuário:** os 17 parâmetros, no mesmo formato do n8n, seguidos de um bloco "Metas calculadas" com TMB, GET, meta calórica e faixa de proteína, e a instrução de usar esses valores sem recalcular.
- **Saída estruturada:** o schema é montado com `zodOutputFormat` (`output_config.format`) e a resposta é lida e validada pelo próprio adaptador (`create` do SDK; `JSON.parse` e `safeParse` do texto após o último bloco `fallback`). O schema pede `meals[] { name, time, foods, calories (número) }`, `calories` (número) e `observations`.
- **Parâmetros:** modelo de `ANTHROPIC_MODEL`; raciocínio adaptativo (padrão do modelo); `output_config.effort = "high"`; `max_tokens = 16000`; tempo limite de 120 s; uma repetição automática do SDK.
- **Fallback:** `fallbacks: "default"` (beta `server-side-fallback-2026-07-01`). Se o modelo recusar o pedido por filtro de segurança, a própria API refaz em outro modelo. O parâmetro exige o endpoint beta do SDK: o adaptador chama `client.beta.messages.create` com `output_config.format` e `fallbacks: "default"` juntos, e lê o plano no texto que vem depois do último bloco `fallback` (o que veio antes é do modelo que recusou), validando-o com o schema.
- **Resposta sem plano** (`stop_reason` igual a `refusal` ou `max_tokens`, ou texto que não é JSON do schema) → erro temporário.

**Classificação de erros** (o adaptador converte os erros do SDK em um erro de domínio com `transient`):

| Erro | Tipo |
|---|---|
| Conexão, tempo limite, 429, 5xx | temporário |
| Recusa, corte por `max_tokens`, saída fora do schema, plano inválido | temporário |
| 400, 401, 403, 404 | definitivo |

**Custo estimado:** na casa de US$ 0,10 por plano com `claude-opus-5-5` (cerca de 2 mil tokens de entrada e 5 mil de saída, incluindo o raciocínio). É uma estimativa; os tokens reais de cada plano ficam em `plan_generations.generation`.

### 6.4 Validação do plano

- De 2 a 6 refeições, cada uma com `name`, `time` e `foods` não vazios.
- Cada linha de `foods` traz uma quantidade (contém um dígito) ou a expressão "à vontade" (aceita também "a vontade", sem diferenciar maiúsculas).
- A soma das calorias das refeições fica a até 10% do total.
- O total fica entre `max(piso, 85% da meta)` e `115% da meta`.
- `observations` não é vazio.

Depois de validado, o plano é convertido para o formato de `plan_data` (calorias da refeição viram texto).

### 6.5 Tentativas e falha definitiva

- Até **5 tentativas**, com o backoff do job (2, 4, 8, 16 minutos).
- Erro definitivo ou 5ª falha: `status = failed`, e-mail de alerta (`kind = meal_plan`, com id da geração, nome do paciente, etapa e erro).
- `last_error` nunca contém respostas do quiz nem o conteúdo do plano.

## 7. Job e reabertura

**Rodada do job** (`run-jobs`), na ordem:

1. cobranças a sincronizar (até 20), como hoje;
2. **gerações de plano** vencidas (até 3): `status = 'pending'`, `next_attempt_at <= agora` e não reservadas;
3. notificações vencidas (até 50), como hoje. As criadas na etapa 2 já saem na mesma rodada.

**`POST /api/jobs/retry`** aceita mais um formato, `{ "planGenerationId": "…" }`, que volta a geração para `pending` com `attempts = 0`. `{ "allFailed": true }` passa a incluir as gerações com falha.

## 8. Credencial de acesso

**Senha temporária.** Derivada, não sorteada:

```
HMAC-SHA256(ACCESS_PASSWORD_SECRET, "temp-password:v1:" + patient.id)
  → 10 primeiros bytes, cada um mapeado (byte mod 32) para o alfabeto
    "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
```

- 10 caracteres, só maiúsculas e dígitos, sem `0`, `1`, `I` e `O`.
- O mesmo paciente recebe sempre a mesma senha temporária. Por isso e-mail e WhatsApp mostram a mesma senha, o reenvio funciona, e nenhuma senha em texto puro é gravada no banco.
- `ACCESS_PASSWORD_SECRET` não pode ser trocado sem invalidar as senhas temporárias ainda não usadas.

**Hash gravado** em `patients.password_hash`:

```
scrypt$16384$8$1$<salt em base64, 16 bytes>$<hash em base64, 32 bytes>
```

Os três números são `N`, `r` e `p`. A verificação compara em tempo constante.

**Criação.** Só acontece na transação de conclusão do plano e só se `password_hash` é nulo. A condição está no próprio `UPDATE`, então duas gerações simultâneas do mesmo paciente não criam duas senhas. Junto vão `must_change_password = true` e `password_set_at`.

## 9. Notificações

Novo `kind`: `plan_ready`, criado para o `quiz_response_id` da geração, um por canal ativo.

**Escolha do texto na hora do envio.** O serviço deriva a senha temporária do paciente e a confere contra o `password_hash` atual:

| Resultado | Texto enviado |
|---|---|
| A senha gravada ainda é a temporária | **Primeiro acesso**, com a senha |
| O paciente já trocou a senha | **Plano novo disponível**, sem senha |
| Paciente sem `password_hash` | erro temporário (não deveria ocorrer) |

A decisão não depende de `must_change_password`, então funciona mesmo que o PlanA nunca atualize esse campo.

**Primeiro acesso**

- Título: `Primeiro Acesso App PlanA`
- Corpo:

```
Olá {nome}! 👋 <br>Seu pagamento foi confirmado e seu <strong>Plano Alimentar Personalizado está pronto</strong>! 🎉 <br><br>
Utilize os dados abaixo para realizar seu <strong>primeiro login</strong>: <br>
Link: {PLANA_APP_URL} <br>
🔐 <strong>Usuário:</strong> seu CPF (somente números) <br>
🔑 <strong>Senha temporária:</strong> {senha} <br><br>
Por segurança, recomendamos que você <strong>troque a senha</strong> após o primeiro acesso.
```

**Plano novo disponível**

- Título: `Seu novo Plano Alimentar está pronto`
- Corpo:

```
Olá {nome}! 👋 <br>Recebemos seu pagamento e seu <strong>novo Plano Alimentar Personalizado já está disponível</strong>. 🎉 <br><br>
Acesse com seu CPF e a senha que você já usa: <br>
{PLANA_APP_URL}
```

O envio segue as regras atuais: e-mail com HTML e texto puro; WhatsApp dividido a cada `<br><br>`, título em negrito na primeira parte e 3 segundos entre as partes; tentativas, backoff, alerta e reabertura do outbox. `NOTIFY_EMAIL_ENABLED` e `NOTIFY_WHATSAPP_ENABLED` continuam valendo. O nome do paciente é escapado como no template `payment_link`.

**Aviso de estorno ou chargeback** (para o admin, fora do outbox): assunto `[tami-forms] Pagamento revertido: {paymentId}`, com o evento, o id da cobrança no Asaas e o nome do paciente. Falha no envio só gera log; o evento já está gravado em `payments.status` e `last_event`.

## 10. Configuração

| variável | obrigatória | exemplo / padrão |
|---|---|---|
| `ASAAS_WEBHOOK_TOKEN` | sim | segredo aleatório, mínimo de 32 caracteres; o mesmo valor cadastrado no painel do Asaas |
| `ANTHROPIC_API_KEY` | sim | chave da API da Anthropic |
| `ANTHROPIC_MODEL` | não | `claude-opus-5-5` |
| `ACCESS_PASSWORD_SECRET` | sim | segredo aleatório, mínimo de 32 caracteres |
| `PLANA_APP_URL` | não | `https://plana.nutritamilivalle.com.br/` |

Validadas por `lib/env.ts` no boot, como as demais. Nenhuma é `NEXT_PUBLIC_*`. O token do webhook não deve ser igual à chave de API do Asaas.

## 11. Contrato com o PlanA

O PlanA (`../dieta-app`) não é alterado neste trabalho. Para que quem pagou consiga entrar e ver o plano, a refatoração dele precisa cobrir:

| Item | Hoje no PlanA | O que passa a valer |
|---|---|---|
| Banco | PostgreSQL (Supabase) | Este MySQL: tabelas `patients` e `meal_plans` |
| Senha | SHA-512 em base64, coluna `patients.password` | scrypt no formato da seção 8, coluna `patients.password_hash` |
| Troca de senha | Grava SHA-512 | Grava scrypt e põe `must_change_password = false` |
| Primeiro acesso | Não força a troca | Opcional: forçar a troca quando `must_change_password = true` |
| Login por CPF | Compara o valor digitado | `patients.cpf` tem só dígitos (11) |
| Login por e-mail | E-mail único | Aqui o e-mail não é único; a identidade é o CPF |
| Planos | Status `active`, `completed`, `cancelled`; só `active` abre | Igual. O app marca `completed` no plano substituído |
| Ids | UUID nativo | `CHAR(36)` |

**Dependência para produção:** o webhook de produção só deve ser cadastrado no Asaas depois que o PlanA estiver lendo este MySQL e validando o novo hash. Até lá, tudo é testado no sandbox.

## 12. Observabilidade e segurança

- **Logs** (JSON, uma linha por evento): `webhook.asaas.received`, `webhook.asaas.duplicate`, `webhook.asaas.ignored`, `webhook.asaas.unauthorized`, `webhook.asaas.unreadable`, `plan.generation.done`, `plan.generation.retry_scheduled`, `plan.generation.failed`. Campos: id do evento, tipo, `paymentId`, `generationId`, etapa, duração, modelo e tokens.
- **Nunca vão para log, `last_error` ou e-mail de alerta:** respostas do quiz, conteúdo do plano, senha temporária, token do webhook, chaves de API.
- **Dados enviados à Anthropic:** só os 17 campos da seção 6.1 e as metas calculadas. Sem identificação do paciente.
- **Webhook:** exige token; não tem limite de taxa por IP, porque a origem é o Asaas.
- **Senha:** nunca gravada em texto puro; hash com salt por paciente.

## 13. Testes (Vitest)

- **Unitários**
  - evento do Asaas: parse, campos extras ignorados, classificação por grupo;
  - metas: os quatro pontos médios de idade, as duas fórmulas, o piso e o arredondamento;
  - validação do plano: cada regra da seção 6.4, e a conversão para `plan_data`;
  - senha: derivação determinística, alfabeto e tamanho; hash e verificação; senha errada não confere;
  - templates: os dois textos, escape do nome, conversão para partes de WhatsApp;
  - mensagem enviada à IA: contém os 17 campos e as metas, e nenhum dado pessoal.
- **Handler do webhook:** token ausente ou errado → 401; corpo ilegível → 200; falha de banco → 500; evento válido → 200 e geração disparada depois da resposta.
- **Serviços com dublês**
  - evento pago cria a geração uma única vez (`CONFIRMED` seguido de `RECEIVED`);
  - evento duplicado não tem efeito;
  - cobrança desconhecida e `asaas_id` divergente são ignorados;
  - `OVERDUE` depois de pago não muda o status;
  - reversão atualiza o status e avisa o admin, sem tocar no plano;
  - geração com sucesso: plano `active`, anterior `completed`, credencial criada, notificações enfileiradas;
  - paciente que já tem senha: credencial intacta;
  - plano inválido agenda nova tentativa; a 5ª falha vira `failed` com alerta;
  - erro definitivo da IA vira `failed` na primeira vez;
  - respostas inválidas viram `failed` na primeira vez;
  - geração reservada não é processada em paralelo;
  - envio de `plan_ready`: texto de primeiro acesso com a senha temporária; texto de plano novo depois que a senha muda;
  - `/api/jobs/retry` reabre uma geração e `allFailed` a inclui.
- **Repositórios:** os novos métodos entram no contrato (`tests/db/repos.contract.ts`) e passam pelo fake em memória e pelo MySQL real (`TEST_DATABASE_URL`).
- **Gerador da Anthropic:** testado com um cliente falso (resposta válida, recusa, corte por `max_tokens`, erros 401, 429 e 500). Nenhum teste automático chama a API real.
- **Roteiro manual no sandbox** (README): pagar uma cobrança de teste e conferir evento, plano, credencial, e-mail e WhatsApp; reenviar o mesmo evento; simular estorno; token errado; falha da IA com chave inválida seguida de `/api/jobs/retry`.

## 14. Critérios de sucesso

- Um pagamento confirmado no sandbox gera o plano, a credencial e as duas mensagens sem intervenção, em poucos minutos.
- O mesmo evento entregue duas vezes, ou `CONFIRMED` seguido de `RECEIVED`, gera um único plano e uma única mensagem por canal.
- Chamada sem o token correto é recusada com 401 e não altera nada.
- Um paciente nunca tem dois planos `active`.
- A senha de quem já tem credencial nunca é alterada.
- Falha da IA é repetida automaticamente; a falha definitiva gera alerta e pode ser reaberta por `/api/jobs/retry`.
- Estorno e chargeback atualizam a cobrança e avisam o admin.
- Testes, `typecheck` e `next build` passam; o deploy exige só as variáveis novas e a migration automática.
- Nenhum fluxo do n8n é necessário.
