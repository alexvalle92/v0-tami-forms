/** GET /api/health: `SELECT 1` no MySQL → 200 `{ ok: true }`, senão 503 `{ ok: false }` (sem detalhes). */
export function createHealthHandler(d: { ping: () => Promise<void> }): () => Promise<Response> {
  return async function handleHealth() {
    try {
      await d.ping()
      return Response.json({ ok: true })
    } catch {
      return Response.json({ ok: false }, { status: 503 })
    }
  }
}
