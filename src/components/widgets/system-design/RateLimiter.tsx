import { useRef, useState } from 'react'
import { RotateCcw, Send, Zap, SplitSquareHorizontal } from 'lucide-react'
import { Segmented, Slider, WidgetFrame } from '../kit'
import { fmt, rng, useTicker } from './shared'
import './RateLimiter.css'

type Algo = 'tb' | 'lb' | 'fw' | 'sl' | 'sc'
const ALGOS: { value: Algo; label: string; long: string }[] = [
  { value: 'tb', label: 'Token bucket', long: 'Token bucket' },
  { value: 'lb', label: 'Leaky bucket', long: 'Leaky bucket (cola)' },
  { value: 'fw', label: 'Ventana fija', long: 'Ventana fija' },
  { value: 'sl', label: 'Log deslizante', long: 'Sliding window log' },
  { value: 'sc', label: 'Contador deslizante', long: 'Sliding window counter' },
]

const DT = 0.1
const VIEW = 15

type Req = { t: number; ok: Record<Algo, boolean> }
type Sim = {
  t: number
  lastActive: number
  reqs: Req[]
  scheduled: number[]
  tb: { tokens: number; last: number }
  lb: { q: number; last: number }
  fw: { win: number; count: number }
  sl: number[]
  sc: { win: number; prev: number; curr: number }
  totals: Record<Algo, { ok: number; ko: number }>
}

function fresh(limit: number): Sim {
  const z = () => ({ ok: 0, ko: 0 })
  return {
    t: 0,
    lastActive: -999,
    reqs: [],
    scheduled: [],
    tb: { tokens: limit, last: 0 },
    lb: { q: 0, last: 0 },
    fw: { win: 0, count: 0 },
    sl: [],
    sc: { win: 0, prev: 0, curr: 0 },
    totals: { tb: z(), lb: z(), fw: z(), sl: z(), sc: z() },
  }
}

function decide(s: Sim, t: number, L: number, W: number): Record<Algo, boolean> {
  const rate = L / W
  // Token bucket: capacity L, refills L tokens per W seconds.
  s.tb.tokens = Math.min(L, s.tb.tokens + (t - s.tb.last) * rate)
  s.tb.last = t
  const tb = s.tb.tokens >= 1
  if (tb) s.tb.tokens -= 1
  // Leaky bucket as a queue: capacity L, drains at a constant L/W per second.
  s.lb.q = Math.max(0, s.lb.q - (t - s.lb.last) * rate)
  s.lb.last = t
  const lb = s.lb.q + 1 <= L + 1e-9
  if (lb) s.lb.q += 1
  // Fixed window counter.
  const win = Math.floor(t / W)
  if (win !== s.fw.win) s.fw = { win, count: 0 }
  const fw = s.fw.count < L
  if (fw) s.fw.count++
  // Sliding window log: timestamps of accepted requests in (t - W, t].
  s.sl = s.sl.filter((x) => x > t - W)
  const sl = s.sl.length < L
  if (sl) s.sl.push(t)
  // Sliding window counter (Cloudflare-style approximation).
  rollSc(s, t, W)
  const est = scEstimate(s, t, W)
  const sc = est + 1 <= L + 1e-9
  if (sc) s.sc.curr++
  return { tb, lb, fw, sl, sc }
}

function rollSc(s: Sim, t: number, W: number) {
  const win = Math.floor(t / W)
  if (win === s.sc.win) return
  s.sc = win === s.sc.win + 1 ? { win, prev: s.sc.curr, curr: 0 } : { win, prev: 0, curr: 0 }
}
function scEstimate(s: Sim, t: number, W: number) {
  const elapsed = t - Math.floor(t / W) * W
  return s.sc.prev * ((W - elapsed) / W) + s.sc.curr
}

export function RateLimiter() {
  const [algo, setAlgo] = useState<Algo>('tb')
  const [L, setL] = useState(5)
  const [W, setW] = useState(5)
  const [auto, setAuto] = useState(0)
  const sim = useRef<Sim>(fresh(5))
  const rand = useRef(rng(42))
  const [, setFrame] = useState(0)
  const rerender = () => setFrame((f) => f + 1)

  const fire = (t: number) => {
    const s = sim.current
    const ok = decide(s, t, L, W)
    s.reqs.push({ t, ok })
    ;(Object.keys(ok) as Algo[]).forEach((k) => (ok[k] ? s.totals[k].ok++ : s.totals[k].ko++))
    s.lastActive = t
  }

  const s = sim.current
  const running = auto > 0 || s.scheduled.length > 0 || s.t - s.lastActive < VIEW

  useTicker(
    () => {
      const st = sim.current
      st.t = Number((st.t + DT).toFixed(3))
      const due = st.scheduled.filter((x) => x <= st.t).sort((a, b) => a - b)
      st.scheduled = st.scheduled.filter((x) => x > st.t)
      due.forEach((x) => fire(x))
      if (auto > 0 && rand.current() < auto * DT) fire(st.t)
      // passive refill so the state panel stays live
      rollSc(st, st.t, W)
      st.reqs = st.reqs.filter((r) => r.t > st.t - VIEW - 1)
      rerender()
    },
    DT * 1000,
    running,
  )

  const reset = (nl = L) => {
    sim.current = fresh(nl)
    rerender()
  }

  const one = () => {
    fire(sim.current.t)
    rerender()
  }
  const burst = () => {
    const t = sim.current.t
    for (let i = 0; i < 8; i++) sim.current.scheduled.push(Number((t + i * 0.05).toFixed(3)))
    sim.current.lastActive = t
    rerender()
  }
  const boundary = () => {
    const st = sim.current
    let b = (Math.floor(st.t / W) + 1) * W
    if (b - st.t < 0.6) b += W
    for (let i = 0; i < L; i++) st.scheduled.push(Number((b - 0.45 + i * 0.06).toFixed(3)))
    for (let i = 0; i < L; i++) st.scheduled.push(Number((b + 0.05 + i * 0.06).toFixed(3)))
    st.lastActive = st.t
    rerender()
  }

  // ---- drawing ----
  const t = s.t
  const x = (time: number) => ((time - (t - VIEW)) / VIEW) * 580 + 10
  const boundaries: number[] = []
  if (algo === 'fw' || algo === 'sc') {
    for (let b = Math.ceil((t - VIEW) / W) * W; b <= t; b += W) if (b >= 0) boundaries.push(b)
  }
  const sliding = algo === 'sl' || algo === 'sc'
  const visible = s.reqs.filter((r) => r.t >= t - VIEW)
  // stack simultaneous ticks so bursts stay readable
  const stackIdx = new Map<Req, number>()
  visible.forEach((r, i) => {
    const prev = visible[i - 1]
    stackIdx.set(r, prev && Math.abs(prev.t - r.t) < 0.12 ? (stackIdx.get(prev) ?? 0) + 1 : 0)
  })

  const tot = s.totals[algo]

  return (
    <WidgetFrame
      caption={`Límite: ${L} peticiones cada ${W} s. Todas las peticiones pasan por los cinco algoritmos a la vez; el gráfico muestra el que elijas.`}
      controls={
        <>
          <Segmented label="Algoritmo" value={algo} options={ALGOS.map((a) => ({ value: a.value, label: a.label }))} onChange={setAlgo} />
          <Slider label="Límite (L)" value={L} min={2} max={10} onChange={(v) => { setL(v); reset(v) }} format={(v) => `${v} pet.`} />
          <Slider label="Ventana (W)" value={W} min={2} max={10} onChange={(v) => { setW(v); reset() }} format={(v) => `${v} s`} />
          <Slider label="Tráfico automático" value={auto} min={0} max={4} step={0.5} onChange={setAuto} format={(v) => (v === 0 ? 'apagado' : `${fmt(v)} pet/s`)} />
        </>
      }
      readout={
        <div className="rl-readout">
          <div className="rl-cmp" role="table" aria-label="Aceptadas y rechazadas por algoritmo">
            {ALGOS.map((a) => (
              <div key={a.value} role="row" className={`rl-cmp__row ${a.value === algo ? 'is-on' : ''}`}>
                <span role="cell" className="rl-cmp__name">{a.long}</span>
                <span role="cell" className="rl-ok">{s.totals[a.value].ok} ✓</span>
                <span role="cell" className="rl-ko">{s.totals[a.value].ko} ✗</span>
              </div>
            ))}
          </div>
        </div>
      }
    >
      <div className="rl-actions">
        <button type="button" className="btn btn--line" onClick={one}>
          <Send size={16} aria-hidden="true" /> 1 petición
        </button>
        <button type="button" className="btn" onClick={burst}>
          <Zap size={16} aria-hidden="true" /> Ráfaga de 8
        </button>
        <button type="button" className="btn" onClick={boundary}>
          <SplitSquareHorizontal size={16} aria-hidden="true" /> {L}+{L} en el borde de ventana
        </button>
        <button type="button" className="icon-btn" onClick={() => reset()} aria-label="Reiniciar">
          <RotateCcw size={18} aria-hidden="true" />
        </button>
      </div>

      <svg className="rl-svg" viewBox="0 0 600 132" role="img" aria-label={`Últimos ${VIEW} segundos: ${tot.ok} aceptadas, ${tot.ko} rechazadas`}>
        {sliding && <rect x={x(t - W)} y={8} width={x(t) - x(t - W)} height={84} className="rl-window" rx={6} />}
        {boundaries.map((b) => (
          <g key={b}>
            <line x1={x(b)} x2={x(b)} y1={4} y2={96} className="rl-boundary" />
          </g>
        ))}
        <line x1={10} x2={590} y1={92} y2={92} className="rl-axis" />
        {visible.map((r) => {
          const k = stackIdx.get(r) ?? 0
          const ok = r.ok[algo]
          return (
            <circle key={r.t + '-' + k} cx={x(r.t)} cy={80 - k * 9} r={4.5} className={ok ? 'rl-tick is-ok' : 'rl-tick is-ko'} />
          )
        })}
        <text x={10} y={120} className="rl-label">−{VIEW} s</text>
        <text x={590} y={120} className="rl-label" textAnchor="end">ahora</text>
        {sliding && (
          <text x={Math.max(x(t - W) + 4, 14)} y={24} className="rl-label rl-label--window">ventana deslizante</text>
        )}
      </svg>

      <div className="rl-state">{renderState(algo, s, L, W)}</div>
    </WidgetFrame>
  )
}

function renderState(algo: Algo, s: Sim, L: number, W: number) {
  const t = s.t
  if (algo === 'tb') {
    const tokens = Math.min(L, s.tb.tokens + (t - s.tb.last) * (L / W))
    return (
      <div className="rl-bucket" aria-label={`Tokens disponibles: ${fmt(tokens)} de ${L}`}>
        <div className="rl-tokens">
          {Array.from({ length: L }, (_, i) => (
            <span key={i} className="rl-token" style={{ opacity: Math.max(0.12, Math.min(1, tokens - i)) }} />
          ))}
        </div>
        <p>
          <b>{fmt(tokens)}</b> de {L} tokens · se recarga 1 token cada {fmt(W / L, 2)} s. Cada petición gasta uno; sin tokens, se rechaza. Permite ráfagas de hasta {L}.
        </p>
      </div>
    )
  }
  if (algo === 'lb') {
    const q = Math.max(0, s.lb.q - (t - s.lb.last) * (L / W))
    return (
      <div className="rl-bucket" aria-label={`Cola: ${fmt(q)} de ${L}`}>
        <div className="rl-queue">
          <span className="rl-queue__fill" style={{ width: `${(q / L) * 100}%` }} />
        </div>
        <p>
          Cola con <b>{fmt(q)}</b> de {L} lugares; sale 1 petición cada {fmt(W / L, 2)} s a ritmo constante. Las que entran esperan (más latencia); con la cola llena, se rechazan.
        </p>
      </div>
    )
  }
  if (algo === 'fw') {
    const win = Math.floor(t / W)
    const count = s.fw.win === win ? s.fw.count : 0
    const left = (win + 1) * W - t
    return (
      <p className="rl-text">
        Ventana #{win + 1}: <b>{count}</b> / {L} aceptadas · se reinicia en {fmt(left)} s. Prueba el botón del borde: {L} justo antes y {L} justo después del corte pasan todas, el doble del límite en menos de un segundo.
      </p>
    )
  }
  if (algo === 'sl') {
    const n = s.sl.filter((v) => v > t - W).length
    return (
      <p className="rl-text">
        Timestamps guardados en los últimos {W} s: <b>{n}</b> / {L}. Exacto, pero guarda un registro por petición: memoria O(L) por cliente.
      </p>
    )
  }
  const win = Math.floor(t / W)
  const prev = s.sc.win === win ? s.sc.prev : s.sc.win === win - 1 ? s.sc.curr : 0
  const curr = s.sc.win === win ? s.sc.curr : 0
  const elapsed = t - win * W
  const weight = (W - elapsed) / W
  return (
    <p className="rl-text">
      Estimación = anterior × peso + actual = {prev} × {fmt(weight, 2)} + {curr} = <b>{fmt(prev * weight + curr, 2)}</b> / {L}. Solo dos contadores por cliente; asume que la ventana anterior fue uniforme.
    </p>
  )
}
