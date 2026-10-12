import { after } from "next/server"
import { getContainer } from "@/lib/container"
import { createNotificationsDispatchHandler } from "@/lib/http/handlers/notifications-dispatch"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request): Promise<Response> {
  const c = getContainer()
  return createNotificationsDispatchHandler({
    token: c.env.JOBS_TOKEN,
    dispatchNotification: c.dispatchNotification,
    defer: (fn) => after(fn),
    log: c.log,
  })(req)
}
