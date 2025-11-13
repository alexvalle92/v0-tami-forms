"use client"

import type { ReactNode } from "react"
import Image from "next/image"
import { StaticImageData } from "next/image"

interface QuizStepProps {
  kicker?: string
  title: string
  subtitle?: string
  image?: string | StaticImageData
  question?: string
  counter: string
  children: ReactNode
  onNext?: () => void
  onPrev?: () => void
  canGoBack?: boolean
  showNextButton?: boolean
}

export function QuizStep({
  kicker,
  title,
  subtitle,
  image,
  question,
  counter,
  children,
  onNext,
  onPrev,
  canGoBack = true,
  showNextButton = false,
}: QuizStepProps) {
  return (
    <div className="animate-fade-in relative">
      {kicker && <div className="text-[#4f6e2c] font-semibold text-sm md:text-base tracking-wide mb-2">{kicker}</div>}

      <h1 className="text-2xl md:text-4xl font-bold text-[#4f6e2c] leading-tight mb-4">{title}</h1>

      {subtitle && <p className="text-[#777] mb-4">{subtitle}</p>}

      {image && (
        <div className="relative w-full h-48 md:h-56 mb-6 rounded-xl overflow-hidden border border-[#e5e5e5]">
          <Image src={image || "/placeholder.svg"} alt="Quiz image" fill className="object-cover" />
        </div>
      )}

      {question && <h2 className="text-xl md:text-2xl font-semibold text-[#4f6e2c] mb-4">{question}</h2>}

      <div className="mb-6">{children}</div>

      <div className="flex justify-between items-center gap-3 mt-6">
        <button
          onClick={onPrev}
          disabled={!canGoBack}
          className="bg-[#bfbfbf] text-[#222] font-bold py-3 px-5 rounded-lg hover:bg-[#bb951c] hover:text-white transition-all disabled:opacity-50 disabled:cursor-not-allowed"
        >
          ← Voltar
        </button>

        {onNext && (
          <button
            onClick={onNext}
            className="bg-[#4f6e2c] text-white font-bold py-3 px-6 rounded-lg hover:brightness-90 transition-all shadow-md"
          >
            Continuar →
          </button>
        )}
      </div>

      <div className="text-center text-[#777] text-sm mt-4">{counter}</div>
      <div className="text-center text-[#8a8a8a] text-sm mt-2">
        Pressione <code className="bg-[#f1f1f1] rounded px-2 py-1">Enter ↵</code> para continuar
      </div>
    </div>
  )
}
