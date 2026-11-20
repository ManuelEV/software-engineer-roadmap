import { useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { BookOpen, PenLine, RotateCcw } from 'lucide-react'
import { Log, Segmented, Slider, Stat, WidgetFrame } from '../kit'
import { fmt, useTicker } from './shared'
import './ReplicationLag.css'

type Strategy = 'any' | 'ryw' | 'mono'
type Ack = 'async' | 'semi'
type ReplicaId = 'L' | 'A' | 'B'

interface Write {
  version: number
  t: number
}

interface Entry {
  id: number
  text: string
  tone?: 'ok' | 'warn' | 'bad'
}

const NAMES: Record<ReplicaId, string> = { L: 'Líder', A: 'Seguidor A', B: 'Seguidor B' }

// SVG layout
const POS: Record<ReplicaId | 'C', { x: number; y: number }> = {
  C: { x: 52, y: 110 },
  L: { x: 170, y: 110 },
  A: { x: 300, y: 60 },
  B: { x: 300, y: 172 },
}

/**
 * Leader–follower replication with adjustable lag. Write on the leader,
 * read from a replica, and watch stale / non-monotonic reads appear.
 */
export function ReplicationLag() {
  const reduced = useReducedMotion()
  const [lag, setLag] = useState(2500) // ms for follower A; B lags 30% of that
  const [strategy, setStrategy] = useState<Strategy>('any')
  const [ack, setAck] = useState<Ack>('async')
  const [writes, setWrites] = useState<Write[]>([])
  const [now, setNow] = useState(() => Date.now())
  const [rr, setRr] = useState(0)
  const [lastSeen, setLastSeen] = useState(0)
  const [stale, setStale] = useState(0)
  const [reads, setReads] = useState(0)
  const [log, setLog] = useState<Entry[]>([])
  const [lastRead, setLastRead] = useState<{ from: ReplicaId; at: number } | null>(null)

  const lagOf = (r: ReplicaId) => (r === 'L' ? 0 : r === 'A' ? lag : Math.round(lag * 0.3))
  const versionAt = (r: ReplicaId, t: number) => {
    let v = 0
    for (const w of writes) if (w.t + lagOf(r) <= t) v = Math.max(v, w.version)
    return v
  }
  const leaderV = writes.length ? writes[writes.length - 1].version : 0
  const lastWrite = writes[writes.length - 1]
  const ackAt = lastWrite ? lastWrite.t + (ack === 'semi' ? lagOf('B') : 0) : 0
  const pendingAck = !!lastWrite && now < ackAt
  const inFlight = writes.some((w) => now < w.t + lagOf('A'))

  useTicker(() => setNow(Date.now()), 60, inFlight || pendingAck)

  const push = (text: string, tone?: Entry['tone']) =>
    setLog((l) => [{ id: Date.now() + Math.random(), text, tone }, ...l].slice(0, 30))

  const doWrite = () => {
    const t = Date.now()
    const version = leaderV + 1
    setWrites((w) => [...w.slice(-12), { version, t }])
    setNow(t)
    push(
      ack === 'semi'
        ? `Escribes "nombre = v${version}". El líder espera a que B confirme antes de responder.`
        : `Escribes "nombre = v${version}". El líder responde OK de inmediato y replica en segundo plano.`,
    )
  }

  const doRead = () => {
    const t = Date.now()
    setNow(t)
    const vA = versionAt('A', t)
    const vB = versionAt('B', t)
    const myLast = leaderV // in this demo, every write is yours
    let from: ReplicaId
    let why = ''
    if (strategy === 'any') {
      from = rr % 2 === 0 ? 'A' : 'B'
      setRr((x) => x + 1)
      why = 'balanceo round robin entre seguidores'
    } else if (strategy === 'ryw') {
      // route to a follower that has caught up to my last write; else leader
      if (vB >= myLast) {
        from = 'B'
        why = `B ya aplicó v${myLast}`
      } else if (vA >= myLast) {
        from = 'A'
        why = `A ya aplicó v${myLast}`
      } else {
        from = 'L'
        why = `ningún seguidor llegó a v${myLast}, se lee del líder`
      }
    } else {
      from = 'A'
      why = 'tu sesión siempre lee de la misma réplica (A)'
    }
    const v = from === 'L' ? leaderV : from === 'A' ? vA : vB
    setReads((r) => r + 1)
    setLastRead({ from, at: t })
    const label = v === 0 ? 'sin valor' : `v${v}`
    if (v < lastSeen) {
      setStale((s) => s + 1)
      push(`Lees ${label} desde ${NAMES[from]} (${why}). Antes viste v${lastSeen}: viajaste al pasado.`, 'bad')
    } else if (v < myLast) {
      setStale((s) => s + 1)
      push(`Lees ${label} desde ${NAMES[from]} (${why}). Tu escritura v${myLast} todavía no llegó.`, 'warn')
    } else {
      push(`Lees ${label} desde ${NAMES[from]} (${why}). Dato al día.`, 'ok')
    }
    setLastSeen((s) => Math.max(s, v))
  }

  const reset = () => {
    setWrites([])
    setRr(0)
    setLastSeen(0)
    setStale(0)
    setReads(0)
    setLog([])
    setLastRead(null)
    setNow(Date.now())
  }

  const versions: Record<ReplicaId, number> = { L: leaderV, A: versionAt('A', now), B: versionAt('B', now) }
  const packets = (['A', 'B'] as const).flatMap((r) =>
    writes
      .filter((w) => now >= w.t && now < w.t + lagOf(r))
      .map((w) => ({ r, version: w.version, p: (now - w.t) / Math.max(1, lagOf(r)) })),
  )
  const readFlash = lastRead && now - lastRead.at < 900 ? lastRead.from : null

  const node = (id: ReplicaId) => {
    const p = POS[id]
    const behind = versions[id] < leaderV
    return (
      <g key={id}>
        <circle
          cx={p.x}
          cy={p.y}
          r={30}
          className={`rl-node ${id === 'L' ? 'is-leader' : ''} ${behind ? 'is-behind' : ''} ${readFlash === id ? 'is-read' : ''}`}
        />
        <text x={p.x} y={p.y + 5} textAnchor="middle" className="rl-ver">
          {versions[id] ? `v${versions[id]}` : '—'}
        </text>
        <text x={p.x} y={p.y + (id === 'A' ? -40 : 48)} textAnchor="middle" className="rl-name">
          {NAMES[id]}
        </text>
      </g>
    )
  }

  return (
    <WidgetFrame
      caption="Escribe en el líder y lee de una réplica. Con lag alto y round robin aparecen lecturas viejas y lecturas que retroceden en el tiempo; cambia la estrategia para evitarlas."
      controls={
        <>
          <Slider
            label="Lag del seguidor A"
            value={lag}
            min={0}
            max={5000}
            step={250}
            onChange={setLag}
            format={(v) => `${fmt(v / 1000, 2)} s (B: ${fmt((v * 0.3) / 1000, 2)} s)`}
          />
          <Segmented
            label="Lecturas"
            value={strategy}
            onChange={setStrategy}
            options={[
              { value: 'any', label: 'Cualquier seguidor' },
              { value: 'ryw', label: 'Read-your-writes' },
              { value: 'mono', label: 'Monótonas (sticky)' },
            ]}
          />
          <Segmented
            label="Confirmación"
            value={ack}
            onChange={setAck}
            options={[
              { value: 'async', label: 'Asíncrona' },
              { value: 'semi', label: 'Semi-síncrona (B)' },
            ]}
          />
        </>
      }
      readout={
        <div className="rl-readout">
          <div className="rl-actions">
            <button type="button" className="btn btn--line" onClick={doWrite} disabled={pendingAck}>
              <PenLine size={16} aria-hidden="true" />
              {pendingAck ? 'Esperando a B…' : `Escribir v${leaderV + 1}`}
            </button>
            <button type="button" className="btn" onClick={doRead}>
              <BookOpen size={16} aria-hidden="true" />
              Leer
            </button>
            <button type="button" className="icon-btn" onClick={reset} aria-label="Reiniciar">
              <RotateCcw size={18} aria-hidden="true" />
            </button>
          </div>
          <div className="rl-stats">
            <Stat label="lecturas" value={reads} />
            <Stat label="lecturas obsoletas" value={stale} tone={stale ? 'bad' : undefined} />
          </div>
          <Log entries={log} empty="Escribe un valor y luego léelo varias veces." />
        </div>
      }
    >
      <svg viewBox="0 0 360 230" className="rl-svg" role="img" aria-label="Cliente, líder y dos seguidores con sus versiones">
        {(['A', 'B'] as const).map((r) => (
          <line key={r} x1={POS.L.x} y1={POS.L.y} x2={POS[r].x} y2={POS[r].y} className="rl-edge" />
        ))}
        <line x1={POS.C.x} y1={POS.C.y} x2={POS.L.x} y2={POS.L.y} className="rl-edge rl-edge--client" />
        {readFlash && readFlash !== 'L' && (
          <line x1={POS.C.x} y1={POS.C.y} x2={POS[readFlash].x} y2={POS[readFlash].y} className="rl-readline" />
        )}
        {packets.map((k) => {
          const a = POS.L
          const b = POS[k.r]
          const x = a.x + (b.x - a.x) * k.p
          const y = a.y + (b.y - a.y) * k.p
          return reduced ? null : (
            <g key={`${k.r}-${k.version}`}>
              <circle cx={x} cy={y} r={11} className="rl-packet" />
              <text x={x} y={y + 4} textAnchor="middle" className="rl-packet-t">
                {k.version}
              </text>
            </g>
          )
        })}
        <g>
          <rect x={POS.C.x - 30} y={POS.C.y - 20} width={60} height={40} rx={8} className="rl-client" />
          <text x={POS.C.x} y={POS.C.y + 5} textAnchor="middle" className="rl-name">
            Tú
          </text>
        </g>
        {(['L', 'A', 'B'] as const).map(node)}
      </svg>
    </WidgetFrame>
  )
}
