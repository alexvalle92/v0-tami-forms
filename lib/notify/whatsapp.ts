import { fetchWithRetry } from "@/lib/http/retry"

export interface WhatsAppSender {
  sendText(number: string, text: string): Promise<void>
  /** Vídeo MP4 com legenda; `url` precisa ser pública, porque quem baixa o arquivo é a Evolution API. */
  sendVideo(number: string, url: string, caption: string): Promise<void>
}

export function createEvolutionWhatsAppSender(cfg: {
  baseUrl: string
  apiKey: string
  instance: string
  fetchImpl?: typeof fetch
  sleep?: (ms: number) => Promise<void>
}): WhatsAppSender {
  const base = cfg.baseUrl.replace(/\/+$/, "")
  const instance = encodeURIComponent(cfg.instance)

  async function post(path: string, body: unknown) {
    const response = await fetchWithRetry(
      `${base}/message/${path}/${instance}`,
      {
        method: "POST",
        headers: { apikey: cfg.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify(body),
        redirect: "error",
      },
      { fetchImpl: cfg.fetchImpl, sleep: cfg.sleep },
    )
    // Só o status importa: libera a conexão sem esperar o corpo.
    response.body?.cancel().catch(() => {})
  }

  return {
    sendText: (number, text) => post("sendText", { number, text }),
    // Formato da v2 da Evolution: a mídia vai por URL, e a API baixa e reenvia o arquivo.
    sendVideo: (number, url, caption) =>
      post("sendMedia", {
        number,
        mediatype: "video",
        mimetype: "video/mp4",
        caption,
        media: url,
        fileName: "video.mp4",
      }),
  }
}
