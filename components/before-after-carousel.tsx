"use client"

import { useCallback, useEffect, useState } from "react"
import Image, { type StaticImageData } from "next/image"
import useEmblaCarousel from "embla-carousel-react"
import { ArrowRight } from "lucide-react"

export type BeforeAfterResult = {
  /** Primeiro nome (ou iniciais) de quem autorizou a foto. */
  name: string
  /** Uma linha curta de contexto, ex.: "12 semanas de acompanhamento". */
  detail?: string
  before: string | StaticImageData
  after: string | StaticImageData
}

function Photo({ src, label, highlight }: { src: BeforeAfterResult["before"]; label: string; highlight?: boolean }) {
  return (
    <div className="relative aspect-[3/4] rounded-xl overflow-hidden bg-[#eef2e9]">
      <Image src={src} alt={label} fill sizes="(max-width: 448px) 45vw, 200px" className="object-cover" />
      <span
        className={`absolute top-2 left-2 text-[11px] font-bold uppercase tracking-wider px-2 py-1 rounded-full shadow-sm ${
          highlight ? "bg-[#4f6e2c] text-white" : "bg-white/90 text-[#555]"
        }`}
      >
        {label}
      </span>
    </div>
  )
}

function ResultCard({ result }: { result: BeforeAfterResult }) {
  return (
    <div className="bg-white rounded-2xl border border-[#e5e5e5] shadow-sm p-3">
      <div className="relative grid grid-cols-2 gap-2">
        <Photo src={result.before} label="Antes" />
        <Photo src={result.after} label="Depois" highlight />
        <div
          aria-hidden
          className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-9 h-9 rounded-full bg-[#bb951c] border-[3px] border-white shadow-md flex items-center justify-center"
        >
          <ArrowRight className="w-4 h-4 text-white" />
        </div>
      </div>
      <div className="pt-3 px-1">
        <p className="font-semibold text-[#2f4a18]">{result.name}</p>
        {result.detail && <p className="text-sm text-gray-600">{result.detail}</p>}
      </div>
    </div>
  )
}

/**
 * Fotos de antes e depois. Com um resultado, mostra um card fixo; com mais, vira um
 * carrossel em que o próximo card aparece pela beirada, para indicar que dá para arrastar.
 */
export function BeforeAfterCarousel({ results }: { results: BeforeAfterResult[] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start", containScroll: "trimSnaps" })
  const [selected, setSelected] = useState(0)

  const onSelect = useCallback(() => {
    if (emblaApi) setSelected(emblaApi.selectedScrollSnap())
  }, [emblaApi])

  useEffect(() => {
    if (!emblaApi) return
    onSelect()
    emblaApi.on("select", onSelect).on("reInit", onSelect)
    return () => {
      emblaApi.off("select", onSelect).off("reInit", onSelect)
    }
  }, [emblaApi, onSelect])

  if (results.length === 0) return null

  const footnote = (
    <p className="text-xs text-gray-500 text-center mt-3">Resultados individuais podem variar de pessoa para pessoa.</p>
  )

  if (results.length === 1) {
    return (
      <div>
        <ResultCard result={results[0]} />
        {footnote}
      </div>
    )
  }

  return (
    <div>
      <div className="overflow-hidden -mx-1 px-1 py-1" ref={emblaRef}>
        <div className="flex -ml-3 touch-pan-y">
          {results.map((result, i) => (
            <div key={i} className="min-w-0 shrink-0 grow-0 basis-[86%] pl-3">
              <ResultCard result={result} />
            </div>
          ))}
        </div>
      </div>

      <div className="flex justify-center items-center gap-2 mt-4">
        {results.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Ver resultado ${i + 1}`}
            aria-current={i === selected}
            onClick={() => emblaApi?.scrollTo(i)}
            className={`h-2 rounded-full transition-all ${
              i === selected ? "w-6 bg-[#4f6e2c]" : "w-2 bg-[#cfd9c3] hover:bg-[#a9bb94]"
            }`}
          />
        ))}
      </div>
      {footnote}
    </div>
  )
}
