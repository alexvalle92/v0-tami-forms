# 🚀 Guia Rápido de Configuração

## ✅ Checklist - O que já está pronto

- ✅ Aplicação Next.js configurada e rodando na porta 5000
- ✅ Pacotes instalados (@supabase/supabase-js, @supabase/ssr)
- ✅ Variáveis de ambiente configuradas no Replit Secrets
- ✅ API de integração Supabase + Asaas implementada
- ✅ Formulário de 26 etapas funcionando
- ✅ Validações de dados (email, telefone, CPF)
- ✅ Documentação completa em `replit.md`

## 📋 Próximos Passos

### 1. Configurar o Banco de Dados Supabase

1. Acesse seu projeto no [Supabase](https://supabase.com)
2. Vá em **SQL Editor**
3. Copie e execute o conteúdo do arquivo `supabase-schema.sql`
4. Verifique se as tabelas `patients` e `payments` foram criadas

### 2. Testar a Aplicação

1. A aplicação já está rodando em: **https://[seu-repl].replit.dev**
2. Preencha o quiz completo (26 etapas)
3. Na última etapa, clique em "🔒 Garantir Meu Plano Agora"
4. Você será redirecionado para a página de pagamento do Asaas

### 3. Verificar Dados no Supabase

Após o teste, verifique no Supabase:
- **Tabela `patients`**: Deve ter 1 registro com suas respostas
- **Tabela `payments`**: Deve ter 1 registro com status PENDING

## 🔧 Estrutura de Arquivos Criados

```
├── app/
│   ├── api/
│   │   └── submit-quiz/
│   │       └── route.ts          ← API que processa quiz e cria cobrança
│   └── page.tsx                  ← Formulário de 26 etapas (atualizado)
├── lib/
│   └── supabase/
│       ├── client.ts             ← Cliente Supabase (browser)
│       └── server.ts             ← Cliente Supabase (server-side)
├── supabase-schema.sql           ← Script SQL para criar tabelas
├── replit.md                     ← Documentação completa
└── SETUP.md                      ← Este arquivo
```

## 🎯 Funcionalidades Implementadas

### Quiz Interativo
- 26 perguntas sobre perfil nutricional
- Validação em tempo real
- Design mobile-first responsivo
- Cálculo automático de IMC

### Integração Supabase
- Armazenamento seguro de dados
- Prevenção de duplicatas por email
- Respostas salvas em formato JSON
- Reutilização de clientes Asaas

### Integração Asaas
- Criação automática de clientes
- Geração de cobranças (PIX, Boleto, Cartão)
- Vencimento em 3 dias
- Valor fixo: R$ 49,90

### Validações Server-Side
- ✅ Email válido
- ✅ Telefone com DDD (10-11 dígitos)
- ✅ CPF (11 dígitos)
- ✅ Nome completo obrigatório

## 🔐 Segurança

- Service Role Key usado apenas no backend (API Route)
- Validações antes de enviar para Asaas
- Separação cliente/servidor
- HTTPS obrigatório em produção

## 📊 Fluxo de Dados

1. **Usuário** preenche quiz (26 etapas)
2. **Frontend** envia dados para `/api/submit-quiz`
3. **API** valida dados
4. **API** salva/atualiza paciente no Supabase
5. **API** cria/reusa cliente no Asaas
6. **API** gera cobrança no Asaas
7. **API** salva pagamento no Supabase
8. **Frontend** redireciona para URL de pagamento

## 🐛 Troubleshooting

### Erro: "Dados incompletos"
- Verifique se preencheu nome, email e WhatsApp

### Erro: "Email inválido"
- Use formato: seuemail@exemplo.com

### Erro: "Telefone inválido"
- Use DDD + número: (11) 98765-4321

### Erro ao criar cobrança
- Verifique se a API Key do Asaas está correta
- Confirme se ASAAS_SANDBOX está "true" para testes

### Tabelas não existem no Supabase
- Execute o script `supabase-schema.sql` no SQL Editor

## 🎉 Próximas Melhorias Sugeridas

1. **Webhooks Asaas**: Receber notificações de status
2. **Email Automático**: Enviar plano após pagamento
3. **Dashboard Admin**: Visualizar pacientes e pagamentos
4. **Geração de PDF**: Criar PDF do plano alimentar
5. **Sistema de Cupons**: Implementar descontos
6. **Analytics**: Rastrear conversão

## 📞 Suporte

- **Supabase**: [supabase.com/docs](https://supabase.com/docs)
- **Asaas**: [docs.asaas.com](https://docs.asaas.com)
- **Next.js**: [nextjs.org/docs](https://nextjs.org/docs)

---

**Status**: ✅ Pronto para testes
**Última atualização**: 06/11/2025
