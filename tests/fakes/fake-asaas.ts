import type {
  AsaasClient,
  AsaasPayment,
  CreateCustomerInput,
  CreatePaymentInput,
} from "@/lib/asaas/client"

type FakeMethod = "findCustomerByCpf" | "createCustomer" | "findPaymentByExternalReference" | "createPayment"

export type FakeAsaas = AsaasClient & {
  /** Nomes dos métodos chamados, na ordem. */
  calls: string[]
  /** Clientes criados, por CPF. */
  customers: Map<string, { id: string }>
  /** Cobranças criadas, por externalReference. */
  payments: Map<string, AsaasPayment>
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
      }
      payments.set(i.externalReference, payment)
      return payment
    },
  }
}
