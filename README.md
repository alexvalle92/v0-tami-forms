# Tami Forms

## 1. O que é

Quiz online (Next.js) em que a pessoa responde perguntas sobre peso, altura e hábitos e informa nome, e-mail, telefone e CPF. No fim, o app cria a cobrança no Asaas e entrega o link de pagamento do plano alimentar.

Tudo roda dentro deste projeto: banco MySQL, Asaas, e-mail (SMTP), WhatsApp (Evolution API) e um job de fundo. Não há outro serviço de automação por trás.

O que acontece quando a pessoa envia o formulário:

1. **Deu tudo certo.** O banco e o Asaas responderam. A pessoa é levada direto para o link de pagamento.
2. **O Asaas falhou.** Os dados ficam salvos. A pessoa vê a tela de confirmação (`/confirmation`), que avisa que o link chegará por e-mail. O job tenta criar a cobrança de novo, sozinho, até conseguir.
3. **O banco falhou.** A tela mostra um erro e o botão "Tentar novamente". Reenviar não duplica nada.

E-mail e WhatsApp com o link são enviados automaticamente, assim que a cobrança existe. Se um envio falhar, o job tenta de novo.

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

Para gerar um `JOBS_TOKEN`: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`

## 5. Deploy no Easypanel (a partir do GitHub, sem Docker)

1. Crie um serviço **MySQL 8** no Easypanel. Crie nele o banco `tami_forms` com o collation `utf8mb4_0900_ai_ci` (mesmo comando da seção 3).
2. Crie um serviço **App** a partir do repositório do GitHub (branch de produção).
3. Comandos:
   - Build: `pnpm install && pnpm build`
   - Start: `pnpm start`
   - Porta do app: `5000`
4. Em `DATABASE_URL`, use a **URL interna** do serviço MySQL que o Easypanel mostra (nome do serviço como host).
5. Cadastre todas as variáveis da seção 4 no ambiente do app. Comece com `ASAAS_ENV=sandbox`.
6. Health check: caminho `/api/health`. Responde 200 quando o banco está acessível e 503 quando não está.
7. Configure o domínio no proxy do Easypanel.

O app aplica as migrations do banco **a cada inicialização**. Se a configuração estiver inválida ou o banco inacessível, o processo encerra e o log diz o motivo.

## 6. Operação

### O job de fundo

A cada 2 minutos o app executa uma rodada que:

- termina as cobranças que o Asaas não conseguiu criar antes (até 20 por rodada);
- envia os e-mails e WhatsApps pendentes (até 50 por rodada).

Quando uma tentativa falha, a espera cresce: 2, 4, 8, 16 e 32 minutos; depois, 60 minutos entre tentativas. O limite é de **8 tentativas** por cobrança e **5** por mensagem. Esgotado o limite, o item vira falha definitiva e um e-mail é enviado para `ADMIN_ALERT_EMAIL`.

Erros que não adiantam repetir (por exemplo, o Asaas recusar os dados) viram falha definitiva logo na primeira vez.

### Ver as falhas

Rode no MySQL:

```sql
SELECT id, sync_attempts, last_error, created_at, updated_at
FROM payments WHERE status = 'ASAAS_FAILED';

SELECT id, channel, kind, attempts, last_error, created_at, updated_at
FROM notifications WHERE status = 'failed';
```

Atenção: `last_error` pode conter o texto da resposta do Asaas. Não cole esse conteúdo em chats, issues ou prints.

### Rodar o job na mão e reabrir falhas

Os dois endereços exigem o cabeçalho `Authorization: Bearer <JOBS_TOKEN>`. Troque `SEU-DOMINIO` pelo endereço do app.

Rodar uma rodada agora (responde `"ran"`, ou `"skipped"` se já havia uma rodada em andamento):

```bash
curl -X POST https://SEU-DOMINIO/api/jobs/run \
  -H "Authorization: Bearer SEU_JOBS_TOKEN"
```

Reabrir uma falha. O corpo tem 3 formas:

```bash
# uma cobrança
curl -X POST https://SEU-DOMINIO/api/jobs/retry \
  -H "Authorization: Bearer SEU_JOBS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"paymentId":"ID_DA_COBRANCA"}'

# uma mensagem
curl -X POST https://SEU-DOMINIO/api/jobs/retry \
  -H "Authorization: Bearer SEU_JOBS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notificationId":"ID_DA_MENSAGEM"}'

# todas as falhas de uma vez
curl -X POST https://SEU-DOMINIO/api/jobs/retry \
  -H "Authorization: Bearer SEU_JOBS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"allFailed":true}'
```

A resposta traz `reopened`, o número de itens reabertos. Token errado ou ausente responde 401.

### O que fazer depois de um alerta

1. Leia o `last_error` do item (consultas acima). Ele diz a etapa e o erro.
2. Corrija a causa: chave do Asaas, dado do paciente, SMTP, Evolution API.
3. Chame `/api/jobs/retry` com o `id` do item (ou `allFailed`).

Depois do retry, o app dispara uma rodada logo em seguida. Se já houver uma rodada em andamento, o reprocessamento espera a próxima: até 2 minutos. Com `JOBS_ENABLED=false`, espera até a próxima chamada manual de `/api/jobs/run`.

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

Faça num deploy de teste no Easypanel, com `ASAAS_ENV=sandbox` e a chave do sandbox:

- [ ] **Desfecho 1:** preencha o quiz até o fim. A pessoa é redirecionada ao link de pagamento do Asaas. Pague no sandbox e confira o redirecionamento para `PAYMENT_SUCCESS_URL`.
- [ ] **Desfecho 2:** coloque uma chave do Asaas inválida e envie o quiz. Aparece a tela de confirmação (sem link). Chave recusada pelo Asaas (erro 4xx) é falha definitiva na hora: a cobrança vira `ASAAS_FAILED` e o e-mail de alerta chega em `ADMIN_ALERT_EMAIL`. Corrija a chave, reinicie o app e reabra com `/api/jobs/retry` (`paymentId`). A cobrança é criada e a pessoa recebe o link. (A repetição automática com espera crescente, para falhas temporárias como queda do Asaas, é coberta pelos testes automáticos.)
- [ ] **Desfecho 3:** pare o MySQL e envie o quiz. Aparece o erro com "Tentar novamente". Suba o banco, clique em "Tentar novamente" e confira que nada ficou duplicado.
- [ ] **E-mail e WhatsApp:** os dois chegam, com o link correto, nos desfechos 1 e 2.
- [ ] **Alerta de falha e retry:** confira que o e-mail de alerta do desfecho 2 chegou, que o `last_error` explica a causa e que o `/api/jobs/retry` reabriu o item (`reopened: 1`).
- [ ] **Evolution API:** confirme que o formato usado funciona na sua instância. O app faz `POST /message/sendText/{instância}` com o corpo `{ number, text }`, que é o formato da v2. Se a sua versão for outra, o WhatsApp falhará nesse teste.
- [ ] Só então troque para `ASAAS_ENV=production` com a chave **nova** de produção.

## 10. Notas

- O CPF ainda é pedido no formulário. Existe uma alternativa, deixar a pessoa informar o CPF na página de pagamento do Asaas (Checkout), descrita como experimento futuro na seção 12 do documento de design. Antes de decidir, meça o abandono na etapa do CPF.
- Documentos de design e plano de implementação: `docs/superpowers/specs` e `docs/superpowers/plans`.
