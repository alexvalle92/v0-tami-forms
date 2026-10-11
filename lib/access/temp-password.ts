import { createHmac } from "node:crypto"

/** 32 símbolos (maiúsculas e dígitos, sem 0, 1, I e O): `byte % 32` não introduz viés. */
const ALPHABET = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"
const LENGTH = 10

/**
 * Senha temporária do paciente (§8). Derivada, não sorteada: o mesmo paciente recebe sempre a mesma senha,
 * então nenhuma senha em texto puro é gravada. Trocar o `secret` invalida as senhas ainda não usadas.
 */
export function deriveTempPassword(secret: string, patientId: string): string {
  // Segredo ou id vazios gerariam uma senha previsível. A mensagem não inclui nenhum dos valores.
  if (!secret) throw new Error("deriveTempPassword: segredo vazio")
  if (!patientId) throw new Error("deriveTempPassword: id do paciente vazio")

  const digest = createHmac("sha256", secret).update(`temp-password:v1:${patientId}`).digest()
  let password = ""
  for (let i = 0; i < LENGTH; i++) password += ALPHABET[digest[i] % ALPHABET.length]
  return password
}
