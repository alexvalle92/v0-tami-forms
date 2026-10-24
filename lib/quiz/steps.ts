// Etapas do quiz com slug estável. Os eventos do funil gravam o índice e o slug;
// a comparação ao longo do tempo é feita pelo slug. Quando entrar uma pergunta nova,
// ela ganha um slug novo e as outras mantêm o seu.

export type QuizStepDef = { slug: string; answerKey?: string }

export const QUIZ_STEPS: readonly QuizStepDef[] = [
  { slug: "faixa_etaria", answerKey: "faixa_etaria" },
  { slug: "sexo_biologico", answerKey: "sexo_biologico" },
  { slug: "tipo_fisico", answerKey: "tipo_fisico" },
  { slug: "info_expectativa" },
  { slug: "peso_comportamento", answerKey: "peso_comportamento" },
  { slug: "info_prepare_se" },
  { slug: "cafe_manha", answerKey: "breakfast_foods" },
  { slug: "almoco", answerKey: "almoco" },
  { slug: "lanche_tarde", answerKey: "lanche_tarde" },
  { slug: "jantar", answerKey: "jantar" },
  { slug: "sobremesa", answerKey: "sobremesa" },
  { slug: "info_equilibrio" },
  { slug: "rotina_dia", answerKey: "rotina_dia" },
  { slug: "sono", answerKey: "sono" },
  { slug: "agua", answerKey: "agua" },
  { slug: "habitos", answerKey: "habitos" },
  { slug: "info_resultados" },
  { slug: "info_nutricionista" },
  { slug: "altura" },
  { slug: "peso" },
  { slug: "meta_peso" },
  // Derivada: a faixa do IMC, nunca o número.
  { slug: "perfil_imc", answerKey: "imc_faixa" },
  { slug: "info_rumo_objetivo" },
  { slug: "email" },
  { slug: "whatsapp" },
  { slug: "nome" },
  { slug: "cpf" },
  { slug: "envio" },
  { slug: "checkout" },
]

export const LAST_STEP = 28

export const ALLOWED_ANSWER_KEYS: readonly string[] = QUIZ_STEPS.flatMap((s) => (s.answerKey ? [s.answerKey] : []))

export function stepSlug(step: number): string | undefined {
  return QUIZ_STEPS[step]?.slug
}

export function answerKeyForSlug(slug: string): string | undefined {
  return QUIZ_STEPS.find((s) => s.slug === slug)?.answerKey
}

export type BmiBand = "abaixo" | "normal" | "sobrepeso" | "obesidade"

export function bmiBand(imc: unknown): BmiBand | undefined {
  const n = typeof imc === "number" ? imc : typeof imc === "string" ? Number.parseFloat(imc) : Number.NaN
  if (!Number.isFinite(n) || n <= 0) return undefined
  if (n < 18.5) return "abaixo"
  if (n < 25) return "normal"
  if (n < 30) return "sobrepeso"
  return "obesidade"
}

const MAX_ANSWER_LENGTH = 80
const MAX_ANSWER_ITEMS = 15

function isAnswerString(value: unknown): value is string {
  return typeof value === "string" && value.length >= 1 && value.length <= MAX_ANSWER_LENGTH
}

// Aceita string de 1 a 80 caracteres, ou array de 1 a 15 strings nesse mesmo limite.
export function sanitizeAnswer(value: unknown): string | string[] | undefined {
  if (isAnswerString(value)) return value
  if (Array.isArray(value) && value.length >= 1 && value.length <= MAX_ANSWER_ITEMS && value.every(isAnswerString)) {
    return [...value]
  }
  return undefined
}
