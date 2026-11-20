import { useEffect, useMemo, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { WidgetFrame, Segmented, Slider, Stat } from '../kit'
import './AdaptiveBitrate.css'

type Profile = 'stable' | 'tunnel' | 'wobbly' | 'mobile'
type Algo = 'throughput' | 'buffer' | 'fixed'

/** Escalera de calidades (bitrates de ejemplo, en Mbps). */
const LADDER = [
  { name: '240p', mbps: 0.4 },
  { name: '360p', mbps: 0.8 },
  { name: '480p', mbps: 1.4 },
  { name: '720p', mbps: 2.8 },
  { name: '1080p', mbps: 5.0 },
]
const SEG = 4 // seconds per segment
const DURATION = 120 // seconds of wall-clock simulated
const MAX_BUFFER = 30

/** Bandwidth in Mbps at wall-clock time t. */
function bandwidth(p: Profile, t: number, scale: number): number {
  let v: number
  switch (p) {
    case 'stable':
      v = 8
      break
    case 'tunnel':
      v = t < 40 ? 7 : t < 70 ? 0.6 : t < 80 ? 2 : 7
      break
    case 'wobbly':
      v = 3.2 + 2.4 * Math.sin(t / 6) + 1.2 * Math.sin(t / 2.3)
      break
    case 'mobile':
      v = t < 25 ? 2.2 : t < 55 ? 1.1 : t < 85 ? 3.5 : 1.6
      break
  }
  return Math.max(0.15, v * scale)
}

interface Sample {
  t: number
  bw: number
  buffer: number
  level: number // rendition index being downloaded
  stalled: boolean
}

function simulate(profile: Profile, algo: Algo, scale: number) {
  const dt = 0.1
  let t = 0
  let buffer = 0
  let downloading = -1
  let remainingMb = 0
  let level = 0
  let est = bandwidth(profile, 0, scale) * 0.6 // throughput estimate (EWMA)
  let segStart = 0
  let started = false
  let stallTime = 0
  let stalls = 0
  let wasStalled = false
  let switches = 0
  let lastLevel = -1
  let playedBits = 0
  let played = 0
  const samples: Sample[] = []

  const choose = (): number => {
    if (algo === 'fixed') return LADDER.length - 1
    if (algo === 'throughput') {
      // highest rendition below 80% of estimated throughput
      let l = 0
      LADDER.forEach((r, i) => {
        if (r.mbps <= est * 0.8) l = i
      })
      return l
    }
    // buffer-based (BBA-like): map buffer level linearly onto the ladder
    const reservoir = 6
    const cushion = 20
    if (buffer <= reservoir) return 0
    const f = Math.min(1, (buffer - reservoir) / cushion)
    return Math.min(LADDER.length - 1, Math.floor(f * LADDER.length))
  }

  while (t < DURATION) {
    const bw = bandwidth(profile, t, scale)
    // start a new segment download if idle and buffer has room
    if (downloading < 0 && buffer + SEG <= MAX_BUFFER) {
      level = choose()
      if (lastLevel >= 0 && level !== lastLevel) switches++
      lastLevel = level
      downloading = level
      remainingMb = LADDER[level].mbps * SEG
      segStart = t
    }
    if (downloading >= 0) {
      remainingMb -= bw * dt
      if (remainingMb <= 0) {
        const took = t + dt - segStart
        est = 0.7 * est + 0.3 * ((LADDER[downloading].mbps * SEG) / took)
        buffer += SEG
        downloading = -1
        if (!started && buffer >= SEG) started = true
      }
    }
    // playback
    let stalled = false
    if (started) {
      if (buffer > 0) {
        const step = Math.min(dt, buffer)
        buffer -= step
        played += step
        playedBits += step * LADDER[lastLevel < 0 ? 0 : lastLevel].mbps
      } else {
        stalled = true
        stallTime += dt
        if (!wasStalled) stalls++
      }
    } else {
      stalled = true
      stallTime += dt
    }
    wasStalled = stalled && started
    samples.push({ t, bw, buffer, level: downloading >= 0 ? downloading : lastLevel < 0 ? 0 : lastLevel, stalled })
    t = Number((t + dt).toFixed(2))
  }
  return {
    samples,
    stalls,
    stallTime,
    switches,
    avgMbps: played > 0 ? playedBits / played : 0,
  }
}

const X0 = 40
const X1 = 470
const xs = (t: number) => X0 + (t / DURATION) * (X1 - X0)

export function AdaptiveBitrate() {
  const reduced = useReducedMotion()
  const [profile, setProfile] = useState<Profile>('tunnel')
  const [algo, setAlgo] = useState<Algo>('buffer')
  const [scale, setScale] = useState(1)
  const [now, setNow] = useState(DURATION)
  const [playing, setPlaying] = useState(false)
  const raf = useRef<number | null>(null)

  const sim = useMemo(() => simulate(profile, algo, scale), [profile, algo, scale])

  useEffect(() => {
    if (!playing) return
    let prev = performance.now()
    const tick = (ts: number) => {
      const d = (ts - prev) / 1000
      prev = ts
      setNow((n) => {
        const next = n + d * 15
        if (next >= DURATION) {
          setPlaying(false)
          return DURATION
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

  const toggle = () => {
    if (reduced) {
      setNow(DURATION)
      return
    }
    if (now >= DURATION) setNow(0)
    setPlaying((p) => !p)
  }

  const vis = sim.samples.filter((s) => s.t <= now)
  const cur = vis[vis.length - 1] ?? sim.samples[0]

  // chart 1: bandwidth (line) + chosen rendition (step), y in Mbps 0..9
  const B_TOP = 20
  const B_BOT = 150
  const yb = (m: number) => B_BOT - (Math.min(m, 9) / 9) * (B_BOT - B_TOP)
  // chart 2: buffer 0..30 s
  const F_TOP = 178
  const F_BOT = 250
  const yf = (s: number) => F_BOT - (Math.min(s, MAX_BUFFER) / MAX_BUFFER) * (F_BOT - F_TOP)

  const step = (arr: Sample[], f: (s: Sample) => number, y: (v: number) => number) =>
    arr
      .filter((_, i) => i % 2 === 0)
      .map((s, i) => `${i === 0 ? 'M' : 'L'}${xs(s.t).toFixed(1)},${y(f(s)).toFixed(1)}`)
      .join(' ')

  const bwPath = step(vis, (s) => s.bw, yb)
  const lvPath = step(vis, (s) => LADDER[s.level].mbps, yb)
  const bufPath = vis.length
    ? `${step(vis, (s) => s.buffer, yf)} L${xs(vis[vis.length - 1].t).toFixed(1)},${F_BOT} L${xs(0)},${F_BOT} Z`
    : ''

  // stall bands (contiguous stalled runs after start)
  const stallBands: [number, number][] = []
  let open: number | null = null
  vis.forEach((s) => {
    if (s.stalled && open === null) open = s.t
    if (!s.stalled && open !== null) {
      stallBands.push([open, s.t])
      open = null
    }
  })
  if (open !== null) stallBands.push([open, cur.t])

  return (
    <WidgetFrame
      caption="Un reproductor HLS/DASH descarga el video en segmentos de 4 s y elige, segmento a segmento, qué calidad pedir. Cambia la red y el algoritmo: la meta es no congelarse nunca y, después, verse lo mejor posible."
      controls={
        <>
          <Segmented<Profile>
            label="Red"
            value={profile}
            onChange={setProfile}
            options={[
              { value: 'stable', label: 'Fibra estable' },
              { value: 'tunnel', label: 'Túnel' },
              { value: 'wobbly', label: 'Wi-Fi inestable' },
              { value: 'mobile', label: 'Móvil' },
            ]}
          />
          <Segmented<Algo>
            label="Algoritmo ABR"
            value={algo}
            onChange={setAlgo}
            options={[
              { value: 'buffer', label: 'Por buffer' },
              { value: 'throughput', label: 'Por throughput' },
              { value: 'fixed', label: 'Siempre 1080p' },
            ]}
          />
          <Slider label="Escala de la red" value={scale} min={0.4} max={2} step={0.1} onChange={setScale} format={(v) => `× ${v.toFixed(1)}`} />
          <div className="abr-play">
            <button type="button" className="btn btn--line" onClick={toggle}>
              {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
              {playing ? 'Pausar' : 'Reproducir'}
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Ver la simulación completa"
              onClick={() => {
                setPlaying(false)
                setNow(DURATION)
              }}
            >
              <RotateCcw size={18} aria-hidden="true" />
            </button>
          </div>
        </>
      }
      readout={
        <div className="abr-stats">
          <Stat label="Congelamientos" value={sim.stalls} tone={sim.stalls ? 'bad' : 'ok'} hint={`${sim.stallTime.toFixed(1)} s sin imagen (incl. arranque)`} />
          <Stat label="Bitrate medio visto" value={`${sim.avgMbps.toFixed(2)} Mbps`} />
          <Stat label="Cambios de calidad" value={sim.switches} tone={sim.switches > 12 ? 'warn' : undefined} />
          <Stat label="Ahora" value={LADDER[cur.level].name} hint={`buffer ${cur.buffer.toFixed(1)} s · red ${cur.bw.toFixed(1)} Mbps`} />
        </div>
      }
    >
      <svg className="abr-svg" viewBox="0 0 480 272" role="img" aria-label="Ancho de banda, calidad elegida y nivel de buffer durante 120 segundos">
        {/* rendition guide lines */}
        {LADDER.map((r) => (
          <g key={r.name}>
            <line x1={X0} x2={X1} y1={yb(r.mbps)} y2={yb(r.mbps)} stroke="var(--rule)" strokeDasharray="3 4" />
            <text x={X0 - 4} y={yb(r.mbps) + 4} textAnchor="end" className="abr-tick">
              {r.name}
            </text>
          </g>
        ))}
        {stallBands.map(([a, b], i) => (
          <rect key={i} x={xs(a)} y={B_TOP} width={Math.max(1.5, xs(b) - xs(a))} height={F_BOT - B_TOP} fill="color-mix(in oklab, var(--bad) 14%, transparent)" />
        ))}
        <path d={bwPath} fill="none" stroke="var(--ink-3)" strokeWidth={1.5} strokeDasharray="5 3" />
        <path d={lvPath} fill="none" stroke="var(--line)" strokeWidth={4} strokeLinejoin="round" />
        <line x1={X0} x2={X0 + 22} y1={B_TOP - 10} y2={B_TOP - 10} stroke="var(--line)" strokeWidth={4} />
        <text x={X0 + 28} y={B_TOP - 5} className="abr-legend">
          calidad pedida
        </text>
        <line x1={X0 + 140} x2={X0 + 162} y1={B_TOP - 10} y2={B_TOP - 10} stroke="var(--ink-3)" strokeWidth={1.5} strokeDasharray="5 3" />
        <text x={X0 + 168} y={B_TOP - 5} className="abr-legend">
          ancho de banda
        </text>

        {/* buffer */}
        <text x={X0} y={F_TOP - 8} className="abr-legend">
          buffer (s)
        </text>
        <line x1={X0} x2={X1} y1={F_BOT} y2={F_BOT} stroke="var(--rule-strong)" />
        <line x1={X0} x2={X1} y1={yf(MAX_BUFFER)} y2={yf(MAX_BUFFER)} stroke="var(--rule)" strokeDasharray="3 4" />
        <text x={X0 - 4} y={yf(MAX_BUFFER) + 4} textAnchor="end" className="abr-tick">
          30
        </text>
        <text x={X0 - 4} y={F_BOT + 4} textAnchor="end" className="abr-tick">
          0
        </text>
        <path d={bufPath} fill="var(--line-tint-2)" stroke="var(--line)" strokeWidth={2} />

        {[0, 30, 60, 90, 120].map((t) => (
          <text key={t} x={xs(t)} y={268} textAnchor="middle" className="abr-tick">
            {t} s
          </text>
        ))}
        {now < DURATION && <line x1={xs(now)} x2={xs(now)} y1={B_TOP} y2={F_BOT} stroke="var(--ink-2)" strokeWidth={1.5} />}
      </svg>
    </WidgetFrame>
  )
}
