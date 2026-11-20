import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Pause, Play } from 'lucide-react'
import { Segmented, Slider, WidgetFrame } from '../kit'
import { useTransition } from './shared'
import './EventReplay.css'

type Ev =
  | { type: 'PedidoIniciado'; customer: string }
  | { type: 'ArticuloAgregado'; sku: string; qty: number; price: number }
  | { type: 'ArticuloQuitado'; sku: string }
  | { type: 'DireccionDefinida'; address: string }
  | { type: 'CuponAplicado'; code: string; pct: number }
  | { type: 'PedidoConfirmado' }
  | { type: 'PagoRecibido'; amount: number }
  | { type: 'PedidoEnviado'; tracking: string }

const EVENTS: Ev[] = [
  { type: 'PedidoIniciado', customer: 'c-42' },
  { type: 'ArticuloAgregado', sku: 'POLERA', qty: 2, price: 25 },
  { type: 'ArticuloAgregado', sku: 'ZAPATILLAS', qty: 1, price: 120 },
  { type: 'ArticuloAgregado', sku: 'GORRO', qty: 1, price: 15 },
  { type: 'ArticuloQuitado', sku: 'ZAPATILLAS' },
  { type: 'DireccionDefinida', address: 'Av. Providencia 1234' },
  { type: 'CuponAplicado', code: 'VERANO10', pct: 10 },
  { type: 'PedidoConfirmado' },
  { type: 'PagoRecibido', amount: 58.5 },
  { type: 'PedidoEnviado', tracking: 'CHX-88213' },
]

const LABEL: Record<Ev['type'], string> = {
  PedidoIniciado: 'PedidoIniciado',
  ArticuloAgregado: 'ArtículoAgregado',
  ArticuloQuitado: 'ArtículoQuitado',
  DireccionDefinida: 'DirecciónDefinida',
  CuponAplicado: 'CupónAplicado',
  PedidoConfirmado: 'PedidoConfirmado',
  PagoRecibido: 'PagoRecibido',
  PedidoEnviado: 'PedidoEnviado',
}

function detail(e: Ev): string {
  switch (e.type) {
    case 'PedidoIniciado':
      return `cliente ${e.customer}`
    case 'ArticuloAgregado':
      return `${e.sku} × ${e.qty} a $${e.price}`
    case 'ArticuloQuitado':
      return e.sku
    case 'DireccionDefinida':
      return e.address
    case 'CuponAplicado':
      return `${e.code} (−${e.pct} %)`
    case 'PagoRecibido':
      return `$${e.amount}`
    case 'PedidoEnviado':
      return `tracking ${e.tracking}`
    default:
      return ''
  }
}

interface State {
  status: string
  customer?: string
  lines: Record<string, { qty: number; price: number }>
  address?: string
  discountPct: number
  paid: number
  tracking?: string
}

/** The aggregate's state is a left fold over its events. */
function evolve(s: State, e: Ev): State {
  switch (e.type) {
    case 'PedidoIniciado':
      return { ...s, status: 'BORRADOR', customer: e.customer }
    case 'ArticuloAgregado':
      return { ...s, lines: { ...s.lines, [e.sku]: { qty: (s.lines[e.sku]?.qty ?? 0) + e.qty, price: e.price } } }
    case 'ArticuloQuitado': {
      const { [e.sku]: _removed, ...rest } = s.lines
      return { ...s, lines: rest }
    }
    case 'DireccionDefinida':
      return { ...s, address: e.address }
    case 'CuponAplicado':
      return { ...s, discountPct: e.pct }
    case 'PedidoConfirmado':
      return { ...s, status: 'CONFIRMADO' }
    case 'PagoRecibido':
      return { ...s, status: 'PAGADO', paid: s.paid + e.amount }
    case 'PedidoEnviado':
      return { ...s, status: 'ENVIADO', tracking: e.tracking }
  }
}

const EMPTY: State = { status: '(no existe)', lines: {}, discountPct: 0, paid: 0 }

type View = 'state' | 'abandoned' | 'crud'

export function EventReplay() {
  const [v, setV] = useState(EVENTS.length)
  const [view, setView] = useState<View>('state')
  const [playing, setPlaying] = useState(false)
  const timer = useRef<number | null>(null)
  const t = useTransition(0.2)

  useEffect(() => {
    if (!playing) return
    timer.current = window.setTimeout(() => {
      setV((x) => {
        if (x >= EVENTS.length) {
          setPlaying(false)
          return x
        }
        return x + 1
      })
    }, 700)
    return () => {
      if (timer.current) window.clearTimeout(timer.current)
    }
  }, [playing, v])

  const play = () => {
    if (playing) return setPlaying(false)
    if (v >= EVENTS.length) setV(0)
    setPlaying(true)
  }

  const state = useMemo(() => EVENTS.slice(0, v).reduce(evolve, EMPTY), [v])
  const finalState = useMemo(() => EVENTS.reduce(evolve, EMPTY), [])
  const subtotal = Object.values(state.lines).reduce((s, l) => s + l.qty * l.price, 0)
  const total = subtotal * (1 - state.discountPct / 100)

  // Projection: products added then removed (only possible because the events are kept)
  const abandoned = useMemo(() => {
    const out: Record<string, number> = {}
    for (const e of EVENTS.slice(0, v)) if (e.type === 'ArticuloQuitado') out[e.sku] = (out[e.sku] ?? 0) + 1
    return out
  }, [v])

  return (
    <WidgetFrame
      caption="Event sourcing: el estado del pedido no se guarda, se calcula aplicando los eventos en orden. Mueve el cursor para ver el pedido en cualquier momento del pasado, y cambia de vista para construir otro modelo de lectura con los mismos eventos."
      controls={
        <>
          <button type="button" className="btn btn--line" onClick={play} aria-label={playing ? 'Pausar' : 'Reproducir desde el inicio'}>
            {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
            {playing ? 'Pausar' : 'Reproducir'}
          </button>
          <Slider
            label="Versión del stream"
            value={v}
            min={0}
            max={EVENTS.length}
            onChange={(x) => {
              setPlaying(false)
              setV(x)
            }}
            format={(x) => `${x} de ${EVENTS.length} eventos`}
          />
          <Segmented<View>
            label="Vista"
            value={view}
            onChange={setView}
            options={[
              { value: 'state', label: 'Estado (fold)' },
              { value: 'abandoned', label: 'Proyección: quitados' },
              { value: 'crud', label: 'Fila CRUD' },
            ]}
          />
        </>
      }
    >
      <div className="er-layout">
        <ol className="er-events" aria-label="Eventos del stream pedido-o-981">
          {EVENTS.map((e, i) => {
            const applied = i < v
            return (
              <motion.li key={i} className={`er-ev ${applied ? 'is-applied' : ''} ${i === v - 1 ? 'is-last' : ''}`} animate={{ opacity: applied ? 1 : 0.45 }} transition={t}>
                <span className="er-ev__n">{i + 1}</span>
                <span className="er-ev__type">{LABEL[e.type]}</span>
                <span className="er-ev__d">{detail(e)}</span>
              </motion.li>
            )
          })}
        </ol>

        <div className="er-view" aria-live="polite">
          {view === 'state' && (
            <>
              <span className="er-view__title">Estado reconstruido en la versión {v}</span>
              <dl className="er-dl">
                <dt>estado</dt>
                <dd>{state.status}</dd>
                <dt>cliente</dt>
                <dd>{state.customer ?? '—'}</dd>
                <dt>líneas</dt>
                <dd>
                  {Object.keys(state.lines).length
                    ? Object.entries(state.lines)
                        .map(([sku, l]) => `${sku} × ${l.qty}`)
                        .join(', ')
                    : '—'}
                </dd>
                <dt>total</dt>
                <dd>
                  ${total.toLocaleString('es', { maximumFractionDigits: 2 })}
                  {state.discountPct ? ` (−${state.discountPct} %)` : ''}
                </dd>
                <dt>dirección</dt>
                <dd>{state.address ?? '—'}</dd>
                <dt>pagado</dt>
                <dd>${state.paid}</dd>
                <dt>tracking</dt>
                <dd>{state.tracking ?? '—'}</dd>
              </dl>
            </>
          )}
          {view === 'abandoned' && (
            <>
              <span className="er-view__title">Proyección "productos quitados del carrito"</span>
              {Object.keys(abandoned).length ? (
                <ul className="er-proj">
                  {Object.entries(abandoned).map(([sku, n]) => (
                    <li key={sku}>
                      <b>{sku}</b> quitado {n} {n === 1 ? 'vez' : 'veces'}
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="er-muted">Todavía nadie quitó un producto.</p>
              )}
              <p className="er-note">
                Esta proyección se puede crear hoy y llenarse con todo el historial, aunque nadie la haya pensado cuando se diseñó el sistema. Un consumidor nuevo
                solo tiene que leer el stream desde el evento 1.
              </p>
            </>
          )}
          {view === 'crud' && (
            <>
              <span className="er-view__title">Lo que guardaría un modelo CRUD</span>
              <pre className="er-row">
                {`orders
id       o-981
status   ${finalState.status}
items    POLERA×2, GORRO×1
total    58.50
address  ${finalState.address}`}
              </pre>
              <p className="er-note">
                Una sola fila con el último estado, sin importar dónde esté el cursor. No hay forma de saber que las zapatillas estuvieron en el carrito, cuándo se aplicó el
                cupón ni cuál era el pedido en la versión {v}.
              </p>
            </>
          )}
        </div>
      </div>
    </WidgetFrame>
  )
}
