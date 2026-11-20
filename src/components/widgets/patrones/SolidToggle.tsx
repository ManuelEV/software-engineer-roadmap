/**
 * SolidToggle — each SOLID principle as a before/after pair, plus the
 * "blast radius" of a realistic change request in each version.
 */
import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { FilePlus2, FilePen, File } from 'lucide-react'
import { Segmented, WidgetFrame } from '../kit'
import { CodeBlock } from '../../mdx/CodeBlock'
import './SolidToggle.css'

type Key = 'S' | 'O' | 'L' | 'I' | 'D'
type Mode = 'antes' | 'despues'
type FileState = 'mod' | 'new' | 'same'

interface Side {
  code: string
  files: { name: string; state: FileState }[]
  note: string
}

interface Principle {
  name: string
  rule: string
  change: string
  antes: Side
  despues: Side
}

const P: Record<Key, Principle> = {
  S: {
    name: 'Responsabilidad única (SRP)',
    rule: 'Un módulo debería tener una sola razón para cambiar: responder a un solo actor del negocio.',
    change: 'Finanzas cambia el redondeo del impuesto y, la misma semana, Diseño cambia el PDF.',
    antes: {
      code: `class Invoice {
  constructor(private items: LineItem[], private db: Db) {}

  total(): number {                 // regla de Finanzas
    const net = this.items.reduce((s, i) => s + i.price * i.qty, 0)
    return Math.round(net * 1.19)
  }

  toPdf(): Buffer {                 // pedido de Diseño
    return renderPdf({ items: this.items, total: this.total() })
  }

  async save(): Promise<void> {     // decisión de Infraestructura
    await this.db.insert('invoices', { items: this.items })
  }
}`,
      files: [
        { name: 'Invoice.ts', state: 'mod' },
        { name: 'Invoice.test.ts', state: 'mod' },
      ],
      note: 'Dos equipos tocan la misma clase por motivos distintos: conflictos de merge y un cambio de PDF que puede romper el cálculo.',
    },
    despues: {
      code: `class InvoiceCalculator {
  total(items: LineItem[]): number {
    const net = items.reduce((s, i) => s + i.price * i.qty, 0)
    return Math.round(net * 1.19)
  }
}

class InvoicePdfRenderer {
  render(invoice: Invoice, total: number): Buffer { /* ... */ }
}

class InvoiceRepository {
  constructor(private db: Db) {}
  save(invoice: Invoice): Promise<void> { /* ... */ }
}`,
      files: [
        { name: 'InvoiceCalculator.ts', state: 'mod' },
        { name: 'InvoicePdfRenderer.ts', state: 'mod' },
        { name: 'InvoiceRepository.ts', state: 'same' },
      ],
      note: 'Cada cambio cae en el módulo de su actor. El repositorio ni se entera.',
    },
  },
  O: {
    name: 'Abierto/cerrado (OCP)',
    rule: 'Abierto a extensión, cerrado a modificación: agregar un caso nuevo no debería obligarte a editar código que ya funciona.',
    change: 'Producto pide un tipo de envío nuevo: "mismo día".',
    antes: {
      code: `function shippingCost(order: Order): number {
  switch (order.shipping) {
    case 'standard':
      return 5 + order.weightKg * 1.2
    case 'express':
      return 15 + order.weightKg * 2
    case 'pickup':
      return 0
    // agregar 'same-day' = editar esta función
    // (y cada otro switch sobre order.shipping)
    default:
      throw new Error('tipo desconocido')
  }
}`,
      files: [
        { name: 'shippingCost.ts', state: 'mod' },
        { name: 'deliveryEta.ts', state: 'mod' },
        { name: 'labelPrinter.ts', state: 'mod' },
        { name: 'shipping.test.ts', state: 'mod' },
      ],
      note: 'El mismo switch aparece en varios archivos. Olvidar uno es un bug en producción.',
    },
    despues: {
      code: `interface ShippingMethod {
  cost(order: Order): number
  etaDays(order: Order): number
}

class SameDayShipping implements ShippingMethod {
  cost(order: Order) { return 25 + order.weightKg * 3 }
  etaDays() { return 0 }
}

const methods: Record<string, ShippingMethod> = {
  standard: new StandardShipping(),
  express: new ExpressShipping(),
  'same-day': new SameDayShipping(),   // única línea nueva
}`,
      files: [
        { name: 'SameDayShipping.ts', state: 'new' },
        { name: 'SameDayShipping.test.ts', state: 'new' },
        { name: 'methods.ts', state: 'mod' },
        { name: 'StandardShipping.ts', state: 'same' },
        { name: 'ExpressShipping.ts', state: 'same' },
      ],
      note: 'Extiendes agregando una clase. Lo que ya estaba probado no se toca (solo el registro).',
    },
  },
  L: {
    name: 'Sustitución de Liskov (LSP)',
    rule: 'Un subtipo debe poder usarse donde se espera su tipo base sin sorpresas: mismo contrato, mismas garantías.',
    change: 'Operaciones quiere procesar devoluciones en lote para todos los pagos de un pedido.',
    antes: {
      code: `class Payment {
  constructor(public amount: number) {}
  refund(): void { /* devuelve el dinero */ }
}

class GiftCardPayment extends Payment {
  refund(): void {
    throw new Error('Las gift cards no se reembolsan')
  }
}

// El cliente confía en el contrato de Payment...
for (const p of order.payments) p.refund()   // falla en runtime`,
      files: [
        { name: 'refundBatch.ts', state: 'new' },
        { name: 'partialRefund.ts', state: 'mod' },
        { name: 'chargebacks.ts', state: 'mod' },
      ],
      note: 'El lote explota con la primera gift card. El parche típico es un if (p instanceof GiftCardPayment) en cada lugar que llama a refund(): otro olor.',
    },
    despues: {
      code: `interface Payment {
  amount: number
}

interface Refundable extends Payment {
  refund(): void
}

class CardPayment implements Refundable { /* ... */ }
class GiftCardPayment implements Payment { /* sin refund */ }

const isRefundable = (p: Payment): p is Refundable =>
  'refund' in p

order.payments.filter(isRefundable).forEach((p) => p.refund())`,
      files: [
        { name: 'refundBatch.ts', state: 'new' },
        { name: 'partialRefund.ts', state: 'same' },
        { name: 'chargebacks.ts', state: 'same' },
      ],
      note: 'El tipo dice la verdad: solo lo reembolsable tiene refund(). El compilador te protege.',
    },
  },
  I: {
    name: 'Segregación de interfaces (ISP)',
    rule: 'Ningún cliente debería depender de métodos que no usa. Prefiere interfaces pequeñas, pensadas desde quien las consume.',
    change: 'Necesitas escribir un test del reporte de ventas diarias.',
    antes: {
      code: `interface OrderStore {
  findById(id: string): Promise<Order>
  findByDate(d: Date): Promise<Order[]>
  save(o: Order): Promise<void>
  delete(id: string): Promise<void>
  lock(id: string): Promise<void>
  exportCsv(): Promise<string>
}

class SalesReport {
  constructor(private store: OrderStore) {}  // solo usa findByDate
}

// El test necesita un fake con 6 métodos, 5 de ellos vacíos.`,
      files: [
        { name: 'SalesReport.test.ts', state: 'mod' },
        { name: 'FakeOrderStore.ts', state: 'mod' },
        { name: 'OrderStore.ts', state: 'same' },
      ],
      note: 'Si OrderStore gana un método, todos los fakes y clientes se recompilan aunque no lo usen.',
    },
    despues: {
      code: `interface OrdersByDate {
  findByDate(d: Date): Promise<Order[]>
}

class SalesReport {
  constructor(private orders: OrdersByDate) {}
}

// El test:
const report = new SalesReport({
  findByDate: async () => [orderOf(100), orderOf(250)],
})`,
      files: [
        { name: 'SalesReport.test.ts', state: 'new' },
        { name: 'OrdersByDate.ts', state: 'new' },
        { name: 'PostgresOrderStore.ts', state: 'same' },
      ],
      note: 'La implementación real puede seguir siendo una sola clase que cumple varias interfaces chicas.',
    },
  },
  D: {
    name: 'Inversión de dependencias (DIP)',
    rule: 'Las políticas de alto nivel no dependen de detalles: ambos dependen de abstracciones, y la abstracción la define quien la usa.',
    change: 'Hay que cambiar Stripe por otro proveedor y, además, testear el checkout sin red.',
    antes: {
      code: `import Stripe from 'stripe'
import { pool } from './db'

class CheckoutService {
  private stripe = new Stripe(process.env.STRIPE_KEY!)

  async checkout(cart: Cart) {
    await this.stripe.paymentIntents.create({
      amount: cart.total, currency: 'usd',
    })
    await pool.query('INSERT INTO orders ...')
  }
}`,
      files: [
        { name: 'CheckoutService.ts', state: 'mod' },
        { name: 'RefundService.ts', state: 'mod' },
        { name: 'SubscriptionService.ts', state: 'mod' },
        { name: 'checkout.test.ts', state: 'mod' },
      ],
      note: 'La lógica de negocio importa el SDK. Cambiar de proveedor es tocar cada servicio; testear requiere mocks de módulo.',
    },
    despues: {
      code: `// Lo define el dominio, con su vocabulario
interface PaymentGateway {
  charge(amount: Money, customerId: string): Promise<ChargeId>
}

class CheckoutService {
  constructor(
    private payments: PaymentGateway,
    private orders: OrderRepository,
  ) {}
}

// Detalle en el borde: un adapter por proveedor
class MercadoPagoGateway implements PaymentGateway { /* ... */ }`,
      files: [
        { name: 'MercadoPagoGateway.ts', state: 'new' },
        { name: 'main.ts (wiring)', state: 'mod' },
        { name: 'CheckoutService.ts', state: 'same' },
        { name: 'RefundService.ts', state: 'same' },
      ],
      note: 'El negocio no se entera del proveedor. En los tests pasas un FakeGateway por el constructor.',
    },
  },
}

const icon = { mod: FilePen, new: FilePlus2, same: File }
const stateLabel = { mod: 'modificado', new: 'nuevo', same: 'intacto' }

export function SolidToggle() {
  const [key, setKey] = useState<Key>('O')
  const [mode, setMode] = useState<Mode>('antes')
  const reduced = useReducedMotion()
  const p = P[key]
  const side = p[mode]
  const mods = side.files.filter((f) => f.state === 'mod').length
  const news = side.files.filter((f) => f.state === 'new').length

  return (
    <WidgetFrame
      caption="Cada principio con un cambio realista. Alterna antes/después y mira cuántos archivos tienes que tocar."
      title="Interactivo"
      grid={false}
      controls={
        <>
          <Segmented
            label="Principio"
            value={key}
            onChange={setKey}
            options={(Object.keys(P) as Key[]).map((k) => ({ value: k, label: <span aria-label={P[k].name}>{k}</span> }))}
          />
          <Segmented
            label="Versión"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'antes', label: 'Antes' },
              { value: 'despues', label: 'Después' },
            ]}
          />
        </>
      }
      readout={<p>{side.note}</p>}
    >
      <div className="solid-head">
        <div className="solid-name">
          <span className="line-badge">{key}</span> {p.name}
        </div>
        <p className="solid-rule">{p.rule}</p>
        <p className="solid-change">
          <b>Pedido de cambio:</b> {p.change}
        </p>
      </div>
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={key + mode}
          initial={{ opacity: 0, y: reduced ? 0 : 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="solid-code">
            <CodeBlock code={side.code} lang="ts" bare />
          </div>
          <div className="solid-impact">
            <div className="solid-impact__stats">
              <span className={mods > 1 ? 'is-bad' : ''}>
                <b>{mods}</b> modificados
              </span>
              <span className="is-ok">
                <b>{news}</b> nuevos
              </span>
            </div>
            <ul className="solid-files" aria-label="Archivos afectados por el cambio">
              {side.files.map((f) => {
                const Icon = icon[f.state]
                return (
                  <li key={f.name} className={`solid-file is-${f.state}`}>
                    <Icon size={15} aria-hidden="true" />
                    <span>{f.name}</span>
                    <span className="visually-hidden">: {stateLabel[f.state]}</span>
                  </li>
                )
              })}
            </ul>
          </div>
        </motion.div>
      </AnimatePresence>
    </WidgetFrame>
  )
}
