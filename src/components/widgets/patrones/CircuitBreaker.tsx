import { useCallback, useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Pause, Play, RotateCcw, Send } from 'lucide-react'
import { Log, Slider, Stat, WidgetFrame } from '../kit'
import './CircuitBreaker.css'

type BState = 'closed' | 'open' | 'half'

const WINDOW = 10
const MIN_CALLS = 5

const stateLabel: Record<BState, string> = {
  closed: 'CERRADO',
  open: 'ABIERTO',
  half: 'SEMIABIERTO',
}

const pos: Record<BState, { x: number; y: number }> = {
  closed: { x: 70, y: 168 },
  half: { x: 200, y: 58 },
  open: { x: 330, y: 168 },
}

type Pt = { x: number; y: number }

function arrow(a: Pt, b: Pt, offset: number, r = 30) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const len = Math.hypot(dx, dy)
  const ux = dx / len
  const uy = dy / len
  const nx = -uy * offset
  const ny = ux * offset
  const s = { x: a.x + ux * r + nx, y: a.y + uy * r + ny }
  const e = { x: b.x - ux * (r + 4) + nx, y: b.y - uy * (r + 4) + ny }
  const hx = e.x - ux * 10
  const hy = e.y - uy * 10
  const head = `M${hx - uy * 6},${hy + ux * 6} L${e.x},${e.y} L${hx + uy * 6},${hy - ux * 6}`
  return { line: `M${s.x},${s.y} L${e.x},${e.y}`, head, mid: { x: (s.x + e.x) / 2, y: (s.y + e.y) / 2 } }
}

interface Entry {
  id: number
  text: string
  tone?: 'ok' | 'warn' | 'bad'
}

export function CircuitBreaker() {
  const reduced = useReducedMotion()
  const [failRate, setFailRate] = useState(20)
  const [threshold, setThreshold] = useState(50)
  const [cooldown, setCooldown] = useState(4)
  const [state, setState] = useState<BState>('closed')
  const [windowCalls, setWindowCalls] = useState<boolean[]>([])
  const [openedAt, setOpenedAt] = useState<number | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [auto, setAuto] = useState(false)
  const [stats, setStats] = useState({ sent: 0, ok: 0, failed: 0, rejected: 0 })
  const [log, setLog] = useState<Entry[]>([])
  const [lastEdge, setLastEdge] = useState<string | null>(null)
  const seq = useRef(0)

  // Keep a ref with the latest values so the auto-fire interval never goes stale.
  const live = useRef({ state, windowCalls, openedAt, failRate, threshold, cooldown })
  live.current = { state, windowCalls, openedAt, failRate, threshold, cooldown }

  const push = useCallback((text: string, tone?: Entry['tone']) => {
    seq.current += 1
    const id = seq.current
    setLog((l) => [{ id, text, tone }, ...l].slice(0, 30))
  }, [])

  const transition = useCallback(
    (from: BState, to: BState, why: string) => {
      setState(to)
      setLastEdge(`${from}-${to}`)
      push(`→ ${stateLabel[to]}: ${why}`, to === 'closed' ? 'ok' : to === 'open' ? 'bad' : 'warn')
    },
    [push],
  )

  // Cool-down clock: while OPEN, tick and move to HALF-OPEN when the time is up.
  useEffect(() => {
    if (state !== 'open' || openedAt === null) return
    const t = window.setInterval(() => {
      const n = Date.now()
      setNow(n)
      if (n - openedAt >= live.current.cooldown * 1000) {
        transition('open', 'half', `pasaron ${live.current.cooldown} s; se permite una llamada de prueba`)
      }
    }, 200)
    return () => window.clearInterval(t)
  }, [state, openedAt, transition])

  const fire = useCallback(() => {
    const { state: s, windowCalls: w, failRate: fr, threshold: th } = live.current
    setStats((st) => ({ ...st, sent: st.sent + 1 }))
    if (s === 'open') {
      setStats((st) => ({ ...st, rejected: st.rejected + 1 }))
      push('rechazada al instante (CallNotPermitted): ni se llamó a pagos', 'warn')
      return
    }
    const failed = Math.random() * 100 < fr
    setStats((st) => ({ ...st, ok: st.ok + (failed ? 0 : 1), failed: st.failed + (failed ? 1 : 0) }))
    if (s === 'half') {
      if (failed) {
        push('prueba → 503 del servicio de pagos', 'bad')
        setOpenedAt(Date.now())
        setNow(Date.now())
        transition('half', 'open', 'la llamada de prueba falló; vuelve a esperar')
      } else {
        push('prueba → 200 OK', 'ok')
        setWindowCalls([])
        transition('half', 'closed', 'la prueba salió bien; se reanuda el tráfico')
      }
      return
    }
    // CLOSED
    const next = [...w, failed].slice(-WINDOW)
    setWindowCalls(next)
    push(failed ? 'llamada → 503 del servicio de pagos' : 'llamada → 200 OK', failed ? 'bad' : 'ok')
    const rate = (next.filter(Boolean).length / next.length) * 100
    if (next.length >= MIN_CALLS && rate >= th) {
      setOpenedAt(Date.now())
      setNow(Date.now())
      transition('closed', 'open', `tasa de fallo ${Math.round(rate)} % ≥ ${th} % en las últimas ${next.length} llamadas`)
    }
  }, [push, transition])

  useEffect(() => {
    if (!auto) return
    const t = window.setInterval(fire, 650)
    return () => window.clearInterval(t)
  }, [auto, fire])

  const reset = () => {
    setAuto(false)
    setState('closed')
    setWindowCalls([])
    setOpenedAt(null)
    setStats({ sent: 0, ok: 0, failed: 0, rejected: 0 })
    setLog([])
    setLastEdge(null)
  }

  const rate = windowCalls.length ? Math.round((windowCalls.filter(Boolean).length / windowCalls.length) * 100) : 0
  const remaining = state === 'open' && openedAt !== null ? Math.max(0, cooldown - (now - openedAt) / 1000) : 0

  const edges: { from: BState; to: BState; label: string; offset: number; lx: number; ly: number }[] = [
    { from: 'closed', to: 'open', label: 'fallos ≥ umbral', offset: 0, lx: 200, ly: 198 },
    { from: 'open', to: 'half', label: 'cool-down', offset: -8, lx: 318, ly: 94 },
    { from: 'half', to: 'open', label: 'falla', offset: -8, lx: 236, ly: 132 },
    { from: 'half', to: 'closed', label: 'prueba OK', offset: 0, lx: 82, ly: 96 },
  ]

  return (
    <WidgetFrame
      caption="Un circuit breaker delante del servicio de pagos. Sube la tasa de fallo y dispara peticiones: cuando la ventana supera el umbral, el circuito se abre y las llamadas fallan rápido sin tocar al servicio."
      controls={
        <>
          <Slider label="Fallo del servicio" value={failRate} min={0} max={100} step={5} onChange={setFailRate} format={(v) => `${v} %`} />
          <Slider label="Umbral de apertura" value={threshold} min={20} max={90} step={10} onChange={setThreshold} format={(v) => `${v} %`} />
          <Slider label="Cool-down" value={cooldown} min={2} max={8} onChange={setCooldown} format={(v) => `${v} s`} />
        </>
      }
      readout={
        <div className="cb-readout">
          <div className="cb-stats">
            <Stat label="Enviadas" value={stats.sent} />
            <Stat label="OK" value={stats.ok} tone="ok" />
            <Stat label="Fallaron" value={stats.failed} tone="bad" />
            <Stat label="Cortocircuitadas" value={stats.rejected} tone="warn" hint="no llegaron a pagos" />
          </div>
          <Log entries={log} empty="Envía una petición para empezar." />
        </div>
      }
    >
      <div className="cb-actions">
        <button type="button" className="btn btn--line" onClick={fire}>
          <Send size={16} aria-hidden="true" /> Enviar petición
        </button>
        <button type="button" className="btn" onClick={() => setAuto((a) => !a)} aria-pressed={auto}>
          {auto ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
          {auto ? 'Pausar tráfico' : 'Tráfico continuo'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={reset}>
          <RotateCcw size={16} aria-hidden="true" /> Reiniciar
        </button>
      </div>

      <svg className="cb-svg" viewBox="0 0 400 222" role="img" aria-label={`Estado del circuito: ${stateLabel[state]}`}>
        {edges.map((e) => {
          const a = arrow(pos[e.from], pos[e.to], e.offset)
          const on = lastEdge === `${e.from}-${e.to}` && e.to === state
          return (
            <g key={`${e.from}-${e.to}`} className={`cb-edge ${on ? 'is-on' : ''}`}>
              <path d={a.line} />
              <path d={a.head} />
              <text x={e.lx} y={e.ly} textAnchor="middle">
                {e.label}
              </text>
            </g>
          )
        })}
        {(Object.keys(pos) as BState[]).map((k) => {
          const p = pos[k]
          const on = state === k
          return (
            <g key={k} className={`cb-node cb-node--${k} ${on ? 'is-on' : ''}`}>
              <motion.circle
                cx={p.x}
                cy={p.y}
                r={24}
                animate={{ scale: on && !reduced ? 1.08 : 1 }}
                transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                style={{ transformOrigin: `${p.x}px ${p.y}px` }}
              />
              <text x={p.x} y={k === 'half' ? p.y - 34 : p.y + 44} textAnchor="middle" className="cb-node__label">
                {stateLabel[k]}
              </text>
            </g>
          )
        })}
        {state === 'open' && (
          <text x={pos.open.x} y={pos.open.y + 5} textAnchor="middle" className="cb-timer">
            {remaining.toFixed(1)}s
          </text>
        )}
      </svg>

      <div className="cb-window" aria-label={`Ventana de las últimas ${WINDOW} llamadas: ${rate} % de fallos`}>
        <span className="cb-window__label">
          Ventana ({windowCalls.length}/{WINDOW}) · fallos {rate} %
          {windowCalls.length < MIN_CALLS ? ` · mínimo ${MIN_CALLS} llamadas para evaluar` : ''}
        </span>
        <div className="cb-window__dots">
          {Array.from({ length: WINDOW }).map((_, i) => {
            const v = windowCalls[i]
            return <span key={i} className={`cb-dot ${v === undefined ? '' : v ? 'is-bad' : 'is-ok'}`} />
          })}
        </div>
      </div>
    </WidgetFrame>
  )
}
