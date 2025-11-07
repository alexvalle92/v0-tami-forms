import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getConfig } from '@/lib/config'

const ERROR_WEBHOOK_URL = 'https://n8n.nutritamilivalle.com.br/webhook/errors-app'
const REDIRECT_URL = 'https://nutritamilivalle.com.br/'

async function sendErrorToWebhook(patientId: string, errorDetails: any): Promise<void> {
  try {
    await fetch(ERROR_WEBHOOK_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        patient_id: patientId,
        error: errorDetails,
        timestamp: new Date().toISOString(),
      }),
    })
  } catch (webhookError) {
    console.error('Erro ao enviar para webhook:', webhookError)
  }
}

function validateEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

function validatePhone(phone: string): boolean {
  const cleanPhone = phone.replace(/\D/g, '')
  return cleanPhone.length >= 10 && cleanPhone.length <= 11
}

function validateCPF(cpf: string | null): boolean {
  if (!cpf) return true
  const cleanCPF = cpf.replace(/\D/g, '')
  return cleanCPF.length === 11
}

export async function POST(request: NextRequest) {
  try {
    const config = await getConfig()
    
    const supabase = createClient(
      config.NEXT_PUBLIC_SUPABASE_URL,
      config.SUPABASE_SERVICE_ROLE_KEY
    )

    const ASAAS_API_KEY = config.ASAAS_API_KEY
    const ASAAS_SANDBOX = config.ASAAS_SANDBOX === 'true'
    const ASAAS_BASE_URL = ASAAS_SANDBOX 
      ? 'https://sandbox.asaas.com/api/v3' 
      : 'https://api.asaas.com/v3'

    const body = await request.json()
    const { answers } = body

    if (!answers || !answers.nome_completo || !answers.email || !answers.whatsapp) {
      return NextResponse.json(
        { error: 'Dados incompletos. Nome, email e WhatsApp são obrigatórios.' },
        { status: 400 }
      )
    }

    if (!validateEmail(answers.email)) {
      return NextResponse.json(
        { error: 'Email inválido.' },
        { status: 400 }
      )
    }

    if (!validatePhone(answers.whatsapp)) {
      return NextResponse.json(
        { error: 'Telefone inválido. Deve conter DDD + número (10 ou 11 dígitos).' },
        { status: 400 }
      )
    }

    const cpf = answers.cpf || null
    if (!validateCPF(cpf)) {
      return NextResponse.json(
        { error: 'CPF inválido.' },
        { status: 400 }
      )
    }

    const phone = answers.whatsapp.replace(/\D/g, '')
    const cpfClean = cpf ? cpf.replace(/\D/g, '') : null

    const { data: existingPatient, error: searchError } = await supabase
      .from('patients')
      .select('id, asaas_customer_id')
      .eq('email', answers.email)
      .single()

    let patientId: string
    let asaasCustomerId: string | null = null

    if (existingPatient) {
      patientId = existingPatient.id
      asaasCustomerId = existingPatient.asaas_customer_id

      const { error: updateError } = await supabase
        .from('patients')
        .update({
          name: answers.nome_completo,
          cpf: cpfClean,
          phone: phone,
          quiz_responses: answers,
          updated_at: new Date().toISOString()
        })
        .eq('id', patientId)

      if (updateError) {
        console.error('Erro ao atualizar paciente:', updateError)
        return NextResponse.json(
          { error: 'Erro ao atualizar dados do paciente' },
          { status: 500 }
        )
      }
    } else {
      const { data: newPatient, error: insertError } = await supabase
        .from('patients')
        .insert({
          name: answers.nome_completo,
          cpf: cpfClean,
          email: answers.email,
          phone: phone,
          quiz_responses: answers,
        })
        .select('id')
        .single()

      if (insertError || !newPatient) {
        console.error('Erro ao criar paciente:', insertError)
        return NextResponse.json(
          { error: 'Erro ao salvar dados do paciente' },
          { status: 500 }
        )
      }

      patientId = newPatient.id
    }

    if (!asaasCustomerId) {
      const customerResponse = await fetch(`${ASAAS_BASE_URL}/customers`, {
        method: 'POST',
        headers: {
          'access_token': ASAAS_API_KEY,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          name: answers.nome_completo,
          email: answers.email,
          phone: phone,
          cpfCnpj: cpfClean,
        }),
      })

      if (!customerResponse.ok) {
        const errorData = await customerResponse.json()
        console.error('Erro ao criar cliente Asaas:', errorData)
        
        await sendErrorToWebhook(patientId, {
          type: 'asaas_customer_creation_error',
          details: errorData,
          context: 'Falha ao criar cliente no Asaas'
        })
        
        return NextResponse.json({
          success: false,
          redirectUrl: REDIRECT_URL
        })
      }

      const customerData = await customerResponse.json()
      asaasCustomerId = customerData.id

      const { error: updatePatientError } = await supabase
        .from('patients')
        .update({ asaas_customer_id: asaasCustomerId })
        .eq('id', patientId)

      if (updatePatientError) {
        console.error('Erro ao atualizar asaas_customer_id:', updatePatientError)
        
        await sendErrorToWebhook(patientId, {
          type: 'supabase_update_asaas_id_error',
          details: updatePatientError,
          context: 'Falha ao atualizar asaas_customer_id no paciente'
        })
        
        return NextResponse.json({
          success: false,
          redirectUrl: REDIRECT_URL
        })
      }
    }

    const today = new Date()
    const dueDate = new Date(today)
    dueDate.setDate(today.getDate() + 3)
    const dueDateStr = dueDate.toISOString().split('T')[0]

    const paymentResponse = await fetch(`${ASAAS_BASE_URL}/payments`, {
      method: 'POST',
      headers: {
        'access_token': ASAAS_API_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        customer: asaasCustomerId,
        billingType: 'UNDEFINED',
        value: 49.90,
        dueDate: dueDateStr,
        description: 'Plano Alimentar Personalizado - 30 dias',
        externalReference: patientId,
      }),
    })

    if (!paymentResponse.ok) {
      const errorData = await paymentResponse.json()
      console.error('Erro ao criar cobrança Asaas:', errorData)
      
      await sendErrorToWebhook(patientId, {
        type: 'asaas_payment_creation_error',
        details: errorData,
        context: 'Falha ao criar cobrança no Asaas'
      })
      
      return NextResponse.json({
        success: false,
        redirectUrl: REDIRECT_URL
      })
    }

    const paymentData = await paymentResponse.json()

    const { error: paymentInsertError } = await supabase
      .from('payments')
      .insert({
        patient_id: patientId,
        asaas_id: paymentData.id,
        asaas_customer_id: asaasCustomerId,
        amount: 49.90,
        status: paymentData.status,
        payment_url: paymentData.invoiceUrl,
      })

    if (paymentInsertError) {
      console.error('Erro ao salvar pagamento:', paymentInsertError)
      
      await sendErrorToWebhook(patientId, {
        type: 'supabase_payment_insert_error',
        details: paymentInsertError,
        context: 'Falha ao salvar registro de pagamento no Supabase'
      })
      
      return NextResponse.json({
        success: false,
        redirectUrl: REDIRECT_URL
      })
    }

    return NextResponse.json({
      success: true,
      paymentUrl: paymentData.invoiceUrl,
      patientId: patientId,
    })

  } catch (error) {
    console.error('Erro no processamento:', error)
    return NextResponse.json(
      { error: 'Erro interno do servidor' },
      { status: 500 }
    )
  }
}
