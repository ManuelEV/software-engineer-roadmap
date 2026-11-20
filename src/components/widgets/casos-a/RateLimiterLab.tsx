import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { WidgetFrame, Segmented, Slider, Stat } from '../kit'
import './RateLimiterLab.css'

type Algo = 'bucket' | 'fixed' | 'log' | 'counter'
type Pattern = 'edge' | 'bursts' | 'steady'

const T = 40 // seconds simulated
const W = 10 // window size in seconds

/** Small deterministic PRNG so every visit sees the same traffic. */
function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function traffic(p: Pattern): number[] {
  const rnd = mulberry32(p === 'edge' ? 7 : p === 'bursts' ? 21 : 3)
  const out: number[] = []
  const burst = (start: number, dur: number, n: number) => {
    for (let i = 0; i < n; i++) out.push(start + (dur * (i + rnd() * 0.6)) / n)
  }
  if (p === 'edge') {
    burst(7.6, 2.3, 10) // end of window 0
    burst(10.05, 2.3, 10) // start of window 1
    burst(16, 3, 3)
    burst(27.6, 2.3, 10)
    burst(30.05, 2.3, 10)
    burst(35, 4, 4)
  } else if (p === 'bursts') {
    burst(3, 1.5, 16)
    burst(15, 1.2, 14)
    burst(24, 4, 5)
    burst(31, 1.5, 16)
  } else {
    // ~1.4 req/s with jitter: slightly above a 1 req/s average limit
    let t = 0.3
    while (t < T) {
      out.push(t)
      t += 0.45 + rnd() * 0.55
    }
  }
  return out.filter((t) => t < T).sort((a, b) => a - b)
}

interface Sim {
  accepted: boolean[]
  series: [number, number][]
  label: string
}

function simulate(algo: Algo, reqs: number[], limit: number): Sim {
  const accepted: boolean[] = []
  const series: [number, number][] = []
  const rate = limit / W // tokens per second
  const samples: number[] = []
  for (let s = 0; s <= T; s += 0.2) samples.push(Number(s.toFixed(1)))

  // merged event loop: requests + sample instants
  type Ev = { t: number; kind: 'req'; i: number } | { t: number; kind: 'sample' }
  const evs: Ev[] = [
    ...reqs.map((t, i) => ({ t, kind: 'req' as const, i })),
    ...samples.map((t) => ({ t, kind: 'sample' as const })),
  ].sort((a, b) => a.t - b.t || (a.kind === 'sample' ? 1 : -1))

  // state
  let tokens = limit
  let last = 0
  const log: number[] = []
  const counts = new Map<number, number>()

  const value = (t: number): number => {
    switch (algo) {
      case 'bucket':
        return Math.min(limit, tokens + (t - last) * rate)
      case 'fixed':
        return counts.get(Math.floor(t / W)) ?? 0
      case 'log':
        return log.filter((x) => x > t - W).length
      case 'counter': {
        const k = Math.floor(t / W)
        const frac = (t - k * W) / W
        return (counts.get(k - 1) ?? 0) * (1 - frac) + (counts.get(k) ?? 0)
      }
    }
  }

  for (const ev of evs) {
    if (ev.kind === 'sample') {
      series.push([ev.t, value(ev.t)])
      continue
    }
    const t = ev.t
    let ok = false
    if (algo === 'bucket') {
      tokens = Math.min(limit, tokens + (t - last) * rate)
      last = t
      if (tokens >= 1) {
        tokens -= 1
        ok = true
      }
    } else if (algo === 'fixed') {
      const k = Math.floor(t / W)
      const c = counts.get(k) ?? 0
      if (c < limit) {
        counts.set(k, c + 1)
        ok = true
      }
    } else if (algo === 'log') {
      while (log.length && log[0] <= t - W) log.shift()
      if (log.length < limit) {
        log.push(t)
        ok = true
      }
    } else {
      if (value(t) < limit) {
        const k = Math.floor(t / W)
        counts.set(k, (counts.get(k) ?? 0) + 1)
        ok = true
      }
    }
    accepted[ev.i] = ok
  }
  const label =
    algo === 'bucket'
      ? 'fichas en el balde'
      : algo === 'fixed'
        ? 'contador de la ventana actual'
        : algo === 'log'
          ? 'timestamps en los últimos 10 s'
          : 'estimación ponderada'
  return { accepted, series, label }
}

/** Worst real rate: max accepted requests inside any 10-second window. */
function worstWindow(reqs: number[], acc: boolean[]) {
  const a = reqs.filter((_, i) => acc[i])
  let best = 0
  let start = 0
  let j = 0
  for (let i = 0; i < a.length; i++) {
    while (a[i] - a[j] >= W) j++
    if (i - j + 1 > best) {
      best = i - j + 1
      start = a[j]
    }
  }
  return { best, start }
}

const X0 = 34
const X1 = 470
const xs = (t: number) => X0 + (t / T) * (X1 - X0)

export function RateLimiterLab() {
  const reduced = useReducedMotion()
  const [algo, setAlgo] = useState<Algo>('fixed')
  const [pattern, setPattern] = useState<Pattern>('edge')
  const [limit, setLimit] = useState(10)
  const [now, setNow] = useState(T)
  const [playing, setPlaying] = useState(false)
  const raf = useRef<number | null>(null)

  const reqs = useMemo(() => traffic(pattern), [pattern])
  const sim = useMemo(() => simulate(algo, reqs, limit), [algo, reqs, limit])
  const worst = useMemo(() => worstWindow(reqs, sim.accepted), [reqs, sim])

  useEffect(() => {
    if (!playing) return
    let prev = performance.now()
    const tick = (ts: number) => {
      const dt = (ts - prev) / 1000
      prev = ts
      setNow((n) => {
        const next = n + dt * 6 // 6 simulated seconds per real second
        if (next >= T) {
          setPlaying(false)
          return T
        }
        return next
      })
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  }, [playing])

  const play = () => {
    if (reduced) {
      setNow(T)
      return
    }
    if (now >= T) setNow(0)
    setPlaying((p) => !p)
  }

  const visible = reqs.map((t, i) => ({ t, i, ok: sim.accepted[i] })).filter((r) => r.t <= now)
  const okCount = visible.filter((r) => r.ok).length
  const badCount = visible.length - okCount

  // state chart geometry
  const CH_TOP = 112
  const CH_BOT = 222
  const vmax = Math.max(limit * 1.25, 4)
  const ys = (v: number) => CH_BOT - (Math.min(v, vmax) / vmax) * (CH_BOT - CH_TOP)
  const path = sim.series
    .filter(([t]) => t <= now)
    .map(([t, v], i) => `${i === 0 ? 'M' : 'L'}${xs(t).toFixed(1)},${ys(v).toFixed(1)}`)
    .join(' ')

  const overLimit = worst.best > limit
  const showWindows = algo === 'fixed' || algo === 'counter'

  return (
    <WidgetFrame
      caption="Mismo tráfico, cuatro algoritmos. Arriba, cada punto es una petición (aceptada o rechazada con 429); abajo, el estado interno del limitador. La franja marca el peor intervalo real de 10 s."
      controls={
        <>
          <Segmented<Algo>
            label="Algoritmo"
            value={algo}
            onChange={setAlgo}
            options={[
              { value: 'bucket', label: 'Token bucket' },
              { value: 'fixed', label: 'Ventana fija' },
              { value: 'log', label: 'Log deslizante' },
              { value: 'counter', label: 'Contador deslizante' },
            ]}
          />
          <Segmented<Pattern>
            label="Tráfico"
            value={pattern}
            onChange={setPattern}
            options={[
              { value: 'edge', label: 'Ráfaga en el borde' },
              { value: 'bursts', label: 'Ráfagas' },
              { value: 'steady', label: 'Constante' },
            ]}
          />
          <Slider label="Límite por 10 s" value={limit} min={5} max={20} onChange={setLimit} format={(v) => `${v} req`} />
          <div className="rl-play">
            <button type="button" className="btn btn--line" onClick={play} aria-label={playing ? 'Pausar' : 'Reproducir'}>
              {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
              {playing ? 'Pausar' : 'Reproducir'}
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Mostrar todo"
              onClick={() => {
                setPlaying(false)
                setNow(T)
              }}
            >
              <RotateCcw size={18} aria-hidden="true" />
            </button>
          </div>
        </>
      }
      readout={
        <>
          <div className="rl-stats">
            <Stat label="Aceptadas" value={okCount} tone="ok" />
            <Stat label="Rechazadas (429)" value={badCount} tone={badCount ? 'bad' : undefined} />
            <Stat
              label="Peor ventana real de 10 s"
              value={`${worst.best} / ${limit}`}
              tone={overLimit ? 'bad' : 'ok'}
              hint={overLimit ? 'se pasó del límite' : 'respeta el límite'}
            />
          </div>
          <p className="rl-note">
            {algo === 'fixed' &&
              'Ventana fija: un contador por intervalo [0,10), [10,20)… Es barato (un INCR con expiración), pero en el borde dos ventanas llenas seguidas dejan pasar hasta el doble del límite en pocos segundos.'}
            {algo === 'bucket' &&
              'Token bucket: el balde se rellena a ritmo constante (límite/10 por segundo) y cada petición gasta una ficha. Permite ráfagas hasta la capacidad y después limita al ritmo de recarga. Ojo: promete un ritmo medio, no un tope por ventana; en el peor caso deja pasar capacidad + recarga × 10 s. Guarda solo dos números: fichas y última recarga.'}
            {algo === 'log' &&
              'Log deslizante: guarda el timestamp de cada petición aceptada y cuenta las de los últimos 10 s. Es exacto, pero la memoria crece con el límite (un sorted set por cliente).'}
            {algo === 'counter' &&
              'Contador deslizante: estima la ventana móvil como anterior × (fracción que aún se solapa) + actual. Dos contadores por cliente y, con tráfico real, casi la precisión del log. Pero asume que la ventana anterior fue uniforme: si esa ventana tuvo una ráfaga justo al final, se equivoca (mira la peor ventana con «Ráfaga en el borde»).'}
          </p>
        </>
      }
    >
      <svg className="rl-svg" viewBox="0 0 480 250" role="img" aria-label={`Línea de tiempo de 40 segundos con ${reqs.length} peticiones`}>
        {/* worst window band */}
        {worst.best > 0 && (
          <motion.rect
            initial={false}
            animate={{ x: xs(worst.start), width: xs(W) - xs(0) }}
            transition={{ duration: reduced ? 0 : 0.3, ease: [0.16, 1, 0.3, 1] }}
            y={14}
            height={CH_BOT - 14}
            fill={overLimit ? 'color-mix(in oklab, var(--bad) 12%, transparent)' : 'var(--line-tint)'}
            rx={4}
          />
        )}

        {/* window boundaries */}
        {[10, 20, 30].map((b) => (
          <line
            key={b}
            x1={xs(b)}
            x2={xs(b)}
            y1={14}
            y2={CH_BOT}
            stroke={showWindows ? 'var(--rule-strong)' : 'var(--rule)'}
            strokeDasharray="4 4"
          />
        ))}

        {/* request lane */}
        <text x={4} y={30} className="rl-lane">
          req
        </text>
        <line x1={X0} x2={X1} y1={60} y2={60} stroke="var(--rule-strong)" strokeWidth={4} strokeLinecap="round" />
        {visible.map((r) => {
          const lane = (r.i % 4) - 1.5
          return (
            <motion.circle
              key={`${pattern}-${r.i}`}
              cx={xs(r.t)}
              cy={60 + lane * 11}
              r={4.5}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1, fill: r.ok ? 'var(--ok)' : 'var(--bad)' }}
              transition={{ duration: 0.18 }}
              stroke="var(--paper)"
              strokeWidth={1.5}
            />
          )
        })}

        {/* state chart */}
        <text x={4} y={CH_TOP - 6} className="rl-lane">
          {sim.label}
        </text>
        <line x1={X0} x2={X1} y1={ys(limit)} y2={ys(limit)} stroke="var(--bad)" strokeWidth={1.5} strokeDasharray="6 4" />
        <text x={X1} y={ys(limit) - 5} textAnchor="end" className="rl-limit">
          límite {limit}
        </text>
        <line x1={X0} x2={X1} y1={CH_BOT} y2={CH_BOT} stroke="var(--rule-strong)" />
        <path d={path} fill="none" stroke="var(--line)" strokeWidth={3.5} strokeLinejoin="round" strokeLinecap="round" />

        {/* axis */}
        {[0, 10, 20, 30, 40].map((t) => (
          <text key={t} x={xs(t)} y={242} textAnchor="middle" className="rl-axis">
            {t} s
          </text>
        ))}

        {/* playhead */}
        {now < T && <line x1={xs(now)} x2={xs(now)} y1={14} y2={CH_BOT} stroke="var(--ink-2)" strokeWidth={1.5} />}
      </svg>
    </WidgetFrame>
  )
}
