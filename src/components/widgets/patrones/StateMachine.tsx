import { useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { RotateCcw } from 'lucide-react'
import { Log, WidgetFrame } from '../kit'
import { useMediaQuery } from '../../../lib/hooks'
import './StateMachine.css'

type S = 'pending' | 'paid' | 'shipped' | 'delivered' | 'cancelled' | 'refunded'
type A = 'pay' | 'ship' | 'deliver' | 'cancel' | 'refund'

const states: Record<S, { label: string; cls: string }> = {
  pending: { label: 'Pendiente', cls: 'PendingState' },
  paid: { label: 'Pagado', cls: 'PaidState' },
  shipped: { label: 'Enviado', cls: 'ShippedState' },
  delivered: { label: 'Entregado', cls: 'DeliveredState' },
  cancelled: { label: 'Cancelado', cls: 'CancelledState' },
  refunded: { label: 'Reembolsado', cls: 'RefundedState' },
}

const actions: { a: A; label: string; verb: string }[] = [
  { a: 'pay', label: 'Pagar', verb: 'pagar' },
  { a: 'ship', label: 'Enviar', verb: 'enviar' },
  { a: 'deliver', label: 'Entregar', verb: 'entregar' },
  { a: 'cancel', label: 'Cancelar', verb: 'cancelar' },
  { a: 'refund', label: 'Devolver', verb: 'devolver' },
]

const transitions: { from: S; a: A; to: S }[] = [
  { from: 'pending', a: 'pay', to: 'paid' },
  { from: 'pending', a: 'cancel', to: 'cancelled' },
  { from: 'paid', a: 'ship', to: 'shipped' },
  { from: 'paid', a: 'cancel', to: 'refunded' },
  { from: 'shipped', a: 'deliver', to: 'delivered' },
  { from: 'delivered', a: 'refund', to: 'refunded' },
]

type P = [number, number]
interface Layout {
  vb: string
  pos: Record<S, P>
  label: Record<S, { x: number; y: number; anchor: 'start' | 'middle' | 'end' }>
  edges: Record<string, P[]>
}

const wideLayout: Layout = {
  vb: '0 0 680 250',
  pos: { pending: [70, 90], paid: [240, 90], shipped: [410, 90], delivered: [580, 90], cancelled: [70, 200], refunded: [410, 200] },
  label: {
    pending: { x: 70, y: 58, anchor: 'middle' },
    paid: { x: 240, y: 58, anchor: 'middle' },
    shipped: { x: 410, y: 58, anchor: 'middle' },
    delivered: { x: 580, y: 58, anchor: 'middle' },
    cancelled: { x: 70, y: 240, anchor: 'middle' },
    refunded: { x: 410, y: 240, anchor: 'middle' },
  },
  edges: {
    'pending-pay': [[70, 90], [240, 90]],
    'pending-cancel': [[70, 90], [70, 200]],
    'paid-ship': [[240, 90], [410, 90]],
    'paid-cancel': [[240, 90], [350, 200], [410, 200]],
    'shipped-deliver': [[410, 90], [580, 90]],
    'delivered-refund': [[580, 90], [470, 200], [410, 200]],
  },
}

const narrowLayout: Layout = {
  vb: '0 0 340 450',
  pos: { pending: [110, 50], paid: [110, 160], shipped: [110, 270], delivered: [110, 380], cancelled: [270, 50], refunded: [270, 270] },
  label: {
    pending: { x: 88, y: 55, anchor: 'end' },
    paid: { x: 88, y: 165, anchor: 'end' },
    shipped: { x: 88, y: 275, anchor: 'end' },
    delivered: { x: 88, y: 385, anchor: 'end' },
    cancelled: { x: 270, y: 90, anchor: 'middle' },
    refunded: { x: 270, y: 310, anchor: 'middle' },
  },
  edges: {
    'pending-pay': [[110, 50], [110, 160]],
    'pending-cancel': [[110, 50], [270, 50]],
    'paid-ship': [[110, 160], [110, 270]],
    'paid-cancel': [[110, 160], [220, 270], [270, 270]],
    'shipped-deliver': [[110, 270], [110, 380]],
    'delivered-refund': [[110, 380], [220, 270], [270, 270]],
  },
}

const toPath = (pts: P[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(' ')

export function StateMachine() {
  const reduced = useReducedMotion()
  const narrow = useMediaQuery('(max-width: 559px)')
  const L = narrow ? narrowLayout : wideLayout
  const [cur, setCur] = useState<S>('pending')
  const [path, setPath] = useState<string[]>([])
  const [visited, setVisited] = useState<Set<S>>(new Set(['pending']))
  const [log, setLog] = useState<{ id: number; text: string; tone?: 'ok' | 'bad' }[]>([])
  const nid = useRef(0)

  const available = transitions.filter((t) => t.from === cur)
  const terminal = available.length === 0

  const fire = (a: A) => {
    const t = transitions.find((x) => x.from === cur && x.a === a)
    const verb = actions.find((x) => x.a === a)!.verb
    if (!t) {
      setLog((l) => [
        { id: nid.current++, text: `${states[cur].cls}.${a}() → InvalidTransition: no se puede ${verb} un pedido ${states[cur].label.toLowerCase()}`, tone: 'bad' as const },
        ...l,
      ].slice(0, 20))
      return
    }
    setCur(t.to)
    setPath((p) => [...p, `${t.from}-${t.a}`])
    setVisited((v) => new Set(v).add(t.to))
    setLog((l) => [
      { id: nid.current++, text: `${states[cur].cls}.${a}() → order.setState(new ${states[t.to].cls}())`, tone: 'ok' as const },
      ...l,
    ].slice(0, 20))
  }

  const reset = () => {
    setCur('pending')
    setPath([])
    setVisited(new Set(['pending']))
    setLog([])
  }

  const [cx, cy] = L.pos[cur]

  return (
    <WidgetFrame
      caption="Cada nodo es una clase de estado. El pedido delega cada acción en su estado actual, que decide si la transición es válida y cuál es el siguiente estado."
      controls={
        <div className="sm-controls" role="group" aria-label="Acciones sobre el pedido">
          {actions.map((x) => {
            const ok = available.some((t) => t.a === x.a)
            return (
              <button
                key={x.a}
                type="button"
                className={`btn ${ok ? 'btn--line' : 'sm-blocked'}`}
                onClick={() => fire(x.a)}
                aria-label={`${x.label}${ok ? '' : ' (no válido en este estado)'}`}
              >
                {x.label}
              </button>
            )
          })}
          <button type="button" className="icon-btn" onClick={reset} aria-label="Reiniciar pedido">
            <RotateCcw size={18} />
          </button>
        </div>
      }
      readout={
        <div className="sm-readout">
          <p aria-live="polite">
            Estado actual: <b className="sm-cur">{states[cur].cls}</b>
            {terminal
              ? ' — estado final: ninguna acción es válida.'
              : ` — acepta: ${available.map((t) => `${t.a}()`).join(', ')}.`}
          </p>
          <Log entries={log} empty="Prueba una acción válida (resaltada) y una bloqueada." />
        </div>
      }
    >
      <svg className="sm-svg" viewBox={L.vb} role="img" aria-label={`Ciclo de vida del pedido. Estado actual: ${states[cur].label}`}>
        {transitions.map((t) => {
          const id = `${t.from}-${t.a}`
          const done = path.includes(id)
          const next = t.from === cur
          const pts = L.edges[id]
          const mid = [(pts[0][0] + pts[1][0]) / 2, (pts[0][1] + pts[1][1]) / 2]
          return (
            <g key={id} className={`sm-edge ${done ? 'is-done' : ''} ${next ? 'is-next' : ''}`}>
              <path d={toPath(pts)} className="sm-edge__casing" />
              <path d={toPath(pts)} className="sm-edge__line" />
              <text
                x={pts[0][0] === pts[1][0] ? mid[0] + 14 : mid[0]}
                y={pts[0][0] === pts[1][0] ? mid[1] + 5 : mid[1] - 9}
                textAnchor={pts[0][0] === pts[1][0] ? 'start' : 'middle'}
                className="sm-edge__label"
              >
                {t.a}()
              </text>
            </g>
          )
        })}
        {(Object.keys(states) as S[]).map((s) => {
          const [x, y] = L.pos[s]
          const lab = L.label[s]
          const on = s === cur
          return (
            <g key={s} className={`sm-station ${on ? 'is-on' : ''} ${visited.has(s) ? 'is-visited' : ''}`}>
              <circle cx={x} cy={y} r={13} className="sm-station__dot" />
              <text x={lab.x} y={lab.y} textAnchor={lab.anchor} className="sm-station__label">
                {states[s].label}
              </text>
            </g>
          )
        })}
        <motion.circle
          className="sm-train"
          r={7}
          initial={false}
          animate={{ cx, cy }}
          transition={{ duration: reduced ? 0 : 0.4, ease: [0.16, 1, 0.3, 1] }}
        />
      </svg>
    </WidgetFrame>
  )
}
