import { after } from "next/server"
import { getContainer } from "@/lib/container"
import { createRenewalsHandler } from "@/lib/http/handlers/renewals"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request): Promise<Response> {
  const c = getContainer()
  return createRenewalsHandler({
    token: c.env.JOBS_TOKEN,
    submitQuiz: c.submitQuiz,
    dispatchForQuizResponse: c.dispatchForQuizResponse,
    defer: (fn) => after(fn),
    log: c.log,
  })(req)
}
