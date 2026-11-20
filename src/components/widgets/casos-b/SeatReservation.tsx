import { useCallback, useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { CreditCard, RotateCcw } from 'lucide-react'
import { Log, Segmented, Slider, Stat, WidgetFrame } from '../kit'
import './SeatReservation.css'

type Strategy = 'none' | 'pessimistic' | 'optimistic' | 'redis'
type Who = 'A' | 'B'
type Status = 'free' | 'held' | 'sold' | 'double'

interface Seat {
  status: Status
  owner?: Who
  expiresAt?: number
  /** B pays at this timestamp (if defined) */
  payAt?: number
  version: number
  /** set when a hold just expired (for the log) */
  expiredFrom?: Who
}

interface RaceStep {
  lane: Who | 'sys'
  text: string
  tone?: 'ok' | 'warn' | 'bad'
}

interface Race {
  seat: number
  steps: RaceStep[]
  shown: number
  /** applied when the animation ends */
  outcome: { kind: 'hold'; who: Who } | { kind: 'double' } | { kind: 'none' }
}

const ROWS = 4
const COLS = 7
const N = ROWS * COLS
const ROW_NAMES = 'ABCDEFGH'
const STEP_MS = 520
const ease = [0.16, 1, 0.3, 1] as const

const seatName = (i: number) => `${ROW_NAMES[Math.floor(i / COLS)]}${(i % COLS) + 1}`

const fresh = (): Seat[] => Array.from({ length: N }, () => ({ status: 'free' as Status, version: 1 }))

const strategyOptions: { value: Strategy; label: string }[] = [
  { value: 'none', label: 'Sin control' },
  { value: 'pessimistic', label: 'FOR UPDATE' },
  { value: 'optimistic', label: 'Optimista' },
  { value: 'redis', label: 'Hold en Redis' },
]

const strategyBlurb: Record<Strategy, string> = {
  none: 'Lee el estado, decide en la aplicación y escribe. Entre la lectura y la escritura hay una ventana en la que otro puede leer lo mismo.',
  pessimistic:
    'SELECT … FOR UPDATE toma un lock de fila dentro de una transacción corta. El segundo espera y, cuando entra, ya ve el asiento tomado.',
  optimistic:
    'UPDATE condicional con columna version: solo gana quien todavía ve la versión que leyó. El otro recibe 0 filas afectadas.',
  redis:
    'SET seat NX PX ttl es atómico en Redis: el primero crea la clave, el segundo recibe nil al instante. La clave expira sola si nadie paga.',
}

function buildRace(strategy: Strategy, seat: number, version: number, winner: Who, contested: boolean, ttlS: number): Race {
  const w = winner
  const l: Who = w === 'A' ? 'B' : 'A'
  const s = seatName(seat)
  if (!contested) {
    const step: RaceStep =
      strategy === 'redis'
        ? { lane: w, text: `SET seat:${s} ${w} NX PX ${ttlS}000 → OK`, tone: 'ok' }
        : { lane: w, text: `UPDATE tickets SET status='held' WHERE id='${s}' → 1 fila`, tone: 'ok' }
    return { seat, steps: [step, { lane: 'sys', text: `Sin competencia: ${w} obtiene el hold de ${s}.`, tone: 'ok' }], shown: 0, outcome: { kind: 'hold', who: w } }
  }
  let steps: RaceStep[] = []
  let outcome: Race['outcome'] = { kind: 'hold', who: w }
  switch (strategy) {
    case 'none':
      steps = [
        { lane: w, text: `SELECT status FROM tickets WHERE id='${s}' → available` },
        { lane: l, text: `SELECT status FROM tickets WHERE id='${s}' → available` },
        { lane: w, text: `UPDATE tickets SET status='held', owner='${w}' → ok`, tone: 'ok' },
        { lane: l, text: `UPDATE tickets SET status='held', owner='${l}' → ok (pisa a ${w})`, tone: 'warn' },
        { lane: 'sys', text: `Los dos recibieron "asiento reservado" y los dos pagan: doble venta de ${s}.`, tone: 'bad' },
      ]
      outcome = { kind: 'double' }
      break
    case 'pessimistic':
      steps = [
        { lane: w, text: `BEGIN; SELECT … WHERE id='${s}' FOR UPDATE → lock obtenido`, tone: 'ok' },
        { lane: l, text: `BEGIN; SELECT … WHERE id='${s}' FOR UPDATE → bloqueado, esperando…`, tone: 'warn' },
        { lane: w, text: `UPDATE … SET status='held'; COMMIT → libera el lock`, tone: 'ok' },
        { lane: l, text: `obtiene el lock, lee status='held' → ROLLBACK, 409`, tone: 'bad' },
        { lane: 'sys', text: `${l} esperó un turno completo de ${w}. Correcto, pero con contención alta las esperas se acumulan.` },
      ]
      break
    case 'optimistic':
      steps = [
        { lane: w, text: `SELECT status, version → available, v=${version}` },
        { lane: l, text: `SELECT status, version → available, v=${version}` },
        { lane: w, text: `UPDATE … SET status='held', version=${version + 1} WHERE version=${version} → 1 fila`, tone: 'ok' },
        { lane: l, text: `UPDATE … WHERE version=${version} → 0 filas: conflicto`, tone: 'warn' },
        { lane: l, text: `relee: status='held', v=${version + 1} → 409 no disponible`, tone: 'bad' },
      ]
      break
    case 'redis':
      steps = [
        { lane: w, text: `SET seat:${s} ${w} NX PX ${ttlS}000 → OK`, tone: 'ok' },
        { lane: l, text: `SET seat:${s} ${l} NX PX ${ttlS}000 → (nil)`, tone: 'bad' },
        { lane: l, text: '409 inmediato: sin esperar un lock ni tocar Postgres' },
        { lane: 'sys', text: `Si ${w} no paga en ${ttlS} s, la clave expira y el asiento vuelve solo.` },
      ]
      break
  }
  return { seat, steps, shown: 0, outcome }
}

export function SeatReservation() {
  const reduced = useReducedMotion()
  const [strategy, setStrategy] = useState<Strategy>('none')
  const [contested, setContested] = useState(true)
  const [ttl, setTtl] = useState(15)
  const [seats, setSeats] = useState<Seat[]>(fresh)
  const [race, setRace] = useState<Race | null>(null)
  const [now, setNow] = useState(() => Date.now())
  const [stats, setStats] = useState({ doubles: 0, conflicts: 0 })
  const [log, setLog] = useState<{ id: number; text: string; tone?: 'ok' | 'warn' | 'bad' }[]>([])
  const logId = useRef(0)
  const ttlRef = useRef(ttl)
  useEffect(() => {
    ttlRef.current = ttl
  }, [ttl])

  const push = useCallback((text: string, tone?: 'ok' | 'warn' | 'bad') => {
    logId.current += 1
    const id = logId.current
    setLog((l) => [{ id, text, tone }, ...l].slice(0, 30))
  }, [])

  /* Clock: expire holds, let bot B pay some of its holds (pure updater). */
  useEffect(() => {
    const t = window.setInterval(() => {
      const ts = Date.now()
      setNow(ts)
      setSeats((prev) => {
        let changed = false
        const next = prev.map((seat) => {
          if (seat.status !== 'held') return seat
          if (seat.owner === 'B' && seat.payAt !== undefined && seat.payAt <= ts) {
            changed = true
            return { status: 'sold' as Status, owner: 'B' as Who, version: seat.version + 1 }
          }
          if (seat.expiresAt !== undefined && seat.expiresAt <= ts) {
            changed = true
            return { status: 'free' as Status, version: seat.version + 1, expiredFrom: seat.owner }
          }
          return seat
        })
        return changed ? next : prev
      })
    }, 250)
    return () => window.clearInterval(t)
  }, [])

  /* Derive log lines for clock-driven transitions by diffing. */
  const prevSeats = useRef(seats)
  useEffect(() => {
    const prev = prevSeats.current
    prevSeats.current = seats
    if (prev === seats) return
    seats.forEach((s, i) => {
      const p = prev[i]
      if (p.status !== 'held') return
      if (s.status === 'sold' && s.owner === 'B' && p.owner === 'B') push(`B pagó ${seatName(i)} → vendido`, 'ok')
      if (s.status === 'free' && s.expiredFrom) push(`Hold de ${s.expiredFrom} en ${seatName(i)} expiró → disponible`, 'warn')
    })
  }, [seats, push])

  /* Reveal race steps one by one, then apply the outcome. */
  useEffect(() => {
    if (!race) return
    if (race.shown < race.steps.length) {
      const t = window.setTimeout(() => setRace((r) => (r ? { ...r, shown: r.shown + 1 } : r)), race.shown === 0 ? 60 : STEP_MS)
      return () => window.clearTimeout(t)
    }
    const t = window.setTimeout(() => {
      const ts = Date.now()
      const o = race.outcome
      const name = seatName(race.seat)
      const ttlMs = ttlRef.current * 1000
      const expiresAt = ts + ttlMs
      const payAt = o.kind === 'hold' && o.who === 'B' && Math.random() < 0.5 ? ts + ttlMs * (0.3 + Math.random() * 0.4) : undefined
      setSeats((prev) =>
        prev.map((seat, i): Seat => {
          if (i !== race.seat) return seat
          if (o.kind === 'double') return { status: 'double', version: seat.version + 1 }
          if (o.kind === 'hold') return { status: 'held', owner: o.who, expiresAt, payAt, version: seat.version + 1 }
          return seat
        }),
      )
      if (o.kind === 'double') {
        setStats((s) => ({ ...s, doubles: s.doubles + 1 }))
        push(`${name}: doble venta (A y B tienen la misma entrada)`, 'bad')
      } else if (o.kind === 'hold') {
        if (race.steps.length > 2) setStats((s) => ({ ...s, conflicts: s.conflicts + 1 }))
        push(`${name}: hold para ${o.who}${race.steps.length > 2 ? `; ${o.who === 'A' ? 'B' : 'A'} rechazado con 409` : ''}`, o.who === 'A' ? 'ok' : undefined)
      }
      setRace(null)
    }, 700)
    return () => window.clearTimeout(t)
  }, [race, push])

  const request = (i: number) => {
    if (race) return
    const seat = seats[i]
    const name = seatName(i)
    if (seat.status === 'held' && seat.owner === 'A') {
      setSeats((prev) => prev.map((s, j) => (j === i ? { status: 'free', version: s.version + 1 } : s)))
      push(`A liberó ${name} (DEL / UPDATE status='available')`)
      return
    }
    if (seat.status !== 'free') {
      push(`A pide ${name}: no disponible → 409`, 'warn')
      return
    }
    const winner: Who = contested && Math.random() < 0.5 ? 'B' : 'A'
    setRace(buildRace(strategy, i, seat.version, winner, contested, ttl))
  }

  const payA = () => {
    const mine = seats.filter((s) => s.status === 'held' && s.owner === 'A').length
    if (!mine) {
      push('A no tiene holds activos para pagar', 'warn')
      return
    }
    setSeats((prev) => prev.map((s) => (s.status === 'held' && s.owner === 'A' ? { status: 'sold', owner: 'A', version: s.version + 1 } : s)))
    push(`A pagó ${mine} asiento(s): held → sold en una transacción`, 'ok')
  }

  const reset = () => {
    setSeats(fresh())
    setRace(null)
    setStats({ doubles: 0, conflicts: 0 })
    setLog([])
  }

  const sold = seats.filter((s) => s.status === 'sold' || s.status === 'double').length
  const held = seats.filter((s) => s.status === 'held').length
  const myHolds = seats.filter((s) => s.status === 'held' && s.owner === 'A').length

  const seatLabel = (s: Seat, i: number) => {
    const name = seatName(i)
    switch (s.status) {
      case 'free':
        return `Asiento ${name}, disponible. Pedirlo como A.`
      case 'held':
        return `Asiento ${name}, en hold de ${s.owner}, expira en ${Math.max(0, Math.ceil(((s.expiresAt ?? now) - now) / 1000))} segundos${s.owner === 'A' ? '. Tocar para liberarlo.' : '.'}`
      case 'sold':
        return `Asiento ${name}, vendido a ${s.owner}.`
      case 'double':
        return `Asiento ${name}, vendido dos veces.`
    }
  }

  const seatText = (s: Seat, i: number) => {
    if (s.status === 'held') return `${Math.max(0, Math.ceil(((s.expiresAt ?? now) - now) / 1000))}s`
    if (s.status === 'sold') return s.owner
    if (s.status === 'double') return 'A+B'
    return seatName(i)
  }

  return (
    <WidgetFrame
      caption="Toca un asiento como el usuario A. Si «B compite» está activo, el usuario B pide el mismo asiento en el mismo instante (quién llega primero es al azar). Cambia la estrategia y compara: solo «Sin control» vende dos veces el mismo asiento. Los holds expiran solos; B paga la mitad de los suyos."
      controls={
        <>
          <Segmented label="Estrategia" value={strategy} options={strategyOptions} onChange={(v) => !race && setStrategy(v)} />
          <Segmented
            label="Usuario B"
            value={contested ? 'on' : 'off'}
            options={[
              { value: 'on', label: 'B compite' },
              { value: 'off', label: 'A solo' },
            ]}
            onChange={(v) => setContested(v === 'on')}
          />
          <Slider label="TTL del hold (simula 10 min)" value={ttl} min={5} max={30} onChange={setTtl} format={(v) => `${v} s`} />
        </>
      }
      readout={
        <>
          <div className="sr-stats">
            <Stat label="Vendidos" value={sold} />
            <Stat label="En hold" value={held} />
            <Stat label="Dobles ventas" value={stats.doubles} tone={stats.doubles ? 'bad' : 'ok'} />
            <Stat label="Conflictos resueltos" value={stats.conflicts} hint="409 al perdedor" />
          </div>
          <Log entries={log} empty="Toca un asiento para empezar." />
        </>
      }
    >
      <div className="sr">
        <p className="sr-blurb">{strategyBlurb[strategy]}</p>
        <div className="sr-stage-label" aria-hidden="true">
          Escenario
        </div>
        <div className="sr-map" role="group" aria-label="Mapa de asientos">
          {seats.map((s, i) => (
            <button
              key={i}
              type="button"
              className={`sr-seat is-${s.status} ${s.owner ? `own-${s.owner}` : ''} ${race?.seat === i ? 'is-racing' : ''}`}
              aria-label={seatLabel(s, i)}
              onClick={() => request(i)}
              disabled={!!race && race.seat !== i}
            >
              {seatText(s, i)}
            </button>
          ))}
        </div>
        <ul className="sr-legend" aria-label="Leyenda">
          <li>
            <span className="sr-swatch is-free" /> disponible
          </li>
          <li>
            <span className="sr-swatch is-held own-A" /> hold A
          </li>
          <li>
            <span className="sr-swatch is-held own-B" /> hold B
          </li>
          <li>
            <span className="sr-swatch is-sold own-A" /> vendido
          </li>
          <li>
            <span className="sr-swatch is-double" /> doble venta
          </li>
        </ul>

        <div className="sr-actions">
          <button type="button" className="btn btn--line" onClick={payA} disabled={!myHolds || !!race}>
            <CreditCard size={16} aria-hidden="true" /> Pagar mis holds ({myHolds})
          </button>
          <button type="button" className="btn btn--ghost" onClick={reset}>
            <RotateCcw size={16} aria-hidden="true" /> Reiniciar
          </button>
        </div>

        <div className="sr-race" aria-live="polite">
          <div className="sr-race__title">{race ? `Carrera por ${seatName(race.seat)}` : 'Línea de tiempo de la última petición'}</div>
          <ol className="sr-race__list">
            <AnimatePresence initial={false}>
              {race?.steps.slice(0, race.shown).map((st, k) => (
                <motion.li
                  key={`${race.seat}-${k}`}
                  className={`sr-step lane-${st.lane} ${st.tone ? `is-${st.tone}` : ''}`}
                  initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25, ease }}
                >
                  <span className="sr-step__lane">{st.lane === 'sys' ? '=' : st.lane}</span>
                  <code className="sr-step__text">{st.text}</code>
                </motion.li>
              ))}
            </AnimatePresence>
            {!race && <li className="sr-race__empty">Elige un asiento libre para ver las operaciones de A y B intercaladas.</li>}
          </ol>
        </div>
      </div>
    </WidgetFrame>
  )
}
