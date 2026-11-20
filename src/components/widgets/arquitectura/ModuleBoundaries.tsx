import { useMemo, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { GitMerge, RotateCcw } from 'lucide-react'
import { Log, Segmented, Stat, WidgetFrame } from '../kit'
import { useTransition } from './shared'
import './ModuleBoundaries.css'

type ModId = 'orders' | 'payments' | 'catalog' | 'shipping' | 'customers'
type Kind = 'api' | 'event' | 'internal' | 'table'

const MODS: { id: ModId; label: string; x: number; y: number }[] = [
  { id: 'orders', label: 'Pedidos', x: 180, y: 58 },
  { id: 'payments', label: 'Pagos', x: 312, y: 150 },
  { id: 'shipping', label: 'Envíos', x: 262, y: 272 },
  { id: 'customers', label: 'Clientes', x: 98, y: 272 },
  { id: 'catalog', label: 'Catálogo', x: 48, y: 150 },
]

interface PR {
  id: number
  title: string
  from: ModId
  to: ModId
  kind: Kind
  path: string
}

const PRS: PR[] = [
  { id: 101, title: 'Pedidos consulta el precio con catalog.getPrice()', from: 'orders', to: 'catalog', kind: 'api', path: 'modules/catalog/index.ts' },
  { id: 102, title: 'Envíos importa la entidad interna OrderRow para leer la dirección', from: 'shipping', to: 'orders', kind: 'internal', path: 'modules/orders/internal/order-row.ts' },
  { id: 103, title: 'Pagos expone payments.charge() y Pedidos la usa', from: 'orders', to: 'payments', kind: 'api', path: 'modules/payments/index.ts' },
  { id: 104, title: 'Reporte de Pagos hace JOIN con la tabla orders', from: 'payments', to: 'orders', kind: 'table', path: 'orders.orders (SQL)' },
  { id: 105, title: 'Pedidos publica OrderPlaced; Envíos se suscribe', from: 'shipping', to: 'orders', kind: 'event', path: 'modules/orders/events.ts' },
  { id: 106, title: 'Catálogo llama a orders/internal/countSales() para el ranking', from: 'catalog', to: 'orders', kind: 'internal', path: 'modules/orders/internal/stats.ts' },
  { id: 107, title: 'Clientes actualiza orders.customer_name con un UPDATE directo', from: 'customers', to: 'orders', kind: 'table', path: 'orders.orders (SQL)' },
]

const ILLEGAL: Kind[] = ['internal', 'table']
const KIND_LABEL: Record<Kind, string> = {
  api: 'API pública',
  event: 'evento publicado',
  internal: 'import interno',
  table: 'tabla ajena',
}

export function ModuleBoundaries() {
  const [rules, setRules] = useState<'off' | 'on'>('off')
  const [next, setNext] = useState(0)
  const [merged, setMerged] = useState<PR[]>([])
  const [log, setLog] = useState<{ id: number; text: string; tone?: 'ok' | 'warn' | 'bad' }[]>([])
  const t = useTransition(0.35)

  const reset = () => {
    setNext(0)
    setMerged([])
    setLog([])
  }

  const mergeNext = () => {
    const pr = PRS[next]
    if (!pr) return
    const bad = ILLEGAL.includes(pr.kind)
    if (bad && rules === 'on') {
      setLog((l) => [
        {
          id: pr.id,
          tone: 'bad',
          text: `#${pr.id} rechazado por CI: no-cross-module-internals: modules/${pr.from}/… → ${pr.path}`,
        },
        ...l,
      ])
    } else {
      setMerged((m) => [...m, pr])
      setLog((l) => [
        {
          id: pr.id,
          tone: bad ? 'warn' : 'ok',
          text: `#${pr.id} fusionado: ${pr.title}${bad ? ' (dependencia oculta)' : ''}`,
        },
        ...l,
      ])
    }
    setNext((n) => n + 1)
  }

  const stats = useMemo(() => {
    const hidden = merged.filter((p) => ILLEGAL.includes(p.kind)).length
    const pairs = new Set(merged.map((p) => `${p.from}>${p.to}`))
    let cycles = 0
    for (const p of pairs) {
      const [a, b] = p.split('>')
      if (a < b && pairs.has(`${b}>${a}`)) cycles++
    }
    // To extract "orders" as a service, every illegal dependency touching it must be rewritten
    const toBreak = merged.filter((p) => ILLEGAL.includes(p.kind) && (p.to === 'orders' || p.from === 'orders')).length
    return { hidden, cycles, toBreak }
  }, [merged])

  const pos = (id: ModId) => MODS.find((m) => m.id === id)!
  const pending = PRS[next]

  return (
    <WidgetFrame
      caption="Fusiona pull requests uno a uno. Sin reglas automáticas, cada atajo razonable en el momento agrega una dependencia oculta; con reglas en CI, los atajos se rechazan y el diseño se mantiene. Así se forma (o se evita) una bola de barro."
      controls={
        <>
          <Segmented
            label="Reglas de fronteras en CI"
            value={rules}
            onChange={(v) => {
              setRules(v)
              reset()
            }}
            options={[
              { value: 'off', label: 'Desactivadas' },
              { value: 'on', label: 'Activadas' },
            ]}
          />
          <div className="mb-actions">
            <button type="button" className="btn btn--line" onClick={mergeNext} disabled={!pending}>
              <GitMerge size={16} aria-hidden="true" />
              {pending ? `Fusionar PR #${pending.id}` : 'No hay más PRs'}
            </button>
            <button type="button" className="icon-btn" onClick={reset} aria-label="Reiniciar">
              <RotateCcw size={18} />
            </button>
          </div>
        </>
      }
      readout={
        <div className="mb-readout">
          <div className="mb-stats">
            <Stat label="Dependencias ocultas" value={stats.hidden} tone={stats.hidden ? 'bad' : 'ok'} />
            <Stat label="Ciclos entre módulos" value={stats.cycles} tone={stats.cycles ? 'bad' : 'ok'} />
            <Stat
              label="A reescribir para extraer Pedidos"
              value={stats.toBreak}
              tone={stats.toBreak ? 'warn' : 'ok'}
            />
          </div>
          <Log entries={log} empty="Ningún PR fusionado todavía." />
        </div>
      }
    >
      <div className="mb-layout">
        <svg className="mb-svg" viewBox="0 0 360 320" role="img" aria-label="Grafo de dependencias entre módulos">
          <defs>
            <marker id="mb-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="mb-arrowhead" />
            </marker>
            <marker id="mb-arrow-bad" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0,0 L10,5 L0,10 z" className="mb-arrowhead is-bad" />
            </marker>
          </defs>
          <AnimatePresence>
            {merged.map((p, i) => {
              const a = pos(p.from)
              const b = pos(p.to)
              const bad = ILLEGAL.includes(p.kind)
              // offset parallel edges a bit so A→B and B→A don't overlap
              const dx = b.x - a.x
              const dy = b.y - a.y
              const len = Math.hypot(dx, dy)
              const nx = (-dy / len) * (6 + (i % 3) * 5)
              const ny = (dx / len) * (6 + (i % 3) * 5)
              const shrink = 40 / len
              const x1 = a.x + dx * shrink + nx
              const y1 = a.y + dy * shrink + ny
              const x2 = b.x - dx * shrink + nx
              const y2 = b.y - dy * shrink + ny
              return (
                <motion.line
                  key={p.id}
                  x1={x1}
                  y1={y1}
                  x2={x2}
                  y2={y2}
                  className={`mb-edge ${bad ? 'is-bad' : ''} ${p.kind === 'event' ? 'is-event' : ''}`}
                  markerEnd={`url(#${bad ? 'mb-arrow-bad' : 'mb-arrow'})`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={t}
                />
              )
            })}
          </AnimatePresence>
          {MODS.map((m) => {
            const involved = pending && (pending.from === m.id || pending.to === m.id)
            return (
              <g key={m.id} className={`mb-mod ${involved ? 'is-next' : ''}`}>
                <circle cx={m.x} cy={m.y} r={34} />
                <text x={m.x} y={m.y + 5} textAnchor="middle">
                  {m.label}
                </text>
              </g>
            )
          })}
        </svg>
        <div className="mb-pr" aria-live="polite">
          {pending ? (
            <>
              <span className="mb-pr__tag">Siguiente PR #{pending.id}</span>
              <p className="mb-pr__title">{pending.title}</p>
              <p className="mb-pr__meta">
                Depende de: <code>{pending.path}</code>
                <span className={`mb-kind ${ILLEGAL.includes(pending.kind) ? 'is-bad' : 'is-ok'}`}>
                  {KIND_LABEL[pending.kind]}
                </span>
              </p>
            </>
          ) : (
            <p className="mb-pr__title">
              {rules === 'off'
                ? 'Todos los PRs entraron. Cada uno era razonable por separado; juntos dejaron a Pedidos imposible de extraer sin reescribir a sus vecinos.'
                : 'Los atajos se rechazaron. Los equipos tuvieron que pedir una API pública o suscribirse a un evento: más trabajo hoy, módulos extraíbles mañana.'}
            </p>
          )}
          <ul className="mb-legend">
            <li>
              <span className="mb-swatch" /> API pública o evento
            </li>
            <li>
              <span className="mb-swatch is-bad" /> Interno o tabla ajena
            </li>
          </ul>
        </div>
      </div>
    </WidgetFrame>
  )
}
