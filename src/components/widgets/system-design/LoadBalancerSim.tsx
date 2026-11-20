import { useCallback, useRef, useState } from 'react'
import { Pause, Play, Power, RotateCcw } from 'lucide-react'
import { Log, Segmented, Slider, Stat, WidgetFrame } from '../kit'
import { fmt, hash32, rng, useTicker } from './shared'
import './LoadBalancerSim.css'

type Algo = 'rr' | 'wrr' | 'lc' | 'p2c' | 'hash'
type Fleet = 'equal' | 'mixed'

const TICK_MS = 100
const HC_EVERY = 5 // health check every 5 ticks (500 ms)
const HC_THRESHOLD = 2 // consecutive results to flip state

interface Req {
  arrival: number
  work: number
  client: number
}
interface Server {
  name: string
  speed: number
  up: boolean
  /** what the load balancer believes */
  healthy: boolean
  streak: number
  queue: Req[]
  served: number
  sent: number
  cw: number // smooth WRR current weight
}
interface Sim {
  t: number
  servers: Server[]
  rr: number
  lat: number[]
  errors: number
  done: number
  doneWindow: number[]
  rand: () => number
  log: { id: number; text: string; tone?: 'ok' | 'warn' | 'bad' }[]
  logId: number
}

const SPEEDS: Record<Fleet, number[]> = {
  equal: [1, 1, 1, 1],
  mixed: [2, 1, 1, 0.5],
}

// Skewed client traffic: client 0 is a big corporate NAT sending a lot.
const CLIENT_W = [0.34, 0.16, 0.12, 0.1, 0.09, 0.07, 0.06, 0.06]

function makeSim(fleet: Fleet): Sim {
  return {
    t: 0,
    servers: SPEEDS[fleet].map((speed, i) => ({
      name: `S${i + 1}`,
      speed,
      up: true,
      healthy: true,
      streak: 0,
      queue: [],
      served: 0,
      sent: 0,
      cw: 0,
    })),
    rr: 0,
    lat: [],
    errors: 0,
    done: 0,
    doneWindow: [],
    rand: rng(42),
    log: [],
    logId: 0,
  }
}

function poisson(lambda: number, r: () => number) {
  const L = Math.exp(-lambda)
  let k = 0
  let p = 1
  do {
    k++
    p *= r()
  } while (p > L && k < 60)
  return k - 1
}

function pickClient(r: () => number) {
  let x = r()
  for (let i = 0; i < CLIENT_W.length; i++) {
    x -= CLIENT_W[i]
    if (x <= 0) return i
  }
  return CLIENT_W.length - 1
}

function choose(sim: Sim, algo: Algo, client: number): Server | null {
  const pool = sim.servers.filter((s) => s.healthy)
  if (!pool.length) return null
  const out = (s: Server) => s.queue.length
  switch (algo) {
    case 'rr': {
      const s = pool[sim.rr % pool.length]
      sim.rr++
      return s
    }
    case 'wrr': {
      // nginx "smooth weighted round robin"
      const total = pool.reduce((a, s) => a + s.speed, 0)
      let best = pool[0]
      for (const s of pool) {
        s.cw += s.speed
        if (s.cw > best.cw) best = s
      }
      best.cw -= total
      return best
    }
    case 'lc': {
      let best = pool[0]
      for (const s of pool) if (out(s) < out(best)) best = s
      return best
    }
    case 'p2c': {
      if (pool.length === 1) return pool[0]
      const a = Math.floor(sim.rand() * pool.length)
      let b = Math.floor(sim.rand() * (pool.length - 1))
      if (b >= a) b++
      return out(pool[a]) <= out(pool[b]) ? pool[a] : pool[b]
    }
    case 'hash':
      return pool[hash32(`10.0.0.${client}`) % pool.length]
  }
}

function pushLog(sim: Sim, text: string, tone?: 'ok' | 'warn' | 'bad') {
  const secs = fmt(sim.t / (1000 / TICK_MS), 1)
  sim.log = [{ id: ++sim.logId, text: `t=${secs}s  ${text}`, tone }, ...sim.log].slice(0, 30)
}

function step(sim: Sim, algo: Algo, load: number) {
  sim.t++
  const capacity = sim.servers.reduce((a, s) => a + s.speed, 0)
  const arrivals = poisson(capacity * load, sim.rand)
  for (let i = 0; i < arrivals; i++) {
    const client = pickClient(sim.rand)
    const s = choose(sim, algo, client)
    if (!s) {
      sim.errors++
      continue
    }
    s.sent++
    if (!s.up) {
      sim.errors++ // connection refused / timeout: the LB still thinks it's healthy
      continue
    }
    const work = Math.min(6, -Math.log(1 - sim.rand())) // exponential, mean ≈ 1 tick of a 1x server
    s.queue.push({ arrival: sim.t, work, client })
  }
  let doneNow = 0
  for (const s of sim.servers) {
    if (!s.up) continue
    let budget = s.speed
    while (budget > 0 && s.queue.length) {
      const head = s.queue[0]
      const use = Math.min(budget, head.work)
      head.work -= use
      budget -= use
      if (head.work <= 1e-9) {
        s.queue.shift()
        s.served++
        doneNow++
        sim.lat.push((sim.t - head.arrival + 1) * TICK_MS)
      }
    }
  }
  if (sim.lat.length > 400) sim.lat = sim.lat.slice(-400)
  sim.done += doneNow
  sim.doneWindow.push(doneNow)
  if (sim.doneWindow.length > 20) sim.doneWindow.shift()

  if (sim.t % HC_EVERY === 0) {
    for (const s of sim.servers) {
      const pass = s.up
      if (pass === s.healthy) {
        s.streak = 0
        continue
      }
      s.streak++
      if (s.streak >= HC_THRESHOLD) {
        s.healthy = pass
        s.streak = 0
        pushLog(
          sim,
          pass ? `${s.name} pasó ${HC_THRESHOLD} health checks: vuelve a la rotación` : `${s.name} falló ${HC_THRESHOLD} health checks: sale de la rotación`,
          pass ? 'ok' : 'warn',
        )
      }
    }
  }
}

function p95(xs: number[]) {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.floor(s.length * 0.95))]
}

const ALGO_TEXT: Record<Algo, string> = {
  rr: 'Round robin: S1, S2, S3, S4, S1… Ignora la velocidad y la carga de cada servidor. Con flota heterogénea, el lento acumula cola.',
  wrr: 'Round robin ponderado: reparte en proporción al peso (aquí, la velocidad). Bien si los pesos son correctos y estables; no reacciona a picos ni a peticiones lentas.',
  lc: 'Menos conexiones: elige el servidor con menos peticiones en curso. Se adapta a servidores lentos y peticiones pesadas, pero necesita estado global y puede provocar efecto manada si varios balanceadores ven el mismo dato viejo.',
  p2c: 'Power of two choices: toma 2 servidores al azar y elige el menos cargado. Casi tan bueno como mirar todos, barato y robusto con muchos balanceadores en paralelo.',
  hash: 'Hash de IP: el mismo cliente cae siempre en el mismo servidor (afinidad). Si un cliente (una NAT corporativa) manda mucho tráfico, su servidor se vuelve punto caliente. Y con mod N, al caer un servidor se remapea casi todo.',
}

export function LoadBalancerSim() {
  const [algo, setAlgo] = useState<Algo>('rr')
  const [fleet, setFleet] = useState<Fleet>('mixed')
  const [load, setLoad] = useState(0.8)
  const [running, setRunning] = useState(true)
  const sim = useRef<Sim>(makeSim('mixed'))
  const [, setVersion] = useState(0)
  const rerender = useCallback(() => setVersion((v) => v + 1), [])

  useTicker(
    () => {
      step(sim.current, algo, load)
      rerender()
    },
    TICK_MS,
    running,
  )

  const reset = (f: Fleet = fleet) => {
    sim.current = makeSim(f)
    rerender()
  }

  const toggleServer = (i: number) => {
    const s = sim.current.servers[i]
    s.up = !s.up
    if (!s.up) {
      sim.current.errors += s.queue.length
      s.queue = []
    }
    pushLog(sim.current, s.up ? `${s.name} vuelve a encenderse (el LB aún no lo sabe)` : `${s.name} se cae (el LB aún no lo sabe)`, s.up ? undefined : 'bad')
    rerender()
  }

  const S = sim.current
  const latP95 = p95(S.lat)
  const thr = (S.doneWindow.reduce((a, b) => a + b, 0) / Math.max(1, S.doneWindow.length)) * (1000 / TICK_MS)
  const maxQ = Math.max(...S.servers.map((s) => s.queue.length))
  const SLOTS = 18

  return (
    <WidgetFrame
      caption="Un balanceador reparte peticiones entre 4 servidores. Cambia el algoritmo, mezcla servidores de distinta velocidad y apaga uno para ver cuánto tardan los health checks en sacarlo."
      controls={
        <>
          <Segmented<Algo>
            label="Algoritmo"
            value={algo}
            onChange={setAlgo}
            options={[
              { value: 'rr', label: 'Round robin' },
              { value: 'wrr', label: 'Ponderado' },
              { value: 'lc', label: 'Menos conex.' },
              { value: 'p2c', label: 'P2C' },
              { value: 'hash', label: 'Hash IP' },
            ]}
          />
          <Segmented<Fleet>
            label="Flota"
            value={fleet}
            onChange={(f) => {
              setFleet(f)
              reset(f)
            }}
            options={[
              { value: 'mixed', label: 'Distinta (2×,1×,1×,½×)' },
              { value: 'equal', label: 'Iguales' },
            ]}
          />
          <Slider label="Carga" value={load} min={0.2} max={1.1} step={0.05} onChange={setLoad} format={(v) => `${Math.round(v * 100)} % de la capacidad`} />
          <div className="lbs-btns">
            <button type="button" className="btn" onClick={() => setRunning((r) => !r)} aria-label={running ? 'Pausar' : 'Reanudar'}>
              {running ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
              {running ? 'Pausar' : 'Seguir'}
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => reset()} aria-label="Reiniciar simulación">
              <RotateCcw size={16} aria-hidden="true" />
              Reiniciar
            </button>
          </div>
        </>
      }
      readout={
        <>
          <div className="lbs-stats">
            <Stat label="Latencia p95" value={`${fmt(latP95, 0)} ms`} tone={latP95 > 1500 ? 'bad' : latP95 > 600 ? 'warn' : 'ok'} />
            <Stat label="Throughput" value={`${fmt(thr, 0)} req/s`} />
            <Stat label="Errores" value={fmt(S.errors, 0)} tone={S.errors > 0 ? 'bad' : undefined} hint="enviadas a un servidor caído" />
            <Stat label="Cola máxima" value={fmt(maxQ, 0)} tone={maxQ > 12 ? 'bad' : maxQ > 5 ? 'warn' : undefined} />
          </div>
          <p>{ALGO_TEXT[algo]}</p>
          <Log entries={S.log} empty="Toca el botón de encendido de un servidor para simular una caída." />
        </>
      }
    >
      <div className="lbs-stage">
        <div className="lbs-lb" aria-hidden="true">
          <span className="lbs-lb__dot" />
          <span className="lbs-lb__label">LB</span>
        </div>
        <ul className="lbs-servers">
          {S.servers.map((s, i) => {
            const state = !s.up && s.healthy ? 'ghost' : !s.up ? 'down' : !s.healthy ? 'pending' : 'up'
            const q = s.queue.length
            return (
              <li key={s.name} className={`lbs-row is-${state}`}>
                <span className="lbs-row__wire" aria-hidden="true" />
                <button
                  type="button"
                  className="lbs-power"
                  onClick={() => toggleServer(i)}
                  aria-pressed={!s.up}
                  aria-label={`${s.up ? 'Apagar' : 'Encender'} ${s.name}`}
                >
                  <Power size={16} aria-hidden="true" />
                </button>
                <div className="lbs-row__id">
                  <b>{s.name}</b>
                  <span>{s.speed === 0.5 ? '½×' : `${s.speed}×`}</span>
                </div>
                <div className="lbs-queue" aria-label={`${s.name}: ${q} peticiones en cola`}>
                  {Array.from({ length: SLOTS }, (_, k) => (
                    <span key={k} className={`lbs-slot ${k < q ? 'is-on' : ''} ${k < q && q > 12 ? 'is-hot' : ''}`} />
                  ))}
                  {q > SLOTS && <span className="lbs-more">+{q - SLOTS}</span>}
                </div>
                <div className="lbs-row__meta">
                  <span>{fmt(s.served, 0)} ok</span>
                  <span className="lbs-state">
                    {state === 'ghost' ? 'caído, sigue recibiendo' : state === 'down' ? 'fuera de rotación' : state === 'pending' ? 'encendido, en espera' : 'sano'}
                  </span>
                </div>
              </li>
            )
          })}
        </ul>
      </div>
    </WidgetFrame>
  )
}
