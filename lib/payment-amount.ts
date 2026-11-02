const DEFAULT_AMOUNT = "39.90"

/**
 * `PAYMENT_AMOUNT` para exibir (preço no quiz, valor do Pixel), ou 39.90 se ausente ou fora do formato. Não usa
 * `getEnv()`: a página não deve cair por causa de uma variável do backend que falte.
 */
export function paymentAmount(env: Record<string, string | undefined>): string {
  const amount = env.PAYMENT_AMOUNT
  return amount && /^\d+(\.\d{1,2})?$/.test(amount) ? amount : DEFAULT_AMOUNT
}
