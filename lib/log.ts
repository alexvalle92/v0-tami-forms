export type Logger = {
  info(event: string, fields?: Record<string, unknown>): void
  warn(event: string, fields?: Record<string, unknown>): void
  error(event: string, fields?: Record<string, unknown>): void
}

type Level = "info" | "warn" | "error"

const SECRET_KEY = /token|authorization|apikey|api_key|password|secret/i

/** Rede de segurança (spec §11): só o nível superior, sem recursão. */
function redact(fields: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(fields)) {
    const k = key.toLowerCase()
    if (SECRET_KEY.test(k)) out[key] = "[REDACTED]"
    else if (typeof value !== "string") out[key] = value
    else if (k === "cpf") out[key] = maskCpf(value)
    else if (k === "email") out[key] = maskEmail(value)
    else if (k === "phone" || k === "telefone" || k === "whatsapp") out[key] = maskPhone(value)
    else out[key] = value
  }
  return out
}

function replacer(_key: string, value: unknown): unknown {
  if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack }
  if (typeof value === "bigint") return value.toString()
  return value
}

export function createLogger(write: (line: string) => void = console.log): Logger {
  const emit = (level: Level) => (event: string, fields?: Record<string, unknown>) => {
    const ts = new Date().toISOString()
    let line: string
    try {
      line = JSON.stringify({ ...redact(fields ?? {}), ts, level, event }, replacer)
    } catch {
      line = JSON.stringify({ ts, level, event, logError: true })
    }
    write(line)
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
