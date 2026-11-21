"use client"

import { useCallback, useEffect, useState } from "react"
import Image, { type StaticImageData } from "next/image"
import useEmblaCarousel from "embla-carousel-react"
import * as Dialog from "@radix-ui/react-dialog"
import { ChevronLeft, ChevronRight, Instagram, MessageCircle, X, ZoomIn } from "lucide-react"

export type TestimonialPrint = {
  /** Captura de tela da mensagem. Borre nome, foto e número de quem não autorizou aparecer. */
  src: string | StaticImageData
  source: "whatsapp" | "instagram"
  /** Resumo do que o print diz, para leitores de tela. */
  alt?: string
}

const SOURCE = {
  whatsapp: {
    label: "WhatsApp",
    Icon: MessageCircle,
    chip: "bg-[#25D366] text-white",
  },
  instagram: {
    label: "Instagram",
    Icon: Instagram,
    chip: "bg-gradient-to-r from-[#f58529] via-[#dd2a7b] to-[#8134af] text-white",
  },
} as const

function altFor(print: TestimonialPrint, index: number) {
  return print.alt ?? `Depoimento por ${SOURCE[print.source].label} ${index + 1}`
}

function SourceChip({ source }: { source: TestimonialPrint["source"] }) {
  const { label, Icon, chip } = SOURCE[source]
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full shadow-sm ${chip}`}
    >
      <Icon className="w-3.5 h-3.5" aria-hidden />
      {label}
    </span>
  )
}

function PrintCard({ print, index, onOpen }: { print: TestimonialPrint; index: number; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-label={`Ampliar print ${index + 1}`}
      className="group block w-full text-left rounded-2xl overflow-hidden bg-[#111b21] ring-1 ring-black/10 shadow-[0_12px_30px_-12px_rgba(0,0,0,0.5)] transition-transform active:scale-[0.98]"
    >
      <span className="relative block aspect-[7/10]">
        <Image
          src={print.src}
          alt={altFor(print, index)}
          fill
          sizes="(max-width: 448px) 78vw, 340px"
          className="object-contain"
        />
      </span>
      {/* Etiqueta e "ampliar" numa faixa abaixo do print, para não cobrir nada da conversa */}
      <span className="flex items-center justify-between gap-2 px-3 py-2.5 border-t border-white/10">
        <SourceChip source={print.source} />
        <span
          aria-hidden
          className="inline-flex items-center gap-1 text-xs font-semibold text-white/85 group-hover:text-white transition-colors"
        >
          <ZoomIn className="w-4 h-4" />
          Ampliar
        </span>
      </span>
    </button>
  )
}

/**
 * Prints de mensagens de pacientes num carrossel de arrastar (o próximo aparece pela
 * beirada). Tocar num print abre ampliado, com setas para passar aos outros, porque a
 * letra do print fica pequena no celular.
 */
export function TestimonialPrints({ prints }: { prints: TestimonialPrint[] }) {
  const [emblaRef, emblaApi] = useEmblaCarousel({ align: "start", containScroll: "trimSnaps" })
  const [selected, setSelected] = useState(0)
  const [zoomed, setZoomed] = useState<number | null>(null)

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

  const step = useCallback(
    (delta: number) => setZoomed((i) => (i === null ? i : (i + delta + prints.length) % prints.length)),
    [prints.length],
  )

  // Ao fechar a ampliação, o carrossel fica no último print visto.
  const close = () => {
    if (zoomed !== null) emblaApi?.scrollTo(zoomed)
    setZoomed(null)
  }

  if (prints.length === 0) return null

  const zoomedPrint = zoomed === null ? null : prints[zoomed]
  const many = prints.length > 1

  return (
    <div>
      <div className="overflow-hidden -mx-1 px-1 py-2" ref={emblaRef}>
        <div className="flex -ml-3 touch-pan-y">
          {prints.map((print, i) => (
            <div key={i} className={`min-w-0 shrink-0 grow-0 pl-3 ${many ? "basis-[78%]" : "basis-[85%] mx-auto"}`}>
              <PrintCard print={print} index={i} onOpen={() => setZoomed(i)} />
            </div>
          ))}
        </div>
      </div>

      {many && (
        <div className="flex justify-center items-center gap-2 mt-3">
          {prints.map((_, i) => (
            <button
              key={i}
              type="button"
              aria-label={`Ver print ${i + 1}`}
              aria-current={i === selected}
              onClick={() => emblaApi?.scrollTo(i)}
              className={`h-2 rounded-full transition-all ${
                i === selected ? "w-6 bg-[#4f6e2c]" : "w-2 bg-[#cfd9c3] hover:bg-[#a9bb94]"
              }`}
            />
          ))}
        </div>
      )}

      <p className="text-xs text-gray-500 text-center mt-3">
        Mensagens reais de pacientes. Resultados individuais podem variar de pessoa para pessoa.
      </p>

      <Dialog.Root open={zoomedPrint !== null} onOpenChange={(open) => !open && close()}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/90 animate-fade-in" />
          <Dialog.Content
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 p-4 outline-none"
            onClick={close}
            onKeyDown={(e) => {
              if (!many) return
              if (e.key === "ArrowRight") step(1)
              if (e.key === "ArrowLeft") step(-1)
            }}
          >
            <Dialog.Title className="sr-only">Print do depoimento ampliado</Dialog.Title>
            <Dialog.Description className="sr-only">
              {zoomedPrint ? altFor(zoomedPrint, zoomed!) : ""}. Toque fora da imagem ou no X para fechar.
            </Dialog.Description>

            {zoomedPrint && (
              <>
                <div
                  key={zoomed}
                  className="relative w-full max-w-md h-[78vh] animate-fade-in"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Image
                    src={zoomedPrint.src}
                    alt={altFor(zoomedPrint, zoomed!)}
                    fill
                    sizes="(max-width: 448px) 100vw, 448px"
                    className="object-contain"
                  />
                </div>

                <div className="flex items-center gap-4" onClick={(e) => e.stopPropagation()}>
                  {many && (
                    <button
                      type="button"
                      aria-label="Print anterior"
                      onClick={() => step(-1)}
                      className="w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center"
                    >
                      <ChevronLeft className="w-6 h-6" />
                    </button>
                  )}
                  <div className="flex flex-col items-center gap-1.5">
                    <SourceChip source={zoomedPrint.source} />
                    {many && (
                      <span className="text-xs text-white/70">
                        {zoomed! + 1} de {prints.length}
                      </span>
                    )}
                  </div>
                  {many && (
                    <button
                      type="button"
                      aria-label="Próximo print"
                      onClick={() => step(1)}
                      className="w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center"
                    >
                      <ChevronRight className="w-6 h-6" />
                    </button>
                  )}
                </div>
              </>
            )}

            <Dialog.Close
              aria-label="Fechar"
              className="absolute top-4 right-4 w-11 h-11 rounded-full bg-white/15 hover:bg-white/25 text-white flex items-center justify-center"
            >
              <X className="w-6 h-6" />
            </Dialog.Close>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
