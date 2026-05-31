"use client"

import { useEffect, useState, useRef, useCallback } from "react"
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
  const [showButtons, setShowButtons] = useState(false)
  const [retryCount, setRetryCount] = useState(0)

  const webhookResultRef = useRef<"pending" | "success" | "error">("pending")
  const webhookErrorMsgRef = useRef("")
  const progressIntervalRef = useRef<NodeJS.Timeout | null>(null)

  const submitToWebhook = useCallback(async () => {
    webhookResultRef.current = "pending"
    webhookErrorMsgRef.current = ""

    const WEBHOOK_URL_NOVO_FORMULARIO = "https://n8n-n8n-start.z8qram.easypanel.host/webhook-test/e914138c-0f72-4bb9-a209-3f379a630473";

    if (!WEBHOOK_URL_NOVO_FORMULARIO) {
      webhookResultRef.current = "error"
      webhookErrorMsgRef.current = "Houve um problema ao registrar seus dados. Por favor, aguarde alguns instantes e tente novamente ou entre em contato com o suporte."
      return
    }

    try {
      console.log('Efetuando requisição em ' + WEBHOOK_URL_NOVO_FORMULARIO)
      const response = await fetch(WEBHOOK_URL_NOVO_FORMULARIO, {
        method: "POST",
        body: JSON.stringify({ answers }),
      })

      if (!response.ok) {
        webhookResultRef.current = "error"
        webhookErrorMsgRef.current = "Houve um problema ao registrar seus dados. Por favor, aguarde alguns instantes e tente novamente ou entre em contato com o suporte."
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
            webhookResultRef.current = "success"
          } else if (data.mensagemErro) {
            webhookResultRef.current = "error"
            webhookErrorMsgRef.current = data.mensagemErro
          } else {
            webhookResultRef.current = "success"
          }
        } else {
          webhookResultRef.current = "success"
        }
      } else {
        webhookResultRef.current = "success"
      }
    } catch (error) {
      webhookResultRef.current = "error"
      webhookErrorMsgRef.current = "Houve um problema ao registrar seus dados. Por favor, aguarde alguns instantes e tente novamente ou entre em contato com o suporte."
    }
  }, [answers])

  const startProgressAnimation = useCallback((duration: number, webhookDelay: number) => {
    setProgress(0)
    setHasError(false)
    setShowButtons(false)
    setErrorMessage("")
    webhookResultRef.current = "pending"

    let currentProgress = 0
    const intervalTime = duration / 100

    if (progressIntervalRef.current) {
      clearInterval(progressIntervalRef.current)
    }

    const webhookTimer = setTimeout(() => {
      submitToWebhook()
    }, webhookDelay)

    progressIntervalRef.current = setInterval(() => {
      currentProgress += 1
      setProgress(currentProgress)

      if (currentProgress >= 100) {
        if (progressIntervalRef.current) {
          clearInterval(progressIntervalRef.current)
          progressIntervalRef.current = null
        }

        setTimeout(() => {
          if (webhookResultRef.current === "error") {
            setErrorMessage(webhookErrorMsgRef.current)
            setHasError(true)
            setShowButtons(true)
          } else if (webhookResultRef.current === "success") {
            onComplete()
          } else {
            const checkResult = setInterval(() => {
              if (webhookResultRef.current === "error") {
                clearInterval(checkResult)
                setErrorMessage(webhookErrorMsgRef.current)
                setHasError(true)
                setShowButtons(true)
              } else if (webhookResultRef.current === "success") {
                clearInterval(checkResult)
                onComplete()
              }
            }, 300)
          }
        }, 500)
      }
    }, intervalTime)

    return () => {
      clearTimeout(webhookTimer)
      if (progressIntervalRef.current) {
        clearInterval(progressIntervalRef.current)
      }
    }
  }, [submitToWebhook, onComplete])

  useEffect(() => {
    const cleanup = startProgressAnimation(16000, 12000)
    return cleanup
  }, [])

  const handleRetry = () => {
    setRetryCount((prev) => prev + 1)
    startProgressAnimation(8000, 3000)
  }

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
            {retryCount > 0 ? "Reenviando seus dados..." : "Montando seu plano alimentar personalizado..."}
          </h2>

          <div className="space-y-2 text-center text-[#555]">
            <p className="animate-pulse">✓ Analisando suas respostas</p>
            <p className="animate-pulse delay-100">✓ Calculando necessidades nutricionais</p>
            <p className="animate-pulse delay-200">✓ Personalizando recomendações</p>
          </div>
        </>
      )}

      {showButtons && hasError && (
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
              className="w-full flex items-center justify-center gap-3 bg-[#4f6e2c] text-white font-semibold py-4 px-6 rounded-xl hover:brightness-90 transition-all active:scale-95"
            >
              <RefreshCw className="w-5 h-5" />
              Tentar novamente
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
