# Tami Forms

## 1. O que é

Quiz online (Next.js) em que a pessoa responde perguntas sobre peso, altura e hábitos e informa nome, e-mail, telefone e CPF. No fim, o app cria a cobrança no Asaas e entrega o link de pagamento do plano alimentar.

Tudo roda dentro deste projeto: banco MySQL, Asaas, e-mail (SMTP), WhatsApp (Evolution API) e um job de fundo. Não há outro serviço de automação por trás.

O que acontece quando a pessoa envia o formulário:

1. **Deu tudo certo.** O banco e o Asaas responderam. A pessoa é levada direto para o link de pagamento.
2. **O Asaas falhou.** Os dados ficam salvos. A pessoa vê a tela de confirmação (`/confirmation`), que avisa que o link chegará por e-mail. O job tenta criar a cobrança de novo, sozinho, até conseguir.
3. **O banco falhou.** A tela mostra um erro e o botão "Tentar novamente". Reenviar não duplica nada.

E-mail e WhatsApp com o link são enviados automaticamente, assim que a cobrança existe. Se um envio falhar, o job tenta de novo.

O que acontece depois do pagamento:

1. O Asaas avisa o app pelo webhook (seção "Webhook do Asaas"). O app registra o pagamento no banco.
2. O app calcula as metas de calorias e proteína e pede à IA (Anthropic) o plano alimentar a partir das respostas do quiz. Nome, CPF, e-mail e telefone nunca vão para a IA.
3. O plano é gravado e passa a ser o plano ativo da pessoa. Se ela já tinha um plano ativo, o antigo passa para `completed`.
4. Quem ainda não tem senha do PlanA recebe uma senha temporária. Quem já tem continua com a que tem.
5. O app envia os dados de acesso por e-mail e WhatsApp. Se a IA ou um envio falhar, o job repete sozinho.

Tudo isso leva poucos minutos e não depende de ninguém. Os dados do plano ficam no MySQL; quem lê é o PlanA (seção "Integração com o PlanA").

## 2. Requisitos

- Node 24.
- pnpm, pelo corepack: rode `corepack enable` uma vez.
- **MySQL 8.** Não use MariaDB: a migration usa o collation `utf8mb4_0900_ai_ci`, que só existe no MySQL 8.

## 3. Rodar no seu computador

```bash
corepack pnpm install
cp .env.example .env.local
```

Edite o `.env.local` com seus valores (use o Asaas em `sandbox`). Crie o banco:

```sql
CREATE DATABASE tami_forms CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
```

Inicie:

```bash
corepack pnpm dev
```

O servidor abre em `http://localhost:5000` (a porta é sempre 5000). As migrations (criação das tabelas) rodam sozinhas quando o app inicia.

## 4. Variáveis de ambiente

O modelo está em `.env.example`. Nenhuma variável começa com `NEXT_PUBLIC_`: todas ficam só no servidor.

Uma variável **vazia** é tratada como inválida. O app se recusa a iniciar e lista o que está errado. Para usar o valor padrão, **remova** a variável; não deixe `NOME=` em branco.

| Variável | Obrigatória | Para que serve |
|---|---|---|
| `DATABASE_URL` | sim | Conexão com o MySQL. Ex.: `mysql://usuario:senha@host:3306/tami_forms` |
| `ASAAS_ENV` | sim | `sandbox` (testes) ou `production` |
| `ASAAS_API_KEY` | sim | Chave do Asaas do ambiente escolhido em `ASAAS_ENV` |
| `PAYMENT_AMOUNT` | não | Valor da cobrança, com ponto e até 2 casas. Padrão `39.90` |
| `PAYMENT_DUE_DAYS` | não | Dias até o vencimento. Padrão `2` |
| `PAYMENT_SUCCESS_URL` | sim | Endereço para onde o Asaas leva a pessoa após pagar (URL completa) |
| `SMTP_HOST` | sim | Servidor de e-mail |
| `SMTP_PORT` | sim | Porta do servidor de e-mail (ex.: `587`) |
| `SMTP_USER` | sim | Usuário do e-mail |
| `SMTP_PASS` | sim | Senha do e-mail |
| `SMTP_FROM` | sim | Remetente. Ex.: `Nome <contato@seudominio.com>` |
| `EVOLUTION_API_URL` | sim | Endereço da Evolution API (URL completa) |
| `EVOLUTION_API_KEY` | sim | Chave da Evolution API |
| `EVOLUTION_INSTANCE` | sim | Nome da instância do WhatsApp |
| `ADMIN_ALERT_EMAIL` | sim | E-mail que recebe o alerta de falha definitiva |
| `JOBS_TOKEN` | sim | Segredo de pelo menos 32 caracteres, aleatório. Protege `/api/jobs/*` |
| `JOBS_ENABLED` | não | `true` (padrão) liga o job de fundo; `false` desliga |
| `NOTIFY_EMAIL_ENABLED` | não | `true` (padrão) envia e-mail; `false` desliga o canal |
| `NOTIFY_WHATSAPP_ENABLED` | não | `true` (padrão) envia WhatsApp; `false` desliga o canal |
| `ASAAS_WEBHOOK_TOKEN` | sim | Segredo de pelo menos 32 caracteres, aleatório. É o mesmo valor cadastrado no painel do Asaas (seção "Webhook do Asaas"). **Não** use a chave de API do Asaas aqui |
| `ANTHROPIC_API_KEY` | sim | Chave da API da Anthropic, usada para gerar o plano alimentar |
| `ANTHROPIC_MODEL` | não | Modelo da IA. Padrão `claude-opus-5-5`. Para usar o padrão, **remova** a variável: `ANTHROPIC_MODEL=` em branco é inválido |
| `ACCESS_PASSWORD_SECRET` | sim | Segredo de pelo menos 32 caracteres, aleatório. Dele sai a senha temporária de cada paciente. **Não troque depois** (veja abaixo) |
| `PLANA_APP_URL` | não | Endereço do PlanA que vai nas mensagens. Padrão `https://plana.nutritamilivalle.com.br/` |

Para gerar um `JOBS_TOKEN`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

Use o mesmo comando para gerar `ASAAS_WEBHOOK_TOKEN` e `ACCESS_PASSWORD_SECRET`, um valor diferente para cada.

- **`ACCESS_PASSWORD_SECRET` não deve ser trocado depois que o app entrou em uso.** A senha temporária de cada paciente é calculada a partir dele. Se mudar, as senhas temporárias que ainda não foram trocadas deixam de funcionar, e a mensagem de "plano novo" passa a ser enviada no lugar da de primeiro acesso.
- **`ASAAS_WEBHOOK_TOKEN` não pode ser a chave de API do Asaas** (`ASAAS_API_KEY`). O Asaas não aceita, e o token trafega em cada chamada do webhook.

## 5. Deploy no Easypanel (a partir do GitHub, sem Docker)

1. Crie um serviço **MySQL 8** no Easypanel. Crie nele o banco `tami_forms` com o collation `utf8mb4_0900_ai_ci` (mesmo comando da seção 3).
2. Crie um serviço **App** a partir do repositório do GitHub (branch de produção).
3. Comandos:
   - Build: `pnpm install && pnpm build`
   - Start: `pnpm start`
   - Porta do app: `5000`
4. Em `DATABASE_URL`, use a **URL interna** do serviço MySQL que o Easypanel mostra (nome do serviço como host).
5. Cadastre todas as variáveis da seção 4 no ambiente do app. Comece com `ASAAS_ENV=sandbox`, num banco separado do de produção (seção 9).
6. Health check: caminho `/api/health`. Responde 200 quando o banco está acessível e 503 quando não está.
7. Configure o domínio no proxy do Easypanel.

**Atenção ao atualizar para a renovação de plano:** a migration `0003` remove as colunas `meal_plans.due_date_new_meal_plan` e `meal_plans.payment_url_new_meal_plan`, que o PlanA do primeiro ciclo ainda lê. Entre este deploy e o do PlanA novo, as telas de plano do PlanA antigo respondem com erro. Suba o PlanA logo em seguida e, se ele já estiver em uso, faça os dois deploys num horário de pouco acesso.

- **Antes do deploy da `0003`**, confira no banco de produção que as duas colunas nunca foram preenchidas. O resultado esperado é `0`; se vier outro número, pare e investigue antes de subir, porque a migration apaga esses dados:

  ```sql
  SELECT COUNT(*) FROM meal_plans WHERE due_date_new_meal_plan IS NOT NULL OR payment_url_new_meal_plan IS NOT NULL;
  ```

- **A `0003` não tem volta simples:** para voltar ao código anterior deste app (ou ao PlanA do primeiro ciclo), é preciso recriar antes as duas colunas em `meal_plans`; sem elas, o código anterior quebra.

O app aplica as migrations do banco **a cada inicialização**. Se a configuração estiver inválida ou o banco inacessível, o processo encerra e o log diz o motivo.

## Webhook do Asaas

É por ele que o Asaas avisa o app de que a cobrança foi paga. Sem o webhook cadastrado, o plano não é gerado.

**URL:** `https://SEU-DOMINIO/api/webhooks/asaas` (troque `SEU-DOMINIO` pelo endereço do app).

**Como cadastrar** (confira no painel do Asaas do ambiente certo: sandbox para testes, produção só depois da seção "Integração com o PlanA"). Os nomes abaixo vêm da documentação do Asaas (<https://docs.asaas.com/docs/criar-novo-webhook-pela-aplicacao-web>); o painel pode mostrar os rótulos um pouco diferentes:

1. No painel, abra `Menu do usuário > Integrações > Webhooks` e clique em **Criar Webhook**.
2. Preencha **Nome** (qualquer um, por exemplo `tami-forms`), **URL** (a de cima) e **E-mail** (quem deve receber os avisos de falha do Asaas).
3. Em **Auth Token**, cole o valor de `ASAAS_WEBHOOK_TOKEN`. O Asaas exige de 32 a 255 caracteres, sem espaços, e não aceita uma chave de API. Se preferir, use o botão **Gerar token** do Asaas e copie o valor gerado para o `ASAAS_WEBHOOK_TOKEN` do app. O token precisa ser **igual** nos dois lados; se for diferente, o app responde 401 e nada acontece.
4. Deixe o webhook ativado (**Enabled**). **Send Type** (tipo de envio): qualquer um serve, o app não depende da ordem dos eventos.
5. Marque os eventos de cobrança (`PAYMENT_*`) abaixo e salve.

**Eventos a marcar:**

| Grupo | Eventos | O que o app faz |
|---|---|---|
| `paid` (pago) | `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED` | Registra o pagamento e inicia a geração do plano |
| `reversal` (reversão) | `PAYMENT_REFUNDED`, `PAYMENT_PARTIALLY_REFUNDED`, `PAYMENT_REFUND_IN_PROGRESS`, `PAYMENT_CHARGEBACK_REQUESTED`, `PAYMENT_CHARGEBACK_DISPUTE`, `PAYMENT_AWAITING_CHARGEBACK_REVERSAL`, `PAYMENT_RECEIVED_IN_CASH_UNDONE` | Atualiza o status da cobrança e avisa `ADMIN_ALERT_EMAIL`. O plano e o acesso não mudam |
| `pre_payment` (antes de pagar) | `PAYMENT_OVERDUE`, `PAYMENT_DELETED`, `PAYMENT_RESTORED` | Atualiza o status, só se a cobrança ainda não foi paga |

Outros eventos, se marcados, são aceitos e ignorados. Cartão de crédito: o Asaas manda `PAYMENT_CONFIRMED` na hora e `PAYMENT_RECEIVED` cerca de 32 dias depois; o plano é gerado uma única vez, no primeiro.

**Se a fila for pausada.** Depois de 15 falhas seguidas de entrega, o Asaas interrompe a fila desse webhook e manda e-mail avisando. Os eventos continuam sendo gerados e ficam guardados por **14 dias** (depois disso são apagados). Para recuperar:

1. Veja nos **Logs de Webhooks** do Asaas por que as entregas falharam e corrija (app fora do ar, token diferente, URL errada).
2. Em `Menu do usuário > Integrações > Webhooks`, reative a fila da configuração interrompida. Os eventos guardados são reenviados. O app trata reenvios com segurança: o mesmo evento nunca gera dois planos nem duas mensagens.

O app responde `200` mesmo para corpo ilegível, justamente para não pausar a fila à toa. Só responde `401` (token errado ou ausente) e `500` (falha do banco, quando pede reenvio).

## Observabilidade (funil e erros)

O app grava o caminho de quem preenche o quiz e os erros das integrações no próprio MySQL, e o **Metabase** (gratuito, no Easypanel) mostra isso em painéis, sem escrever SQL no dia a dia.

### O que é gravado e o que nunca é gravado

- **Funil do quiz** (`funnel_sessions` e `funnel_events`): um id aleatório por aba (`sessionStorage`, sem vínculo com o paciente), a etapa vista, o tempo em cada etapa, os erros de validação, o resultado do envio, o clique no checkout, a origem (UTM e só o host do referrer), o aparelho (tipo, sistema e navegador, tirados do User-Agent) e as respostas não sensíveis da lista permitida (faixa etária, sexo biológico, tipo físico, refeições, sono, água etc.; o IMC entra só como faixa).
- **Erros do backend** (`app_logs`): todo `warn` e `error` do logger (Asaas, e-mail, WhatsApp, Anthropic, webhook, envio do quiz) e quatro eventos de sucesso (`submit.done`, `webhook.asaas.received`, `plan.generation.done`, `notification.dispatch.sent`), para calcular a taxa de falha. É o mesmo texto que já vai para o stdout, já mascarado.
- **Nunca é gravado:** nome, CPF, e-mail, WhatsApp, peso, altura, meta e IMC numérico; o IP (só o rate limit em memória o usa); o User-Agent bruto.
- O usuário `metabase_ro` só lê as 3 tabelas e as 5 views abaixo. Ele **não** enxerga `patients`, `payments`, `quiz_responses` nem `notifications`.

### Metabase no Easypanel

Faça depois do primeiro deploy do app com as migrations `0004` e `0005` aplicadas (o `GRANT` falha em tabela que ainda não existe). Os comandos SQL rodam como `root`, no console do serviço MySQL do Easypanel.

1. **Banco interno do Metabase e o usuário dele** (o Metabase guarda aqui as perguntas e os painéis, separado do `tami_forms`):

   ```sql
   CREATE DATABASE metabase CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
   CREATE USER 'metabase_app'@'%' IDENTIFIED BY '<senha forte>';
   GRANT ALL PRIVILEGES ON metabase.* TO 'metabase_app'@'%';
   ```

2. **Usuário de leitura** (é com ele que o Metabase consulta os dados do app; só `SELECT`, e só nestas tabelas e views):

   ```sql
   CREATE USER 'metabase_ro'@'%' IDENTIFIED BY '<senha forte>';
   GRANT SELECT ON tami_forms.funnel_sessions TO 'metabase_ro'@'%';
   GRANT SELECT ON tami_forms.funnel_events TO 'metabase_ro'@'%';
   GRANT SELECT ON tami_forms.app_logs TO 'metabase_ro'@'%';
   GRANT SELECT ON tami_forms.vw_funnel_steps TO 'metabase_ro'@'%';
   GRANT SELECT ON tami_forms.vw_abandonment TO 'metabase_ro'@'%';
   GRANT SELECT ON tami_forms.vw_session_answers TO 'metabase_ro'@'%';
   GRANT SELECT ON tami_forms.vw_step_durations TO 'metabase_ro'@'%';
   GRANT SELECT ON tami_forms.vw_api_errors TO 'metabase_ro'@'%';
   ```

   Se o banco do app não se chamar `tami_forms`, troque o nome nas 8 linhas. Os `GRANT` valem pelo nome: continuam valendo quando uma migration recria uma view.

3. **Serviço novo** pelo template **Metabase** do Easypanel, com estas variáveis de ambiente:

   | Variável | Valor |
   |---|---|
   | `MB_DB_TYPE` | `mysql` |
   | `MB_DB_HOST` | host interno do serviço MySQL (o nome do serviço, como no `DATABASE_URL`) |
   | `MB_DB_PORT` | `3306` |
   | `MB_DB_DBNAME` | `metabase` |
   | `MB_DB_USER` | `metabase_app` |
   | `MB_DB_PASS` | a senha do `metabase_app` |
   | `JAVA_OPTS` | `-Xmx1g` |

   Defina o limite de memória do serviço em **1,5 GB** (o servidor tem 8 GB, a maior parte livre).
4. **Domínio próprio** (por exemplo `painel.nutritamilivalle.com.br`) no proxy do Easypanel. No primeiro acesso, crie o usuário admin.
5. No Metabase, em `Admin > Bancos de dados > Adicionar banco`, escolha **MySQL**, informe o host interno, a porta `3306`, o banco `tami_forms` e o usuário `metabase_ro`. Em `Admin > Configurações > Localização`, deixe o fuso do relatório em `America/Sao_Paulo`. As datas das tabelas estão em UTC; os gráficos "por dia" (painéis 8 e 9) agrupam por dia UTC, então o dia vira às 21h de Brasília.
6. Crie as 9 perguntas abaixo (`Novo > Pergunta SQL`, banco `tami_forms`) e monte um painel com elas. Nas perguntas com `{{periodo}}`, `{{utm_source}}`, `{{utm_campaign}}` ou `{{device_type}}`, abra a variável, escolha o tipo **Filtro de campo** e aponte para a coluna da tabela indicada em cada painel; depois ligue esses filtros aos filtros do painel (`Período`, `utm_source`, `utm_campaign`, `device_type`). Os trechos `[[AND ...]]` só entram na consulta quando o filtro é preenchido.

### Os 9 painéis

Duas regras valem para todos: o filtro de campo do Metabase escreve o nome da tabela na frente da coluna, por isso as consultas **não usam apelido de tabela** nos pontos onde há `{{...}}`; e o MySQL não tem `MEDIAN`, por isso a mediana e o p90 do painel 3 usam `ROW_NUMBER()` e `COUNT()` por `step_slug`.

#### 1. Funil por etapa

Objetivo: ver quantas sessões chegaram a cada etapa e quanto cai de uma etapa para a seguinte. Filtros de campo: `periodo` em `funnel_sessions.started_at`, `utm_source`, `utm_campaign` e `device_type` nas colunas de mesmo nome de `funnel_sessions`. Visualização: **Funil** (etapa = `step_slug`, medida = `sessoes`); a tabela mostra também `pct_do_inicio` e `pct_queda`.

```sql
SELECT vw_funnel_steps.step,
       vw_funnel_steps.step_slug,
       COUNT(funnel_sessions.session_id) AS sessoes,
       ROUND(100 * COUNT(funnel_sessions.session_id)
             / NULLIF(FIRST_VALUE(COUNT(funnel_sessions.session_id)) OVER (ORDER BY vw_funnel_steps.step), 0), 1) AS pct_do_inicio,
       ROUND(100 * (1 - COUNT(funnel_sessions.session_id)
             / NULLIF(LAG(COUNT(funnel_sessions.session_id)) OVER (ORDER BY vw_funnel_steps.step), 0)), 1) AS pct_queda
FROM vw_funnel_steps
LEFT JOIN funnel_sessions
       ON funnel_sessions.max_step >= vw_funnel_steps.step
       [[AND {{periodo}}]]
       [[AND {{utm_source}}]]
       [[AND {{utm_campaign}}]]
       [[AND {{device_type}}]]
GROUP BY vw_funnel_steps.step, vw_funnel_steps.step_slug
ORDER BY vw_funnel_steps.step;
```

Sem filtros, o resultado é o mesmo de `SELECT step, step_slug, sessions, pct_of_start FROM vw_funnel_steps ORDER BY step`.

#### 2. Onde abandonam

Objetivo: descobrir em que etapa ficam as sessões que não chegaram ao checkout e pararam há mais de 30 minutos. Filtros de campo: `periodo` em `vw_abandonment.started_at`; `utm_source`, `utm_campaign` e `device_type` nas colunas de `vw_abandonment`. Visualização: **Barras**, etapa no eixo X (`abandon_step_slug`) e `sessoes` no Y.

```sql
SELECT abandon_step, abandon_step_slug, COUNT(*) AS sessoes
FROM vw_abandonment
WHERE 1 = 1
  [[AND {{periodo}}]]
  [[AND {{utm_source}}]]
  [[AND {{utm_campaign}}]]
  [[AND {{device_type}}]]
GROUP BY abandon_step, abandon_step_slug
ORDER BY abandon_step;
```

#### 3. Tempo por etapa

Objetivo: achar as etapas em que as pessoas demoram mais, pela mediana e pelo percentil 90 (o p90 mostra o "lento" que a mediana esconde). Filtro de campo: `periodo` em `vw_step_durations.created_at`. Visualização: **Barras** com `mediana_s` e `p90_s` por `step_slug`, ou tabela.

```sql
WITH ordenado AS (
  SELECT step,
         step_slug,
         duration_ms,
         ROW_NUMBER() OVER (PARTITION BY step_slug ORDER BY duration_ms) AS posicao,
         COUNT(*)     OVER (PARTITION BY step_slug)                      AS total
  FROM vw_step_durations
  WHERE duration_ms IS NOT NULL
    [[AND {{periodo}}]]
)
SELECT step,
       step_slug,
       MAX(total) AS respostas,
       ROUND(AVG(CASE WHEN posicao IN (FLOOR((total + 1) / 2), CEIL((total + 1) / 2)) THEN duration_ms END) / 1000, 1) AS mediana_s,
       ROUND(MIN(CASE WHEN posicao >= CEIL(0.9 * total) THEN duration_ms END) / 1000, 1) AS p90_s
FROM ordenado
GROUP BY step, step_slug
ORDER BY step;
```

#### 4. Erros de validação

Objetivo: ver em que etapa e por qual motivo (`vazio`, `email_invalido`, `telefone_invalido`, `cpf_invalido`) as pessoas esbarram na validação. Filtro de campo: `periodo` em `funnel_events.created_at`. Visualização: **Barras empilhadas**, `step_slug` no eixo X e `motivo` como série.

```sql
SELECT step,
       step_slug,
       JSON_UNQUOTE(JSON_EXTRACT(props, '$.reason')) AS motivo,
       COUNT(*) AS total
FROM funnel_events
WHERE event = 'validation_error'
  [[AND {{periodo}}]]
GROUP BY step, step_slug, motivo
ORDER BY total DESC;
```

#### 5. Conversão por origem

Objetivo: comparar a origem do tráfego pela parte das sessões que chega ao clique no checkout. Sem UTM, a origem mostra o host do referrer (`ref:...`) ou `(direto)`. Filtros de campo: `periodo` em `funnel_sessions.started_at` e `device_type` em `funnel_sessions.device_type`. Visualização: **Tabela** ordenada por `sessoes` (ou barras com `pct_checkout`).

```sql
SELECT COALESCE(utm_source, CONCAT('ref:', referrer_host), '(direto)') AS origem,
       COALESCE(utm_campaign, '(sem campanha)') AS campanha,
       COUNT(*) AS sessoes,
       SUM(checkout_clicked) AS checkouts,
       ROUND(100 * SUM(checkout_clicked) / COUNT(*), 1) AS pct_checkout
FROM funnel_sessions
WHERE 1 = 1
  [[AND {{periodo}}]]
  [[AND {{device_type}}]]
GROUP BY origem, campanha
ORDER BY sessoes DESC;
```

#### 6. Conversão por aparelho

Objetivo: ver se o quiz converte pior em algum aparelho, sistema ou navegador (inclusive os navegadores internos do Instagram e do Facebook). Filtros de campo: `periodo` em `funnel_sessions.started_at`, `utm_source` e `utm_campaign` em `funnel_sessions`. Visualização: **Tabela** (ou barras de `pct_checkout` por `device_type`).

```sql
SELECT device_type,
       os,
       browser,
       COUNT(*) AS sessoes,
       SUM(checkout_clicked) AS checkouts,
       ROUND(100 * SUM(checkout_clicked) / COUNT(*), 1) AS pct_checkout
FROM funnel_sessions
WHERE 1 = 1
  [[AND {{periodo}}]]
  [[AND {{utm_source}}]]
  [[AND {{utm_campaign}}]]
GROUP BY device_type, os, browser
ORDER BY sessoes DESC;
```

#### 7. Respostas × abandono

Objetivo: cruzar uma resposta do quiz com a etapa em que a pessoa abandonou (o exemplo usa `tipo_fisico`; troque `vw_session_answers.tipo_fisico` por qualquer outra coluna da view: `faixa_etaria`, `sexo_biologico`, `peso_comportamento`, `sono`, `agua`, `imc_faixa` etc.). Só entram sessões abandonadas. Filtros de campo: `periodo` em `vw_session_answers.started_at`; `utm_source`, `utm_campaign` e `device_type` em `vw_session_answers`. Visualização: **Barras empilhadas**, `abandon_step_slug` no eixo X e `resposta` como série.

```sql
SELECT vw_abandonment.abandon_step,
       vw_abandonment.abandon_step_slug,
       COALESCE(vw_session_answers.tipo_fisico, '(sem resposta)') AS resposta,
       COUNT(*) AS sessoes
FROM vw_session_answers
JOIN vw_abandonment ON vw_abandonment.session_id = vw_session_answers.session_id
WHERE 1 = 1
  [[AND {{periodo}}]]
  [[AND {{utm_source}}]]
  [[AND {{utm_campaign}}]]
  [[AND {{device_type}}]]
GROUP BY vw_abandonment.abandon_step, vw_abandonment.abandon_step_slug, resposta
ORDER BY vw_abandonment.abandon_step, sessoes DESC;
```

#### 8. Falhas de envio no navegador

Objetivo: saber quantas tentativas de envio (etapa `envio`) deram certo e quantas falharam, e de que tipo (`http_4xx`, `http_5xx`, `timeout`, `rede`, `resposta_invalida`, `storage`), dia a dia. Filtro de campo: `periodo` em `funnel_events.created_at`. Visualização: **Barras empilhadas** por `dia`, com `resultado` como série.

```sql
SELECT DATE(created_at) AS dia,
       JSON_UNQUOTE(JSON_EXTRACT(props, '$.outcome')) AS resultado,
       COUNT(*) AS total
FROM funnel_events
WHERE event = 'submit_result'
  [[AND {{periodo}}]]
GROUP BY dia, resultado
ORDER BY dia, resultado;
```

#### 9. Saúde das integrações

Objetivo: acompanhar os erros do servidor por área (a parte do nome do evento antes do primeiro ponto: `asaas`, `webhook`, `submit`, `plan`, `notification`, `payment` etc.) e por dia, com os sucessos ao lado. Só quatro eventos de sucesso são gravados (`submit`, `webhook`, `plan` e `notification`); nas demais áreas a coluna `sucessos` fica em 0. Filtro de campo: `periodo` em `vw_api_errors.day`. Visualização: **Linhas** (ou barras) com `erros` e `sucessos` por `day`, uma série por `area`.

```sql
SELECT day,
       area,
       SUM(CASE WHEN level IN ('warn', 'error') THEN total ELSE 0 END) AS erros,
       SUM(CASE WHEN level = 'info' THEN total ELSE 0 END) AS sucessos
FROM vw_api_errors
WHERE 1 = 1
  [[AND {{periodo}}]]
GROUP BY day, area
ORDER BY day, area;
```

Para ver quais eventos estão falhando (uma tabela de apoio ao lado do painel 9, mesmo filtro `periodo`):

```sql
SELECT area, event, level, SUM(total) AS total
FROM vw_api_errors
WHERE level IN ('warn', 'error')
  [[AND {{periodo}}]]
GROUP BY area, event, level
ORDER BY total DESC;
```

### Quando uma etapa do quiz mudar

A lista de etapas (`vw_funnel_steps`) e a de chaves de resposta (`vw_session_answers`) estão **copiadas** dentro da migration `0005_observability_views.sql`, a partir de `QUIZ_STEPS` e `ALLOWED_ANSWER_KEYS` (`lib/quiz/steps.ts`). Ao entrar, sair ou renomear uma etapa, ou ao incluir uma chave de resposta, crie uma **nova migration** que recria as views (`DROP VIEW` + `CREATE VIEW`). Enquanto isso não for feito, o teste `tests/lib/quiz/steps-migration.test.ts` falha. Etapa nova ganha um slug novo e as outras mantêm o seu; assim a comparação ao longo do tempo continua válida.

### Retenção

- Funil (`funnel_events` e `funnel_sessions`): **365 dias**.
- `app_logs`: **90 dias**.

A limpeza roda no fim de cada rodada do job (a cada 2 minutos), apagando até 1.000 linhas por tabela por rodada. Para mudar os prazos ou o tamanho do lote, edite `FUNNEL_RETENTION_DAYS`, `APP_LOG_RETENTION_DAYS` e `PURGE_BATCH` em `lib/jobs/purge-observability.ts`.

## 6. Operação

### O job de fundo

A cada 2 minutos o app executa uma rodada que:

- termina as cobranças que o Asaas não conseguiu criar antes (até 20 por rodada);
- gera os planos alimentares que ficaram pendentes (até 3 por rodada). Normalmente o plano sai logo depois do pagamento; esta etapa é a rede de segurança para quando a geração falhou ou o app reiniciou no meio;
- enfileira os avisos de vencimento do plano (ver "Integração com o PlanA"). Esta etapa só age entre **9h e 20h de São Paulo**: fora desse horário a rodada a ignora e a primeira rodada dentro da janela cria os avisos do dia (nunca duplica);
- envia os e-mails e WhatsApps pendentes (até 50 por rodada). Os das etapas anteriores, inclusive os avisos de vencimento, já saem na mesma rodada.

Quando uma tentativa falha, a espera cresce: 2, 4, 8, 16 e 32 minutos; depois, 60 minutos entre tentativas. O limite é de **8 tentativas** por cobrança, **5** por geração de plano (esperas de 2, 4, 8 e 16 minutos) e **5** por mensagem. Esgotado o limite, o item vira falha definitiva e um e-mail é enviado para `ADMIN_ALERT_EMAIL`.

Erros que não adiantam repetir (por exemplo, o Asaas recusar os dados) viram falha definitiva logo na primeira vez.

### Ver as falhas

Rode no MySQL:

```sql
SELECT id, sync_attempts, last_error, created_at, updated_at
FROM payments WHERE status = 'ASAAS_FAILED';

SELECT id, channel, kind, attempts, last_error, created_at, updated_at
FROM notifications WHERE status = 'failed';

SELECT id, attempts, last_error, created_at
FROM plan_generations WHERE status = 'failed';
```

Atenção: `last_error` pode conter o texto da resposta do Asaas. Não cole esse conteúdo em chats, issues ou prints. O `last_error` das gerações de plano traz só a etapa e a mensagem do erro, nunca as respostas do quiz nem o conteúdo do plano.

### Rodar o job na mão e reabrir falhas

Os dois endereços exigem o cabeçalho `Authorization: Bearer <JOBS_TOKEN>`. Troque `SEU-DOMINIO` pelo endereço do app.

Rodar uma rodada agora (responde `"ran"`, ou `"skipped"` se já havia uma rodada em andamento):

```bash
curl -X POST https://SEU-DOMINIO/api/jobs/run \
  -H "Authorization: Bearer SEU_JOBS_TOKEN"
```

Reabrir uma falha. O corpo tem 4 formas:

```bash
# uma cobrança
curl -X POST https://SEU-DOMINIO/api/jobs/retry \
  -H "Authorization: Bearer SEU_JOBS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"paymentId":"ID_DA_COBRANCA"}'

# uma geração de plano (o id vem da consulta de plan_generations)
curl -X POST https://SEU-DOMINIO/api/jobs/retry \
  -H "Authorization: Bearer SEU_JOBS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"planGenerationId":"ID_DA_GERACAO"}'

# uma mensagem
curl -X POST https://SEU-DOMINIO/api/jobs/retry \
  -H "Authorization: Bearer SEU_JOBS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notificationId":"ID_DA_MENSAGEM"}'

# todas as falhas de uma vez (cobranças, gerações de plano e mensagens)
curl -X POST https://SEU-DOMINIO/api/jobs/retry \
  -H "Authorization: Bearer SEU_JOBS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"allFailed":true}'
```

A resposta traz `reopened`, o número de itens reabertos. Token errado ou ausente responde 401. Reabrir uma geração de plano zera as tentativas dela.

### Envio imediato de mensagens (usado pelo PlanA)

`POST /api/notifications/dispatch` envia na hora mensagens que já estão em `notifications`. Exige o cabeçalho `Authorization: Bearer <JOBS_TOKEN>` e um corpo com 1 a 10 ids. Responde `202` e envia depois da resposta, uma por vez, com as mesmas regras do job (tentativas, espera crescente e alerta). Id inexistente ou que já não está pendente é ignorado.

```bash
curl -X POST https://SEU-DOMINIO/api/notifications/dispatch \
  -H "Authorization: Bearer SEU_JOBS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notificationIds":["ID_DA_MENSAGEM"]}'
```

### O que fazer depois de um alerta

1. Leia o `last_error` do item (consultas acima). Ele diz a etapa e o erro.
2. Corrija a causa: chave do Asaas, chave da Anthropic, dado do paciente, SMTP, Evolution API.
3. Chame `/api/jobs/retry` com o `id` do item, cobrança, mensagem ou geração de plano (ou `allFailed`, que reabre os três tipos).

Depois do retry, o app dispara uma rodada logo em seguida. Se já houver uma rodada em andamento, o reprocessamento espera a próxima: até 2 minutos. Com `JOBS_ENABLED=false`, espera até a próxima chamada manual de `/api/jobs/run`.

## Integração com o PlanA

O PlanA (repositório `dieta-app`) é quem mostra o plano para a pessoa e onde o admin administra os cadastros. Ele usa **este mesmo MySQL**.

- **Este app é dono de todas as tabelas.** As migrations (`lib/db/migrations`) criam também as do PlanA: `admins`, `recipes`, `meal_categories`, `allowed_meal_items`, `app_settings` e `password_reset_tokens`. O PlanA não cria nem altera tabela; no boot ele confere se elas existem e, se faltar alguma, encerra e lista o que falta.
- **Ordem de deploy:** primeiro este app (aplica as migrations), depois o PlanA. Quando o schema mudar, este app sobe antes.
- **Schema:** `lib/db/schema.ts` é a fonte. O PlanA mantém uma cópia idêntica; depois de mudar o schema aqui, rode `pnpm db:sync-schema` no PlanA.
- **Mensagens:** todo e-mail e WhatsApp sai por aqui. O PlanA grava a mensagem de recuperação de senha em `notifications` (`kind = 'password_reset'`) e pede o envio imediato em `POST /api/notifications/dispatch` (seção "Operação"). Se esse pedido falhar, o job de 2 minutos envia.

**Renovação do plano** (`POST /api/renewals`): o PlanA mostra o formulário de renovação ao paciente e, no envio, chama este endpoint para criar a cobrança. Exige `Authorization: Bearer <JOBS_TOKEN>` (o mesmo token do job; não há variável nova) e o mesmo corpo de `/api/submit-quiz`, `{ submissionId, answers }`, com `nome_completo`, `email`, `whatsapp` e `cpf` dentro de `answers` (até 64 KB). Usa a mesma validação e o mesmo serviço do quiz: idempotente por `submissionId`, reaproveita a cobrança pendente do paciente, cria a cobrança no Asaas dentro do pedido (até 20 s) e depois da resposta envia o link por e-mail e WhatsApp. Diferenças em relação ao quiz: não tem limite por IP (quem chama é o PlanA) e aceita `whatsapp` vazio, para o paciente cadastrado pelo admin sem telefone; nesse caso o cliente é criado no Asaas sem telefone e o link vai só por e-mail.

| Resposta | Quando |
|---|---|
| `200 { "ok": true, "paymentUrl": "https://..." }` | dados gravados e link de pagamento obtido |
| `200 { "ok": true, "paymentUrl": null }` | dados gravados, mas o Asaas ainda não respondeu; o job conclui e envia o link |
| `400 { "ok": false }` | corpo ilegível ou fora do formato |
| `401 { "ok": false }` | token ausente ou errado |
| `413 { "ok": false }` | corpo acima de 64 KB |
| `500 { "ok": false }` | nada foi gravado (falha do banco); pode reenviar com o mesmo `submissionId` |

```bash
curl -X POST https://SEU-DOMINIO/api/renewals \
  -H "Authorization: Bearer SEU_JOBS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "submissionId": "UUID",
    "answers": {
      "nome_completo": "Ana Souza",
      "email": "ana@example.com",
      "whatsapp": "",
      "cpf": "52998224725"
    }
  }'
```

**Avisos de vencimento do plano:** o job de 2 minutos enfileira em `notifications` (`kind = plan_expiring_d5`, `plan_expiring_d2` e `plan_expiring_d0`), por e-mail e WhatsApp, o aviso dos planos `active` que vencem em 5 dias, em 2 dias e no dia do vencimento, só entre 9h e 20h de São Paulo. Sai um aviso por plano, canal e estágio. Nos avisos de 2 dias e do dia, a mensagem leva o link de pagamento quando a renovação já foi pedida; quando a renovação já está paga, não há aviso. Paciente sem telefone recebe só o e-mail. Depois de vencido não há mensagem; só o alerta na tela do PlanA. No envio o aviso é conferido de novo: se ele atrasou (novas tentativas, reabertura com `/api/jobs/retry`) e nesse meio-tempo a renovação foi paga, o plano deixou de ser `active` ou já venceu, a mensagem não sai, vira `failed` com `last_error.step = notify.stale` e não gera alerta.

**Formato do hash** em `patients.password_hash` e `admins.password_hash`:

```
scrypt$16384$8$1$<salt>$<hash>
```

- `16384`, `8` e `1` são `N`, `r` e `p` do scrypt.
- `<salt>` (16 bytes) e `<hash>` (32 bytes) são **base64 padrão, com padding `=`**. O separador é `$`.
- A verificação compara em tempo constante e lê `N`, `r` e `p` do próprio valor gravado.

**Campos que o PlanA usa:**

- `patients.must_change_password`: este app grava `true` ao criar a senha temporária; o PlanA exige a troca e zera o campo. Este app não depende dele para escolher a mensagem: ele compara a senha gravada com a temporária.
- `meal_plans.status`: `active`, `completed` ou `cancelled`. Este app cria o plano novo como `active` e passa os outros planos `active` da mesma pessoa para `completed`; o PlanA aplica a mesma regra nos planos criados pelo admin. Quem só tem plano `cancelled` ou `completed` não vê plano.
- `meal_plans.plan_data` (JSON): `meals[]` (`name`, `time`, `foods` com uma linha por alimento, `calories` em texto), `calories` (número) e `observations`.
- O e-mail do paciente não é único; a identidade é o CPF (`patients.cpf`, 11 dígitos).

**Dependência para produção:** o webhook de **produção** só deve ser cadastrado no Asaas depois que o PlanA estiver no ar, lendo este MySQL. Até lá, tudo é testado no sandbox. Se o webhook de produção for cadastrado antes, as pessoas pagam e recebem uma senha que o PlanA ainda não sabe validar.

## 7. Segurança

- O app deve ser acessível **só pelo proxy do Easypanel**. O limite de envios (5 por minuto por IP) usa o primeiro valor do cabeçalho `x-forwarded-for`, que qualquer um consegue forjar se acessar o app direto. Não exponha a porta 5000 para a internet.
- Esse limite fica na memória e vale por instância. Com mais de uma instância, cada uma conta separado.
- Nunca coloque chaves, senhas ou tokens no repositório. O `.env.local` já é ignorado pelo git.
- **Gere uma nova chave de produção do Asaas.** A anterior ficou exposta nos arquivos do antigo fluxo de automação e numa conversa. Considere-a comprometida e revogue-a.
- Mantenha `ASAAS_ENV=sandbox` até concluir o checklist da seção 9.

## 8. Testes

```bash
corepack pnpm test        # testes unitários e de serviços
corepack pnpm typecheck   # verificação de tipos
corepack pnpm build       # build de produção (não precisa de variáveis nem de banco)
```

Os testes que usam MySQL de verdade são **pulados** se `TEST_DATABASE_URL` não estiver definida. Para rodá-los, aponte para um banco descartável, vazio e só para testes: eles **apagam o conteúdo das tabelas**.

```bash
TEST_DATABASE_URL=mysql://root:senha@127.0.0.1:3306/tami_forms_test corepack pnpm test
```

Crie antes o banco `tami_forms_test` (MySQL 8, mesmo collation da seção 3). Nunca use o banco real.

## 9. Checklist antes de ir para produção (sandbox do Asaas)

Faça num deploy de teste no Easypanel, com `ASAAS_ENV=sandbox` e a chave do sandbox. **Use um banco só para este teste (por exemplo `tami_forms_sandbox`) e não direcione o domínio público para esse deploy.** O banco guarda IDs de cliente e links de cobrança do Asaas: se o mesmo banco for usado depois em produção, quem enviou o quiz durante o teste recebe um link do sandbox, ou a cobrança falha porque o cliente do sandbox não existe em produção.

- [ ] **Desfecho 1:** preencha o quiz até o fim. A pessoa é redirecionada ao link de pagamento do Asaas. Pague no sandbox e confira o redirecionamento para `PAYMENT_SUCCESS_URL`.
- [ ] **Desfecho 2:** use um **CPF diferente** do desfecho 1 (com o mesmo CPF a cobrança é reaproveitada e o resultado vira o desfecho 1). Coloque uma chave do Asaas inválida e envie o quiz. Aparece a tela de confirmação (sem link). Chave recusada pelo Asaas (erro 4xx) é falha definitiva na hora: a cobrança vira `ASAAS_FAILED` e o e-mail de alerta chega em `ADMIN_ALERT_EMAIL`. Corrija a chave, reinicie o app e reabra com `/api/jobs/retry` (`paymentId`). A cobrança é criada e a pessoa recebe o link. (A repetição automática com espera crescente, para falhas temporárias como queda do Asaas, é coberta pelos testes automáticos.)
- [ ] **Desfecho 3:** pare o MySQL e envie o quiz. Aparece o erro com "Tentar novamente". Suba o banco, clique em "Tentar novamente" e confira que nada ficou duplicado.
- [ ] **E-mail e WhatsApp:** os dois chegam, com o link correto, nos desfechos 1 e 2.
- [ ] **Alerta de falha e retry:** confira que o e-mail de alerta do desfecho 2 chegou, que o `last_error` explica a causa e que o `/api/jobs/retry` reabriu o item (`reopened: 1`).
- [ ] **Webhook e pagamento de teste:** cadastre o webhook no sandbox (seção "Webhook do Asaas") e pague uma cobrança de teste. Confira: o evento chegou (log `webhook.asaas.received`), a cobrança ficou com o status pago e `paid_at` preenchido, existe uma linha `done` em `plan_generations`, o plano `active` em `meal_plans`, o `password_hash` do paciente preenchido, e o e-mail e o WhatsApp de primeiro acesso chegaram com a senha temporária.
- [ ] **Mesmo evento duas vezes:** reenvie o mesmo evento (por exemplo, pausando e reativando a fila do Asaas, ou repetindo a chamada com `curl` e o mesmo `id` de evento). O log mostra `webhook.asaas.duplicate` e não nasce segundo plano nem segunda mensagem.
- [ ] **Token errado:** chame o webhook com um token errado (`curl -i -X POST https://SEU-DOMINIO/api/webhooks/asaas -H "asaas-access-token: errado" -d '{}'`). A resposta é 401 e nada muda no banco.
- [ ] **Estorno:** estorne a cobrança de teste no sandbox. O status da cobrança muda, o e-mail `[tami-forms] Pagamento revertido` chega em `ADMIN_ALERT_EMAIL`, e o plano e a senha continuam como estavam.
- [ ] **Falha da IA e retry:** com uma `ANTHROPIC_API_KEY` inválida, pague outra cobrança de teste. A chave recusada (401) é falha definitiva na hora: `plan_generations` fica `failed`, o alerta chega (`kind = meal_plan`) e nenhuma mensagem de acesso é enviada. Corrija a chave, reinicie o app e reabra com `/api/jobs/retry` (`planGenerationId`). O plano é gerado e as mensagens saem.
- [ ] **Plano com a nutricionista:** mostre o plano gerado para a nutricionista e confira a meta de calorias, a faixa de proteína e as linhas de alimentos (cada linha com quantidade). Ela também deve confirmar a fórmula e os pisos (seção 10).
- [ ] **Evolution API:** confirme que o formato usado funciona na sua instância. O app faz `POST /message/sendText/{instância}` com o corpo `{ number, text }`, que é o formato da v2. Se a sua versão for outra, o WhatsApp falhará nesse teste.
- [ ] Só então suba o deploy de produção com `ASAAS_ENV=production`, a chave **nova** de produção e um **banco novo e vazio** (nunca o banco usado no sandbox). Se precisar reaproveitar o banco do teste, apague antes o conteúdo das tabelas `asaas_webhook_events`, `notifications`, `plan_generations`, `meal_plans`, `quiz_responses`, `payments`, `allowed_meal_items`, `meal_categories`, `recipes`, `app_settings`, `password_reset_tokens`, `admins` e `patients`, nessa ordem.

## 10. Notas

- O CPF ainda é pedido no formulário. Existe uma alternativa, deixar a pessoa informar o CPF na página de pagamento do Asaas (Checkout), descrita como experimento futuro na seção 12 do documento de design. Antes de decidir, meça o abandono na etapa do CPF.
- A fórmula das metas (Harris-Benedict original, 1919) e os pisos de calorias (1.200 feminino e 1.500 masculino) em `lib/meal-plan/targets.ts` ainda precisam ser confirmados pela nutricionista. Trocar é mudar constantes naquele arquivo.
- Documentos de design e plano de implementação: `docs/superpowers/specs` e `docs/superpowers/plans`.
