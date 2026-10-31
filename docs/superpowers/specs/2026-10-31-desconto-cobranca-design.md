# Desconto automático na cobrança não paga

**Data:** 2026-10-31
**Branch da implementação:** `feature/desconto-cobranca` (o spec é commitado na `develop`)
**Status:** design aprovado em conversa; aguardando revisão do spec

## 1. Contexto e objetivo

Depois do quiz (ou da renovação pelo PlanA), o `syncPayment` cria a cobrança no Asaas com `PAYMENT_AMOUNT` (R$ 39,90) e vencimento em `PAYMENT_DUE_DAYS` (2 dias), e a fila de `notifications` manda o link por e-mail e WhatsApp. Parte das pessoas não paga.

**Objetivo:** no dia seguinte à criação, a partir das 9h, baixar o valor da cobrança ainda em aberto para `PAYMENT_DISCOUNT_AMOUNT` (R$ 29,90), estender o vencimento para hoje + `PAYMENT_DISCOUNT_DUE_DAYS` (5 dias) e avisar o paciente por e-mail e WhatsApp: "condição especial, de R$ 39,90 para R$ 29,90, vale até dd/mm/aaaa".

### Restrições

- **Uma vez por paciente.** O desconto vale para qualquer cobrança (1º quiz ou renovação), mas cada paciente o recebe no máximo uma vez. Quem pagou uma cobrança anterior com valor cheio nunca teve desconto e continua elegível nas próximas.
- **Uma vez por cobrança.** Uma cobrança já avaliada (aplicada ou descartada) nunca é alterada de novo.
- **Nunca aumenta o preço:** cobrança com valor menor ou igual a `PAYMENT_DISCOUNT_AMOUNT` não é tocada.
- **Nunca altera cobrança paga.** O status é conferido no Asaas imediatamente antes da alteração.
- **O valor local acompanha o Asaas.** `payments.amount` passa a ser o valor com desconto, para que o `Purchase` da Meta ([lib/services/send-meta-conversion.ts](../../../lib/services/send-meta-conversion.ts)) e o Metabase registrem o valor realmente cobrado.
- Logs sem dados pessoais (sem nome, e-mail, telefone ou link), como no resto do projeto.

## 2. Decisões tomadas

| Tema | Decisão |
|---|---|
| Quais cobranças | Criadas **ontem** (data de `payments.created_at` em São Paulo), com `asaas_id`, status `PENDING` ou `OVERDUE`, sem `paid_at` e com `discount_status` nulo |
| Escopo | 1º quiz e renovações, limitado a um desconto por paciente |
| Horário | Etapa da rodada que já roda a cada 2 min; só age das **9h às 20h** em São Paulo. A primeira rodada da janela aplica; se o servidor estiver fora às 9h, aplica quando voltar. Depois das 20h, as cobranças de ontem perdem a oferta |
| Novo vencimento | Hoje (em São Paulo) + `PAYMENT_DISCOUNT_DUE_DAYS` |
| Como alterar no Asaas | `PUT /payments/{id}` trocando `value`, `dueDate` e `description`. Não usa o desconto nativo do Asaas (`discount`): o "de/por" aparece só na mensagem |
| Link | O mesmo `invoiceUrl`; o Asaas mantém a fatura e regenera Pix e boleto |
| Mensagem | Novo `kind` `payment_discount`, nos canais habilitados, pela fila de `notifications` que já existe |
| Liga/desliga | `PAYMENT_DISCOUNT_ENABLED`, padrão `false`. Desligada, a etapa nem entra na rodada |

### Fora de escopo

- Desconto nativo do Asaas (`discount` com prazo).
- Valores ou prazos diferentes por campanha, origem ou tipo de cobrança.
- Recuperar cobranças de anteontem que perderam a janela.
- Segunda oferta ou desconto progressivo.
- Painel no Metabase do resultado da oferta (as colunas novas permitem montar depois).

## 3. Arquitetura

```
startScheduler (a cada 2 min)
  runJobs
    syncPayment ...           (cobranças PENDING_ASAAS)
    generatePlan ...
    enqueueExpiryReminders
    applyPaymentDiscounts     ← novo, só com PAYMENT_DISCOUNT_ENABLED
      ├─ fora de 9h–20h → 0, sem tocar no banco
      ├─ payments.listDiscountEligible(início de ontem, início de hoje, valor do desconto, limite)
      └─ para cada id: applyPaymentDiscount(id)
           tryLock → Asaas GET → Asaas PUT → payments.applyDiscount (transação: cobrança + fila)
    dispatchNotification ...  (as payment_discount criadas agora saem na mesma rodada)
    sendMetaConversion ...
    purge
```

### Módulos novos

| Arquivo | Responsabilidade |
|---|---|
| `lib/services/apply-payment-discount.ts` | Processa uma cobrança (seção 5). Devolve `applied`, `skipped`, `retry` ou `busy` |
| `lib/jobs/payment-discounts.ts` | Confere a janela, calcula o intervalo de "ontem" em UTC, lista e chama o serviço item a item. Devolve a contagem de cobranças tentadas |
| `lib/db/migrations/0007_payment_discount.sql` | Colunas novas em `payments` (seção 7) |

### Módulos alterados

| Arquivo | Mudança |
|---|---|
| `lib/asaas/client.ts` | `getPayment(asaasId)` e `updatePayment(asaasId, input)` |
| `lib/db/schema.ts` | Colunas novas em `payments` (o PlanA recebe a cópia por `pnpm db:sync-schema`) |
| `lib/db/repos/types.ts`, `mysql.ts`, `tests/fakes/memory-repos.ts` | `listDiscountEligible`, `applyDiscount`, `markDiscountSkipped`; `NotificationKind` ganha `payment_discount`; `PaymentView` ganha `originalAmount` e `discountStatus` |
| `lib/notify/templates.ts` | `renderPaymentDiscount` |
| `lib/services/dispatch-notification.ts` | Envia `payment_discount`; descarta (`skipped`) se a cobrança não estiver mais em aberto |
| `lib/jobs/run-jobs.ts` | Etapa opcional `discounts` antes das notificações; `RunSummary.discounts` só existe quando a etapa é configurada |
| `lib/time.ts` | `saoPauloDayStartUtc(date)` |
| `lib/env.ts`, `.env.example`, `lib/container.ts` | Variáveis novas e ligação dos módulos |
| `README.md` | Seção sobre o desconto e como ligar |

## 4. Configuração

| Variável | Padrão | Validação |
|---|---|---|
| `PAYMENT_DISCOUNT_ENABLED` | `false` | booleano, como `JOBS_ENABLED` |
| `PAYMENT_DISCOUNT_AMOUNT` | `29.90` | mesma regex de `PAYMENT_AMOUNT` (`^\d+(\.\d{1,2})?$`), maior que zero |
| `PAYMENT_DISCOUNT_DUE_DAYS` | `5` | inteiro positivo |

Com `PAYMENT_DISCOUNT_ENABLED=false`, as outras duas são ignoradas e um valor em branco ou inválido não impede o boot (mesmo comportamento das `META_*`). Ligada com valor inválido, o boot falha.

Com a feature ligada, `PAYMENT_DISCOUNT_AMOUNT` maior ou igual a `PAYMENT_AMOUNT` não é erro de boot: as cobranças novas não ficam elegíveis, e o boot registra `discount.config.no_effect` como `warn`.

## 5. Serviço `applyPaymentDiscount(paymentId)`

1. `payments.get(id)`. Ausente → `skipped` (sem gravar). Se `discountStatus` não for nulo ou o status não for `PENDING`/`OVERDUE` → `skipped` (sem gravar; outra rodada ou o webhook chegou primeiro).
2. `payments.tryLock(id, 120 s)`. Falhou → `busy`. Depois do lock, relê a cobrança e repete as conferências do passo 1. Também confere com `payments.hasAppliedDiscount(patientId)` que nenhuma outra cobrança do paciente recebeu o desconto; se recebeu → `markDiscountSkipped`, `skipped`.
3. **Asaas `GET /payments/{asaasId}`.**
   - Status diferente de `PENDING`/`OVERDUE` (paga, excluída, estornada) → `markDiscountSkipped`, `skipped`. Não manda mensagem: o webhook cuida do resto.
   - Se o `GET` ainda não mostra o valor e o vencimento novos e o `value` do Asaas é **menor ou igual** ao do desconto (o valor local estava defasado) → `markDiscountSkipped` com motivo `asaas_value_not_above_discount`, `skipped`, sem `PUT` e sem mensagem: o desconto nunca aumenta nem iguala o preço de verdade.
4. **Asaas `PUT /payments/{asaasId}`**, a não ser que o `GET` já mostre `value` igual ao valor do desconto e `dueDate` igual ao novo vencimento (o `PUT` de uma rodada anterior deu certo e a gravação no banco falhou):
   - `value`: `PAYMENT_DISCOUNT_AMOUNT`
   - `dueDate`: hoje em São Paulo + `PAYMENT_DISCOUNT_DUE_DAYS`
   - `description`: `Plano Alimentar Personalizado - {nome} - 30 dias - condição especial`
   - `billingType`: o que o `GET` devolveu (não muda a forma de pagamento que a pessoa escolheu)
   - `externalReference`: o id da cobrança no app, e `callback.successUrl`: `PAYMENT_SUCCESS_URL`, os mesmos da criação. O `PUT` pode apagar o que não vem no corpo, e sem a referência o webhook não acharia a cobrança.
5. **`payments.applyDiscount(id, { amount, originalAmount, dueDate, status, at, channels })`** numa transação:
   - `amount` = desconto, `original_amount` = valor anterior, `due_date` = novo vencimento, `status` = o da resposta do `PUT` (ou do `GET`, se o `PUT` foi pulado; o Asaas devolve a cobrança vencida para `PENDING` e o webhook `PAYMENT_UPDATED` é ignorado), `discount_status = 'applied'`, `discount_applied_at = at`, solta o lock;
   - insere as `notifications` `payment_discount` (um por canal habilitado e com destinatário) ligadas ao `quiz_response` **mais recente** daquela cobrança. O índice único `(quiz_response_id, channel, kind)` impede duplicatas (`INSERT IGNORE`).
   - Cobrança sem `quiz_response` (não deve acontecer): grava o desconto sem mensagem e registra `discount.no_quiz_response` como `warn`.
6. Devolve `applied` e registra `discount.applied` (`paymentId`, `originalAmount`, `amount`, `dueDate`).

### Falhas

| Situação | Ação |
|---|---|
| Erro passageiro do Asaas (rede, timeout, 5xx, 429) no `GET` ou no `PUT` | Nada é gravado, solta o lock, `retry`. A rodada seguinte, ainda na janela, tenta de novo. Repetir o `PUT` com os mesmos valores é seguro. Log `discount.retry` (`warn`) |
| Erro definitivo do Asaas (4xx) | `markDiscountSkipped`, `skipped`, log `discount.skipped` (`error`, com `httpStatus` e `step`) |
| Falha ao gravar no banco depois do `PUT` (ou com o `GET` já mostrando o valor novo) | Solta o lock (no `finally`), `retry`. Na rodada seguinte o `GET` mostra o valor novo e o fluxo pula o `PUT` (passo 4). Como o Asaas já cobra o valor novo e o banco ainda não, também registra `discount.asaas_changed_db_not` (`error`) e **avisa o admin** (`alertAdmin`, tipo `payment`, etapa `db.apply_discount`). Falha do próprio alerta vira `discount.alert_failed` (`error`) e não muda o resultado |
| Cobranças em aberto no fim da janela por falhas passageiras | Ficam com `discount_status` nulo e perdem a oferta no dia seguinte (não são mais "de ontem"). Sem alerta |

Deadline das chamadas ao Asaas: o mesmo `paymentDeadlineMs` da rodada, limitado à janela segura do lock (100 s), como em `syncPayment`.

`markDiscountSkipped` grava `discount_status = 'skipped'`, `discount_applied_at = now` e solta o lock.

## 6. Job `applyPaymentDiscounts`

- `hourInSaoPaulo(now)` fora de `[9, 20)` → devolve 0 sem tocar no banco.
- `today = todayInSaoPaulo(now)`, `yesterday = addDaysISO(today, -1)`.
- Intervalo em UTC: `[saoPauloDayStartUtc(yesterday), saoPauloDayStartUtc(today))`. `saoPauloDayStartUtc` usa offset fixo `-03:00` (o Brasil não tem horário de verão desde 2019; o código documenta isso).
- `payments.listDiscountEligible({ fromUtc, toUtc, discountAmount, limit: 50 })` devolve ids ordenados por `created_at`, com uma cobrança por paciente (a mais recente).
- Para cada id chama o serviço; uma exceção é registrada (`job.discount.error`) e não interrompe as demais.
- Registra `job.discounts.done` com a contagem por desfecho quando houver ao menos uma cobrança.

### Consulta de elegibilidade

```sql
SELECT p.id FROM payments p
WHERE p.created_at >= :fromUtc AND p.created_at < :toUtc
  AND p.status IN ('PENDING', 'OVERDUE')
  AND p.asaas_id IS NOT NULL
  AND p.paid_at IS NULL
  AND p.discount_status IS NULL
  AND p.amount > :discountAmount
  AND NOT EXISTS (
    SELECT 1 FROM payments o
    WHERE o.patient_id = p.patient_id AND o.discount_status = 'applied'
  )
ORDER BY p.created_at
LIMIT :limit
```

Uma por paciente: se o mesmo paciente tiver mais de uma cobrança elegível no intervalo, só a de `created_at` mais recente entra na lista (`ROW_NUMBER() OVER (PARTITION BY patient_id ORDER BY created_at DESC) = 1`, MySQL 8). As outras ficam com `discount_status` nulo; depois que a mais recente recebe o desconto, o `NOT EXISTS` as exclui. O serviço confere a regra de novo no passo 2 (`hasAppliedDiscount`).

## 7. Dados

### 7.1 Migration `0007_payment_discount`

```sql
ALTER TABLE payments
  ADD COLUMN discount_status VARCHAR(16) NULL,
  ADD COLUMN discount_applied_at DATETIME(3) NULL,
  ADD COLUMN original_amount DECIMAL(10,2) NULL,
  ADD INDEX payments_discount_status_patient_idx (discount_status, patient_id),
  ADD INDEX payments_created_at_idx (created_at);
```

- `discount_status`: `'applied'`, `'skipped'` ou nulo (não avaliada).
- `discount_applied_at`: quando a oferta foi aplicada ou descartada (UTC).
- `original_amount`: valor antes do desconto; só preenchido com `applied`.

### 7.2 Repositórios

```ts
// PaymentRepo
listDiscountEligible(d: { fromUtc: Date; toUtc: Date; discountAmount: string; limit: number }): Promise<string[]>
hasAppliedDiscount(patientId: string): Promise<boolean>
applyDiscount(id: string, d: {
  amount: string; originalAmount: string; dueDate: string; status: string; at: Date; channels: Channel[]
}): Promise<{ notificationsEnqueued: number }>
markDiscountSkipped(id: string, at: Date): Promise<void>
```

`PaymentView` ganha `discountStatus: "applied" | "skipped" | null` e `originalAmount: string | null`. A implementação MySQL e a em memória passam pelo mesmo teste de contrato (`tests/db/repos.contract.ts`).

### 7.3 Cliente Asaas

```ts
getPayment(asaasId: string, o: CallOpts): Promise<AsaasPayment>
updatePayment(asaasId: string, i: {
  value: number; dueDate: string; description: string; billingType: string
  externalReference: string; callback: { successUrl: string }
}, o: CallOpts): Promise<AsaasPayment>
```

`AsaasPayment` ganha `value`. O `PUT` faz uma tentativa só (`attempts: 1`), como os `POST`: a repetição fica com a rodada seguinte, que começa pelo `GET`.

## 8. Mensagem

O despachante já escolhe o texto do `payment_link` pelo paciente ter ou não senha; o `payment_discount` segue a mesma regra e muda só o último parágrafo. Os valores (`original_amount`, `amount`) e a data (`due_date`) são lidos da cobrança no momento do envio. O link é o `payment_url` da cobrança.

**Assunto (e-mail) / título (WhatsApp):** `🎁 Condição especial: seu plano de R$ 39,90 por R$ 29,90`

**Corpo:**

> Olá {nome}! 👋
> Seu **Plano Alimentar Personalizado** já está pronto e só falta o pagamento para liberar.
>
> Preparamos uma **condição especial** para você começar agora: o valor baixou de **R$ 39,90 para R$ 29,90**.
>
> Essa condição vale até **{dd/mm/aaaa}**. O link de pagamento é o mesmo de antes:
> {link}
>
> **1º quiz (sem senha):** Assim que o pagamento for confirmado, você recebe os dados de acesso ao seu plano. 💚
> **Renovação (com senha):** Assim que o pagamento for confirmado, seu novo plano aparece no PlanA. É só entrar com seu CPF e a senha que você já usa. 💚

- Valores em reais com vírgula (`R$ 29,90`), formatados a partir das strings decimais, sem `Number` com ponto flutuante na exibição.
- Data com `formatDateBR` (já existe em `templates.ts`).
- Sem riscado: `toWhatsAppParts` não converte `<s>` e o WhatsApp usa outra marcação.
- No WhatsApp, cada parágrafo é uma parte, com o intervalo de 3 s que já existe.

**Descartar sem enviar (`skipped`, sem alerta):** cobrança com status fora de `PENDING`/`OVERDUE`, com `paid_at`, sem `discount_status = 'applied'` ou com o novo vencimento (`due_date`) anterior a hoje em São Paulo (`discount expired`) no momento do envio. Falhas de envio seguem o fluxo atual (backoff, 5 tentativas, alerta ao admin).

## 9. Testes

Escritos antes do código (TDD), com `vitest`:

- **`lib/time`:** `saoPauloDayStartUtc("2026-10-31")` → `2026-10-31T03:00:00.000Z`.
- **`lib/env`:** padrões; desligado com valores em branco ou inválidos sobe; ligado com valor inválido falha.
- **Cliente Asaas:** `getPayment` e `updatePayment` (URL, método, corpo, uma tentativa no `PUT`, resposta inválida).
- **Contrato dos repositórios** (memória e MySQL): limites do intervalo (23h59:59.999 de ontem entra, 00h00 de hoje não); status, `paid_at`, `asaas_id`, valor menor ou igual ao desconto; paciente com desconto aplicado em outra cobrança fica fora; uma por paciente; `applyDiscount` grava cobrança e mensagens juntas e não duplica mensagens; `markDiscountSkipped`.
- **Serviço** (com `fake-asaas`): aplicado; já paga no Asaas; valor já atualizado (pula o `PUT`); erro passageiro no `GET` e no `PUT` (`retry`, nada gravado); 4xx (`skipped`); lock ocupado (`busy`); paciente que já usou o desconto; falha do banco depois do `PUT` seguida de nova rodada.
- **Job:** 8h59 e 20h00 não tocam no banco; 9h00 e 19h59 processam; uma exceção não interrompe as demais.
- **Rodada:** a etapa roda antes das notificações e só existe quando configurada.
- **Template e despachante:** texto das duas variantes, partes do WhatsApp, formatação de valor e data, `skipped` quando a cobrança foi paga antes do envio.

## 10. Ativação

1. Deploy com `PAYMENT_DISCOUNT_ENABLED=false` (a migration roda no boot).
2. **Antes da produção, no sandbox do Asaas** (`ASAAS_ENV=sandbox`, desconto ligado): depois do `PUT`, buscar a cobrança (`GET`) e conferir que `externalReference` e `callback` continuam como na criação; pagar uma cobrança já com desconto e conferir que o webhook gera o plano e um Purchase de 29,90.
3. No Easypanel: `PAYMENT_DISCOUNT_ENABLED=true`, `PAYMENT_DISCOUNT_AMOUNT=29.90`, `PAYMENT_DISCOUNT_DUE_DAYS=5`; reiniciar.
4. No dia seguinte, depois das 9h: conferir `discount.applied` nos logs, uma cobrança no painel do Asaas (valor e vencimento) e a chegada do e-mail e do WhatsApp.
5. Para desligar: `PAYMENT_DISCOUNT_ENABLED=false` e reiniciar. Cobranças já alteradas continuam com o desconto.
