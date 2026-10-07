const MAX_BODY_CHARS = 2048

export class HttpError extends Error {
  status?: number
  /** Texto da resposta, truncado em 2048 caracteres. Pode conter dados sensíveis: nunca logar. */
  body?: string
  /** true quando vale a pena tentar de novo (rede, timeout, 5xx, 429, deadline). */
  transient: boolean

  constructor(message: string, init: { transient: boolean; status?: number; body?: string }) {
    super(message)
    this.name = "HttpError"
    this.transient = init.transient
    this.status = init.status
    this.body = init.body
  }
}

export type RetryOptions = {
  timeoutMs?: number
  attempts?: number
  baseDelayMs?: number
  /** Instante limite (epoch ms) que nenhuma tentativa ou espera pode ultrapassar. */
  deadline?: number
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
  random?: () => number
  now?: () => number
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

async function readBody(response: Response): Promise<string | undefined> {
  try {
    return (await response.text()).slice(0, MAX_BODY_CHARS)
  } catch {
    return undefined
  }
}

/**
 * fetch com timeout por tentativa, retry exponencial com jitter e deadline.
 * Repete apenas em erro de rede, timeout, 5xx e 429. Não registra logs.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  opts: RetryOptions = {},
): Promise<Response> {
  const {
    timeoutMs = 8000,
    attempts = 3,
    baseDelayMs = 500,
    deadline,
    fetchImpl = fetch,
    sleep = defaultSleep,
    random = Math.random,
    now = Date.now,
  } = opts

  const deadlineExceeded = () => new HttpError("deadline exceeded", { transient: true })

  let lastError: HttpError | undefined

  for (let i = 0; i < attempts; i++) {
    let attemptTimeout = timeoutMs
    if (deadline !== undefined) {
      const remaining = deadline - now()
      if (remaining <= 0) throw deadlineExceeded()
      attemptTimeout = Math.min(timeoutMs, remaining)
    }

    const controller = new AbortController()
    let timedOut = false
    const timer = setTimeout(() => {
      timedOut = true
      controller.abort()
    }, attemptTimeout)

    try {
      const response = await fetchImpl(url, { ...init, signal: controller.signal })
      if (response.ok) return response

      const body = await readBody(response)
      const transient = response.status >= 500 || response.status === 429
      lastError = new HttpError(`HTTP ${response.status}`, {
        transient,
        status: response.status,
        body,
      })
      if (!transient) throw lastError
    } catch (err) {
      if (err instanceof HttpError && !err.transient) throw err
      if (!(err instanceof HttpError)) {
        lastError = new HttpError(
          timedOut
            ? `timeout after ${attemptTimeout}ms`
            : `network error: ${err instanceof Error ? err.message : String(err)}`,
          { transient: true },
        )
      }
    } finally {
      clearTimeout(timer)
    }

    if (i === attempts - 1) break

    const delay = baseDelayMs * 2 ** i * (0.8 + 0.4 * random())
    if (deadline !== undefined && now() + delay > deadline) throw deadlineExceeded()
    await sleep(delay)
  }

  throw lastError ?? new HttpError("no attempts made", { transient: true })
}
