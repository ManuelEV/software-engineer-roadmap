import { useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Pause, Play, RotateCcw, Send } from 'lucide-react'
import { Log, Slider, Stat, WidgetFrame } from '../kit'
import { EASE, fmt, rng, useTicker } from './shared'
import './CircuitBreaker.css'

type BState = 'closed' | 'open' | 'half'
const WINDOW = 10
const MIN_CALLS = 5
const THRESHOLD = 0.5
const COOLDOWN = 5
const PROBES = 3
const TIMEOUT = 2 // seconds a failing call burns
const DT = 0.1
const EVERY = 0.4

type Sim = {
  t: number
  state: BState
  openedAt: number
  window: boolean[] // true = failure
  probesSent: number
  probesOk: number
  calls: number
  failures: number
  rejected: number
  trips: number
  log: { id: number; text: string; tone?: 'ok' | 'warn' | 'bad' }[]
  logId: number
  nextAuto: number
}

const fresh = (): Sim => ({
  t: 0,
  state: 'closed',
  openedAt: 0,
  window: [],
  probesSent: 0,
  probesOk: 0,
  calls: 0,
  failures: 0,
  rejected: 0,
  trips: 0,
  log: [],
  logId: 0,
  nextAuto: 0,
})

const LABEL: Record<BState, string> = { closed: 'Cerrado', open: 'Abierto', half: 'Semiabierto' }

export function CircuitBreaker() {
  const reduced = useReducedMotion()
  const [failRate, setFailRate] = useState(0)
  const [auto, setAuto] = useState(false)
  const sim = useRef<Sim>(fresh())
  const rand = useRef(rng(3))
  const [, setFrame] = useState(0)
  const rerender = () => setFrame((f) => f + 1)

  const log = (s: Sim, text: string, tone?: 'ok' | 'warn' | 'bad') => {
    s.log = [{ id: s.logId++, text: `t=${fmt(s.t)}s · ${text}`, tone }, ...s.log].slice(0, 30)
  }

  const transition = (s: Sim, to: BState, why: string) => {
    s.state = to
    if (to === 'open') {
      s.openedAt = s.t
      s.trips++
    }
    if (to === 'half') {
      s.probesSent = 0
      s.probesOk = 0
    }
    if (to === 'closed') s.window = []
    log(s, `→ ${LABEL[to]}: ${why}`, to === 'open' ? 'bad' : to === 'closed' ? 'ok' : 'warn')
  }

  const request = () => {
    const s = sim.current
    if (s.state === 'open') {
      s.rejected++
      return
    }
    if (s.state === 'half' && s.probesSent >= PROBES) {
      s.rejected++
      return
    }
    const fail = rand.current() * 100 < failRate
    s.calls++
    if (fail) s.failures++
    if (s.state === 'half') {
      s.probesSent++
      if (fail) {
        log(s, `sonda ${s.probesSent} falla`, 'bad')
        transition(s, 'open', 'una sonda falló, otro cooldown')
        return
      }
      s.probesOk++
      log(s, `sonda ${s.probesSent} OK`, 'ok')
      if (s.probesOk >= PROBES) transition(s, 'closed', `${PROBES} sondas exitosas`)
      return
    }
    s.window = [...s.window, fail].slice(-WINDOW)
    const fails = s.window.filter(Boolean).length
    if (s.window.length >= MIN_CALLS && fails / s.window.length >= THRESHOLD) {
      transition(s, 'open', `${fails}/${s.window.length} fallos en la ventana`)
    }
  }

  const s = sim.current
  const running = auto || s.state === 'open'

  useTicker(
    () => {
      const st = sim.current
      st.t = Number((st.t + DT).toFixed(2))
      if (st.state === 'open' && st.t - st.openedAt >= COOLDOWN) transition(st, 'half', `pasaron ${COOLDOWN} s`)
      if (auto && st.t >= st.nextAuto) {
        request()
        st.nextAuto = st.t + EVERY
      }
      rerender()
    },
    DT * 1000,
    running,
  )

  const fails = s.window.filter(Boolean).length
  const cooldownLeft = s.state === 'open' ? Math.max(0, COOLDOWN - (s.t - s.openedAt)) : 0

  const stations: Record<BState, { x: number; y: number }> = {
    closed: { x: 90, y: 70 },
    open: { x: 510, y: 70 },
    half: { x: 300, y: 210 },
  }
  const station = (k: BState) => {
    const on = s.state === k
    const p = stations[k]
    return (
      <g key={k}>
        <motion.circle
          cx={p.x}
          cy={p.y}
          r={on ? 22 : 16}
          className={`cb-station ${on ? 'is-on' : ''} cb-station--${k}`}
          animate={{ r: on ? 22 : 16 }}
          transition={{ duration: reduced ? 0 : 0.3, ease: EASE }}
        />
        <text x={p.x} y={k === 'half' ? p.y + 46 : p.y - 34} textAnchor="middle" className={`cb-name ${on ? 'is-on' : ''}`}>
          {LABEL[k]}
        </text>
      </g>
    )
  }

  return (
    <WidgetFrame
      caption={`Regla: abre si fallan ≥ ${THRESHOLD * 100} % de las últimas ${WINDOW} llamadas (mínimo ${MIN_CALLS}); espera ${COOLDOWN} s; deja pasar ${PROBES} sondas. Cada fallo real cuesta un timeout de ${TIMEOUT} s.`}
      controls={
        <>
          <Slider label="Fallos del servicio de pagos" value={failRate} min={0} max={100} step={5} onChange={setFailRate} format={(v) => `${v} %`} />
          <div className="cb-buttons">
            <button type="button" className="btn btn--line" onClick={() => setAuto((a) => !a)}>
              {auto ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
              {auto ? 'Pausar tráfico' : 'Iniciar tráfico'}
            </button>
            <button type="button" className="btn" onClick={() => { request(); rerender() }}>
              <Send size={16} aria-hidden="true" /> 1 petición
            </button>
            <button type="button" className="icon-btn" onClick={() => { sim.current = fresh(); setAuto(false); rerender() }} aria-label="Reiniciar">
              <RotateCcw size={18} aria-hidden="true" />
            </button>
          </div>
        </>
      }
      readout={
        <div className="cb-readout">
          <div className="cb-stats">
            <Stat label="Llamadas reales" value={s.calls} />
            <Stat label="Fallos reales" value={s.failures} tone={s.failures ? 'bad' : undefined} />
            <Stat label="Rechazadas al instante" value={s.rejected} tone={s.rejected ? 'warn' : undefined} />
            <Stat label="Espera evitada" value={`${fmt(s.rejected * TIMEOUT, 0)} s`} hint="timeouts que no pagaste" tone={s.rejected ? 'ok' : undefined} />
          </div>
          <Log entries={s.log} empty="Inicia el tráfico y sube la tasa de fallos." />
        </div>
      }
    >
      <svg className="cb-svg" viewBox="0 0 600 270" role="img" aria-label={`Estado del circuit breaker: ${LABEL[s.state]}`}>
        {/* closed → open */}
        <path d="M112 70 L488 70" className={`cb-track ${s.state === 'open' ? 'is-hot' : ''}`} />
        <text x={300} y={58} textAnchor="middle" className="cb-edge">fallos ≥ {THRESHOLD * 100} %</text>
        {/* open → half */}
        <path d="M495 87 L375 207 L322 207" className="cb-track" />
        <text x={445} y={168} className="cb-edge">pasa el cooldown</text>
        {/* half → closed */}
        <path d="M278 207 L225 207 L105 87" className="cb-track" />
        <text x={160} y={168} textAnchor="end" className="cb-edge">{PROBES} sondas OK</text>
        {/* half → open */}
        <path d="M318 196 L420 110" className="cb-track cb-track--thin" />
        <text x={372} y={128} textAnchor="end" className="cb-edge cb-edge--small">sonda falla</text>
        {(['closed', 'open', 'half'] as BState[]).map(station)}
        {s.state === 'open' && (
          <g>
            <rect x={455} y={108} width={110} height={8} rx={4} className="cb-cool-bg" />
            <rect x={455} y={108} width={110 * (1 - cooldownLeft / COOLDOWN)} height={8} rx={4} className="cb-cool" />
            <text x={510} y={134} textAnchor="middle" className="cb-edge">{fmt(cooldownLeft)} s</text>
          </g>
        )}
        <g aria-hidden="true">
          {Array.from({ length: WINDOW }, (_, i) => {
            const v = s.window[i]
            return (
              <rect
                key={i}
                x={20 + i * 15}
                y={232}
                width={12}
                height={12}
                rx={3}
                className={v === undefined ? 'cb-cell' : v ? 'cb-cell is-fail' : 'cb-cell is-ok'}
              />
            )
          })}
          <text x={20} y={262} className="cb-edge cb-edge--small">
            ventana: {fails}/{s.window.length} fallos
          </text>
        </g>
        {s.state === 'half' && (
          <text x={300} y={150} textAnchor="middle" className="cb-edge">
            sondas: {s.probesOk}/{PROBES}
          </text>
        )}
      </svg>
    </WidgetFrame>
  )
}
