import { useId, useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, RotateCcw, TriangleAlert } from 'lucide-react'
import { Stat, WidgetFrame } from '../kit'
import { useTransition } from './shared'
import './DependencyRings.css'

const C = 180
const RINGS = [
  { r: 55, label: 'Entidades' },
  { r: 95, label: 'Casos de uso' },
  { r: 135, label: 'Adaptadores' },
  { r: 172, label: 'Frameworks y drivers' },
]

type NodeId = 'order' | 'placeOrder' | 'repoPort' | 'controller' | 'pgRepo' | 'express' | 'pg'

const NODES: Record<NodeId, { label: string; ring: number; r: number; deg: number }> = {
  order: { label: 'Order', ring: 0, r: 24, deg: 90 },
  placeOrder: { label: 'PlaceOrder', ring: 1, r: 75, deg: 150 },
  repoPort: { label: 'OrderRepository', ring: 1, r: 75, deg: 30 },
  controller: { label: 'OrdersController', ring: 2, r: 115, deg: 200 },
  pgRepo: { label: 'PgOrderRepository', ring: 2, r: 115, deg: 340 },
  express: { label: 'Express', ring: 3, r: 155, deg: 230 },
  pg: { label: 'pg', ring: 3, r: 155, deg: 310 },
}

const pt = (id: NodeId) => {
  const n = NODES[id]
  const a = (n.deg * Math.PI) / 180
  return { x: C + n.r * Math.cos(a), y: C + n.r * Math.sin(a) }
}

interface Dep {
  id: string
  from: NodeId
  to: NodeId
  text: string
  explain: string
}

const DEPS: Dep[] = [
  { id: 'uc-ent', from: 'placeOrder', to: 'order', text: 'PlaceOrder crea un Order', explain: 'Un caso de uso usa entidades: la flecha apunta hacia adentro. Correcto.' },
  { id: 'ctl-uc', from: 'controller', to: 'placeOrder', text: 'OrdersController llama a PlaceOrder', explain: 'El adaptador conoce al caso de uso, no al revés. Correcto.' },
  { id: 'pg-port', from: 'pgRepo', to: 'repoPort', text: 'PgOrderRepository implementa OrderRepository', explain: 'La interfaz vive en el círculo de casos de uso y la implementación afuera: la dependencia de código apunta hacia adentro aunque en ejecución el caso de uso llame a Postgres. Eso es inversión de dependencias.' },
  { id: 'fw-ctl', from: 'express', to: 'controller', text: 'Express enruta a OrdersController', explain: 'El framework vive en el borde y llama al adaptador. Correcto.' },
  { id: 'ent-pg', from: 'order', to: 'pgRepo', text: 'Order.save() usa PgOrderRepository', explain: 'Violación: una entidad depende de un adaptador (estilo Active Record). Arreglo: la entidad no sabe persistirse; el caso de uso la guarda a través del puerto OrderRepository.' },
  { id: 'uc-pg', from: 'placeOrder', to: 'pg', text: 'PlaceOrder importa pg para abrir una transacción', explain: 'Violación: el caso de uso depende de un driver. Arreglo: define un puerto UnitOfWork (o TransactionManager) en el círculo de casos de uso e impleméntalo con pg en un adaptador.' },
  { id: 'uc-ctl', from: 'placeOrder', to: 'controller', text: 'PlaceOrder devuelve un HttpResponse del controlador', explain: 'Violación: el caso de uso conoce el formato de salida HTTP. Arreglo: devuelve un modelo de salida propio (o usa un puerto de salida, el "presenter" de Clean Architecture) y que el controlador lo traduzca.' },
]

const isLegal = (d: Dep) => NODES[d.to].ring <= NODES[d.from].ring

export function DependencyRings() {
  const [on, setOn] = useState<string[]>(['uc-ent', 'ctl-uc', 'pg-port'])
  const [last, setLast] = useState<string>('pg-port')
  const t = useTransition(0.3)
  const uid = useId().replace(/:/g, '')

  const active = DEPS.filter((d) => on.includes(d.id))
  const violations = active.filter((d) => !isLegal(d))
  const lastDep = DEPS.find((d) => d.id === last)

  const toggle = (id: string) => {
    setOn((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
    setLast(id)
  }

  const paths = useMemo(
    () =>
      active.map((d) => {
        const a = pt(d.from)
        const b = pt(d.to)
        const dx = b.x - a.x
        const dy = b.y - a.y
        const len = Math.hypot(dx, dy) || 1
        const ux = dx / len
        const uy = dy / len
        const sx = a.x + ux * 9
        const sy = a.y + uy * 9
        const ex = b.x - ux * 11
        const ey = b.y - uy * 11
        const bend = isLegal(d) ? 14 : -26
        const mx = (sx + ex) / 2 - uy * bend
        const my = (sy + ey) / 2 + ux * bend
        return { d, path: `M${sx},${sy} Q${mx},${my} ${ex},${ey}` }
      }),
    [active],
  )

  return (
    <WidgetFrame
      caption="Activa imports entre componentes. Los que apuntan hacia adentro (o se quedan en su círculo) respetan la regla de dependencia; los que apuntan hacia afuera se marcan como violación, con su arreglo."
      readout={
        <div className="dr-readout">
          <div className="dr-stats">
            <Stat label="Imports activos" value={active.length} />
            <Stat label="Violaciones" value={violations.length} tone={violations.length ? 'bad' : 'ok'} />
          </div>
          {lastDep && (
            <p className={isLegal(lastDep) ? '' : 'dr-bad'} aria-live="polite">
              <b>{lastDep.text}.</b> {lastDep.explain}
            </p>
          )}
        </div>
      }
    >
      <div className="dr-layout">
        <svg className="dr-svg" viewBox="0 0 360 360" role="img" aria-label="Círculos concéntricos de Clean Architecture con las dependencias activas">
          <defs>
            <marker id={`${uid}-ok`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" className="dr-head" />
            </marker>
            <marker id={`${uid}-bad`} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto">
              <path d="M0,0 L10,5 L0,10 z" className="dr-head is-bad" />
            </marker>
          </defs>
          {[...RINGS].reverse().map((ring, i) => (
            <circle key={ring.label} cx={C} cy={C} r={ring.r} className={`dr-ring dr-ring--${3 - i}`} />
          ))}
          {RINGS.map((ring, i) => {
            const inner = i === 0 ? 0 : RINGS[i - 1].r
            const y = i === 0 ? C - 22 : C - (inner + ring.r) / 2 + 5
            return (
              <text key={ring.label} x={C} y={y} textAnchor="middle" className="dr-ring-label">
                {ring.label}
              </text>
            )
          })}
          <AnimatePresence>
            {paths.map(({ d, path }) => (
              <motion.path
                key={d.id}
                d={path}
                className={`dr-edge ${isLegal(d) ? '' : 'is-bad'}`}
                markerEnd={`url(#${uid}-${isLegal(d) ? 'ok' : 'bad'})`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={t}
              />
            ))}
          </AnimatePresence>
          {(Object.keys(NODES) as NodeId[]).map((id) => {
            const p = pt(id)
            return (
              <g key={id} className="dr-node">
                <circle cx={p.x} cy={p.y} r={6} />
                <text x={p.x} y={p.y + 19} textAnchor="middle">
                  {NODES[id].label}
                </text>
              </g>
            )
          })}
        </svg>

        <div className="dr-list" role="group" aria-label="Imports">
          {DEPS.map((d) => {
            const isOn = on.includes(d.id)
            const legal = isLegal(d)
            return (
              <button
                key={d.id}
                type="button"
                aria-pressed={isOn}
                className={`dr-dep ${isOn ? 'is-on' : ''} ${legal ? '' : 'is-illegal'}`}
                onClick={() => toggle(d.id)}
              >
                <span className="dr-dep__box" aria-hidden="true">
                  {isOn && (legal ? <Check size={14} strokeWidth={3} /> : <TriangleAlert size={14} strokeWidth={2.5} />)}
                </span>
                <span>{d.text}</span>
              </button>
            )
          })}
          <button type="button" className="btn btn--ghost dr-reset" onClick={() => setOn([])}>
            <RotateCcw size={16} aria-hidden="true" /> Limpiar
          </button>
        </div>
      </div>
    </WidgetFrame>
  )
}
