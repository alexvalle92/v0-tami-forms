import { connection } from "next/server"
import { QuizPage } from "@/components/quiz-page"
import { paymentAmount } from "@/lib/payment-amount"
import { formatBRL } from "@/lib/notify/templates"

// Componente de servidor que lê PAYMENT_AMOUNT a cada pedido (connection() tira a página da geração estática),
// então mudar o preço vale com um reinício, sem build. O quiz em si é componente de cliente.
export default async function Page() {
  await connection()
  return <QuizPage price={formatBRL(paymentAmount(process.env))} />
}
