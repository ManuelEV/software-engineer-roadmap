import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Pause, Play, RotateCcw, Snail } from 'lucide-react'
import { Segmented, WidgetFrame } from '../kit'
import './Bulkhead.css'

type Mode = 'shared' | 'isolated'
type Feature = 'pagos' | 'catalogo' | 'recos'

const FEATURES: { id: Feature; label: string; short: string }[] = [
  { id: 'pagos', label: 'Pagos', short: 'P' },
  { id: 'catalogo', label: 'Catálogo', short: 'C' },
  { id: 'recos', label: 'Recomendaciones', short: 'R' },
]

const SLOTS = 9
const PER_POOL = 3
const WINDOW = 60 // ticks used for the availability figure
const NORMAL_LATENCY = 2 // ticks (1 tick = 100 ms simulated)
const SLOW_LATENCY = 40

interface Slot {
  f: Feature
  left: number
  id: number
}

interface Sim {
  tick: number
  slots: (Slot | null)[]
  events: { t: number; f: Feature; ok: boolean }[]
  seq: number
}

function hash(n: number) {
  let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b)
  x ^= x >>> 13
  x = Math.imul(x, 0xc2b2ae35)
  return (x ^ (x >>> 16)) >>> 0
}

const fresh = (): Sim => ({ tick: 0, slots: Array(SLOTS).fill(null), events: [], seq: 0 })

function step(s: Sim, mode: Mode, slow: boolean): Sim {
  const tick = s.tick + 1
  // 1. Requests in flight make progress; finished ones free their slot.
  const slots = s.slots.map((sl) => (sl && sl.left > 1 ? { ...sl, left: sl.left - 1 } : null))
  // 2. One request arrives per tick; the feature is picked by a cheap
  //    deterministic hash so traffic is mixed but reproducible.
  const f = FEATURES[hash(tick) % 3].id
  const range = mode === 'shared' ? [0, SLOTS] : [FEATURES.findIndex((x) => x.id === f) * PER_POOL, FEATURES.findIndex((x) => x.id === f) * PER_POOL + PER_POOL]
  let free = -1
  for (let i = range[0]; i < range[1]; i++) {
    if (!slots[i]) {
      free = i
      break
    }
  }
  const seq = s.seq + 1
  if (free >= 0) slots[free] = { f, left: f === 'recos' && slow ? SLOW_LATENCY : NORMAL_LATENCY, id: seq }
  const events = [...s.events, { t: tick, f, ok: free >= 0 }].filter((e) => e.t > tick - WINDOW)
  return { tick, slots, events, seq }
}

export function Bulkhead() {
  const reduced = useReducedMotion()
  const [mode, setMode] = useState<Mode>('shared')
  const [slow, setSlow] = useState(false)
  const [playing, setPlaying] = useState(false)
  const [sim, setSim] = useState<Sim>(fresh)

  useEffect(() => {
    if (!playing) return
    const t = window.setInterval(() => setSim((s) => step(s, mode, slow)), 130)
    return () => window.clearInterval(t)
  }, [playing, mode, slow])

  const changeMode = (m: Mode) => {
    setMode(m)
    setSim(fresh())
  }

  const avail = FEATURES.map((f) => {
    const evs = sim.events.filter((e) => e.f === f.id)
    const ok = evs.filter((e) => e.ok).length
    return { ...f, pct: evs.length ? Math.round((ok / evs.length) * 100) : 100, rejected: evs.length - ok }
  })

  const pools =
    mode === 'shared'
      ? [{ label: `Pool compartido · ${SLOTS} conexiones`, from: 0, to: SLOTS }]
      : FEATURES.map((f, i) => ({ label: `${f.label} · ${PER_POOL}`, from: i * PER_POOL, to: i * PER_POOL + PER_POOL }))

  return (
    <WidgetFrame
      caption="Tres funcionalidades comparten (o no) las conexiones salientes. Vuelve lenta la de recomendaciones y mira qué pasa con pagos y catálogo en cada modo."
      controls={
        <>
          <Segmented<Mode>
            label="Conexiones"
            value={mode}
            onChange={changeMode}
            options={[
              { value: 'shared', label: 'Un pool compartido' },
              { value: 'isolated', label: 'Bulkheads' },
            ]}
          />
          <button type="button" className={`btn ${slow ? 'bh-slow-on' : ''}`} aria-pressed={slow} onClick={() => setSlow((v) => !v)}>
            <Snail size={16} aria-hidden="true" />
            {slow ? 'Recomendaciones: 4 s' : 'Volver lenta recomendaciones'}
          </button>
        </>
      }
      readout={
        <div className="bh-avail" aria-live="polite">
          {avail.map((a) => (
            <div key={a.id} className="bh-avail__row">
              <span className="bh-avail__label">{a.label}</span>
              <span className="bh-avail__track">
                <motion.span
                  className={`bh-avail__fill ${a.pct < 60 ? 'is-bad' : a.pct < 95 ? 'is-warn' : ''}`}
                  initial={false}
                  animate={{ width: `${a.pct}%` }}
                  transition={{ duration: reduced ? 0 : 0.3, ease: [0.16, 1, 0.3, 1] }}
                />
              </span>
              <span className="bh-avail__pct">{a.pct} %</span>
            </div>
          ))}
          <p className="bh-avail__note">Disponibilidad = peticiones aceptadas en los últimos 6 s simulados. Una petición se rechaza si no hay conexión libre en su pool.</p>
        </div>
      }
    >
      <div className="bh-actions">
        <button type="button" className="btn btn--line" onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>
          {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
          {playing ? 'Pausar' : 'Iniciar tráfico'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => setSim(fresh())}>
          <RotateCcw size={16} aria-hidden="true" /> Reiniciar
        </button>
        <span className="bh-clock">t = {(sim.tick / 10).toFixed(1)} s</span>
      </div>
      <div className={`bh-pools bh-pools--${mode}`}>
        {pools.map((p) => (
          <div key={p.label} className="bh-pool">
            <div className="bh-pool__label">{p.label}</div>
            <div className="bh-pool__slots">
              {sim.slots.slice(p.from, p.to).map((sl, i) => (
                <span
                  key={p.from + i}
                  className={`bh-slot ${sl ? `bh-slot--${sl.f}` : ''}`}
                  aria-label={sl ? `ocupada por ${FEATURES.find((f) => f.id === sl.f)?.label}` : 'libre'}
                >
                  {sl ? FEATURES.find((f) => f.id === sl.f)?.short : ''}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
      <div className="bh-key">
        {FEATURES.map((f) => (
          <span key={f.id} className={`bh-key__item bh-key__item--${f.id}`}>
            <span className={`bh-slot bh-slot--${f.id} bh-slot--mini`}>{f.short}</span>
            {f.label}
          </span>
        ))}
      </div>
    </WidgetFrame>
  )
}
