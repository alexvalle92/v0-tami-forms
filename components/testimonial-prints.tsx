"use client"

import { useCallback, useEffect, useState } from "react"
import Image, { type StaticImageData } from "next/image"
import useEmblaCarousel from "embla-carousel-react"
import * as Dialog from "@radix-ui/react-dialog"
import { Instagram, MessageCircle, X, ZoomIn } from "lucide-react"

export type TestimonialPrint = {
  /** Captura de tela da mensagem. Borre nome, foto e número de quem não autorizou aparecer. */
  src: string | StaticImageData
  source: "whatsapp" | "instagram"
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
    <div className="flex flex-col items-center gap-3">
      <button
        type="button"
        onClick={onOpen}
        aria-label={`Ampliar print ${index + 1}`}
        className="group relative w-full rounded-[26px] bg-[#1b1f24] p-1.5 shadow-[0_10px_28px_-10px_rgba(0,0,0,0.45)] transition-transform active:scale-[0.98]"
      >
        <div className="relative aspect-[9/16] rounded-[20px] overflow-hidden bg-white">
          <Image
            src={print.src}
            alt={`Depoimento por ${SOURCE[print.source].label} ${index + 1}`}
            fill
            sizes="(max-width: 448px) 60vw, 260px"
            className="object-contain"
          />
        </div>
        <span
          aria-hidden
          className="absolute bottom-3 right-3 w-8 h-8 rounded-full bg-white/90 text-[#2f4a18] flex items-center justify-center shadow-md group-hover:scale-110 transition-transform"
        >
          <ZoomIn className="w-4 h-4" />
        </span>
      </button>
      <SourceChip source={print.source} />
    </div>
  )
}

/**
 * Prints de mensagens de pacientes num carrossel de arrastar (o próximo aparece pela
 * beirada). Tocar num print abre ampliado, porque a letra do print fica pequena no celular.
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

  if (prints.length === 0) return null

  const zoomedPrint = zoomed === null ? null : prints[zoomed]

  return (
    <div>
      <div className="overflow-hidden -mx-1 px-1 py-2" ref={emblaRef}>
        <div className="flex -ml-4 touch-pan-y">
          {prints.map((print, i) => (
            <div key={i} className={`min-w-0 shrink-0 grow-0 pl-4 ${prints.length === 1 ? "basis-[70%] mx-auto" : "basis-[62%]"}`}>
              <PrintCard print={print} index={i} onOpen={() => setZoomed(i)} />
            </div>
          ))}
        </div>
      </div>

      {prints.length > 1 && (
        <div className="flex justify-center items-center gap-2 mt-4">
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

      <p className="text-xs text-gray-500 text-center mt-3">Toque no print para ampliar.</p>

      <Dialog.Root open={zoomedPrint !== null} onOpenChange={(open) => !open && setZoomed(null)}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-50 bg-black/85 animate-fade-in" />
          <Dialog.Content
            className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 p-4 outline-none"
            onClick={() => setZoomed(null)}
          >
            <Dialog.Title className="sr-only">Print do depoimento ampliado</Dialog.Title>
            <Dialog.Description className="sr-only">Toque fora da imagem ou no X para fechar.</Dialog.Description>
            {zoomedPrint && (
              <>
                <div className="relative w-full max-w-md h-[80vh]" onClick={(e) => e.stopPropagation()}>
                  <Image
                    src={zoomedPrint.src}
                    alt={`Depoimento por ${SOURCE[zoomedPrint.source].label}`}
                    fill
                    sizes="(max-width: 448px) 100vw, 448px"
                    className="object-contain rounded-xl"
                  />
                </div>
                <SourceChip source={zoomedPrint.source} />
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
