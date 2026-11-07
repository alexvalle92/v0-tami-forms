import { z } from "zod"
import { parseSubmitMeta, type SubmitMetaInput } from "@/lib/meta/events"

export type ParsedSubmission = {
  submissionId: string
  patient: { name: string; cpf: string; email: string; phone: string }
  answers: Record<string, unknown>
  /** Atribuição da Meta, quando o navegador mandou e ela é válida. */
  meta?: SubmitMetaInput
}

export function isValidCpf(raw: string): boolean {
  const cpf = raw.replace(/\D/g, "")
  if (cpf.length !== 11) return false
  if (/^(\d)\1+$/.test(cpf)) return false

  const checkDigit = (length: number): number => {
    let sum = 0
    for (let i = 0; i < length; i++) {
      sum += Number.parseInt(cpf.charAt(i), 10) * (length + 1 - i)
    }
    const digit = 11 - (sum % 11)
    return digit >= 10 ? 0 : digit
  }

  return checkDigit(9) === Number.parseInt(cpf.charAt(9), 10) && checkDigit(10) === Number.parseInt(cpf.charAt(10), 10)
}

export function normalizePhone(raw: string): string | null {
  let digits = raw.replace(/\D/g, "")
  if ((digits.length === 12 || digits.length === 13) && digits.startsWith("55")) {
    digits = digits.slice(2)
  }
  return digits.length === 10 || digits.length === 11 ? digits : null
}

/**
 * Com `allowEmptyPhone`, `whatsapp` igual a `""` é aceito (paciente cadastrado pelo admin sem
 * telefone); um valor preenchido continua precisando ser um telefone válido.
 */
function buildBodySchema(allowEmptyPhone: boolean) {
  const answersSchema = z
    .object({
      nome_completo: z.string().trim().min(1, "nome_completo obrigatório").max(200, "nome_completo muito longo"),
      email: z.string().trim().toLowerCase().email("email inválido").max(254, "email muito longo"),
      whatsapp: z
        .string()
        .refine((v) => (v === "" ? allowEmptyPhone : normalizePhone(v) !== null), "whatsapp inválido"),
      cpf: z.string().refine(isValidCpf, "cpf inválido"),
    })
    .passthrough()

  return z.object({
    submissionId: z.string().uuid("submissionId deve ser um UUID"),
    answers: answersSchema,
  })
}

const defaultBodySchema = buildBodySchema(false)
const emptyPhoneBodySchema = buildBodySchema(true)

export function parseSubmitRequest(
  body: unknown,
  opts: { allowEmptyPhone?: boolean } = {},
): { ok: true; value: ParsedSubmission } | { ok: false; issues: string[] } {
  const parsed = (opts.allowEmptyPhone ? emptyPhoneBodySchema : defaultBodySchema).safeParse(body)
  if (!parsed.success) {
    // Só caminho e mensagem: nunca ecoar valores recebidos (dados pessoais).
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`),
    }
  }

  const { submissionId, answers } = parsed.data
  const meta = parseSubmitMeta((body as { meta?: unknown }).meta)
  return {
    ok: true,
    value: {
      submissionId,
      patient: {
        name: answers.nome_completo,
        email: answers.email,
        phone: answers.whatsapp === "" ? "" : (normalizePhone(answers.whatsapp) as string),
        cpf: answers.cpf.replace(/\D/g, ""),
      },
      // Objeto original completo, sem as transformações de trim/lowercase.
      answers: (body as { answers: Record<string, unknown> }).answers,
      ...(meta ? { meta } : {}),
    },
  }
}
