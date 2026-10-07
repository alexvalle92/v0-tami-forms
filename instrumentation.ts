/**
 * Ganchos do Next no início do servidor. Só o runtime Node faz o boot (migrations + agendador);
 * o import dinâmico garante que o runtime edge nunca carregue mysql2/nodemailer.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return
  // O `next build` não deve depender de banco nem de env.
  if (process.env.NEXT_PHASE === "phase-production-build") return
  const { boot } = await import("./lib/boot")
  await boot()
}
