import { getContainer } from "@/lib/container"
import { createHealthHandler } from "@/lib/http/handlers/health"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function GET(): Promise<Response> {
  // Montar o container dentro do ping: env/banco indisponível → 503, não 500.
  return createHealthHandler({ ping: async () => getContainer().ping() })()
}
