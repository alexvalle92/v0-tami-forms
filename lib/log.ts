export type Logger = {
  info(event: string, fields?: Record<string, unknown>): void
  warn(event: string, fields?: Record<string, unknown>): void
  error(event: string, fields?: Record<string, unknown>): void
}

export function createLogger(write: (line: string) => void = console.log): Logger {
  const emit = (level: "info" | "warn" | "error") => (event: string, fields?: Record<string, unknown>) => {
    write(JSON.stringify({ ts: new Date().toISOString(), level, event, ...fields }))
  }
  return { info: emit("info"), warn: emit("warn"), error: emit("error") }
}

/** 05687104950 -> ***.***.*49-50 */
export function maskCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, "")
  if (digits.length !== 11) return "***.***.***-**"
  return `***.***.*${digits.slice(7, 9)}-${digits.slice(9)}`
}

/** alex@gmail.com -> a***@gmail.com */
export function maskEmail(email: string): string {
  const at = email.lastIndexOf("@")
  if (at < 1) return "***"
  return `${email[0]}***${email.slice(at)}`
}

/** 41999679512 -> ***9512 */
export function maskPhone(phone: string): string {
  const digits = phone.replace(/\D/g, "")
  return `***${digits.slice(-4)}`
}
