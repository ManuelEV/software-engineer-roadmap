import { useCallback, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Pause, Play, RotateCcw, StepForward } from 'lucide-react'
import { Segmented, Slider, WidgetFrame } from '../kit'
import { EASE, fmt, rng, useTicker } from './shared'
import './CacheSimulator.css'

type Pattern = 'zipf' | 'scan' | 'shift' | 'uniform'
type Policy = 'LRU' | 'LFU' | 'FIFO'
const POLICIES: Policy[] = ['LRU', 'LFU', 'FIFO']
const KEYS = 30

interface Entry {
  key: string
  freq: number
  lastUse: number
  inserted: number
}
interface CacheState {
  entries: Entry[]
  hits: number
  total: number
  lastHit: boolean | null
  evicted: string | null
}
interface Sim {
  n: number
  rand: () => number
  caches: Record<Policy, CacheState>
  recent: string[]
  scanLeft: number
  scanNext: number
}

const emptyCache = (): CacheState => ({ entries: [], hits: 0, total: 0, lastHit: null, evicted: null })
const makeSim = (): Sim => ({
  n: 0,
  rand: rng(7),
  caches: { LRU: emptyCache(), LFU: emptyCache(), FIFO: emptyCache() },
  recent: [],
  scanLeft: 0,
  scanNext: 1,
})

// Zipf(s=1) weights over KEYS keys
const ZIPF = (() => {
  const w = Array.from({ length: KEYS }, (_, i) => 1 / (i + 1))
  const sum = w.reduce((a, b) => a + b, 0)
  return w.map((x) => x / sum)
})()

function zipfIndex(r: () => number) {
  let x = r()
  for (let i = 0; i < KEYS; i++) {
    x -= ZIPF[i]
    if (x <= 0) return i
  }
  return KEYS - 1
}

function nextKey(sim: Sim, pattern: Pattern): string {
  const r = sim.rand
  if (pattern === 'uniform') return `p${1 + Math.floor(r() * KEYS)}`
  if (pattern === 'scan') {
    // every ~40 requests, a batch job reads 12 cold keys once each
    if (sim.scanLeft > 0) {
      sim.scanLeft--
      return `s${sim.scanNext++}`
    }
    if (sim.n > 0 && sim.n % 40 === 0) {
      sim.scanLeft = 11
      return `s${sim.scanNext++}`
    }
    return `p${1 + zipfIndex(r)}`
  }
  if (pattern === 'shift') {
    // popularity flips after 120 requests: yesterday's hot products are cold now
    const i = zipfIndex(r)
    return sim.n < 120 ? `p${1 + i}` : `p${KEYS - i}`
  }
  return `p${1 + zipfIndex(r)}`
}

function access(c: CacheState, policy: Policy, key: string, now: number, cap: number) {
  c.total++
  c.evicted = null
  const e = c.entries.find((x) => x.key === key)
  if (e) {
    c.hits++
    c.lastHit = true
    e.freq++
    e.lastUse = now
    return
  }
  c.lastHit = false
  if (c.entries.length >= cap) {
    let victim = c.entries[0]
    for (const x of c.entries) {
      if (policy === 'LRU' && x.lastUse < victim.lastUse) victim = x
      if (policy === 'FIFO' && x.inserted < victim.inserted) victim = x
      if (policy === 'LFU' && (x.freq < victim.freq || (x.freq === victim.freq && x.lastUse < victim.lastUse))) victim = x
    }
    c.evicted = victim.key
    c.entries = c.entries.filter((x) => x !== victim)
  }
  c.entries.push({ key, freq: 1, lastUse: now, inserted: now })
}

function trimTo(c: CacheState, policy: Policy, cap: number) {
  while (c.entries.length > cap) {
    let victim = c.entries[0]
    for (const x of c.entries) {
      if (policy === 'LRU' && x.lastUse < victim.lastUse) victim = x
      if (policy === 'FIFO' && x.inserted < victim.inserted) victim = x
      if (policy === 'LFU' && (x.freq < victim.freq || (x.freq === victim.freq && x.lastUse < victim.lastUse))) victim = x
    }
    c.entries = c.entries.filter((x) => x !== victim)
  }
}

const PATTERN_TEXT: Record<Pattern, string> = {
  zipf: 'Ley de potencias (Zipf): pocos productos concentran la mayoría de las visitas. Es el caso típico y donde una caché pequeña rinde muchísimo.',
  scan: 'Cada 40 peticiones un job de reportes lee 12 claves frías una sola vez. LRU y FIFO las meten y expulsan a las calientes; LFU las ignora porque tienen frecuencia 1.',
  shift: 'A las 120 peticiones la popularidad se invierte (terminó la campaña). LFU queda “envenenada” con contadores viejos y tarda en adaptarse; LRU se adapta enseguida. Por eso las LFU reales envejecen los contadores.',
  uniform: 'Acceso uniforme: todas las claves igual de probables. Ninguna política gana; la tasa de aciertos ≈ capacidad / universo de claves. La caché no puede inventar localidad.',
}

export function CacheSimulator() {
  const reduce = useReducedMotion()
  const [pattern, setPattern] = useState<Pattern>('scan')
  const [cap, setCap] = useState(6)
  const [running, setRunning] = useState(false)
  const sim = useRef<Sim>(makeSim())
  const [, setV] = useState(0)
  const rerender = useCallback(() => setV((v) => v + 1), [])

  const tick = () => {
    const S = sim.current
    const key = nextKey(S, pattern)
    S.n++
    for (const p of POLICIES) access(S.caches[p], p, key, S.n, cap)
    S.recent = [key, ...S.recent].slice(0, 14)
    rerender()
  }

  useTicker(tick, 420, running)

  const reset = () => {
    sim.current = makeSim()
    rerender()
  }

  const S = sim.current
  const current = S.recent[0]
  const best = Math.max(...POLICIES.map((p) => (S.caches[p].total ? S.caches[p].hits / S.caches[p].total : 0)))

  return (
    <WidgetFrame
      caption="La misma secuencia de peticiones pasa por tres cachés con la misma capacidad y distinta política de desalojo. Mira cuál conserva las claves calientes."
      controls={
        <>
          <Segmented<Pattern>
            label="Patrón de acceso"
            value={pattern}
            onChange={(p) => {
              setPattern(p)
              reset()
            }}
            options={[
              { value: 'zipf', label: 'Claves calientes' },
              { value: 'scan', label: '+ escaneo' },
              { value: 'shift', label: 'Cambio de moda' },
              { value: 'uniform', label: 'Uniforme' },
            ]}
          />
          <Slider
            label="Capacidad"
            value={cap}
            min={2}
            max={12}
            onChange={(v) => {
              setCap(v)
              for (const p of POLICIES) trimTo(sim.current.caches[p], p, v)
              rerender()
            }}
            format={(v) => `${v} de ${KEYS} claves`}
          />
          <div className="csim-btns">
            <button type="button" className="btn btn--line" onClick={() => setRunning((r) => !r)}>
              {running ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
              {running ? 'Pausar' : 'Reproducir'}
            </button>
            <button type="button" className="btn" onClick={tick} disabled={running} aria-label="Una petición">
              <StepForward size={16} aria-hidden="true" />
              Paso
            </button>
            <button type="button" className="btn btn--ghost" onClick={reset} aria-label="Reiniciar">
              <RotateCcw size={16} aria-hidden="true" />
            </button>
          </div>
        </>
      }
      readout={
        <p>
          {PATTERN_TEXT[pattern]} <span className="csim-n">Peticiones: {S.n}.</span>
        </p>
      }
    >
      <div className="csim-stream" aria-label="Últimas peticiones">
        <span className="csim-stream__label">Peticiones</span>
        <ol className="csim-stream__list">
          {S.recent.map((k, i) => (
            <li key={`${S.n - i}`} className={`csim-req ${i === 0 ? 'is-now' : ''} ${k.startsWith('s') ? 'is-scan' : ''}`}>
              {k}
            </li>
          ))}
          {S.recent.length === 0 && <li className="csim-empty">Pulsa Reproducir o Paso.</li>}
        </ol>
      </div>
      <div className="csim-rows">
        {POLICIES.map((p) => {
          const c = S.caches[p]
          const ratio = c.total ? c.hits / c.total : 0
          const sorted = [...c.entries].sort((a, b) =>
            p === 'LRU' ? b.lastUse - a.lastUse : p === 'FIFO' ? b.inserted - a.inserted : b.freq - a.freq || b.lastUse - a.lastUse,
          )
          return (
            <section key={p} className="csim-row" aria-label={`Caché ${p}`}>
              <header className="csim-row__head">
                <b>{p}</b>
                <span className={`csim-ratio ${c.total > 10 && ratio === best ? 'is-best' : ''}`}>{fmt(ratio * 100, 0)} %</span>
                <span className={`csim-flag ${c.lastHit === true ? 'is-hit' : c.lastHit === false ? 'is-miss' : ''}`}>
                  {c.lastHit === null ? '—' : c.lastHit ? `hit ${current}` : `miss ${current}`}
                  {c.evicted ? ` · sale ${c.evicted}` : ''}
                </span>
              </header>
              <ul className="csim-slots" style={{ ['--cap' as string]: cap }}>
                <AnimatePresence initial={false} mode="popLayout">
                  {sorted.map((e) => (
                    <motion.li
                      key={e.key}
                      layout={!reduce}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: reduce ? 0.15 : 0.3, ease: EASE }}
                      className={`csim-slot ${e.key === current ? (c.lastHit ? 'is-hit' : 'is-new') : ''} ${e.key.startsWith('s') ? 'is-scan' : ''}`}
                    >
                      <span>{e.key}</span>
                      {p === 'LFU' && <small>×{e.freq}</small>}
                    </motion.li>
                  ))}
                </AnimatePresence>
                {Array.from({ length: Math.max(0, cap - sorted.length) }, (_, i) => (
                  <li key={`empty-${i}`} className="csim-slot is-empty" aria-hidden="true" />
                ))}
              </ul>
            </section>
          )
        })}
      </div>
      <p className="csim-legend">
        Orden de cada fila: LRU por uso más reciente, LFU por frecuencia, FIFO por llegada. A la derecha queda la próxima víctima.
      </p>
    </WidgetFrame>
  )
}
