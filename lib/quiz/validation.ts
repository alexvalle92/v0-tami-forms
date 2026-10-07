import { z } from "zod"

export type ParsedSubmission = {
  submissionId: string
  patient: { name: string; cpf: string; email: string; phone: string }
  answers: Record<string, unknown>
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

const answersSchema = z
  .object({
    nome_completo: z.string().trim().min(1, "nome_completo obrigatório").max(200, "nome_completo muito longo"),
    email: z.string().trim().toLowerCase().email("email inválido").max(254, "email muito longo"),
    whatsapp: z.string().refine((v) => normalizePhone(v) !== null, "whatsapp inválido"),
    cpf: z.string().refine(isValidCpf, "cpf inválido"),
  })
  .passthrough()

const bodySchema = z.object({
  submissionId: z.string().uuid("submissionId deve ser um UUID"),
  answers: answersSchema,
})

export function parseSubmitRequest(
  body: unknown,
): { ok: true; value: ParsedSubmission } | { ok: false; issues: string[] } {
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    // Só caminho e mensagem: nunca ecoar valores recebidos (dados pessoais).
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => `${i.path.join(".") || "body"}: ${i.message}`),
    }
  }

  const { submissionId, answers } = parsed.data
  return {
    ok: true,
    value: {
      submissionId,
      patient: {
        name: answers.nome_completo,
        email: answers.email,
        phone: normalizePhone(answers.whatsapp) as string,
        cpf: answers.cpf.replace(/\D/g, ""),
      },
      // Objeto original completo, sem as transformações de trim/lowercase.
      answers: (body as { answers: Record<string, unknown> }).answers,
    },
  }
}
