import { connection } from "next/server"
import { QuizPage } from "@/components/quiz-page"
import { priceOffer } from "@/lib/price-display"

// Componente de servidor que lê PAYMENT_AMOUNT e as PAYMENT_DISPLAY_* a cada pedido (connection() tira a página da
// geração estática), então mudar o preço vale com um reinício, sem build. O quiz em si é componente de cliente.
export default async function Page() {
  await connection()
  return <QuizPage offer={priceOffer(process.env)} />
}
