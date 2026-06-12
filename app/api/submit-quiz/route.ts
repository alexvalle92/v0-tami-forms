import { NextRequest, NextResponse } from "next/server"

const WEBHOOK_URL_NOVO_FORMULARIO = process.env.NEXT_PUBLIC_WEBHOOK_URL

export async function POST(request: NextRequest) {
  try {
    if (!WEBHOOK_URL_NOVO_FORMULARIO) {
      return NextResponse.json(
        {
          sucesso: false,
          mensagemErro: "111 Houve um problema ao registrar seus dados. Por favor, aguarde alguns instantes e tente novamente ou entre em contato com o suporte.",
        },
        { status: 500 }
      )
    }

    const body = await request.json()

    const response = await fetch(WEBHOOK_URL_NOVO_FORMULARIO, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    })

    const contentType = response.headers.get("content-type")

    if (contentType?.includes("application/json")) {
      const data = await response.json()

      return NextResponse.json(data, {
        status: response.status,
      })
    }

    return NextResponse.json(
      {
        sucesso: true,
      },
      {
        status: response.status,
      }
    )
  } catch (error) {
    console.error("222 Houve um problema ao registrar seus dados. Por favor, aguarde alguns instantes e tente novamente ou entre em contato com o suporte.", error)

    return NextResponse.json(
      {
        sucesso: false,
        mensagemErro:
          "333 Houve um problema ao registrar seus dados. Por favor, aguarde alguns instantes e tente novamente ou entre em contato com o suporte.",
      },
      { status: 500 }
    )
  }
}