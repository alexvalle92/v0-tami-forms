// Envio do quiz para a API. Módulo sem React e sem sessionStorage: quem chama
// (loading-screen) cuida do armazenamento do link de pagamento.

export const GENERIC_SUBMIT_ERROR =
  "Houve um problema ao registrar seus dados. Por favor, aguarde alguns instantes e tente novamente ou entre em contato com o suporte."

export type SubmitQuizResult = { ok: true; linkPagamento?: string } | { ok: false; message: string }

export async function submitQuizRequest(args: {
  submissionId: string
  answers: Record<string, unknown>
  fetchImpl?: typeof fetch
  timeoutMs?: number
}): Promise<SubmitQuizResult> {
  const { submissionId, answers, fetchImpl = fetch, timeoutMs = 30000 } = args

  try {
    const response = await fetchImpl("/api/submit-quiz", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ submissionId, answers }),
      signal: AbortSignal.timeout(timeoutMs),
    })

    if (!response.ok) {
      return { ok: false, message: GENERIC_SUBMIT_ERROR }
    }

    const contentType = response.headers?.get("content-type")

    if (contentType?.includes("application/json")) {
      const text = await response.text()
      if (text) {
        const data = JSON.parse(text)
        if (data.sucesso == true) {
          return data.linkPagamento ? { ok: true, linkPagamento: data.linkPagamento } : { ok: true }
        }
        if (data.mensagemErro) {
          return { ok: false, message: data.mensagemErro }
        }
      }
    }
    return { ok: true }
  } catch {
    return { ok: false, message: GENERIC_SUBMIT_ERROR }
  }
}
