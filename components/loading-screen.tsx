"use client"

import { useEffect, useState } from "react"

interface LoadingScreenProps {
  onComplete: () => void
}

export function LoadingScreen({ onComplete }: LoadingScreenProps) {
  const [progress, setProgress] = useState(0)

  useEffect(() => {
    const interval = setInterval(() => {
      setProgress((prev) => {
        if (prev >= 100) {
          clearInterval(interval)
          setTimeout(() => onComplete(), 1000)
          return 100
        }
        return prev + 1
      })
    }, 100)

    return () => clearInterval(interval)
  }, [onComplete])

  return (
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
        Montando seu plano personalizado...
      </h2>

      <div className="space-y-2 text-center text-[#555]">
        <p className="animate-pulse">✓ Analisando suas respostas</p>
        <p className="animate-pulse delay-100">✓ Calculando necessidades nutricionais</p>
        <p className="animate-pulse delay-200">✓ Personalizando recomendações</p>
      </div>
    </div>
  )
}
