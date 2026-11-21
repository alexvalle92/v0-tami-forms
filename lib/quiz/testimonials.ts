import type { Testimonial } from "@/components/testimonial-rotator"
import type { TestimonialPrint } from "@/components/testimonial-prints"

// ⚠️ PROVISÓRIO: textos e prints de exemplo. Troque pelos depoimentos reais das pacientes
// antes de publicar. As iniciais em sequência (A.B., C.D., ...) marcam que ainda é exemplo.

// Etapa 28 (tela de carregamento): passam sozinhos a cada 4 s enquanto o plano é montado
// (~16 s, então de 4 a 6 depoimentos é o ideal). Textos curtos (até ~200 caracteres) leem melhor.
export const LOADING_TESTIMONIALS: Testimonial[] = [
  {
    initials: "A.B.",
    text: "Em 30 dias perdi 4 kg sem passar fome. O cardápio tem as comidas que eu já gostava!",
  },
  {
    initials: "C.D.",
    text: "Achei que dieta era sofrimento, mas o plano se encaixou certinho na minha rotina corrida.",
  },
  {
    initials: "E.F.",
    text: "Minha disposição mudou completamente. Durmo melhor e não sinto mais aquele cansaço à tarde.",
  },
  {
    initials: "G.H.",
    text: "As roupas voltaram a servir e minha autoestima foi lá em cima. Super recomendo a Dra. Tâmili!",
  },
  {
    initials: "I.J.",
    text: "O aplicativo facilita demais: abro e já sei o que comer em cada refeição.",
  },
]

// Etapa 18 (Conheça sua nutricionista): prints de mensagens. Para trocar, coloque a imagem
// em public/depoimentos/ e aponte o `src` para ela (ex.: "/depoimentos/whats-1.jpg").
// Borre nome, foto e número de quem não autorizou aparecer.
export const NUTRI_PRINTS: TestimonialPrint[] = [
  { src: "/depoimentos/exemplo-whatsapp-1.svg", source: "whatsapp" },
  { src: "/depoimentos/exemplo-instagram-1.svg", source: "instagram" },
  { src: "/depoimentos/exemplo-whatsapp-2.svg", source: "whatsapp" },
]
