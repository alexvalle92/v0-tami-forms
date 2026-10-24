import { after } from "next/server"
import { getContainer } from "@/lib/container"
import { createMetaEventsHandler } from "@/lib/http/handlers/meta-events"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request): Promise<Response> {
  const c = getContainer()
  return createMetaEventsHandler({
    capi: c.metaCapi,
    amount: c.env.PAYMENT_AMOUNT,
    rateLimiter: c.metaEventsRateLimiter,
    defer: (fn) => after(fn),
    log: c.log,
    now: () => new Date(),
  })(req)
}
