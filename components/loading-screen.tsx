"use client"

import { useEffect, useState, useRef } from "react"
import { ErrorModal } from "./error-modal"

interface LoadingScreenProps {
  onComplete: () => void
  answers: Record<string, any>
}

export function LoadingScreen({ onComplete, answers }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0)
  const [showError, setShowError] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")

  const hasSubmitted = useRef(false)
  const shouldBlockProgressRef = useRef(false)

  const blockProgress = (message: string) => {
    shouldBlockProgressRef.current = true
    setErrorMessage(message)
    setShowError(true)
  }

  const submitToWebhook = async (): Promise<void> => {
    if (hasSubmitted.current) return
    hasSubmitted.current = true

    const WEBHOOK_URL_NOVO_FORMULARIO = "https://n8n-n8n-start.z8qram.easypanel.host/webhook-test/e914138c-0f72-4bb9-a209-3f379a630473"

    if (!WEBHOOK_URL_NOVO_FORMULARIO) {
      blockProgress(
        "Houve um problema ao registrar seus dados. Aguarde alguns instantes e tente novamente ou entre em contato com o suporte.",
      )
      return
    }

    try {
      console.log('Efetuando requisição em ' + WEBHOOK_URL_NOVO_FORMULARIO)
      const response = await fetch(WEBHOOK_URL_NOVO_FORMULARIO, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ answers }),
      })

      if (!response.ok) {
        blockProgress(
          "Houve um problema ao registrar seus dados. Por favor, aguarde alguns instantes e tente novamente ou entre em contato com o suporte.",
        )
        return
      }

      const contentType = response.headers?.get('content-type')

      if (contentType?.includes('application/json')) {
        const text = await response.text()

        if (text) {
          const data = JSON.parse(text)
          if (data.sucesso == true) {
            if (data.linkPagamento) {
              sessionStorage.setItem("linkPagamento", data.linkPagamento)
            }
          } else if (data.mensagemErro) {
            blockProgress(data.mensagemErro)
          }
        }
      }
      
    } catch (error) {
      blockProgress(
        "Houve um problema ao registrar seus dados. Por favor, aguarde alguns instantes e tente novamente ou entre em contato com o suporte.",
      )
    }
  }

  useEffect(() => {
    const duration = 16000
    const intervalTime = duration / 100

    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval)
          if (!shouldBlockProgressRef.current) {
            setTimeout(() => onComplete(), 1000)
          }
          return 100
        }
        return prev + 1
      })
    }, intervalTime)

    return () => {
      clearInterval(interval)
    }
  }, [onComplete])

  useEffect(() => {
    const webhookTimeout = setTimeout(() => {
      submitToWebhook()
    }, 12000)

    return () => {
      clearTimeout(webhookTimeout)
    }
  }, []) // Empty dependency array ensures this runs only once

  return (
    <>
      <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
        <div className="relative w-48 h-48 mb-8">
          <svg className="w-full h-full transform -rotate-90" viewBox="0 0 200 200">
            {/* Background circle */}
            <circle cx="100" cy="100" r="90" fill="none" stroke="#e5e5e5" strokeWidth="12" />
            {/* Progress circle */}
            <circle
              cx="100"
              cy="100"
              r="90"
              fill="none"
              stroke="#4f6e2c"
              strokeWidth="12"
              strokeLinecap="round"
              strokeDasharray={`${2 * Math.PI * 90}`}
              strokeDashoffset={`${2 * Math.PI * 90 * (1 - progress / 100)}`}
              className="transition-all duration-300 ease-out"
            />
          </svg>
          <div className="absolute inset-0 flex items-center justify-center">
            <span className="text-4xl font-bold text-[#4f6e2c]">{progress}%</span>
          </div>
        </div>

        <h2 className="text-2xl md:text-3xl font-bold text-[#4f6e2c] mb-4 text-center">
          Montando seu plano alimentar personalizado...
        </h2>

        <div className="space-y-2 text-center text-[#555]">
          <p className="animate-pulse">✓ Analisando suas respostas</p>
          <p className="animate-pulse delay-100">✓ Calculando necessidades nutricionais</p>
          <p className="animate-pulse delay-200">✓ Personalizando recomendações</p>
        </div>
      </div>

      <ErrorModal isOpen={showError} message={errorMessage} onClose={() => setShowError(false)} />
    </>
  )
}
