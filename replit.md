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
- **Supabase** - Banco de dados PostgreSQL e autenticação
  - `@supabase/supabase-js` - Cliente JavaScript
  - `@supabase/ssr` - Server-side rendering support
- **Asaas API** - Gateway de pagamentos brasileiro

### Gerenciamento de Pacotes
- **pnpm** - Gerenciador de pacotes

## Estrutura do Banco de Dados (Supabase)

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
   - Criação/atualização do paciente no Supabase
   - Criação de cliente no Asaas (se necessário)
   - Geração automática de cobrança

3. **Redirecionamento para Pagamento**
   - Cliente é redirecionado para página de pagamento do Asaas
   - Opções: PIX, Boleto, Cartão de Crédito

## Variáveis de Ambiente Necessárias

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_supabase_service_role_key

# Asaas
ASAAS_API_KEY=your_asaas_api_key
ASAAS_SANDBOX=true  # true para testes, false para produção
```

## Estrutura de Arquivos

```
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
│   ├── supabase/
│   │   ├── client.ts             # Cliente Supabase (browser)
│   │   └── server.ts             # Cliente Supabase (server-side)
│   └── utils.ts                  # Utilitários
├── supabase-schema.sql           # Script SQL para criar tabelas
├── package.json
├── tsconfig.json
└── next.config.mjs
```

## Setup do Projeto

### 1. Configurar Supabase

1. Crie um projeto em [supabase.com](https://supabase.com)
2. Execute o script `supabase-schema.sql` no SQL Editor
3. Copie as credenciais (Project Settings → API)
4. Adicione as variáveis de ambiente no Replit Secrets

### 2. Configurar Asaas

1. Crie conta em [asaas.com](https://www.asaas.com)
2. Acesse Minha Conta → Integração → Gerar API Key
3. Use o ambiente Sandbox para testes
4. Adicione as credenciais no Replit Secrets

### 3. Executar o Projeto

```bash
pnpm install
pnpm run dev
```

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

### Integração com Supabase
- Armazenamento seguro de dados dos pacientes
- Respostas do quiz salvas em JSON
- Prevenção de duplicatas por email
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
- **Supabase**: [supabase.com/docs](https://supabase.com/docs)
- **Asaas**: [docs.asaas.com](https://docs.asaas.com)
- **Next.js**: [nextjs.org/docs](https://nextjs.org/docs)

## Última Atualização

**Data**: 06/11/2025
**Versão**: 1.1.0
**Status**: Pronto para testes

## Últimas Atualizações (v1.1.0)

### Correções
- ✅ Corrigido bug de tela branca após loading screen (ajuste currentStep >= 26)
- ✅ Corrigido seletores de altura/peso que bloqueavam navegação (valores padrão: 170cm, 70kg, 65kg)

### Novas Funcionalidades
- ✅ Adicionada etapa de coleta de CPF com máscara (999.999.999-99)
- ✅ Validação de CPF com 11 dígitos antes de enviar para Asaas
- ✅ Total de etapas aumentado de 26 para 27
