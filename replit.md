# Plataforma de Planos Alimentares Personalizados

## Visão Geral

Aplicação web mobile-first para criação e venda automatizada de planos alimentares personalizados voltados para emagrecimento. O sistema coleta informações através de um quiz interativo de 26 etapas e gera automaticamente uma cobrança via Asaas.

## Objetivo

Desenvolver uma solução escalável e de baixo custo (modelo low ticket) que permite:
- Ampliar o alcance do atendimento nutricional
- Automatizar a geração de planos personalizados
- Simplificar o processo de adesão e pagamento
- Manter qualidade técnica com preço acessível (R$ 49,90)

## Tecnologias Utilizadas

### Frontend
- **Next.js 16** (App Router) - Framework React
- **React 19** - Biblioteca UI
- **TypeScript** - Tipagem estática
- **Tailwind CSS 4** - Estilização
- **Radix UI** - Componentes acessíveis

### Backend & Integrações
- **MySQL 8** (Drizzle ORM) - Banco de dados
- **Nodemailer** (SMTP) e **Evolution API** - E-mail e WhatsApp
- **Asaas API** - Gateway de pagamentos brasileiro

### Gerenciamento de Pacotes
- **pnpm** - Gerenciador de pacotes

## Estrutura do Banco de Dados (MySQL)

> O esquema atual está em `lib/db/schema.ts`; a descrição abaixo é anterior à refatoração do backend.

### Tabela: `patients`
- `id` (UUID) - Primary Key
- `name` (TEXT) - Nome completo
- `cpf` (TEXT) - CPF (opcional)
- `email` (TEXT) - Email único
- `phone` (TEXT) - WhatsApp
- `quiz_responses` (JSONB) - Todas as respostas do formulário
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

### Tabela: `payments`
- `id` (UUID) - Primary Key
- `patient_id` (UUID) - Foreign Key → patients
- `asaas_id` (TEXT) - ID da cobrança no Asaas
- `asaas_customer_id` (TEXT) - ID do cliente no Asaas (para reutilização)
- `amount` (DECIMAL) - Valor da cobrança
- `status` (TEXT) - Status do pagamento (PENDING, RECEIVED, etc)
- `payment_url` (TEXT) - URL da fatura Asaas
- `created_at` (TIMESTAMPTZ)
- `updated_at` (TIMESTAMPTZ)

## Fluxo do Usuário

1. **Quiz Interativo** (27 etapas)
   - Perguntas sobre perfil nutricional, hábitos alimentares, objetivos
   - Interface mobile-first otimizada
   - Validação de campos obrigatórios (email, telefone, CPF)
   - Uma pergunta por tela para melhor UX
   - Valores padrão nos seletores de altura/peso para melhor UX

2. **Processamento**
   - Dados enviados para API `/api/submit-quiz`
   - Criação/atualização do paciente no MySQL
   - Criação de cliente no Asaas (se necessário)
   - Geração automática de cobrança

3. **Redirecionamento para Pagamento**
   - Cliente é redirecionado para página de pagamento do Asaas
   - Opções: PIX, Boleto, Cartão de Crédito

## Tratamento de Erros

O sistema possui duas estratégias diferentes de tratamento de erros dependendo da etapa do processamento:

### Erros nas Linhas 1-120 (Validação e Criação do Paciente)
- **Comportamento**: Erros são apresentados em tela e bloqueiam o fluxo
- **Exemplos**:
  - Validação de email inválido
  - Validação de telefone/CPF
  - Erros ao gravar o paciente no banco (a tela mostra "Tentar novamente")
- **Resposta API**: `{ error: "mensagem de erro" }` com status HTTP 4xx/5xx
- **Frontend**: Exibe mensagem de erro para o usuário corrigir

### Erros de integração (Asaas)
- **Comportamento**: a cobrança fica pendente no banco, o job de fundo tenta de novo com espera crescente e, se as tentativas acabarem, avisa o administrador por e-mail (detalhes no `README.md`)
- **Resposta API**: `{ sucesso: true }` (sem link)
- **Frontend**: vai para `/confirmation` ("logo enviaremos o link")

### Justificativa
Esta abordagem garante que:
1. Dados inválidos sejam corrigidos pelo usuário antes de criar registros
2. Erros de integração (fora do controle do usuário) sejam tratados automaticamente
3. A equipe seja avisada por e-mail para resolver problemas de integração
4. O usuário tenha uma experiência limpa mesmo quando há falhas técnicas

## Gerenciamento de Variáveis de Ambiente

As variáveis são lidas de `process.env` e validadas em `lib/env.ts` quando o app inicia. A lista completa está em `.env.example` e no `README.md`.

## Estrutura de Arquivos

\`\`\`
/
├── app/
│   ├── api/
│   │   └── submit-quiz/
│   │       └── route.ts          # API para processar quiz e criar cobrança
│   ├── layout.tsx                # Layout raiz
│   ├── page.tsx                  # Página principal do quiz (26 etapas)
│   └── globals.css               # Estilos globais
├── components/
│   ├── bmi-display.tsx           # Exibição do IMC
│   ├── height-picker.tsx         # Seletor de altura
│   ├── weight-picker.tsx         # Seletor de peso
│   ├── phone-input.tsx           # Input de telefone formatado (com máscara)
│   ├── cpf-input.tsx             # Input de CPF formatado (999.999.999-99)
│   ├── progress-bar.tsx          # Barra de progresso
│   ├── quiz-step.tsx             # Componente de etapa do quiz
│   ├── loading-screen.tsx        # Tela de carregamento
│   └── theme-provider.tsx        # Provider de tema
├── lib/
│   ├── db/                       # Schema Drizzle, migrations e repositórios (MySQL)
│   ├── env.ts                    # Validação das variáveis de ambiente
│   └── utils.ts                  # Utilitários
├── .env.example                  # Modelo das variáveis de ambiente
├── package.json
├── tsconfig.json
└── next.config.mjs
\`\`\`

## Setup do Projeto

### 1. Configurar o banco (MySQL 8)

Crie o banco e informe `DATABASE_URL`. As migrations rodam sozinhas quando o app inicia. Passo a passo no `README.md`.

### 2. Configurar Asaas

1. Crie conta em [asaas.com](https://www.asaas.com)
2. Acesse Minha Conta → Integração → Gerar API Key
3. Use o ambiente Sandbox para testes
4. Adicione as credenciais no Replit Secrets

### 3. Executar o Projeto

\`\`\`bash
pnpm install
pnpm run dev
\`\`\`

A aplicação estará disponível em `http://0.0.0.0:5000`

## Funcionalidades Principais

### Quiz Interativo
- 27 perguntas divididas em seções temáticas
- Validação em tempo real (email, telefone com DDD, CPF com 11 dígitos)
- Design responsivo (mobile-first)
- Feedback visual de progresso
- Suporte a diferentes tipos de input (texto, seleção, checkboxes, máscaras)
- Inputs formatados: telefone (DDD + número), CPF (999.999.999-99)
- Valores padrão em seletores numéricos para evitar bloqueio de navegação

### Persistência (MySQL)
- Armazenamento seguro de dados dos pacientes
- Respostas do quiz salvas em JSON
- Prevenção de duplicatas por CPF
- Atualização automática de timestamps

### Integração com Asaas
- Criação automática de clientes
- Geração de cobranças flexíveis (PIX, Boleto, Cartão)
- Vencimento configurável (padrão: 3 dias)
- Rastreamento de status de pagamento
- Suporte a ambiente sandbox para testes

## Características de Segurança

- Separação cliente/servidor (API Routes)
- Service Role Key apenas no backend
- Validação de dados de entrada
- HTTPS obrigatório para produção
- Secrets gerenciados pelo Replit

## Próximos Passos Sugeridos

1. **Webhooks Asaas**: Implementar endpoint para receber notificações de status de pagamento
2. **Email Automático**: Enviar plano alimentar após confirmação do pagamento
3. **Dashboard Admin**: Painel para visualizar pacientes e pagamentos
4. **Geração de PDF**: Criar PDF do plano alimentar personalizado
5. **Sistema de Cupons**: Descontos promocionais
6. **Analytics**: Rastreamento de conversão e abandono de carrinho

## Suporte

Para questões sobre:
- **MySQL**: [dev.mysql.com/doc](https://dev.mysql.com/doc/)
- **Asaas**: [docs.asaas.com](https://docs.asaas.com)
- **Next.js**: [nextjs.org/docs](https://nextjs.org/docs)

## Última Atualização

**Data**: 07/11/2025
**Versão**: 1.2.0
**Status**: Pronto para produção

## Changelog

### v1.2.0 (07/11/2025)
**Gerenciamento de Configuração**
- ✅ Implementado suporte a AWS Parameter Store para produção
- ✅ Sistema dual de configuração (AWS/local) com detecção automática
- ✅ Adicionado arquivo `.env.local.example` como template
- ✅ Cache de configurações em memória para performance
- ✅ Validação automática de variáveis obrigatórias

**Tratamento de Erros**
- ✅ Sistema diferenciado de tratamento de erros (validação vs integração)
- ✅ Notificação de erros de integração
- ✅ Redirecionamento automático para site institucional em caso de falha
- ✅ 4 tipos de erro categorizados e monitorados

### v1.1.0 (06/11/2025)
**Correções**
- ✅ Corrigido bug de tela branca após loading screen
- ✅ Corrigido seletores de altura/peso com valores padrão
- ✅ Removida formatação de CPF antes de enviar para APIs

**Novas Funcionalidades**
- ✅ Adicionada etapa de coleta de CPF com máscara (999.999.999-99)
- ✅ Validação de CPF com 11 dígitos
- ✅ Total de etapas aumentado para 27
