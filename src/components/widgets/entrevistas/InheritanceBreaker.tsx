import { useMemo } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { AlertTriangle } from 'lucide-react'
import { WidgetFrame } from '../kit'
import { StepControls, StepNote } from './algo-kit'
import { useStepPlayer } from './useStepPlayer'
import './InheritanceBreaker.css'

/**
 * InheritanceBreaker: the same delivery-app model grows requirement by
 * requirement. Inheritance needs one subclass per combination; composition
 * needs one class per option. Class lists are derived from the axes, not typed.
 */

interface Req {
  text: string
  vehicles: string[]
  cold: boolean
  premium: boolean
  /** "change vehicle at runtime" requirement is active */
  swap: boolean
}

const REQS: Req[] = [
  { text: 'Punto de partida: repartidores en moto y en bici. Cada uno calcula su tiempo de entrega distinto.', vehicles: ['Moto', 'Bici'], cold: false, premium: false, swap: false },
  { text: 'Producto pide repartidores en auto.', vehicles: ['Moto', 'Bici', 'Auto'], cold: false, premium: false, swap: false },
  { text: 'Algunos pedidos (helados, farmacia) requieren caja refrigerada, en cualquier vehículo.', vehicles: ['Moto', 'Bici', 'Auto'], cold: true, premium: false, swap: false },
  { text: 'A un repartidor se le pincha la moto a mitad del turno y sigue en bici, sin perder sus pedidos en curso.', vehicles: ['Moto', 'Bici', 'Auto'], cold: true, premium: false, swap: true },
  { text: 'Algunos repartidores contratan seguro premium, que cambia la tarifa.', vehicles: ['Moto', 'Bici', 'Auto'], cold: true, premium: true, swap: true },
]

interface Cls {
  name: string
  kind?: 'interface'
}

function inheritanceClasses(r: Req): Cls[] {
  const out: Cls[] = []
  for (const v of r.vehicles)
    for (const c of r.cold ? ['', 'ConFrio'] : [''])
      for (const p of r.premium ? ['', 'Premium'] : ['']) out.push({ name: `Repartidor${v}${c}${p}` })
  return out
}

function compositionGroups(r: Req): { axis: string; field: string; items: Cls[] }[] {
  const g = [{ axis: 'Vehiculo', field: 'vehiculo: Vehiculo', items: r.vehicles.map((v) => ({ name: v })) }]
  if (r.cold) g.push({ axis: 'Equipamiento', field: 'equipo: Equipamiento[]', items: [{ name: 'CajaRefrigerada' }] })
  if (r.premium) g.push({ axis: 'PlanSeguro', field: 'seguro: PlanSeguro', items: [{ name: 'SeguroBasico' }, { name: 'SeguroPremium' }] })
  return g
}

const countComp = (r: Req) => 1 + compositionGroups(r).reduce((s, g) => s + 1 + g.items.length, 0)

const EASE = [0.16, 1, 0.3, 1] as const

export function InheritanceBreaker() {
  const reduced = useReducedMotion()
  const player = useStepPlayer(REQS.length, { interval: 1800 })
  const r = REQS[player.i]
  const prev = player.i > 0 ? REQS[player.i - 1] : null

  const inh = useMemo(() => inheritanceClasses(r), [r])
  const prevInh = useMemo(() => new Set(prev ? inheritanceClasses(prev).map((c) => c.name) : []), [prev])
  const groups = useMemo(() => compositionGroups(r), [r])
  const prevComp = useMemo(() => new Set(prev ? compositionGroups(prev).flatMap((g) => [g.axis, ...g.items.map((i) => i.name)]) : []), [prev])

  const inhTotal = inh.length + 1
  const compTotal = countComp(r)
  const coldTouch = inh.filter((c) => c.name.includes('ConFrio')).length

  const note = (() => {
    switch (player.i) {
      case 0:
        return `Con herencia, una subclase por vehículo. Con composición, el repartidor tiene un Vehiculo. Al principio la herencia hasta parece más simple: ${inhTotal} contra ${compTotal} clases.`
      case 1:
        return 'Un eje que crece de a uno: las dos opciones agregan una clase. Mientras haya un solo eje de variación, la herencia funciona.'
      case 2:
        return `Aparece un segundo eje. La herencia multiplica: cada vehículo necesita su versión con frío (${inhTotal} clases). Si cambia la regla del frío, tocas ${coldTouch} clases. Con composición, una clase nueva.`
      case 3:
        return 'Un objeto no puede cambiar de clase en tiempo de ejecución. Con herencia hay que crear un RepartidorBici nuevo y copiar el estado a mano. Con composición, se reemplaza el campo vehiculo.'
      default:
        return `Tercer eje: 3 × 2 × 2 = ${inh.length} subclases más la base, contra ${compTotal} clases e interfaces que se combinan en tiempo de ejecución.`
    }
  })()

  return (
    <WidgetFrame
      caption="El mismo modelo de una app de delivery, con un requisito nuevo en cada paso. A la izquierda se resuelve con herencia; a la derecha, con composición."
      readout={<StepNote tone={player.i >= 2 ? 'warn' : undefined}>{note}</StepNote>}
    >
      <p className="ihb-req">
        <span className="hand">requisito {player.i + 1}:</span> {r.text}
      </p>

      <div className="ihb-cols">
        <section className="ihb-col" aria-label={`Herencia: ${inhTotal} clases`}>
          <header className="ihb-col__head">
            <h4>Herencia</h4>
            <span className={`ihb-count ${inhTotal > compTotal ? 'is-bad' : ''}`}>
              <b>{inhTotal}</b> clases
            </span>
          </header>
          <div className="ihb-base">
            <span className="ihb-stereo">«abstract»</span>
            Repartidor
          </div>
          <div className="ihb-arrow" aria-hidden="true">
            ▲ extends
          </div>
          <ul className="ihb-chips">
            <AnimatePresence initial={false}>
              {inh.map((c) => (
                <motion.li
                  key={c.name}
                  layout={!reduced}
                  className={`ihb-chip ${!prevInh.has(c.name) && prev ? 'is-new' : ''}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3, ease: EASE }}
                >
                  {c.name}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
          {r.swap && (
            <div className="ihb-warn">
              <AlertTriangle size={16} aria-hidden="true" />
              <span>
                <code>moto → bici</code>: imposible cambiar la clase de un objeto vivo. Hay que construir otro y migrar pedidos, ubicación y calificación.
              </span>
            </div>
          )}
        </section>

        <section className="ihb-col" aria-label={`Composición: ${compTotal} clases e interfaces`}>
          <header className="ihb-col__head">
            <h4>Composición</h4>
            <span className="ihb-count is-ok">
              <b>{compTotal}</b> clases
            </span>
          </header>
          <div className="ihb-base is-line">
            Repartidor
            <ul className="ihb-fields">
              {groups.map((g) => (
                <li key={g.field} className={!prevComp.has(g.axis) && prev ? 'is-new' : ''}>
                  {g.field}
                </li>
              ))}
            </ul>
          </div>
          <div className="ihb-groups">
            {groups.map((g) => (
              <div key={g.axis} className="ihb-group">
                <div className={`ihb-chip is-iface ${!prevComp.has(g.axis) && prev ? 'is-new' : ''}`}>
                  <span className="ihb-stereo">«interface»</span>
                  {g.axis}
                </div>
                <ul className="ihb-chips">
                  {g.items.map((it) => (
                    <li key={it.name} className={`ihb-chip ${!prevComp.has(it.name) && prev ? 'is-new' : ''}`}>
                      {it.name}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
          {r.swap && (
            <div className="ihb-ok">
              <code>repartidor.vehiculo = new Bici()</code>
              <span>mismo objeto, mismos pedidos.</span>
            </div>
          )}
        </section>
      </div>

      <StepControls player={player} label="Requisito" />
    </WidgetFrame>
  )
}
