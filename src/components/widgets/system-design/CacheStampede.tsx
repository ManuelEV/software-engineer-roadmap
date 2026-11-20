import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Segmented, Slider, Stat, WidgetFrame } from '../kit'
import { EASE, fmt, fmtCount, rng } from './shared'
import './CacheStampede.css'

type Strategy = 'none' | 'lock' | 'swr' | 'xfetch'

const WINDOW = 10 // seconds shown
const BUCKET = 0.1 // seconds per bar
const EXPIRY = 5 // the hot key's TTL ends here
const DB_CAP = 40 // assumed concurrent queries the DB handles comfortably
const PRE = 60 // simulate the minute before the chart so XFetch can refresh early

interface Result {
  inflight: number[]
  queries: number
  peak: number
  waited: number
  stale: number
  fresh: number
  missDb: number
  firstRefresh: number | null
}

function simulate(strategy: Strategy, rps: number, cost: number): Result {
  const nb = Math.round(WINDOW / BUCKET)
  const inflight = new Array(nb).fill(0)
  const r = rng(1234)
  const queries: [number, number][] = []
  let waited = 0
  let stale = 0
  let fresh = 0
  let missDb = 0
  let firstRefresh: number | null = null

  let expiry = EXPIRY
  let refreshing: number | null = null // time when an in-flight single refresh completes
  const total = Math.round(rps * (WINDOW + PRE))
  for (let i = 0; i < total; i++) {
    const t = (i + 0.5) / rps - PRE
    // a pending single refresh lands
    if (refreshing !== null && t >= refreshing) {
      expiry = refreshing + 60
      refreshing = null
    }
    if (strategy === 'xfetch') {
      // XFetch: recompute early with probability that grows near expiry
      if (t < expiry) {
        const early = t - cost * Math.log(1 - r()) >= expiry
        if (early) {
          queries.push([t, t + cost])
          missDb++
          if (firstRefresh === null) firstRefresh = t
          // when it lands, the TTL is extended
          const done = t + cost
          if (refreshing === null || done < refreshing) refreshing = done
        } else fresh++
        continue
      }
      // nobody refreshed early: behaves like no protection
    }
    if (t < expiry) {
      fresh++
      continue
    }
    // key is expired
    if (strategy === 'none' || strategy === 'xfetch') {
      queries.push([t, t + cost])
      missDb++
      if (firstRefresh === null) firstRefresh = t
      if (refreshing === null) refreshing = t + cost
      continue
    }
    if (refreshing === null) {
      // this request wins the lock / triggers the background refresh
      queries.push([t, t + cost])
      refreshing = t + cost
      if (firstRefresh === null) firstRefresh = t
      if (strategy === 'lock') missDb++
      else stale++
      continue
    }
    if (strategy === 'lock') waited++
    else stale++
  }
  for (const [a, b] of queries) {
    if (b <= 0) continue
    const i0 = Math.max(0, Math.floor(a / BUCKET))
    const i1 = Math.min(nb - 1, Math.floor((b - 1e-9) / BUCKET))
    for (let i = i0; i <= i1; i++) inflight[i]++
  }
  return { inflight, queries: queries.length, peak: Math.max(...inflight), waited, stale, fresh, missDb, firstRefresh }
}

const TEXT: Record<Strategy, string> = {
  none: 'Sin protección: cada petición que llega mientras la clave está vencida va a la base de datos. Con mucho tráfico y un cálculo caro, eso son cientos de consultas idénticas a la vez; si la BD se frena, el cálculo tarda más y la ventana crece.',
  lock: 'Lock / coalescing: solo la primera petición recalcula; las demás esperan ese resultado (single-flight). Una sola consulta, pero esas peticiones pagan la latencia del recálculo. Necesitas un timeout para el lock por si el dueño muere.',
  swr: 'Stale-while-revalidate (TTL blando + duro): al vencer el TTL blando se sirve el valor viejo mientras una sola petición refresca en segundo plano. Nadie espera; a cambio, algunos ven datos con unos segundos de antigüedad.',
  xfetch: 'Expiración temprana probabilística (XFetch): antes de vencer, cada petición tira un dado; la probabilidad de recalcular crece al acercarse la expiración y con el costo del cálculo. Normalmente una sola petición refresca antes de tiempo, sin locks. Con tráfico muy alto puede haber algún recálculo duplicado.',
}

export function CacheStampede() {
  const reduce = useReducedMotion()
  const [strategy, setStrategy] = useState<Strategy>('none')
  const [rps, setRps] = useState(400)
  const [cost, setCost] = useState(1)
  const res = useMemo(() => simulate(strategy, rps, cost), [strategy, rps, cost])

  const W = 360
  const H = 190
  const L = 34
  const R = 8
  const T = 14
  const B = 30
  const plotW = W - L - R
  const plotH = H - T - B
  const yMax = Math.max(DB_CAP * 1.4, res.peak * 1.08)
  const bw = plotW / res.inflight.length
  const y = (v: number) => T + plotH - (v / yMax) * plotH
  const x = (t: number) => L + (t / WINDOW) * plotW

  return (
    <WidgetFrame
      caption="Una clave muy consultada vence en t = 5 s. Las barras muestran cuántas consultas a la base de datos hay en vuelo en cada instante, según la estrategia."
      controls={
        <>
          <Segmented<Strategy>
            label="Estrategia"
            value={strategy}
            onChange={setStrategy}
            options={[
              { value: 'none', label: 'Ninguna' },
              { value: 'lock', label: 'Lock' },
              { value: 'swr', label: 'Stale-while-revalidate' },
              { value: 'xfetch', label: 'XFetch' },
            ]}
          />
          <Slider label="Tráfico a esa clave" value={rps} min={20} max={2000} step={20} onChange={setRps} format={(v) => `${fmt(v, 0)} req/s`} />
          <Slider label="Costo de recalcular" value={cost} min={0.2} max={3} step={0.1} onChange={setCost} format={(v) => `${fmt(v, 1)} s`} />
        </>
      }
      readout={
        <>
          <div className="cst-stats">
            <Stat label="Consultas a la BD" value={fmtCount(res.queries, 1)} tone={res.queries > 5 ? 'bad' : 'ok'} />
            <Stat label="Pico en vuelo" value={fmtCount(res.peak, 1)} tone={res.peak > DB_CAP ? 'bad' : 'ok'} hint={`capacidad ≈ ${DB_CAP}`} />
            <Stat label="Esperaron" value={fmtCount(res.waited + Math.max(0, res.missDb), 1)} tone={res.waited + res.missDb > 50 ? 'warn' : undefined} hint="pagaron el recálculo" />
            <Stat label="Datos viejos" value={fmtCount(res.stale, 1)} hint="servidos con valor vencido" />
          </div>
          <p>
            {TEXT[strategy]}
            {strategy === 'xfetch' && res.firstRefresh !== null && res.firstRefresh < EXPIRY && (
              <>
                {' '}
                En esta corrida el primer recálculo ocurrió {fmt(EXPIRY - res.firstRefresh, 1)} s antes de vencer{res.firstRefresh < 0 ? ' (antes del inicio del gráfico)' : ''}.
              </>
            )}
          </p>
        </>
      }
    >
      <svg className="cst-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Consultas en vuelo: pico de ${res.peak}, total ${res.queries}`}>
        {/* capacity line */}
        <line x1={L} x2={W - R} y1={y(DB_CAP)} y2={y(DB_CAP)} className="cst-cap" />
        <text x={W - R} y={y(DB_CAP) - 4} textAnchor="end" className="cst-cap-label">
          capacidad BD
        </text>
        {/* expiry marker */}
        <line x1={x(EXPIRY)} x2={x(EXPIRY)} y1={T} y2={T + plotH} className="cst-exp" />
        <text x={x(EXPIRY) + 4} y={T + 12} className="cst-exp-label">
          vence TTL
        </text>
        {res.inflight.map((v, i) => {
          const h = (v / yMax) * plotH
          return (
            <motion.rect
              key={i}
              x={L + i * bw + 0.3}
              width={Math.max(0.6, bw - 0.6)}
              initial={false}
              animate={{ y: T + plotH - h, height: h }}
              transition={{ duration: reduce ? 0 : 0.35, ease: EASE }}
              className={v > DB_CAP ? 'cst-bar is-over' : 'cst-bar'}
            />
          )
        })}
        {/* axes */}
        <line x1={L} x2={W - R} y1={T + plotH} y2={T + plotH} className="cst-axis" />
        {[0, 2, 4, 6, 8, 10].map((t) => (
          <text key={t} x={x(t)} y={H - 10} textAnchor="middle" className="cst-tick">
            {t}s
          </text>
        ))}
        <text x={L - 6} y={T + 10} textAnchor="end" className="cst-tick">
          {fmtCount(Math.round(yMax), 0)}
        </text>
        <text x={L - 6} y={T + plotH} textAnchor="end" className="cst-tick">
          0
        </text>
      </svg>
    </WidgetFrame>
  )
}
