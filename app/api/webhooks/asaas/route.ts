import { after } from "next/server"
import { getContainer } from "@/lib/container"
import { createAsaasWebhookHandler } from "@/lib/http/handlers/asaas-webhook"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request): Promise<Response> {
  const c = getContainer()
  return createAsaasWebhookHandler({
    token: c.env.ASAAS_WEBHOOK_TOKEN,
    handleEvent: c.handleAsaasEvent,
    runPlanGeneration: c.runPlanGeneration,
    noticeAdmin: c.noticeAdmin,
    defer: (fn) => after(fn),
    log: c.log,
  })(req)
}
