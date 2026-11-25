import { generateKeyPairSync } from "node:crypto"

// Par de chaves RSA gerado uma vez por processo de teste: a assinatura do JWT é conferida de verdade,
// com a chave pública, sem nenhuma chave fixa no repositório.
const { privateKey, publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 })

export const TEST_PRIVATE_KEY_PEM = privateKey.export({ type: "pkcs8", format: "pem" }).toString()
export const TEST_PUBLIC_KEY = publicKey

export const TEST_CLIENT_EMAIL = "tami-forms@projeto-teste.iam.gserviceaccount.com"

/** JSON da chave da conta de serviço no formato que o Google Cloud baixa. */
export function serviceAccountJson(over: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: "service_account",
    project_id: "projeto-teste",
    private_key_id: "abc123",
    private_key: TEST_PRIVATE_KEY_PEM,
    client_email: TEST_CLIENT_EMAIL,
    token_uri: "https://oauth2.googleapis.com/token",
    ...over,
  })
}
