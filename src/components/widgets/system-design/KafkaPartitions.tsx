import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Minus, Pause, Play, Plus, RotateCcw, Zap } from 'lucide-react'
import { Segmented, Slider, Stat, WidgetFrame } from '../kit'
import { EASE, hash32, rng, useTicker } from './shared'
import './KafkaPartitions.css'

const KEYS = ['#105', '#107', '#123', '#130', '#138', '#140'] as const
const KEY_COLOR = ['var(--l1)', 'var(--l4)', 'var(--l5)', 'var(--l3)', 'var(--l2)', 'var(--ink-2)']
const TICK_MS = 250
const REBALANCE_TICKS = 8
const KEEP = 14

interface Msg {
  offset: number
  key: number
}
interface Part {
  msgs: Msg[]
  end: number // next offset to write
  committed: number // next offset the group will read
}
type Proto = 'eager' | 'coop'

const partitionOf = (key: number, p: number) => hash32(KEYS[key]) % p

/** Sticky assignment: keep current owners within quota, hand the rest to under-loaded consumers. */
function assign(prev: (number | null)[], parts: number, consumers: number[]): (number | null)[] {
  if (!consumers.length) return Array(parts).fill(null)
  const base = Math.floor(parts / consumers.length)
  const extra = parts % consumers.length
  const quota = new Map(consumers.map((c, i) => [c, base + (i < extra ? 1 : 0)]))
  const load = new Map(consumers.map((c) => [c, 0]))
  const next: (number | null)[] = Array(parts).fill(null)
  prev.forEach((owner, p) => {
    if (p >= parts || owner === null || !quota.has(owner)) return
    if (load.get(owner)! < quota.get(owner)!) {
      next[p] = owner
      load.set(owner, load.get(owner)! + 1)
    }
  })
  for (let p = 0; p < parts; p++) {
    if (next[p] !== null) continue
    const c = consumers.find((x) => load.get(x)! < quota.get(x)!)!
    next[p] = c
    load.set(c, load.get(c)! + 1)
  }
  return next
}

const emptyParts = (p: number): Part[] => Array.from({ length: p }, () => ({ msgs: [], end: 0, committed: 0 }))

/**
 * A Kafka topic with keyed messages, partitions and one consumer group.
 * Add consumers to raise throughput (up to the number of partitions) and
 * watch rebalances pause consumption.
 */
export function KafkaPartitions() {
  const reduced = useReducedMotion()
  const [p, setP] = useState<'3' | '4' | '6'>('4')
  const P = Number(p)
  const [rate, setRate] = useState(8) // msgs/s produced
  const [proto, setProto] = useState<Proto>('coop')
  const [playing, setPlaying] = useState(false)
  const [parts, setParts] = useState<Part[]>(() => emptyParts(4))
  const [consumers, setConsumers] = useState<number[]>([1])
  const [owner, setOwner] = useState<(number | null)[]>(() => assign([], 4, [1]))
  const [paused, setPaused] = useState<Set<number>>(new Set())
  const [rebalanceLeft, setRebalanceLeft] = useState(0)
  const [acc, setAcc] = useState(0)
  const [cursor, setCursor] = useState<Record<number, number>>({})
  const [rand] = useState(() => rng(42))
  const [focusKey, setFocusKey] = useState<number | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [consumed, setConsumed] = useState(0)

  const produce = (count: number, state: Part[]) => {
    const next = state.map((x) => ({ ...x, msgs: [...x.msgs] }))
    for (let i = 0; i < count; i++) {
      const key = Math.floor(rand() * KEYS.length)
      const part = next[partitionOf(key, P)]
      part.msgs.push({ offset: part.end, key })
      part.end += 1
      if (part.msgs.length > KEEP) part.msgs.shift()
    }
    return next
  }

  const tick = () => {
    // production
    const total = acc + rate * (TICK_MS / 1000)
    const n = Math.floor(total)
    setAcc(total - n)
    let next = produce(n, parts)
    // consumption: each active consumer reads 1 msg per tick, rotating over its partitions
    const cur = { ...cursor }
    let done = 0
    next = next.map((x) => ({ ...x }))
    for (const c of consumers) {
      const mine = owner.map((o, i) => (o === c && !paused.has(i) ? i : -1)).filter((i) => i >= 0)
      if (!mine.length) continue
      for (let k = 0; k < mine.length; k++) {
        const idx = mine[((cur[c] ?? 0) + k) % mine.length]
        if (next[idx].committed < next[idx].end) {
          next[idx].committed += 1
          cur[c] = ((cur[c] ?? 0) + k + 1) % mine.length
          done++
          break
        }
      }
    }
    setCursor(cur)
    setConsumed((x) => x + done)
    setParts(next)
    if (rebalanceLeft > 0) {
      const left = rebalanceLeft - 1
      setRebalanceLeft(left)
      if (left === 0) setPaused(new Set())
    }
  }

  useTicker(tick, TICK_MS, playing)

  const rebalance = (nextConsumers: number[]) => {
    const nextOwner = assign(owner, P, nextConsumers)
    const moved = new Set<number>()
    nextOwner.forEach((o, i) => {
      if (o !== owner[i]) moved.add(i)
    })
    const pausedNow = proto === 'eager' ? new Set(Array.from({ length: P }, (_, i) => i)) : moved
    setConsumers(nextConsumers)
    setOwner(nextOwner)
    setPaused(pausedNow)
    setRebalanceLeft(REBALANCE_TICKS)
    setNote(
      proto === 'eager'
        ? `Rebalanceo eager: todo el grupo suelta sus particiones y se detiene hasta acordar la nueva asignación (${moved.size} cambian de dueño).`
        : `Rebalanceo cooperativo: solo ${moved.size} partición(es) cambian de dueño y pausan; el resto sigue consumiendo.`,
    )
    if (!playing) {
      // without the clock running, finish the rebalance immediately
      setRebalanceLeft(0)
      setPaused(new Set())
    }
  }

  const addConsumer = () => {
    if (consumers.length >= 7) return
    const id = Math.max(0, ...consumers) + 1
    rebalance([...consumers, id])
  }
  const removeConsumer = () => {
    if (consumers.length <= 1) return
    rebalance(consumers.slice(0, -1))
  }

  const changeP = (v: '3' | '4' | '6') => {
    const np = Number(v)
    setP(v)
    setParts(emptyParts(np))
    setOwner(assign([], np, consumers))
    setPaused(new Set())
    setRebalanceLeft(0)
    setCursor({})
    setConsumed(0)
    setNote(
      `Ahora el tópico tiene ${np} particiones. En Kafka real puedes agregar particiones, pero hash(clave) % ${np} manda las claves a otras particiones: los mensajes nuevos de un pedido pueden quedar en otra partición y se pierde el orden por clave respecto de los viejos.`,
    )
  }

  const reset = () => {
    setParts(emptyParts(P))
    setConsumers([1])
    setOwner(assign([], P, [1]))
    setPaused(new Set())
    setRebalanceLeft(0)
    setCursor({})
    setConsumed(0)
    setNote(null)
    setPlaying(false)
  }

  const lag = parts.reduce((s, x) => s + (x.end - x.committed), 0)
  const idle = consumers.filter((c) => !owner.includes(c))
  const capacity = Math.min(consumers.length, P) * (1000 / TICK_MS)

  return (
    <WidgetFrame
      caption="Un tópico con particiones y un grupo de consumidores. Cada partición la lee un solo consumidor del grupo; los mensajes con la misma clave caen siempre en la misma partición y conservan su orden."
      controls={
        <>
          <div className="kp-row">
            <button type="button" className="icon-btn" onClick={() => setPlaying((x) => !x)} aria-label={playing ? 'Pausar' : 'Producir y consumir'}>
              {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
            </button>
            <button type="button" className="btn" onClick={() => setParts((x) => produce(12, x))}>
              <Zap size={16} aria-hidden="true" />
              Ráfaga
            </button>
            <button type="button" className="icon-btn" onClick={reset} aria-label="Reiniciar">
              <RotateCcw size={18} aria-hidden="true" />
            </button>
          </div>
          <Segmented
            label="Particiones"
            value={p}
            onChange={changeP}
            options={[
              { value: '3', label: '3' },
              { value: '4', label: '4' },
              { value: '6', label: '6' },
            ]}
          />
          <div className="kp-consumers-ctl" role="group" aria-label="Consumidores en el grupo">
            <span className="kp-ctl-label">Consumidores</span>
            <div className="kp-row">
              <button type="button" className="icon-btn" onClick={removeConsumer} disabled={consumers.length <= 1} aria-label="Quitar consumidor">
                <Minus size={18} aria-hidden="true" />
              </button>
              <span className="kp-count" aria-live="polite">
                {consumers.length}
              </span>
              <button type="button" className="icon-btn" onClick={addConsumer} disabled={consumers.length >= 7} aria-label="Agregar consumidor">
                <Plus size={18} aria-hidden="true" />
              </button>
            </div>
          </div>
          <Segmented
            label="Rebalanceo"
            value={proto}
            onChange={setProto}
            options={[
              { value: 'eager', label: 'Eager' },
              { value: 'coop', label: 'Cooperativo' },
            ]}
          />
          <Slider label="Producción" value={rate} min={1} max={24} onChange={setRate} format={(v) => `${v} msg/s`} />
        </>
      }
      readout={
        <div className="kp-readout">
          <div className="kp-stats">
            <Stat label="lag total (mensajes)" value={lag} tone={lag > 30 ? 'bad' : lag > 10 ? 'warn' : 'ok'} />
            <Stat label="capacidad del grupo" value={`${capacity} msg/s`} hint={`producción: ${rate} msg/s`} tone={capacity < rate ? 'bad' : undefined} />
            <Stat label="consumidores inactivos" value={idle.length} tone={idle.length ? 'warn' : undefined} />
            <Stat label="mensajes procesados" value={consumed} />
          </div>
          {note && <p>{note}</p>}
          {idle.length > 0 && (
            <p>
              Hay más consumidores ({consumers.length}) que particiones ({P}): {idle.map((c) => `C${c}`).join(', ')} no reciben nada. El paralelismo máximo de
              un grupo es el número de particiones.
            </p>
          )}
        </div>
      }
    >
      <div className="kp-stage">
        <div className="kp-keys" role="group" aria-label="Resaltar una clave">
          {KEYS.map((k, i) => (
            <button
              key={k}
              type="button"
              className={`kp-key ${focusKey === i ? 'is-on' : ''}`}
              style={{ ['--k' as string]: KEY_COLOR[i] }}
              aria-pressed={focusKey === i}
              onClick={() => setFocusKey((f) => (f === i ? null : i))}
            >
              <span className="kp-key__dot" aria-hidden="true" />
              pedido {k}
              <span className="kp-key__p">→ P{partitionOf(i, P)}</span>
            </button>
          ))}
        </div>
        <div className="kp-lanes">
          {parts.map((part, i) => {
            const o = owner[i]
            const isPaused = paused.has(i) && rebalanceLeft > 0
            return (
              <div key={`${P}-${i}`} className="kp-lane">
                <span className="kp-plabel">P{i}</span>
                <div className="kp-track" aria-label={`Partición ${i}: offsets hasta ${part.end - 1}, consumido hasta ${part.committed - 1}`}>
                  {part.msgs.map((m) => (
                    <motion.span
                      key={m.offset}
                      className={`kp-msg ${m.offset < part.committed ? 'is-done' : ''} ${focusKey !== null && focusKey !== m.key ? 'is-dim' : ''}`}
                      style={{ ['--k' as string]: KEY_COLOR[m.key] }}
                      initial={{ opacity: 0, x: reduced ? 0 : 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: reduced ? 0.15 : 0.25, ease: EASE }}
                      title={`offset ${m.offset} · pedido ${KEYS[m.key]}`}
                    >
                      {m.offset}
                    </motion.span>
                  ))}
                </div>
                <span className={`kp-owner ${isPaused ? 'is-paused' : ''}`}>
                  {isPaused ? 'pausa' : o !== null ? `C${o}` : '—'}
                  <small>lag {part.end - part.committed}</small>
                </span>
              </div>
            )
          })}
        </div>
        <div className="kp-group" aria-label="Grupo de consumidores">
          {consumers.map((c) => {
            const mine = owner.map((x, i) => (x === c ? `P${i}` : null)).filter(Boolean)
            return (
              <span key={c} className={`kp-cons ${mine.length ? '' : 'is-idle'}`}>
                <b>C{c}</b> {mine.length ? mine.join(' ') : 'inactivo'}
              </span>
            )
          })}
        </div>
      </div>
    </WidgetFrame>
  )
}
