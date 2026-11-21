"use client"

import { useEffect, useState } from "react"
import { Heart, Quote, Star } from "lucide-react"

export type Testimonial = {
  /** Iniciais de quem deu o depoimento, ex.: "M.S.". Sem elas, o círculo mostra um coração. */
  initials?: string
  text: string
}

const INTERVAL_MS = 4000

/** Cópia embaralhada da lista (Fisher-Yates). A original não muda. */
export function shuffled<T>(list: readonly T[], random: () => number = Math.random): T[] {
  const out = [...list]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

function Stars() {
  return (
    <div className="flex gap-0.5" aria-label="5 de 5 estrelas" role="img">
      {Array.from({ length: 5 }, (_, i) => (
        <Star key={i} className="w-4 h-4 fill-[#d4ab45] text-[#d4ab45]" aria-hidden />
      ))}
    </div>
  )
}

/**
 * Depoimentos em texto que trocam sozinhos a cada 4 s. Todos os cards ocupam a mesma
 * célula do grid, então a altura é a do maior texto e a tela não pula na troca.
 *
 * Com `shuffle`, a ordem é sorteada a cada vez que o componente aparece. Como só cabem uns
 * 4 depoimentos no tempo de carregamento, cada pessoa vê uma seleção diferente. Só use
 * `shuffle` onde o componente não vem renderizado do servidor (a tela de carregamento só
 * aparece depois de responder o quiz), senão a ordem do servidor e do navegador não bate.
 */
export function TestimonialRotator({
  testimonials: source,
  shuffle = false,
}: {
  testimonials: Testimonial[]
  shuffle?: boolean
}) {
  // sorteado uma vez por montagem: a ordem não muda enquanto a tela está aberta
  const [testimonials] = useState(() => (shuffle ? shuffled(source) : source))
  const [active, setActive] = useState(0)

  useEffect(() => {
    if (testimonials.length < 2) return
    const id = setInterval(() => setActive((i) => (i + 1) % testimonials.length), INTERVAL_MS)
    return () => clearInterval(id)
  }, [testimonials.length, active])

  if (testimonials.length === 0) return null

  return (
    <section className="w-full max-w-md mt-8" aria-roledescription="carrossel" aria-label="Depoimentos de pacientes">
      <p className="text-center text-xs font-bold uppercase tracking-wider text-[#bb951c] mb-3">
        O que dizem minhas pacientes
      </p>

      <div className="grid">
        {testimonials.map((t, i) => {
          const isActive = i === active
          return (
            <figure
              key={i}
              aria-hidden={!isActive}
              data-testimonial
              className={`[grid-area:1/1] relative bg-white rounded-2xl border border-[#e5e5e5] shadow-[0_6px_24px_-8px_rgba(47,74,24,0.25)] p-5 pt-6 transition-all duration-700 ease-out motion-reduce:transition-none ${
                isActive ? "opacity-100 translate-y-0" : "opacity-0 translate-y-2 pointer-events-none"
              }`}
            >
              <div
                aria-hidden
                className="absolute -top-4 left-5 w-8 h-8 rounded-full bg-gradient-to-br from-[#d4ab45] to-[#a8841a] flex items-center justify-center shadow-md"
              >
                <Quote className="w-4 h-4 text-white fill-white" />
              </div>

              <Stars />

              <blockquote className="mt-3 text-[15px] leading-relaxed text-gray-700 italic">“{t.text}”</blockquote>

              <figcaption className="mt-4 flex items-center gap-3">
                <span className="w-10 h-10 rounded-full bg-gradient-to-br from-[#4f6e2c] to-[#6a8f3a] text-white text-sm font-bold flex items-center justify-center flex-shrink-0 shadow-sm">
                  {t.initials || <Heart className="w-4 h-4 fill-white" aria-hidden />}
                </span>
                <span className="text-sm">
                  <span className="block font-semibold text-[#2f4a18]">Paciente da Dra. Tâmili</span>
                  <span className="block text-gray-500">Plano alimentar personalizado</span>
                </span>
              </figcaption>
            </figure>
          )
        })}
      </div>

      {testimonials.length > 1 && (
        <div className="flex justify-center items-center gap-2 mt-4">
          {testimonials.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Ver depoimento ${i + 1}`}
              aria-current={i === active}
              onClick={() => setActive(i)}
              className={`h-2 rounded-full transition-all ${
                i === active ? "w-6 bg-[#4f6e2c]" : "w-2 bg-[#cfd9c3] hover:bg-[#a9bb94]"
              }`}
            />
          ))}
        </div>
      )}
    </section>
  )
}
