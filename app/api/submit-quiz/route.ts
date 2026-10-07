import { after } from "next/server"
import { getContainer } from "@/lib/container"
import { createSubmitQuizHandler } from "@/lib/http/handlers/submit-quiz"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

export async function POST(req: Request): Promise<Response> {
  const c = getContainer()
  return createSubmitQuizHandler({
    submitQuiz: c.submitQuiz,
    dispatchForQuizResponse: c.dispatchForQuizResponse,
    rateLimiter: c.rateLimiter,
    defer: (fn) => after(fn),
    log: c.log,
  })(req)
}
