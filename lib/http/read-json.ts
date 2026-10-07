export type ReadJsonResult = { ok: true; value: unknown } | { ok: false; status: 400 | 413 }

/**
 * Lê e interpreta o corpo JSON de um pedido com limite de tamanho. Confere o `content-length`
 * declarado e também os bytes realmente lidos: para de ler (e cancela o stream) assim que o
 * limite é ultrapassado, sem nunca acumular um corpo ilimitado em memória.
 * Corpo vazio, UTF-8 inválido ou JSON inválido → 400; acima do limite → 413.
 */
export async function readJsonBody(req: Request, maxBytes: number): Promise<ReadJsonResult> {
  const declared = req.headers.get("content-length")
  if (declared !== null && /^\d+$/.test(declared.trim()) && Number(declared.trim()) > maxBytes) {
    req.body?.cancel().catch(() => {})
    return { ok: false, status: 413 }
  }

  const reader = req.body?.getReader()
  if (!reader) return { ok: false, status: 400 }

  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      total += value.byteLength
      if (total > maxBytes) {
        reader.cancel().catch(() => {})
        return { ok: false, status: 413 }
      }
      chunks.push(value)
    }
  } catch {
    return { ok: false, status: 400 }
  }

  const bytes = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    bytes.set(chunk, offset)
    offset += chunk.byteLength
  }

  try {
    const text = new TextDecoder("utf-8", { fatal: true }).decode(bytes)
    return { ok: true, value: JSON.parse(text) }
  } catch {
    return { ok: false, status: 400 }
  }
}
