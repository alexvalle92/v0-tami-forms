import { getContainer } from "@/lib/container"
import { createEventsHandler } from "@/lib/http/handlers/events"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request): Promise<Response> {
  const c = getContainer()
  return createEventsHandler({
    analytics: c.repos.analytics,
    rateLimiter: c.eventsRateLimiter,
    log: c.log,
    now: () => new Date(),
  })(req)
}
