import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Clock, Download, Pause, Play, RotateCcw, StepForward } from 'lucide-react'
import { Log, Segmented, Slider, Stat, WidgetFrame } from '../kit'
import './CrawlerFrontier.css'

const EASE = [0.16, 1, 0.3, 1] as const

const HOSTS = ['wiki.org', 'noticias.cl', 'tienda.mx', 'blog.dev'] as const
type Host = (typeof HOSTS)[number]
const PATHS = ['/', '/a', '/b', '/c', '/d', '/e']
const SEEDS = ['wiki.org/', 'noticias.cl/']
const LINKS_PER_PAGE = 3
const MAX_DEPTH = 4
const K = 2
const TICK_MS = 850

type Prio = 'alta' | 'baja'

interface Url {
  id: string
  host: Host
  path: string
  depth: number
}

interface Worker {
  url: Url
  doneAt: number
}

interface LogEntry {
  id: number
  text: string
  tone?: 'ok' | 'warn' | 'bad'
}

interface Sim {
  t: number
  m: number
  bits: boolean[]
  lastBits: number[]
  seen: Set<string>
  front: Record<Prio, Url[]>
  back: Record<Host, Url[]>
  nextAt: Record<Host, number>
  workers: (Worker | null)[]
  fetched: number
  dup: number
  fp: number
  routeTurn: number
  log: LogEntry[]
  logId: number
  done: boolean
}

/** FNV-1a de 32 bits con semilla: nos da K funciones hash independientes "de juguete". */
function hash(s: string, seed: number): number {
  let h = (0x811c9dc5 ^ Math.imul(seed + 1, 0x9e3779b1)) >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  h ^= h >>> 15
  h = Math.imul(h, 0x2c1b3c6d) >>> 0
  h ^= h >>> 12
  return h >>> 0
}

const ALL_URLS: string[] = HOSTS.flatMap((h) => PATHS.map((p) => `${h}${p}`))

function parse(id: string, depth: number): Url {
  const slash = id.indexOf('/')
  return { id, host: id.slice(0, slash) as Host, path: id.slice(slash), depth }
}

/** Grafo de enlaces determinista: cada página enlaza a 3 URLs (una del mismo host). */
function linksOf(url: Url): Url[] {
  const out: Url[] = []
  for (let j = 0; j < LINKS_PER_PAGE; j++) {
    const r = hash(url.id, 100 + j)
    const id = j === 0 ? `${url.host}${PATHS[r % PATHS.length]}` : ALL_URLS[r % ALL_URLS.length]
    if (id !== url.id) out.push(parse(id, url.depth + 1))
  }
  return out
}

const prioOf = (u: Url): Prio => (u.depth <= 1 ? 'alta' : 'baja')

function makeSim(m: number, workers: number): Sim {
  const sim: Sim = {
    t: 0,
    m,
    bits: Array(m).fill(false),
    lastBits: [],
    seen: new Set(),
    front: { alta: [], baja: [] },
    back: { 'wiki.org': [], 'noticias.cl': [], 'tienda.mx': [], 'blog.dev': [] },
    nextAt: { 'wiki.org': 0, 'noticias.cl': 0, 'tienda.mx': 0, 'blog.dev': 0 },
    workers: Array(workers).fill(null),
    fetched: 0,
    dup: 0,
    fp: 0,
    routeTurn: 0,
    log: [],
    logId: 0,
    done: false,
  }
  for (const s of SEEDS) {
    const u = parse(s, 0)
    bloomAdd(sim, u.id)
    sim.front.alta.push(u)
  }
  sim.lastBits = []
  return sim
}

const positions = (sim: Sim, id: string) => Array.from({ length: K }, (_, i) => hash(id, i) % sim.m)

function bloomAdd(sim: Sim, id: string) {
  const pos = positions(sim, id)
  pos.forEach((p) => (sim.bits[p] = true))
  sim.seen.add(id)
  sim.lastBits = pos
}

function pushLog(sim: Sim, text: string, tone?: LogEntry['tone']) {
  sim.log = [{ id: sim.logId++, text, tone }, ...sim.log].slice(0, 40)
}

function step(sim: Sim, delay: number) {
  if (sim.done) return
  sim.t += 1
  const t = sim.t

  // 1) Terminan las descargas en curso: se extraen enlaces y pasan por el filtro de Bloom.
  sim.workers = sim.workers.map((w, wi) => {
    if (!w || w.doneAt > t) return w
    sim.fetched += 1
    sim.nextAt[w.url.host] = t + delay
    pushLog(sim, `t=${t} W${wi + 1} descargó ${w.url.id}`, 'ok')
    for (const link of linksOf(w.url)) {
      if (link.depth > MAX_DEPTH) continue
      const pos = positions(sim, link.id)
      sim.lastBits = pos
      const maybeSeen = pos.every((p) => sim.bits[p])
      if (maybeSeen) {
        if (sim.seen.has(link.id)) {
          sim.dup += 1
        } else {
          sim.fp += 1
          pushLog(sim, `t=${t} falso positivo: ${link.id} nunca se vio, pero el filtro dice que sí`, 'bad')
        }
        continue
      }
      bloomAdd(sim, link.id)
      sim.front[prioOf(link)].push(link)
      pushLog(sim, `t=${t} nueva ${link.id} → cola ${prioOf(link)}`)
    }
    return null
  })

  // 2) El router pasa hasta 2 URLs de las colas de prioridad a la cola de su host (3 de cada 4 veces elige "alta").
  for (let n = 0; n < 2; n++) {
    const preferHigh = sim.routeTurn % 4 !== 3
    sim.routeTurn += 1
    const from: Prio | null =
      sim.front.alta.length && (preferHigh || !sim.front.baja.length)
        ? 'alta'
        : sim.front.baja.length
          ? 'baja'
          : null
    if (!from) break
    const u = sim.front[from].shift() as Url
    sim.back[u.host].push(u)
  }

  // 3) Cada worker libre toma un host listo: cola no vacía, sin otra descarga en curso y fuera del tiempo de cortesía.
  const busy = new Set(sim.workers.filter(Boolean).map((w) => (w as Worker).url.host))
  sim.workers = sim.workers.map((w, wi) => {
    if (w) return w
    const ready = HOSTS.filter((h) => sim.back[h].length > 0 && !busy.has(h) && sim.nextAt[h] <= t).sort(
      (a, b) => sim.nextAt[a] - sim.nextAt[b],
    )
    const host = ready[0]
    if (!host) return null
    busy.add(host)
    const url = sim.back[host].shift() as Url
    pushLog(sim, `t=${t} W${wi + 1} pide ${url.id}`)
    return { url, doneAt: t + 1 }
  })

  const pending =
    sim.front.alta.length + sim.front.baja.length + HOSTS.reduce((s, h) => s + sim.back[h].length, 0)
  if (pending === 0 && sim.workers.every((w) => !w)) {
    sim.done = true
    pushLog(sim, `t=${t} frontera vacía: rastreo terminado`, 'warn')
  }
}

export function CrawlerFrontier() {
  const reduced = useReducedMotion()
  const [m, setM] = useState<'32' | '128'>('32')
  const [delay, setDelay] = useState(2)
  const [workers, setWorkers] = useState(2)
  const [playing, setPlaying] = useState(false)
  const simRef = useRef<Sim>(makeSim(32, 2))
  const [, setVersion] = useState(0)
  const rerender = () => setVersion((v) => v + 1)

  const reset = useCallback((bits: number, w: number) => {
    simRef.current = makeSim(bits, w)
    setPlaying(false)
    setVersion((v) => v + 1)
  }, [])

  const tick = useCallback(() => {
    step(simRef.current, delay)
    if (simRef.current.done) setPlaying(false)
    setVersion((v) => v + 1)
  }, [delay])

  useEffect(() => {
    if (!playing) return
    const id = window.setInterval(tick, TICK_MS)
    return () => window.clearInterval(id)
  }, [playing, tick])

  const sim = simRef.current
  const t = sim.t
  const busyHosts = new Map<Host, number>()
  sim.workers.forEach((w, i) => w && busyHosts.set(w.url.host, i))
  const waitingPoliteness = HOSTS.reduce(
    (s, h) => s + (sim.nextAt[h] > t || busyHosts.has(h) ? sim.back[h].length : 0),
    0,
  )
  const filled = sim.bits.filter(Boolean).length
  const fpRate = Math.pow(filled / sim.m, K)
  const neverCrawled = ALL_URLS.filter((u) => !sim.seen.has(u)).length

  const chipMotion = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, x: -8 }, animate: { opacity: 1, x: 0 }, exit: { opacity: 0, x: 8 } }

  const chips = (list: Url[], showHost: boolean) => {
    const shown = list.slice(0, 5)
    return (
      <ol className="cf-track">
        <AnimatePresence initial={false} mode="popLayout">
          {shown.map((u) => (
            <motion.li
              key={u.id}
              {...chipMotion}
              transition={{ duration: 0.25, ease: EASE }}
              className={`cf-chip ${u.depth === 0 ? 'is-seed' : ''}`}
            >
              {showHost ? u.id : u.path}
            </motion.li>
          ))}
        </AnimatePresence>
        {list.length > shown.length && <li className="cf-more">+{list.length - shown.length}</li>}
        {list.length === 0 && <li className="cf-empty">vacía</li>}
      </ol>
    )
  }

  return (
    <WidgetFrame
      caption={
        <>
          Una frontera estilo Mercator a escala mínima: cada URL descubierta pasa por un filtro de Bloom, entra a
          una cola de prioridad y luego a la cola de su host. Un worker nunca toca un host que todavía está en su
          tiempo de cortesía. Prueba un filtro chico (32 bits) y mira aparecer falsos positivos.
        </>
      }
      controls={
        <>
          <div className="cf-buttons">
            <button
              type="button"
              className="btn btn--line"
              onClick={() => setPlaying((p) => !p)}
              disabled={sim.done}
              aria-label={playing ? 'Pausar simulación' : 'Reproducir simulación'}
            >
              {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
              {playing ? 'Pausa' : 'Play'}
            </button>
            <button type="button" className="btn" onClick={tick} disabled={sim.done || playing}>
              <StepForward size={16} aria-hidden="true" />
              Paso
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => reset(Number(m), workers)}
              aria-label="Reiniciar simulación"
            >
              <RotateCcw size={18} aria-hidden="true" />
            </button>
          </div>
          <Segmented
            label="Filtro de Bloom"
            value={m}
            onChange={(v) => {
              setM(v)
              reset(Number(v), workers)
            }}
            options={[
              { value: '32', label: '32 bits' },
              { value: '128', label: '128 bits' },
            ]}
          />
          <Slider
            label="Cortesía por host"
            value={delay}
            min={0}
            max={4}
            onChange={(v) => {
              setDelay(v)
              rerender()
            }}
            format={(v) => `${v} ticks`}
          />
          <Slider
            label="Workers"
            value={workers}
            min={1}
            max={3}
            onChange={(v) => {
              setWorkers(v)
              reset(Number(m), v)
            }}
          />
        </>
      }
      readout={
        <>
          <div className="cf-stats">
            <Stat label="Descargadas" value={sim.fetched} />
            <Stat label="Duplicadas descartadas" value={sim.dup} />
            <Stat label="Falsos positivos" value={sim.fp} tone={sim.fp > 0 ? 'bad' : undefined} />
            <Stat label="Esperando cortesía" value={waitingPoliteness} tone={waitingPoliteness > 0 ? 'warn' : undefined} />
          </div>
          {sim.done && (
            <p>
              Rastreo terminado en t={t}. {neverCrawled > 0
                ? `${neverCrawled} de ${ALL_URLS.length} URLs del sitio nunca se rastrearon (falsos positivos o sin enlaces entrantes alcanzables).`
                : `Se rastrearon las ${ALL_URLS.length} URLs.`}
            </p>
          )}
          <Log entries={sim.log.slice(0, 12)} empty="Pulsa Play o Paso para empezar el rastreo." />
        </>
      }
    >
      <div className="cf-stage">
        <div className="cf-clock" aria-live="polite">
          <Clock size={15} aria-hidden="true" /> t = {t}
        </div>

        <section className="cf-block" aria-label="Colas de prioridad (front queues)">
          <h4 className="cf-block__title">Colas de prioridad</h4>
          {(['alta', 'baja'] as Prio[]).map((p) => (
            <div key={p} className="cf-row">
              <span className="cf-row__name">{p === 'alta' ? 'Alta' : 'Baja'}</span>
              {chips(sim.front[p], true)}
            </div>
          ))}
        </section>

        <section className="cf-block" aria-label="Colas por host (back queues)">
          <h4 className="cf-block__title">Colas por host</h4>
          {HOSTS.map((h) => {
            const wi = busyHosts.get(h)
            const cool = Math.max(0, sim.nextAt[h] - t)
            const state = wi !== undefined ? 'fetch' : cool > 0 ? 'cool' : 'ready'
            return (
              <div key={h} className={`cf-row cf-host is-${state}`}>
                <span className="cf-row__name">
                  <span className="cf-dot" aria-hidden="true" />
                  {h}
                </span>
                {chips(sim.back[h], false)}
                <span className="cf-status">
                  {state === 'fetch' && (
                    <>
                      <Download size={14} aria-hidden="true" /> W{(wi as number) + 1} descargando
                    </>
                  )}
                  {state === 'cool' && (
                    <>
                      <Clock size={14} aria-hidden="true" /> espera {cool}
                    </>
                  )}
                  {state === 'ready' && 'lista'}
                </span>
              </div>
            )
          })}
        </section>

        <section className="cf-block" aria-label={`Filtro de Bloom de ${sim.m} bits`}>
          <h4 className="cf-block__title">
            Filtro de Bloom · {filled}/{sim.m} bits en 1 · k={K} · FP estimada ≈ {Math.round(fpRate * 100)}%
          </h4>
          <div className={`cf-bits cf-bits--${sim.m}`} role="img" aria-label={`${filled} de ${sim.m} bits encendidos`}>
            {sim.bits.map((b, i) => (
              <span
                key={i}
                className={`cf-bit ${b ? 'is-on' : ''} ${sim.lastBits.includes(i) ? 'is-probe' : ''}`}
              />
            ))}
          </div>
        </section>
      </div>
    </WidgetFrame>
  )
}
