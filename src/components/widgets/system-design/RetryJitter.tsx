import { useMemo, useState } from 'react'
import { Segmented, Slider, Stat, WidgetFrame } from '../kit'
import { fmt, rng } from './shared'
import './RetryJitter.css'

type Strategy = 'none' | 'expo' | 'full' | 'decor'
const STRATS: { value: Strategy; label: string; formula: string }[] = [
  { value: 'none', label: 'Sin backoff', formula: 'espera = 100 ms fijos' },
  { value: 'expo', label: 'Exponencial', formula: 'espera = min(tope, base · 2^intento)' },
  { value: 'full', label: 'Exp. + full jitter', formula: 'espera = random(0, min(tope, base · 2^intento))' },
  { value: 'decor', label: 'Decorrelated', formula: 'espera = min(tope, random(base, espera_anterior · 3))' },
]

const SLOT = 0.1 // seconds per bucket
const SLOTS = 200 // 20 s horizon
const BASE = 0.1
const CAP = 6.4
const MAX_ATTEMPTS = 10

type Result = { load: number[]; ok: number[]; calls: number; finishedAt: number | null; gaveUp: number; peak: number; pending: number }

function simulate(strategy: Strategy, clients: number, capacity: number, outage: number, seed: number): Result {
  const r = rng(seed)
  const queue: { slot: number; attempt: number; prevSleep: number }[][] = Array.from({ length: SLOTS }, () => [])
  for (let c = 0; c < clients; c++) queue[0].push({ slot: 0, attempt: 0, prevSleep: BASE })
  const load = new Array(SLOTS).fill(0)
  const ok = new Array(SLOTS).fill(0)
  let calls = 0
  let done = 0
  let gaveUp = 0
  let finishedAt: number | null = null
  for (let s = 0; s < SLOTS; s++) {
    const arrivals = queue[s]
    load[s] = arrivals.length
    calls += arrivals.length
    const cap = s * SLOT < outage ? 0 : capacity
    // shuffle so the lucky ones are random
    for (let i = arrivals.length - 1; i > 0; i--) {
      const j = Math.floor(r() * (i + 1))
      ;[arrivals[i], arrivals[j]] = [arrivals[j], arrivals[i]]
    }
    arrivals.forEach((a, i) => {
      if (i < cap) {
        ok[s]++
        done++
        return
      }
      const attempt = a.attempt + 1
      if (attempt >= MAX_ATTEMPTS) {
        gaveUp++
        return
      }
      let sleep: number
      if (strategy === 'none') sleep = BASE
      else if (strategy === 'expo') sleep = Math.min(CAP, BASE * 2 ** attempt)
      else if (strategy === 'full') sleep = r() * Math.min(CAP, BASE * 2 ** attempt)
      else sleep = Math.min(CAP, BASE + r() * (a.prevSleep * 3 - BASE))
      const next = s + Math.max(1, Math.round(sleep / SLOT))
      if (next < SLOTS) queue[next].push({ slot: next, attempt, prevSleep: sleep })
    })
    if (finishedAt === null && done + gaveUp === clients) finishedAt = (s + 1) * SLOT
  }
  const pending = clients - done - gaveUp
  return { load, ok, calls, finishedAt, gaveUp, peak: Math.max(...load.slice(1)), pending }
}

export function RetryJitter() {
  const [strategy, setStrategy] = useState<Strategy>('full')
  const [clients, setClients] = useState(100)
  const [capacity, setCapacity] = useState(8)
  const [outage, setOutage] = useState(1)

  const all = useMemo(
    () =>
      Object.fromEntries(STRATS.map((st) => [st.value, simulate(st.value, clients, capacity, outage, 11)])) as Record<Strategy, Result>,
    [clients, capacity, outage],
  )
  const res = all[strategy]
  const maxY = Math.max(capacity * 2, ...Object.values(all).map((x) => Math.min(x.peak, clients)))
  const H = 180
  const y = (v: number) => 10 + H - (Math.min(v, maxY) / maxY) * H
  const bw = 580 / SLOTS

  return (
    <WidgetFrame
      caption={`${clients} clientes fallan a la vez. El servidor atiende ${capacity} peticiones cada 100 ms (línea punteada) y está caído los primeros ${fmt(outage)} s. Base 100 ms, tope ${fmt(CAP)} s, máximo ${MAX_ATTEMPTS} intentos.`}
      controls={
        <>
          <Segmented label="Estrategia" value={strategy} options={STRATS.map((s) => ({ value: s.value, label: s.label }))} onChange={setStrategy} />
          <Slider label="Clientes" value={clients} min={20} max={300} step={10} onChange={setClients} />
          <Slider label="Capacidad / 100 ms" value={capacity} min={2} max={30} onChange={setCapacity} />
          <Slider label="Caída inicial" value={outage} min={0} max={5} step={0.5} onChange={setOutage} format={(v) => `${fmt(v)} s`} />
        </>
      }
      readout={
        <div className="rj-readout">
          <div className="rj-stats">
            <Stat label="Llamadas totales" value={fmt(res.calls, 0)} hint={`${fmt(res.calls / clients, 1)} por cliente`} tone={res.calls / clients > 4 ? 'bad' : undefined} />
            <Stat
              label="Todos resueltos en"
              value={res.finishedAt === null ? '> 20 s' : `${fmt(res.finishedAt)} s`}
              tone={res.finishedAt === null ? 'bad' : undefined}
            />
            <Stat label="Sin resolver" value={res.gaveUp + res.pending} tone={res.gaveUp + res.pending > 0 ? "warn" : "ok"} hint={`${res.gaveUp} agotaron intentos`} />
            <Stat label="Pico de reintentos" value={`${res.peak}`} hint={`vs capacidad ${capacity}`} tone={res.peak > capacity * 3 ? 'bad' : undefined} />
          </div>
          <div className="rj-cmp" aria-label="Comparación de llamadas totales">
            {STRATS.map((s) => (
              <span key={s.value} className={s.value === strategy ? 'is-on' : ''}>
                {s.label}: <b>{fmt(all[s.value].calls, 0)}</b> llamadas
              </span>
            ))}
          </div>
          <p className="rj-formula">
            <code>{STRATS.find((s) => s.value === strategy)!.formula}</code>
          </p>
        </div>
      }
    >
      <svg className="rj-svg" viewBox="0 0 600 226" role="img" aria-label={`Peticiones por cada 100 ms con ${STRATS.find((s) => s.value === strategy)!.label}`}>
        {outage > 0 && (
          <rect x={10} y={10} width={(outage / SLOT) * bw} height={H} className="rj-outage" />
        )}
        {res.load.map((v, i) => {
          if (!v) return null
          const okH = Math.min(res.ok[i], maxY)
          return (
            <g key={i}>
              <rect x={10 + i * bw} y={y(v)} width={Math.max(bw - 0.6, 1)} height={10 + H - y(v)} className="rj-bar" />
              {okH > 0 && <rect x={10 + i * bw} y={y(okH)} width={Math.max(bw - 0.6, 1)} height={10 + H - y(okH)} className="rj-bar rj-bar--ok" />}
            </g>
          )
        })}
        <line x1={10} x2={590} y1={y(capacity)} y2={y(capacity)} className="rj-cap" />
        <text x={588} y={y(capacity) - 6} textAnchor="end" className="rj-label rj-label--cap">capacidad</text>
        <line x1={10} x2={590} y1={10 + H} y2={10 + H} className="rj-axis" />
        {[0, 5, 10, 15, 20].map((sec) => (
          <text key={sec} x={10 + (sec / SLOT) * bw} y={10 + H + 22} className="rj-label" textAnchor={sec === 0 ? 'start' : sec === 20 ? 'end' : 'middle'}>
            {sec} s
          </text>
        ))}
        {outage > 0 && (
          <text x={14} y={28} className="rj-label">caído</text>
        )}
      </svg>
      <div className="rj-legend" aria-hidden="true">
        <span><i className="rj-key" /> intentos</span>
        <span><i className="rj-key rj-key--ok" /> exitosos</span>
      </div>
    </WidgetFrame>
  )
}
