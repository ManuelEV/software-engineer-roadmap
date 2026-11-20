import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Shuffle } from 'lucide-react'
import { Segmented, Slider, Stat, WidgetFrame } from '../kit'
import './RetryBackoff.css'

type Strategy = 'fixed' | 'exp' | 'jitter'

const BUCKET_MS = 100
const BUCKETS = 100 // 10 s timeline
const OUTAGE_MS = 1000
const CAPACITY = 8 // requests per 100 ms the service can absorb
const CAP_MS = 5000

/** Small deterministic PRNG so the same seed draws the same jitter. */
function mulberry32(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

interface SimResult {
  ok: number[]
  fail: number[]
  total: number
  served: number
  gaveUp: number
  lastOk: number | null
}

function simulate(strategy: Strategy, clients: number, base: number, maxAttempts: number, seed: number): SimResult {
  const rnd = mulberry32(seed)
  const ok = Array<number>(BUCKETS).fill(0)
  const fail = Array<number>(BUCKETS).fill(0)
  // pending attempts: [timeMs, client, attemptIndex]
  let pending: [number, number, number][] = Array.from({ length: clients }, (_, c) => [Math.floor(rnd() * 30), c, 0])
  let total = 0
  let served = 0
  let gaveUp = 0
  let lastOk: number | null = null
  const delay = (k: number) => {
    if (strategy === 'fixed') return base
    const exp = Math.min(CAP_MS, base * 2 ** k)
    return strategy === 'exp' ? exp : rnd() * exp
  }
  for (let b = 0; b < 600 && pending.length; b++) {
    const start = b * BUCKET_MS
    const end = start + BUCKET_MS
    const now = pending.filter((p) => p[0] >= start && p[0] < end)
    if (!now.length) continue
    pending = pending.filter((p) => !(p[0] >= start && p[0] < end))
    total += now.length
    // Simplified model: during the outage everything fails; afterwards the
    // service absorbs CAPACITY per bucket, and if more than 2× arrive it
    // collapses and every request in that bucket times out.
    const down = start < OUTAGE_MS
    const collapse = now.length > CAPACITY * 2
    now.forEach((p, i) => {
      const success = !down && !collapse && i < CAPACITY
      if (b < BUCKETS) {
        if (success) ok[b] += 1
        else fail[b] += 1
      }
      if (success) {
        served += 1
        lastOk = end
      } else if (p[2] + 1 < maxAttempts) {
        pending.push([Math.max(end, p[0] + delay(p[2])), p[1], p[2] + 1])
      } else {
        gaveUp += 1
      }
    })
  }
  return { ok, fail, total, served, gaveUp, lastOk }
}

export function RetryBackoff() {
  const reduced = useReducedMotion()
  const [strategy, setStrategy] = useState<Strategy>('fixed')
  const [clients, setClients] = useState(40)
  const [base, setBase] = useState(200)
  const [attempts, setAttempts] = useState(6)
  const [seed, setSeed] = useState(7)

  const sim = useMemo(() => simulate(strategy, clients, base, attempts, seed), [strategy, clients, base, attempts, seed])
  const peak = Math.max(CAPACITY * 3, ...sim.ok.map((v, i) => v + sim.fail[i]))

  const W = 400
  const H = 170
  const top = 14
  const bottom = 140
  const bw = W / BUCKETS
  const y = (v: number) => bottom - (v / peak) * (bottom - top)
  const t = { duration: reduced ? 0 : 0.35, ease: [0.16, 1, 0.3, 1] as const }

  return (
    <WidgetFrame
      caption={`${clients} clientes reciben un error a la vez porque el servicio se cae 1 s. Después aguanta ${CAPACITY} peticiones cada 100 ms; si llegan más del doble, colapsa y todas fallan (modelo simplificado). Compara cómo se reparten los reintentos.`}
      controls={
        <>
          <Segmented<Strategy>
            label="Espera entre reintentos"
            value={strategy}
            onChange={setStrategy}
            options={[
              { value: 'fixed', label: 'Fija' },
              { value: 'exp', label: 'Exponencial' },
              { value: 'jitter', label: 'Exp. + jitter' },
            ]}
          />
          <Slider label="Clientes" value={clients} min={10} max={60} step={5} onChange={setClients} />
          <Slider label="Espera base" value={base} min={100} max={600} step={50} onChange={setBase} format={(v) => `${v} ms`} />
          <Slider label="Intentos máximos" value={attempts} min={2} max={8} onChange={setAttempts} />
        </>
      }
      readout={
        <div className="rb-readout">
          <div className="rb-stats">
            <Stat label="Llamadas totales" value={sim.total} hint={`${(sim.total / clients).toFixed(1)} por cliente`} />
            <Stat label="Atendidos" value={`${sim.served}/${clients}`} tone={sim.served === clients ? 'ok' : sim.served === 0 ? 'bad' : 'warn'} />
            <Stat label="Se rindieron" value={sim.gaveUp} tone={sim.gaveUp ? 'bad' : undefined} />
            <Stat label="Último éxito" value={sim.lastOk === null ? '—' : `${(sim.lastOk / 1000).toFixed(1)} s`} />
          </div>
          <p>
            {strategy === 'fixed' &&
              'Con espera fija todos reintentan al mismo ritmo: las olas siguen sincronizadas y golpean al servicio justo cuando se está levantando.'}
            {strategy === 'exp' &&
              'El backoff exponencial reduce cuántas veces se llama, pero los clientes siguen sincronizados: cada ola llega junta y puede volver a tumbar al servicio.'}
            {strategy === 'jitter' &&
              'Con full jitter cada cliente espera un tiempo aleatorio entre 0 y el tope exponencial: la carga se reparte y el servicio la absorbe.'}
          </p>
        </div>
      }
    >
      <div className="rb-head">
        <span className="rb-legend rb-legend--ok">éxito</span>
        <span className="rb-legend rb-legend--fail">falla</span>
        <span className="rb-legend rb-legend--cap">capacidad</span>
        <button type="button" className="btn btn--ghost rb-seed" onClick={() => setSeed((s) => s + 1)} disabled={strategy !== 'jitter'}>
          <Shuffle size={16} aria-hidden="true" /> Otro sorteo
        </button>
      </div>
      <svg className="rb-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Histograma de llamadas en 10 segundos: ${sim.total} llamadas, ${sim.served} clientes atendidos`}>
        <rect x={0} y={top} width={(OUTAGE_MS / BUCKET_MS) * bw} height={bottom - top} className="rb-outage" />
        <text x={4} y={top + 16} className="rb-outage__label">
          caída
        </text>
        {sim.ok.map((okN, i) => {
          const failN = sim.fail[i]
          return (
            <g key={i}>
              <motion.rect
                x={i * bw + 0.4}
                width={bw - 0.8}
                className="rb-bar rb-bar--fail"
                initial={false}
                animate={{ y: y(failN + okN), height: bottom - y(failN) }}
                transition={t}
              />
              <motion.rect
                x={i * bw + 0.4}
                width={bw - 0.8}
                className="rb-bar rb-bar--ok"
                initial={false}
                animate={{ y: y(okN), height: bottom - y(okN) }}
                transition={t}
              />
            </g>
          )
        })}
        <line x1={0} x2={W} y1={y(CAPACITY)} y2={y(CAPACITY)} className="rb-cap" />
        <line x1={0} x2={W} y1={bottom} y2={bottom} className="rb-axis" />
        {[0, 2, 4, 6, 8, 10].map((s) => (
          <text key={s} x={Math.min(W - 10, Math.max(8, (s * 1000) / BUCKET_MS * bw))} y={bottom + 20} textAnchor="middle" className="rb-tick">
            {s}s
          </text>
        ))}
      </svg>
    </WidgetFrame>
  )
}
