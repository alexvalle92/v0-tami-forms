import { getContainer } from "@/lib/container"
import { createJobsRunHandler } from "@/lib/http/handlers/jobs"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request): Promise<Response> {
  const c = getContainer()
  return createJobsRunHandler({ token: c.env.JOBS_TOKEN, runner: c.runner, log: c.log })(req)
}
