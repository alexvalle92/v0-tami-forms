import { fetchWithRetry } from "@/lib/http/retry"

export interface WhatsAppSender {
  sendText(number: string, text: string): Promise<void>
}

export function createEvolutionWhatsAppSender(cfg: {
  baseUrl: string
  apiKey: string
  instance: string
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}): WhatsAppSender {
  const url = `${cfg.baseUrl}/message/sendText/${encodeURIComponent(cfg.instance)}`
  return {
    async sendText(number, text) {
      const response = await fetchWithRetry(
        url,
        {
          method: "POST",
          headers: { apikey: cfg.apiKey, "Content-Type": "application/json" },
          body: JSON.stringify({ number, text }),
          redirect: "error",
        },
        { fetchImpl: cfg.fetchImpl, sleep: cfg.sleep },
      )
      // Só o status importa: libera a conexão sem esperar o corpo.
      response.body?.cancel().catch(() => {})
    },
  }
}
