/**
 * SmellSpotter — click the suspicious lines of a snippet to reveal the code
 * smell and the refactoring that cures it.
 */
import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Eye, RotateCcw, Search } from 'lucide-react'
import { Segmented, Stat, WidgetFrame } from '../kit'
import './SmellSpotter.css'

interface Smell {
  name: string
  why: string
  fix: string
}

interface Line {
  code: string
  smell?: string
}

interface Snippet {
  label: string
  file: string
  smells: Record<string, Smell>
  lines: Line[]
}

const snippets: Record<'god' | 'anemic' | 'spec', Snippet> = {
  god: {
    label: 'OrderManager',
    file: 'OrderManager.ts',
    smells: {
      large: { name: 'Large Class / God Object', why: 'Pedidos, reportes y contraseñas en una sola clase: tres razones para cambiar y nadie se anima a tocarla.', fix: 'Extract Class: OrderProcessor, SalesReport, PasswordService.' },
      hidden: { name: 'Dependencia oculta', why: 'La clase crea su propia base de datos y su mailer. No puedes testearla sin red ni cambiar el proveedor.', fix: 'Inyección por constructor (DIP): recibe un OrderRepository y un Notifier.' },
      params: { name: 'Long Parameter List + flag argument', why: 'Cinco parámetros, uno de ellos un booleano que cambia lo que hace la función. Y o: any apaga el compilador.', fix: 'Introduce Parameter Object y Remove Flag Argument (dos métodos o un evento).' },
      chain: { name: 'Message Chains', why: 'o.customer.address.country.code acopla esta clase a la forma interna de cuatro objetos.', fix: 'Hide Delegate: order.destinationCountry().' },
      magic: { name: 'Número mágico', why: '¿Qué es 1.19? ¿Por qué solo para CL? La próxima persona lo copiará en otro archivo.', fix: 'Replace Magic Literal con una constante o, mejor, una política de impuestos por país.' },
      switch: { name: 'Switch Statements', why: 'Cada tipo de envío nuevo obliga a editar esta función (y probablemente otras con el mismo if).', fix: 'Replace Conditional with Polymorphism: Strategy de envío.' },
      divergent: { name: 'Divergent Change', why: 'El reporte mensual cambia por motivos de Finanzas, no de pedidos.', fix: 'Move Function a un módulo de reportes.' },
    },
    lines: [
      { code: 'class OrderManager {', smell: 'large' },
      { code: '  private db = new PostgresClient(process.env.DB_URL)', smell: 'hidden' },
      { code: '  private mailer = new SmtpMailer()', smell: 'hidden' },
      { code: '' },
      { code: '  async process(o: any, type: string, sendMail: boolean, coupon?: string, notes?: string) {', smell: 'params' },
      { code: '    if (o.customer.address.country.code === "CL") {', smell: 'chain' },
      { code: '      o.total = o.total * 1.19', smell: 'magic' },
      { code: '    }' },
      { code: '    if (type === "express") o.total += 15', smell: 'switch' },
      { code: '    else if (type === "standard") o.total += 5' },
      { code: '    await this.db.query("UPDATE orders SET total = $1", [o.total])' },
      { code: '    if (sendMail) await this.mailer.send(o.customer.email, "Pedido listo")' },
      { code: '  }' },
      { code: '' },
      { code: '  async monthlySalesReport(month: number) { /* 120 líneas */ }', smell: 'divergent' },
      { code: '  async resetPassword(userId: string) { /* ... */ }', smell: 'large' },
      { code: '}' },
    ],
  },
  anemic: {
    label: 'Dominio anémico',
    file: 'order.ts',
    smells: {
      data: { name: 'Data Class / Anemic Domain Model', why: 'Order es una bolsa de datos con getters y setters. Las reglas del negocio viven lejos, en servicios.', fix: 'Move Function: llevar cancel() y addItem() a Order (modelo rico).' },
      primitive: { name: 'Primitive Obsession', why: 'El estado es un string libre y el dinero un number: "CANCELED" vs "CANCELLED" compila igual.', fix: 'Replace Primitive with Object: un tipo OrderStatus y un value object Money.' },
      envy: { name: 'Feature Envy', why: 'OrderService pasa todo el tiempo manipulando los datos de Order. Esa lógica quiere vivir con esos datos.', fix: 'Move Function a Order; el servicio solo orquesta.' },
      invariant: { name: 'Invariante rota desde afuera', why: 'Cualquier archivo puede escribir order.status sin pasar por la regla "no se cancela lo enviado".', fix: 'Encapsulate Variable: estado privado y transiciones como métodos.' },
      dup: { name: 'Duplicate Code', why: 'El cálculo del total aparece en dos lugares; tarde o temprano divergirán.', fix: 'Extract Function y que Order calcule su propio total.' },
    },
    lines: [
      { code: 'class Order {', smell: 'data' },
      { code: '  id!: string' },
      { code: '  status!: string          // "PENDING" | "PAID" | ...', smell: 'primitive' },
      { code: '  items: Item[] = []' },
      { code: '  total = 0' },
      { code: '}' },
      { code: '' },
      { code: 'class OrderService {' },
      { code: '  cancel(order: Order) {' },
      { code: '    if (order.status === "SHIPPED") throw new Error("ya enviado")', smell: 'envy' },
      { code: '    order.status = "CANCELLED"' },
      { code: '  }' },
      { code: '  addItem(order: Order, item: Item) {' },
      { code: '    order.items.push(item)' },
      { code: '    order.total += item.price * item.qty', smell: 'dup' },
      { code: '  }' },
      { code: '}' },
      { code: '' },
      { code: '// checkoutController.ts' },
      { code: 'order.status = "CANCELED"   // se saltó la regla (y el typo)', smell: 'invariant' },
      { code: 'order.total = order.items.reduce((s, i) => s + i.price * i.qty, 0)', smell: 'dup' },
    ],
  },
  spec: {
    label: 'Generalidad especulativa',
    file: 'shipping.ts',
    smells: {
      speculative: { name: 'Speculative Generality', why: 'Una interfaz y una clase abstracta genérica "por si algún día" hay más calculadoras. Hoy hay una.', fix: 'Collapse Hierarchy e Inline Class: deja una función hasta que aparezca el segundo caso real.' },
      impl: { name: 'Interfaz con una sola implementación', why: 'El sufijo Impl delata que la interfaz no modela una variación real; es ceremonia.', fix: 'Elimina la interfaz o créala cuando haya un segundo implementador (o un test que la necesite).' },
      dead: { name: 'Parámetros muertos', why: 'Opciones que ningún llamador usa: complejidad que hay que leer, probar y mantener.', fix: 'Remove Dead Code / Change Function Declaration.' },
      middle: { name: 'Middle Man', why: 'Una clase que solo delega a otra no agrega nada.', fix: 'Remove Middle Man: llama directo a la función.' },
    },
    lines: [
      { code: 'interface IShippingCalculatorFactoryProvider {', smell: 'speculative' },
      { code: '  getFactory(): IShippingCalculatorFactory' },
      { code: '}' },
      { code: '' },
      { code: 'abstract class AbstractBaseShippingCalculator<TCtx extends ShippingContext = DefaultCtx> {', smell: 'speculative' },
      { code: '  abstract calculate(ctx: TCtx): number' },
      { code: '}' },
      { code: '' },
      { code: 'class ShippingCalculatorImpl extends AbstractBaseShippingCalculator {', smell: 'impl' },
      { code: '  calculate(ctx: DefaultCtx, opts = { legacyMode: false, v2Hooks: [] }) {', smell: 'dead' },
      { code: '    return 5 + ctx.weightKg * 1.2' },
      { code: '  }' },
      { code: '}' },
      { code: '' },
      { code: 'class ShippingService {', smell: 'middle' },
      { code: '  constructor(private calc: AbstractBaseShippingCalculator) {}' },
      { code: '  cost(ctx: DefaultCtx) { return this.calc.calculate(ctx) }' },
      { code: '}' },
    ],
  },
}

type Key = keyof typeof snippets

export function SmellSpotter() {
  const [key, setKey] = useState<Key>('god')
  const [found, setFound] = useState<Record<Key, string[]>>({ god: [], anemic: [], spec: [] })
  const [active, setActive] = useState<{ line: number; smell?: string } | null>(null)
  const reduced = useReducedMotion()
  const sn = snippets[key]
  const total = Object.keys(sn.smells).length
  const foundHere = found[key]

  const pick = (i: number) => {
    const smell = sn.lines[i].smell
    setActive({ line: i, smell })
    if (smell && !foundHere.includes(smell)) setFound((f) => ({ ...f, [key]: [...f[key], smell] }))
  }

  const switchTo = (k: Key) => {
    setKey(k)
    setActive(null)
  }

  const activeSmell = active?.smell ? sn.smells[active.smell] : undefined

  return (
    <WidgetFrame
      caption="Toca las líneas que te huelen mal. Cada olor trae el refactoring del catálogo de Fowler que lo cura."
      grid={false}
      controls={
        <>
          <Segmented
            label="Código"
            value={key}
            onChange={switchTo}
            options={(Object.keys(snippets) as Key[]).map((k) => ({ value: k, label: snippets[k].label }))}
          />
          <div className="ss-actions">
            <button
              type="button"
              className="btn"
              onClick={() => setFound((f) => ({ ...f, [key]: Object.keys(sn.smells) }))}
              disabled={foundHere.length === total}
            >
              <Eye size={15} aria-hidden="true" /> Revelar
            </button>
            <button
              type="button"
              className="btn btn--ghost"
              onClick={() => {
                setFound((f) => ({ ...f, [key]: [] }))
                setActive(null)
              }}
              disabled={!foundHere.length}
            >
              <RotateCcw size={15} aria-hidden="true" /> Reiniciar
            </button>
          </div>
        </>
      }
      readout={
        <div className="ss-readout" aria-live="polite">
          <Stat label="olores encontrados" value={`${foundHere.length}/${total}`} tone={foundHere.length === total ? 'ok' : undefined} />
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={`${key}-${active?.line ?? 'none'}`}
              className="ss-card"
              initial={{ opacity: 0, y: reduced ? 0 : 4 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              {!active && (
                <p className="ss-muted">
                  <Search size={15} aria-hidden="true" /> Elige una línea sospechosa.
                </p>
              )}
              {active && !activeSmell && <p className="ss-muted">Esa línea no es el problema principal. Sigue buscando.</p>}
              {activeSmell && (
                <>
                  <p className="ss-card__name">{activeSmell.name}</p>
                  <p>{activeSmell.why}</p>
                  <p className="ss-card__fix">
                    <b>Refactoring:</b> {activeSmell.fix}
                  </p>
                </>
              )}
            </motion.div>
          </AnimatePresence>
        </div>
      }
    >
      <div className="ss-code" role="list" aria-label={`Código de ${sn.file}`}>
        <div className="ss-file">{sn.file}</div>
        <div className="ss-lines">
          {sn.lines.map((l, i) => {
            const revealed = !!l.smell && foundHere.includes(l.smell)
            const isActive = active?.line === i
            if (!l.code.trim())
              return (
                <div key={i} className="ss-line ss-line--blank" role="listitem" aria-hidden="true">
                  <span className="ss-ln">{i + 1}</span>
                </div>
              )
            return (
              <div key={i} role="listitem">
                <button
                  type="button"
                  className={`ss-line ${revealed ? 'is-found' : ''} ${isActive ? 'is-active' : ''}`}
                  onClick={() => pick(i)}
                  aria-label={`Línea ${i + 1}: ${l.code.trim()}${revealed ? ` (olor: ${sn.smells[l.smell!].name})` : ''}`}
                >
                  <span className="ss-ln">{i + 1}</span>
                  <code>{l.code}</code>
                </button>
              </div>
            )
          })}
        </div>
      </div>
    </WidgetFrame>
  )
}
