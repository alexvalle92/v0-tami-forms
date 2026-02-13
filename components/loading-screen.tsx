"use client"

import { useEffect, useState, useRef } from "react"
import { AlertTriangle, ArrowLeft, RefreshCw, MessageCircle } from "lucide-react"

interface LoadingScreenProps {
  onComplete: () => void
  onGoBack: () => void
  answers: Record<string, any>
}

export function LoadingScreen({ onComplete, onGoBack, answers }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0)
  const [hasError, setHasError] = useState(false)
  const [errorMessage, setErrorMessage] = useState("")
  const [isRetrying, setIsRetrying] = useState(false)

  const hasSubmitted = useRef(false)
  const shouldBlockProgressRef = useRef(false)

  const blockProgress = (message: string) => {
    shouldBlockProgressRef.current = true
    setErrorMessage(message)
    setHasError(true)
  }

  const submitToWebhook = async (): Promise<void> => {
    const WEBHOOK_URL_NOVO_FORMULARIO = process.env.NEXT_PUBLIC_WEBHOOK_URL_FORMULARIO

    if (!WEBHOOK_URL_NOVO_FORMULARIO) {
      blockProgress(
        "Houve um problema ao registrar seus dados. Por favor, aguarde alguns instantes e tente novamente ou entre em contato com o suporte.",
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
            shouldBlockProgressRef.current = false
            setHasError(false)
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

  const handleRetry = async () => {
    setIsRetrying(true)
    setHasError(false)
    setErrorMessage("")
    shouldBlockProgressRef.current = false
    hasSubmitted.current = false
    setProgress(0)

    await submitToWebhook()
    hasSubmitted.current = true

    if (!shouldBlockProgressRef.current) {
      setProgress(100)
      setTimeout(() => onComplete(), 1000)
    }

    setIsRetrying(false)
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
      if (!hasSubmitted.current) {
        hasSubmitted.current = true
        submitToWebhook()
      }
    }, 12000)

    return () => {
      clearTimeout(webhookTimeout)
    }
  }, [])

  return (
    <div className="flex flex-col items-center justify-center py-12 animate-fade-in">
      <div className="relative w-48 h-48 mb-8">
        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 200 200">
          <circle cx="100" cy="100" r="90" fill="none" stroke="#e5e5e5" strokeWidth="12" />
          <circle
            cx="100"
            cy="100"
            r="90"
            fill="none"
            stroke={hasError ? "#dc2626" : "#4f6e2c"}
            strokeWidth="12"
            strokeLinecap="round"
            strokeDasharray={`${2 * Math.PI * 90}`}
            strokeDashoffset={`${2 * Math.PI * 90 * (1 - progress / 100)}`}
            className="transition-all duration-300 ease-out"
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {hasError ? (
            <AlertTriangle className="w-16 h-16 text-red-500" />
          ) : (
            <span className="text-4xl font-bold text-[#4f6e2c]">{progress}%</span>
          )}
        </div>
      </div>

      {!hasError && (
        <>
          <h2 className="text-2xl md:text-3xl font-bold text-[#4f6e2c] mb-4 text-center">
            {isRetrying ? "Tentando novamente..." : "Montando seu plano alimentar personalizado..."}
          </h2>

          <div className="space-y-2 text-center text-[#555]">
            <p className="animate-pulse">✓ Analisando suas respostas</p>
            <p className="animate-pulse delay-100">✓ Calculando necessidades nutricionais</p>
            <p className="animate-pulse delay-200">✓ Personalizando recomendações</p>
          </div>
        </>
      )}

      {hasError && (
        <div className="w-full max-w-md">
          <h2 className="text-xl md:text-2xl font-bold text-red-600 mb-3 text-center">
            Ops! Algo deu errado
          </h2>

          <p className="text-gray-600 text-sm md:text-base text-center mb-6 leading-relaxed">
            {errorMessage}
          </p>

          <div className="space-y-3">
            <button
              onClick={handleRetry}
              disabled={isRetrying}
              className="w-full flex items-center justify-center gap-3 bg-[#4f6e2c] text-white font-semibold py-4 px-6 rounded-xl hover:brightness-90 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <RefreshCw className={`w-5 h-5 ${isRetrying ? "animate-spin" : ""}`} />
              {isRetrying ? "Tentando novamente..." : "Tentar novamente"}
            </button>

            <button
              onClick={onGoBack}
              className="w-full flex items-center justify-center gap-3 bg-white border-2 border-[#e5e5e5] text-gray-700 font-semibold py-4 px-6 rounded-xl hover:border-[#4f6e2c] hover:bg-[#f5f9f1] transition-all active:scale-95"
            >
              <ArrowLeft className="w-5 h-5" />
              Voltar para as perguntas
            </button>

            <a
              href="https://wa.me/5544991767525"
              target="_blank"
              rel="noopener noreferrer"
              className="w-full flex items-center justify-center gap-3 bg-[#25D366] text-white font-semibold py-4 px-6 rounded-xl hover:brightness-90 transition-all active:scale-95"
            >
              <MessageCircle className="w-5 h-5" />
              Falar com o suporte
            </a>
          </div>
        </div>
      )}
    </div>
  )
}
