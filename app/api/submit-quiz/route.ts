import { type NextRequest, NextResponse } from "next/server"

const WEBHOOK_URL_NOVO_FORMULARIO =
  "https://n8n.nutritamilivalle.com.br/webhook-test/e914138c-0f72-4bb9-a209-3f379a630473"

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function validatePhone(phone: string): boolean {
  const cleanPhone = phone.replace(/\D/g, "")
  return cleanPhone.length >= 10 && cleanPhone.length <= 11
}

function validateCPF(cpf: string | null): boolean {
  if (!cpf) return true
  const cleanCPF = cpf.replace(/\D/g, "")
  return cleanCPF.length === 11
}

export async function POST(request: NextRequest) {
  try {

    const body = await request.json()
    const { answers } = body

    if (!answers || !answers.nome_completo || !answers.email || !answers.whatsapp) {
      return NextResponse.json(
        { error: "Dados incompletos. Nome, email e WhatsApp são obrigatórios." },
        { status: 400 },
      )
    }

    if (!validateEmail(answers.email)) {
      return NextResponse.json({ error: "Email inválido." }, { status: 400 })
    }

    if (!validatePhone(answers.whatsapp)) {
      return NextResponse.json(
        { error: "Telefone inválido. Deve conter DDD + número (10 ou 11 dígitos)." },
        { status: 400 },
      )
    }

    const cpf = answers.cpf || null
    if (!validateCPF(cpf)) {
      return NextResponse.json({ error: "CPF inválido." }, { status: 400 })
    }

    try {
      const webhookResponse = await fetch(WEBHOOK_URL_NOVO_FORMULARIO, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          answers: answers,
        }),
      })

      const webhookData = await webhookResponse.json()

      if (webhookData.linkPagamento) {
        return NextResponse.json({
          linkPagamento: webhookData.linkPagamento,
        })
      }

      // Fallback if webhook doesn't return linkPagamento
      return NextResponse.json({
        linkPagamento: "https://pay.kiwify.com.br/default-checkout-url",
      })
    } catch (webhookError) {
      console.error("Erro ao enviar para webhook:", webhookError)
      return NextResponse.json(
        {
          error:
            "Desculpe pelo transtorno, mas não conseguimos efetuar o seu cadastro! Tente novamente em alguns instantes.",
        },
        { status: 500 },
      )
    }
  } catch (error) {
    console.error("Erro no processamento:", error)
    return NextResponse.json({ error: "Desculpe pelo transtorno! Tente novamente mais tarde." }, { status: 500 })
  }
}
