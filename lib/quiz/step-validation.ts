// Validação por etapa. A regra e a mensagem ficam juntas, num só lugar, para o modal
// de erro e o evento validation_error não divergirem.

export type ValidationReason = "vazio" | "email_invalido" | "telefone_invalido" | "cpf_invalido"

export function validateCPF(cpf: string): boolean {
  // Remove formatting
  const cleanCPF = cpf.replace(/\D/g, "")

  // Check if has 11 digits
  if (cleanCPF.length !== 11) return false

  // Check if all digits are the same
  if (/^(\d)\1+$/.test(cleanCPF)) return false

  // Validate first check digit
  let sum = 0
  for (let i = 0; i < 9; i++) {
    sum += Number.parseInt(cleanCPF.charAt(i)) * (10 - i)
  }
  let checkDigit = 11 - (sum % 11)
  if (checkDigit === 10 || checkDigit === 11) checkDigit = 0
  if (checkDigit !== Number.parseInt(cleanCPF.charAt(9))) return false

  // Validate second check digit
  sum = 0
  for (let i = 0; i < 10; i++) {
    sum += Number.parseInt(cleanCPF.charAt(i)) * (11 - i)
  }
  checkDigit = 11 - (sum % 11)
  if (checkDigit === 10 || checkDigit === 11) checkDigit = 0
  if (checkDigit !== Number.parseInt(cleanCPF.charAt(10))) return false

  return true
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

type StepValidationResult = { message: string; reason: ValidationReason }

const vazio = (message: string): StepValidationResult => ({ message, reason: "vazio" })

const SELECT_ONE = "Por favor, selecione uma opção antes de continuar."

// null = pode avançar.
export function stepValidation(step: number, answers: Record<string, any>): StepValidationResult | null {
  switch (step) {
    case 0:
      return answers.faixa_etaria ? null : vazio(SELECT_ONE)
    case 1:
      return answers.sexo_biologico ? null : vazio(SELECT_ONE)
    case 2:
      return answers.tipo_fisico ? null : vazio(SELECT_ONE)
    case 4:
      return answers.peso_comportamento ? null : vazio(SELECT_ONE)
    case 6:
      return answers.breakfast_foods && answers.breakfast_foods.length > 0
        ? null
        : vazio("Por favor, selecione pelo menos uma opção para o seu café da manhã.")
    case 7:
      return answers.almoco && answers.almoco.length > 0
        ? null
        : vazio("Por favor, selecione pelo menos uma opção para o seu almoço.")
    case 8:
      return answers.lanche_tarde ? null : vazio(SELECT_ONE)
    case 9:
      return answers.jantar && answers.jantar.length > 0
        ? null
        : vazio("Por favor, selecione pelo menos uma opção para o seu jantar.")
    case 10:
      return answers.sobremesa ? null : vazio(SELECT_ONE)
    case 12:
      return answers.rotina_dia ? null : vazio(SELECT_ONE)
    case 13:
      return answers.sono ? null : vazio(SELECT_ONE)
    case 14:
      return answers.agua ? null : vazio(SELECT_ONE)
    case 15:
      return answers.habitos && answers.habitos.length > 0
        ? null
        : vazio("Por favor, selecione pelo menos uma opção de hábito alimentar.")
    case 18:
      return answers.altura_cm ? null : vazio("Por favor, selecione sua altura antes de continuar.")
    case 19:
      return answers.peso_kg ? null : vazio("Por favor, informe seu peso atual para continuar.")
    case 20:
      return answers.meta_peso_30d ? null : vazio("Por favor, defina sua meta de peso para continuar.")
    case 23:
      if (!answers.email) return vazio("Por favor, informe seu e-mail para continuar.")
      if (!EMAIL_REGEX.test(answers.email)) {
        return {
          reason: "email_invalido",
          message: "Por favor, insira um e-mail válido (exemplo: seuemail@exemplo.com)",
        }
      }
      return null
    case 24:
      if (!answers.whatsapp) return vazio("Por favor, informe seu número de WhatsApp.")
      if (answers.whatsapp.replace(/\D/g, "").length < 10) {
        return {
          reason: "telefone_invalido",
          message: "Por favor, insira um telefone válido com DDD (exemplo: (11) 98765-4321)",
        }
      }
      return null
    case 25:
      return answers.nome_completo && answers.nome_completo.trim().length > 0
        ? null
        : vazio("Por favor, informe seu nome completo para continuar.")
    case 26:
      if (!answers.cpf) return vazio("Por favor, informe seu CPF para continuar.")
      if (answers.cpf.replace(/\D/g, "").length !== 11) {
        return { reason: "cpf_invalido", message: "Por favor, insira um CPF válido com 11 dígitos." }
      }
      if (!validateCPF(answers.cpf)) {
        return {
          reason: "cpf_invalido",
          message: "CPF inválido. Por favor, verifique os dados e tente novamente.",
        }
      }
      return null
    default:
      // 3, 5, 11, 16, 17, 21, 22, 27, 28: informativas, cálculo ou envio.
      return null
  }
}
