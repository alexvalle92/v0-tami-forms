"use client"

import type { ReactNode } from "react"
import Image from "next/image"
import { StaticImageData } from "next/image"

interface QuizStepProps {
  kicker?: string
  title: string
  subtitle?: ReactNode
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
      {kicker && <div className="text-[#4f6e2c] font-bold text-xs md:text-sm tracking-wider uppercase mb-3">{kicker}</div>}

      <h1 className="text-2xl md:text-3xl lg:text-4xl font-bold text-[#2f4a18] leading-tight mb-4 text-balance">{title}</h1>

      {subtitle && <p className="text-[#555] text-base md:text-lg mb-5 leading-relaxed">{subtitle}</p>}

      {image && (
        <div className="relative w-full h-48 md:h-64 mb-6 rounded-xl overflow-hidden border-2 border-[#e5e5e5] shadow-sm">
          <Image src={image || "/placeholder.svg"} alt="Quiz image" fill className="object-cover" />
        </div>
      )}

      {question && <h2 className="text-lg md:text-xl lg:text-2xl font-semibold text-[#2f4a18] mb-5">{question}</h2>}

      <div className="mb-8">{children}</div>

      <div className="flex justify-between items-center gap-4 mt-8 pt-6 border-t border-[#e5e5e5]">
        <button
          onClick={onPrev}
          disabled={!canGoBack}
          className="bg-[#e5e5e5] text-[#333] font-semibold py-3 px-6 md:py-4 md:px-8 rounded-lg hover:bg-[#bb951c] hover:text-white transition-all disabled:opacity-40 disabled:cursor-not-allowed min-h-[48px] flex items-center gap-2 hover:scale-105 active:scale-95"
        >
          <span className="text-lg">←</span>
          <span className="hidden sm:inline">Voltar</span>
        </button>

        {onNext && (
          <button
            onClick={onNext}
            className="bg-[#4f6e2c] text-white font-bold py-3 px-6 md:py-4 md:px-8 rounded-lg hover:brightness-110 transition-all shadow-md hover:shadow-lg min-h-[48px] flex items-center gap-2 hover:scale-105 active:scale-95"
          >
            <span>Continuar</span>
            <span className="text-lg">→</span>
          </button>
        )}
      </div>

      <div className="text-center text-[#888] text-sm md:text-base font-medium mt-4 py-2">{counter}</div>
    </div>
  )
}
