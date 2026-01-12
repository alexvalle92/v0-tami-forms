"use client"

import { useEffect, useState } from "react"
import { CheckCircle, Mail, Clock } from "lucide-react"

export default function ConfirmationPage() {
  const [userName, setUserName] = useState("Cliente")

  useEffect(() => {
    // Get user name from sessionStorage
    const storedAnswers = sessionStorage.getItem("quizAnswers")
    if (storedAnswers) {
      try {
        const answers = JSON.parse(storedAnswers)
        if (answers.nome_completo) {
          // Get first name only
          const firstName = answers.nome_completo.split(" ")[0]
          setUserName(firstName)
        }
      } catch (error) {
        console.error("Error parsing answers:", error)
      }
    }
  }, [])

  return (
    <div className="min-h-screen bg-[#f7f7f7] flex items-center justify-center p-4">
      <div className="w-full max-w-[880px] bg-white rounded-[18px] shadow-[0_12px_40px_rgba(0,0,0,0.08)] overflow-hidden">
        <div className="p-8 md:p-12">
          <div className="flex flex-col items-center text-center space-y-6">
            {/* Success Icon */}
            <div className="w-24 h-24 bg-gradient-to-br from-[#4f6e2c] to-[#6a9338] rounded-full flex items-center justify-center animate-bounce-slow">
              <CheckCircle className="w-14 h-14 text-white" strokeWidth={2.5} />
            </div>

            {/* Main Title */}
            <h1 className="text-3xl md:text-4xl font-bold text-[#4f6e2c] leading-tight">
              Recebemos seu formulário, {userName}!
            </h1>

            {/* Description */}
            <div className="space-y-4 max-w-2xl">
              <p className="text-lg md:text-xl text-gray-700 leading-relaxed">
                Estamos muito felizes em ter você conosco nessa jornada de transformação.
              </p>

              <div className="bg-gradient-to-br from-[#f5f9f1] to-white border-2 border-[#e5f3dd] rounded-xl p-6 space-y-3">
                <div className="flex items-start gap-3">
                  <Mail className="w-6 h-6 text-[#4f6e2c] flex-shrink-0 mt-1" />
                  <p className="text-base md:text-lg text-gray-700 text-left">
                    <strong>Em alguns instantes</strong>, você receberá um <strong>e-mail</strong> com todas as
                    informações necessárias para:
                  </p>
                </div>

                <ul className="space-y-2 ml-9 text-left text-gray-700">
                  <li className="flex items-start gap-2">
                    <span className="text-[#4f6e2c] font-bold">•</span>
                    <span>Efetuar o pagamento do seu plano personalizado</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <span className="text-[#4f6e2c] font-bold">•</span>
                    <span>Acessar o aplicativo e começar sua transformação</span>
                  </li>
                </ul>
              </div>

              <div className="flex items-center justify-center gap-2 text-gray-600 mt-6">
                <Clock className="w-5 h-5 text-[#bb951c]" />
                <p className="text-sm md:text-base">Fique de olho na sua caixa de entrada e também na pasta de spam</p>
              </div>
            </div>

            {/* Footer Message */}
            <div className="mt-8 p-6 bg-gradient-to-r from-[#4f6e2c] to-[#6a9338] rounded-xl">
              <p className="text-white text-base md:text-lg font-medium">
                Estamos preparando tudo com muito carinho para você! 💚
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
