const saoPauloDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
})

/** Data de `now` no fuso de São Paulo, como YYYY-MM-DD. */
export function todayInSaoPaulo(now: Date): string {
  return saoPauloDate.format(now)
}

const saoPauloHour = new Intl.DateTimeFormat("en-US", {
  timeZone: "America/Sao_Paulo",
  hour: "numeric",
  hourCycle: "h23",
})

/** Hora cheia de `now` no fuso de São Paulo, de 0 a 23. */
export function hourInSaoPaulo(now: Date): number {
  return Number(saoPauloHour.format(now))
}

/**
 * Instante UTC da meia-noite de São Paulo em `date` (YYYY-MM-DD). Usa o offset fixo -03:00: o Brasil
 * não tem horário de verão desde 2019, e o offset fixo evita depender dos dados de fuso do runtime.
 */
export function saoPauloDayStartUtc(date: string): Date {
  return new Date(`${date}T00:00:00-03:00`)
}

/** Soma `days` a uma data YYYY-MM-DD (aritmética em UTC). */
export function addDaysISO(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
