import type { Testimonial } from "@/components/testimonial-rotator"
import type { TestimonialPrint } from "@/components/testimonial-prints"

// Etapa 28 (tela de carregamento): depoimentos reais de pacientes. A ordem é sorteada a cada
// vez e eles trocam a cada 4 s; nos ~16 s de carregamento aparecem uns 4, então cada pessoa
// vê uma seleção diferente. Pode colocar quantos quiser. Textos curtos (até ~200 caracteres)
// leem melhor. `initials` é opcional ("M.S."); sem ela, o círculo mostra um coração.
export const LOADING_TESTIMONIALS: Testimonial[] = [
  // tirados dos prints de public/depoimentos/
  { text: "Nem acreditei que abaixei tudo isso! Não fico pensando na próxima refeição." },
  { text: "Fiquei feliz que estou tendo resultado 🥰 Minha autoestima está voltando, estou bem comigo mesma… nossa, eu estou feliz!" },
  { text: "Eu tô muito feliz!! Paro nada! Ninguém me para mais." },
  { text: "Achei que não iria conseguir, que ia sentir muita fome ou vontades. Mas foi muito bom, não sinto fome!" },
  // enviados pela Dra. Tâmili
  { text: "Ótima profissional. Em pouco tempo de acompanhamento, já percebi resultados no qual estava buscando 🤩" },
  { text: "Me ajudou demais no processo de emagrecimento, sem tirar o que mais gosto! :)" },
  { text: "Estou tendo ótimos resultados e me sentindo muito melhor desde que comecei" },
]

// Etapa 18 (Conheça sua nutricionista): prints de mensagens, na ordem em que aparecem
// (o primeiro é o que mais chama atenção). Para adicionar, coloque a imagem em
// public/depoimentos/ e inclua uma linha aqui. Prints em pé (~2:3) ficam melhores.
// Borre nome, foto e número de quem não autorizou aparecer.
export const NUTRI_PRINTS: TestimonialPrint[] = [
  {
    src: "/depoimentos/depoimentosWhats2.jpeg",
    source: "whatsapp",
    alt: "Paciente conta que nem acreditou no quanto emagreceu e que não fica mais pensando na próxima refeição: menos 2,9 kg em uma semana.",
  },
  {
    src: "/depoimentos/depoimentosInsta1.jpeg",
    source: "instagram",
    alt: "Paciente manda foto na balança e diz: eu tô muito feliz, ninguém me para mais.",
  },
  {
    src: "/depoimentos/depoimentosWhats3.jpeg",
    source: "whatsapp",
    alt: "Paciente mostra 60,8 kg na balança e diz que está se sentindo leve e que a autoestima está voltando.",
  },
  {
    src: "/depoimentos/depoimentosWhats1.jpeg",
    source: "whatsapp",
    alt: "Paciente diz que achou que ia sentir muita fome, mas não sente, e que agora presta atenção no que come.",
  },
]
