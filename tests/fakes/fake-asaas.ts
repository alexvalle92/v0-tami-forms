import { HttpError } from "@/lib/http/retry"
import type {
  AsaasClient,
  AsaasPayment,
  CreateCustomerInput,
  CreatePaymentInput,
  UpdatePaymentInput,
} from "@/lib/asaas/client"

type FakeMethod =
  | "findCustomerByCpf"
  | "createCustomer"
  | "findPaymentByExternalReference"
  | "createPayment"
  | "getPayment"
  | "updatePayment"

export type FakeAsaas = AsaasClient & {
  /** Nomes dos métodos chamados, na ordem. */
  calls: string[]
  /** Clientes criados, por CPF. */
  customers: Map<string, { id: string }>
  /** Cobranças criadas, por externalReference. */
  payments: Map<string, AsaasPayment>
  /** As mesmas cobranças, por id do Asaas (o que getPayment e updatePayment consultam). */
  byId: Map<string, AsaasPayment>
  /** Entradas recebidas por updatePayment, com o id da cobrança alterada. */
  updatedPayments: { asaasId: string; input: UpdatePaymentInput }[]
  /** Entradas recebidas por createPayment (para conferir o que foi enviado). */
  createdPayments: CreatePaymentInput[]
  /** Entradas recebidas por createCustomer. */
  createdCustomers: CreateCustomerInput[]
  /** Faz a próxima chamada de `method` lançar `err` (a chamada é registrada em `calls`). */
  failNext(method: string, err: Error): void
}

/** Dublê do Asaas: grava o que cria, para que as buscas o encontrem depois. */
export function createFakeAsaas(): FakeAsaas {
  const calls: string[] = []
  const customers = new Map<string, { id: string }>()
  const payments = new Map<string, AsaasPayment>()
  const byId = new Map<string, AsaasPayment>()
  const updatedPayments: { asaasId: string; input: UpdatePaymentInput }[] = []
  const createdPayments: CreatePaymentInput[] = []
  const createdCustomers: CreateCustomerInput[] = []
  const failures = new Map<string, Error[]>()
  let seq = 0

  function enter(method: FakeMethod) {
    calls.push(method)
    const err = failures.get(method)?.shift()
    if (err) throw err
  }

  return {
    calls,
    customers,
    payments,
    byId,
    updatedPayments,
    createdPayments,
    createdCustomers,
    failNext(method, err) {
      failures.set(method, [...(failures.get(method) ?? []), err])
    },

    async findCustomerByCpf(cpf) {
      enter("findCustomerByCpf")
      return customers.get(cpf) ?? null
    },

    async createCustomer(i: CreateCustomerInput) {
      enter("createCustomer")
      createdCustomers.push(i)
      const customer = { id: `cus_${++seq}` }
      customers.set(i.cpfCnpj, customer)
      return customer
    },

    async findPaymentByExternalReference(ref) {
      enter("findPaymentByExternalReference")
      return payments.get(ref) ?? null
    },

    async createPayment(i: CreatePaymentInput) {
      enter("createPayment")
      createdPayments.push(i)
      const payment: AsaasPayment = {
        id: `pay_${++seq}`,
        status: "PENDING",
        invoiceUrl: `https://asaas.test/i/${seq}`,
        invoiceNumber: `INV-${seq}`,
        billingType: "UNDEFINED",
        dueDate: i.dueDate,
        value: i.value,
      }
      payments.set(i.externalReference, payment)
      byId.set(payment.id, payment)
      return payment
    },

    async getPayment(asaasId) {
      enter("getPayment")
      const payment = byId.get(asaasId)
      if (!payment) throw new HttpError("not found", { transient: false, status: 404 })
      return payment
    },

    async updatePayment(asaasId, input) {
      enter("updatePayment")
      const payment = byId.get(asaasId)
      if (!payment) throw new HttpError("not found", { transient: false, status: 404 })
      updatedPayments.push({ asaasId, input })
      // altera o mesmo objeto, que `payments` também guarda, para as duas visões não divergirem
      payment.value = input.value
      payment.dueDate = input.dueDate
      return payment
    },
  }
}
