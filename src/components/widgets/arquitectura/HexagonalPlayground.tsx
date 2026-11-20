import { useEffect, useRef, useState } from 'react'
import { motion } from 'motion/react'
import {
  ArrowLeft,
  ArrowRight,
  CreditCard,
  Database,
  FlaskConical,
  Globe,
  Hexagon,
  MemoryStick,
  Play,
  Terminal,
} from 'lucide-react'
import { Segmented, Stat, WidgetFrame } from '../kit'
import { useTransition } from './shared'
import './HexagonalPlayground.css'

type Driving = 'rest' | 'cli' | 'test'
type Repo = 'pg' | 'mem'
type Pay = 'stripe' | 'fake'

const DRIVING = {
  rest: { label: 'REST', Icon: Globe, cls: 'HttpOrderController', input: 'POST /orders {"customerId":"c-42",…}', out: '201 Created {"orderId":"o-981"}' },
  cli: { label: 'CLI', Icon: Terminal, cls: 'PlaceOrderCommand', input: '$ shop place-order --customer c-42 --sku TSHIRT-M:2', out: 'Pedido o-981 creado' },
  test: { label: 'Test', Icon: FlaskConical, cls: 'placeOrder.test.ts', input: 'await placeOrder.execute({ customerId: "c-42", … })', out: 'expect(result.orderId).toBeDefined()' },
} as const

const REPO = {
  pg: { label: 'Postgres', Icon: Database, cls: 'PostgresOrderRepository', ctor: 'new PostgresOrderRepository(pool)' },
  mem: { label: 'En memoria', Icon: MemoryStick, cls: 'InMemoryOrderRepository', ctor: 'new InMemoryOrderRepository()' },
} as const

const PAY = {
  stripe: { label: 'Stripe', Icon: CreditCard, cls: 'StripePaymentGateway', ctor: 'new StripePaymentGateway(stripeClient)' },
  fake: { label: 'Fake', Icon: FlaskConical, cls: 'FakePaymentGateway', ctor: 'new FakePaymentGateway({ approve: true })' },
} as const

type Part = 'driver' | 'in-port' | 'core' | 'repo-port' | 'repo' | 'pay-port' | 'pay'

const STEPS: { parts: Part[]; text: (d: Driving, r: Repo, p: Pay) => string }[] = [
  { parts: ['driver'], text: (d) => `${DRIVING[d].cls} recibe la entrada y la traduce a un comando del dominio. Es el único que sabe de ${d === 'rest' ? 'HTTP y JSON' : d === 'cli' ? 'argumentos de consola' : 'el framework de tests'}.` },
  { parts: ['driver', 'in-port'], text: () => 'Llama al puerto de entrada PlaceOrder: una interfaz definida por el núcleo, en el lenguaje del negocio.' },
  { parts: ['core'], text: () => 'PlaceOrderService crea el agregado Order y aplica las reglas: mínimo de compra, stock, cliente habilitado. No hay ni un import de infraestructura.' },
  { parts: ['core', 'pay-port', 'pay'], text: (_d, _r, p) => `El núcleo pide el cobro a través del puerto PaymentGateway. Hoy lo implementa ${PAY[p].cls}; el núcleo no lo sabe.` },
  { parts: ['core', 'repo-port', 'repo'], text: (_d, r) => `Guarda el pedido con el puerto OrderRepository. Lo implementa ${REPO[r].cls}.` },
  { parts: ['driver', 'in-port', 'core'], text: (d) => `El resultado vuelve por el mismo puerto y ${DRIVING[d].cls} lo traduce a su formato: ${DRIVING[d].out}.` },
]

export function HexagonalPlayground() {
  const [driving, setDriving] = useState<Driving>('rest')
  const [repo, setRepo] = useState<Repo>('pg')
  const [pay, setPay] = useState<Pay>('stripe')
  const [step, setStep] = useState(-1)
  const [swaps, setSwaps] = useState(0)
  const timer = useRef<number | null>(null)
  const t = useTransition(0.25)

  useEffect(() => () => {
    if (timer.current) window.clearTimeout(timer.current)
  }, [])

  const run = () => {
    if (timer.current) window.clearTimeout(timer.current)
    let i = 0
    setStep(0)
    const tick = () => {
      i++
      if (i < STEPS.length) {
        setStep(i)
        timer.current = window.setTimeout(tick, 1500)
      } else {
        timer.current = null
      }
    }
    timer.current = window.setTimeout(tick, 1500)
  }

  const swap = <T,>(set: (v: T) => void) => (v: T) => {
    set(v)
    setSwaps((s) => s + 1)
    setStep(-1)
    if (timer.current) window.clearTimeout(timer.current)
  }

  const on = (p: Part) => step >= 0 && STEPS[step].parts.includes(p)
  const D = DRIVING[driving]
  const R = REPO[repo]
  const P = PAY[pay]

  return (
    <WidgetFrame
      caption="Cambia los adaptadores de cada lado y envía un pedido. El hexágono no cambia nunca: solo cambia el cableado en main.ts. Las flechas de dependencia de ambos lados apuntan hacia el núcleo."
      controls={
        <>
          <Segmented<Driving>
            label="Adaptador de entrada"
            value={driving}
            onChange={swap(setDriving)}
            options={[
              { value: 'rest', label: 'REST' },
              { value: 'cli', label: 'CLI' },
              { value: 'test', label: 'Test' },
            ]}
          />
          <Segmented<Repo>
            label="Persistencia"
            value={repo}
            onChange={swap(setRepo)}
            options={[
              { value: 'pg', label: 'Postgres' },
              { value: 'mem', label: 'En memoria' },
            ]}
          />
          <Segmented<Pay>
            label="Pagos"
            value={pay}
            onChange={swap(setPay)}
            options={[
              { value: 'stripe', label: 'Stripe' },
              { value: 'fake', label: 'Fake' },
            ]}
          />
          <button type="button" className="btn btn--line" onClick={run}>
            <Play size={16} aria-hidden="true" /> Enviar pedido
          </button>
        </>
      }
      readout={
        <div className="hx-readout">
          <p className="hx-readout__step" aria-live="polite">
            {step >= 0 ? (
              <>
                <b>Paso {step + 1} de {STEPS.length}.</b> {STEPS[step].text(driving, repo, pay)}
              </>
            ) : (
              'Elige adaptadores y pulsa "Enviar pedido" para seguir la petición.'
            )}
          </p>
          <div className="hx-readout__grid">
            <pre className="hx-code" aria-label="Raíz de composición">
              <span className="hx-code__c">{'// main.ts: el único archivo que conoce todo'}</span>
              {'\n'}const orders = <mark>{R.ctor}</mark>
              {'\n'}const payments = <mark>{P.ctor}</mark>
              {'\n'}const placeOrder = new PlaceOrderService(orders, payments)
              {'\n'}
              {driving === 'rest' && <mark>{'app.post("/orders", httpOrderController(placeOrder))'}</mark>}
              {driving === 'cli' && <mark>{'cli.command("place-order", placeOrderCommand(placeOrder))'}</mark>}
              {driving === 'test' && <mark>{'// el test llama a placeOrder.execute() directamente'}</mark>}
            </pre>
            <div className="hx-stats">
              <Stat label="Cambios de adaptador" value={swaps} />
              <Stat label="Archivos del núcleo tocados" value={0} tone="ok" />
            </div>
          </div>
        </div>
      }
    >
      <div className="hx-stage">
        <div className="hx-side">
          <span className="hx-side__title">Lado conductor (driving)</span>
          <motion.div className={`hx-adapter ${on('driver') ? 'is-on' : ''}`} layout={false} key={driving} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={t}>
            <D.Icon size={20} aria-hidden="true" />
            <div>
              <div className="hx-adapter__name">{D.cls}</div>
              <code className="hx-adapter__io">{D.input}</code>
            </div>
          </motion.div>
          <div className={`hx-dep ${on('in-port') ? 'is-on' : ''}`}>
            <span>llama a</span>
            <ArrowRight size={18} aria-hidden="true" className="hx-dep__h" />
          </div>
        </div>

        <div className={`hx-core ${on('core') ? 'is-on' : ''}`}>
          <div className="hx-core__shape" aria-hidden="true" />
          <div className="hx-core__body">
            <span className={`hx-port hx-port--in ${on('in-port') ? 'is-on' : ''}`}>PlaceOrder</span>
            <div className="hx-core__title">
              <Hexagon size={18} aria-hidden="true" /> Núcleo
            </div>
            <div className="hx-core__items">
              <code>Order</code>
              <code>PlaceOrderService</code>
            </div>
            <span className="hx-core__note">0 imports de infraestructura</span>
            <div className="hx-ports-out">
              <span className={`hx-port ${on('repo-port') ? 'is-on' : ''}`}>OrderRepository</span>
              <span className={`hx-port ${on('pay-port') ? 'is-on' : ''}`}>PaymentGateway</span>
            </div>
          </div>
        </div>

        <div className="hx-side hx-side--right">
          <span className="hx-side__title">Lado conducido (driven)</span>
          {(
            [
              ['repo', R, 'repo-port'],
              ['pay', P, 'pay-port'],
            ] as const
          ).map(([part, A, port]) => (
            <div key={part} className="hx-driven">
              <div className={`hx-dep hx-dep--back ${on(port) ? 'is-on' : ''}`}>
                <ArrowLeft size={18} aria-hidden="true" className="hx-dep__h" />
                <span>implementa</span>
              </div>
              <motion.div className={`hx-adapter ${on(part) ? 'is-on' : ''}`} key={A.cls} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={t}>
                <A.Icon size={20} aria-hidden="true" />
                <div className="hx-adapter__name">{A.cls}</div>
              </motion.div>
            </div>
          ))}
        </div>
      </div>
    </WidgetFrame>
  )
}
