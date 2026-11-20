import { useMemo, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { Pause, Play, RotateCcw, Shuffle } from 'lucide-react'
import { Slider, WidgetFrame } from '../kit'
import { fmt, rng, useTicker } from './shared'
import './RealtimeTimeline.css'

/** Simulated horizon, in seconds. */
const T = 60
/** Long-polling hold timeout (server answers empty after this), seconds. */
const HOLD = 20

type Bar = { t0: number; t1: number; kind: 'req' | 'empty' | 'hold' | 'conn' | 'handshake' }
type Lane = {
  id: string
  name: string
  note: string
  bars: Bar[]
  deliveries: { ev: number; t: number }[]
  requests: number
  empty: number
}

function makeEvents(seed: number): number[] {
  const r = rng(seed)
  const evs: number[] = []
  let t = 2 + r() * 4
  while (t < T - 3 && evs.length < 9) {
    evs.push(Number(t.toFixed(2)))
    // occasional burst: two events close together
    t += r() < 0.25 ? 0.4 + r() * 0.8 : 3 + r() * 9
  }
  return evs
}

function simulate(events: number[], poll: number, rtt: number): Lane[] {
  const half = rtt / 2

  // Short polling: ask every `poll` seconds.
  const sp: Lane = { id: 'sp', name: 'Short polling', note: `GET cada ${fmt(poll)} s`, bars: [], deliveries: [], requests: 0, empty: 0 }
  {
    const done = new Set<number>()
    for (let t = 0; t < T; t += poll) {
      const seen = t + half
      const ready = events.map((e, i) => ({ e, i })).filter(({ e, i }) => e <= seen && !done.has(i))
      sp.requests++
      if (ready.length === 0) sp.empty++
      ready.forEach(({ i }) => {
        done.add(i)
        sp.deliveries.push({ ev: i, t: t + rtt })
      })
      sp.bars.push({ t0: t, t1: t + rtt, kind: ready.length ? 'req' : 'empty' })
    }
  }

  // Long polling: the server holds the request until there is data or HOLD expires.
  const lp: Lane = { id: 'lp', name: 'Long polling', note: `espera hasta ${HOLD} s`, bars: [], deliveries: [], requests: 0, empty: 0 }
  {
    const done = new Set<number>()
    let t = 0
    while (t < T) {
      lp.requests++
      const s = t + half
      const pending = events.map((e, i) => ({ e, i })).filter(({ i }) => !done.has(i))
      const nextEv = pending.find(({ e }) => e > s)
      const already = pending.filter(({ e }) => e <= s)
      let respondAt: number
      let delivered: number[]
      if (already.length) {
        respondAt = s
        delivered = already.map((p) => p.i)
      } else if (nextEv && nextEv.e - s <= HOLD) {
        respondAt = nextEv.e
        delivered = pending.filter(({ e }) => e <= respondAt).map((p) => p.i)
      } else {
        respondAt = s + HOLD
        delivered = []
        lp.empty++
      }
      const arrive = respondAt + half
      delivered.forEach((i) => {
        done.add(i)
        lp.deliveries.push({ ev: i, t: arrive })
      })
      lp.bars.push({ t0: t, t1: Math.min(arrive, T), kind: delivered.length ? 'hold' : 'empty' })
      t = arrive
    }
  }

  // SSE: one HTTP request that stays open; server pushes text/event-stream.
  const sse: Lane = { id: 'sse', name: 'SSE', note: '1 conexión HTTP abierta', bars: [], deliveries: [], requests: 1, empty: 0 }
  sse.bars.push({ t0: 0, t1: rtt, kind: 'handshake' }, { t0: rtt, t1: T, kind: 'conn' })
  events.forEach((e, i) => sse.deliveries.push({ ev: i, t: Math.max(e, rtt) + half }))

  // WebSocket: HTTP Upgrade (101) and then a full-duplex channel.
  const ws: Lane = { id: 'ws', name: 'WebSocket', note: 'Upgrade → canal bidireccional', bars: [], deliveries: [], requests: 1, empty: 0 }
  ws.bars.push({ t0: 0, t1: rtt, kind: 'handshake' }, { t0: rtt, t1: T, kind: 'conn' })
  events.forEach((e, i) => ws.deliveries.push({ ev: i, t: Math.max(e, rtt) + half }))

  return [sp, lp, sse, ws]
}

const pct = (t: number) => `${(Math.min(Math.max(t, 0), T) / T) * 100}%`

export function RealtimeTimeline() {
  const reduced = useReducedMotion()
  const [poll, setPoll] = useState(5)
  const [rttMs, setRttMs] = useState(150)
  const [seed, setSeed] = useState(7)
  const [now, setNow] = useState(T)
  const [playing, setPlaying] = useState(false)

  const events = useMemo(() => makeEvents(seed), [seed])
  const lanes = useMemo(() => simulate(events, poll, rttMs / 1000), [events, poll, rttMs])

  useTicker(
    () => {
      setNow((n) => {
        const next = n + 0.5
        if (next >= T) {
          setPlaying(false)
          return T
        }
        return next
      })
    },
    80,
    playing,
  )

  const play = () => {
    if (reduced) {
      setNow(T)
      return
    }
    if (now >= T) setNow(0)
    setPlaying((p) => !p)
  }

  const stats = lanes.map((l) => {
    const lat = l.deliveries.map((d) => d.t - events[d.ev])
    const avg = lat.length ? lat.reduce((a, b) => a + b, 0) / lat.length : 0
    const max = lat.length ? Math.max(...lat) : 0
    return { id: l.id, avg, max, delivered: lat.length }
  })

  return (
    <WidgetFrame
      caption="Los mismos eventos del servidor entregados con cuatro técnicas. Cada barra es una petición HTTP; los puntos marcan cuándo el cliente recibe cada evento."
      controls={
        <>
          <Slider label="Intervalo de polling" value={poll} min={1} max={15} step={1} onChange={setPoll} format={(v) => `${v} s`} />
          <Slider label="RTT de red" value={rttMs} min={20} max={600} step={10} onChange={setRttMs} format={(v) => `${v} ms`} />
          <div className="rt-buttons">
            <button type="button" className="btn btn--line" onClick={play} aria-label={playing ? 'Pausar' : 'Reproducir'}>
              {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
              {playing ? 'Pausa' : 'Reproducir'}
            </button>
            <button type="button" className="btn" onClick={() => setSeed((s) => s + 1)}>
              <Shuffle size={16} aria-hidden="true" /> Otros eventos
            </button>
            <button type="button" className="icon-btn" onClick={() => { setPlaying(false); setNow(T) }} aria-label="Mostrar todo">
              <RotateCcw size={18} aria-hidden="true" />
            </button>
          </div>
        </>
      }
      readout={
        <div className="rt-table" role="table" aria-label="Comparación de técnicas">
          <div className="rt-row rt-row--head" role="row">
            <span role="columnheader">Técnica</span>
            <span role="columnheader">Peticiones</span>
            <span role="columnheader">Vacías</span>
            <span role="columnheader">Latencia media</span>
            <span role="columnheader">Peor caso</span>
          </div>
          {lanes.map((l, i) => (
            <div className="rt-row" role="row" key={l.id}>
              <span role="cell" className="rt-name">{l.name}</span>
              <span role="cell">{l.requests}</span>
              <span role="cell" className={l.empty > l.requests / 2 ? 'rt-bad' : ''}>{l.empty}</span>
              <span role="cell">{fmtLatency(stats[i].avg)}</span>
              <span role="cell" className={stats[i].max > 2 ? 'rt-bad' : ''}>{fmtLatency(stats[i].max)}</span>
            </div>
          ))}
        </div>
      }
    >
      <div className="rt-stage">
        <div className="rt-lane rt-lane--server">
          <div className="rt-label">
            <b>Servidor</b> <span>{events.length} eventos en {T} s</span>
          </div>
          <div className="rt-track" aria-hidden="true">
            {events.map((e, i) => (
              <span key={i} className={`rt-ev ${e <= now ? 'is-on' : ''}`} style={{ left: pct(e) }} title={`Evento ${i + 1} a los ${fmt(e)} s`}>
                {i + 1}
              </span>
            ))}
            <span className="rt-now" style={{ left: pct(now) }} />
          </div>
        </div>
        {lanes.map((l) => (
          <div className="rt-lane" key={l.id}>
            <div className="rt-label">
              <b>{l.name}</b> <span>{l.note}</span>
            </div>
            <div className="rt-track" role="img" aria-label={`${l.name}: ${l.requests} peticiones, ${l.empty} vacías`}>
              {l.bars
                .filter((b) => b.t0 <= now)
                .map((b, i) => (
                  <span
                    key={i}
                    className={`rt-bar rt-bar--${b.kind}`}
                    style={{ left: pct(b.t0), width: `calc(${pct(Math.min(b.t1, now))} - ${pct(b.t0)})` }}
                  />
                ))}
              {l.deliveries
                .filter((d) => d.t <= now)
                .map((d) => (
                  <span key={d.ev} className="rt-dot" style={{ left: pct(d.t) }} title={`Evento ${d.ev + 1}: +${fmtLatency(d.t - events[d.ev])}`}>
                    {d.ev + 1}
                  </span>
                ))}
              <span className="rt-now" style={{ left: pct(now) }} />
            </div>
          </div>
        ))}
        <div className="rt-axis" aria-hidden="true">
          {[0, 15, 30, 45, 60].map((s) => (
            <span key={s} style={{ left: pct(s) }}>
              {s} s
            </span>
          ))}
        </div>
        <div className="rt-legend" aria-hidden="true">
          <span><i className="rt-key rt-key--req" /> respuesta con datos</span>
          <span><i className="rt-key rt-key--empty" /> respuesta vacía</span>
          <span><i className="rt-key rt-key--conn" /> conexión abierta</span>
        </div>
      </div>
    </WidgetFrame>
  )
}

function fmtLatency(s: number) {
  return s < 1 ? `${fmt(s * 1000, 0)} ms` : `${fmt(s, 1)} s`
}
