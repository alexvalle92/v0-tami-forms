import { after } from "next/server"
import { getContainer } from "@/lib/container"
import { createJobsRetryHandler } from "@/lib/http/handlers/jobs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request): Promise<Response> {
  const c = getContainer()
  return createJobsRetryHandler({
    token: c.env.JOBS_TOKEN,
    retryFailed: c.retryFailed,
    runner: c.runner,
    defer: (fn) => after(fn),
    log: c.log,
  })(req)
}
