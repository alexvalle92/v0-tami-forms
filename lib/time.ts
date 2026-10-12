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

/** Soma `days` a uma data YYYY-MM-DD (aritmética em UTC). */
export function addDaysISO(date: string, days: number): string {
  const d = new Date(`${date}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
