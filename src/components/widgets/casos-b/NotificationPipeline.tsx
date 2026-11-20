import { useEffect, useReducer, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Copy, Inbox, Pause, Play, RotateCcw, Send, Zap } from 'lucide-react'
import { Log, Segmented, Slider, Stat, WidgetFrame } from '../kit'
import { useMediaQuery } from '../../../lib/hooks'
import './NotificationPipeline.css'

type Channel = 'push' | 'email' | 'sms'
type Priority = 'alta' | 'normal' | 'baja'
type Stage = 'api' | 'filter' | 'queue' | 'worker' | 'provider' | 'retry' | 'done' | 'dlq' | 'dropped'
type DropReason = 'dedup' | 'preferencia' | 'límite'

interface Item {
  id: number
  eventId: string
  user: string
  channel: Channel
  priority: Priority
  stage: Stage
  attempts: number
  dueTick: number
  queuedAt: number
  endedAt: number
  reason?: DropReason
}

interface LogEntry {
  id: number
  text: string
  tone?: 'ok' | 'warn' | 'bad'
}

interface State {
  tick: number
  nextId: number
  nextEvent: number
  lastEvent: { eventId: string; user: string } | null
  items: Item[]
  seen: string[]
  sends: { user: string; tick: number }[]
  delivered: number
  retries: number
  dropped: Record<DropReason, number>
  log: LogEntry[]
  logId: number
}

type NewMsg = { user: string; channel: Channel; priority: Priority; reuse: boolean }

type Action =
  | { type: 'send'; msgs: NewMsg[] }
  | { type: 'tick'; rolls: number[]; failRate: number; maxAttempts: number }
  | { type: 'redrive' }
  | { type: 'reset' }

const USERS = ['ana', 'beto', 'caro']
const RATE_LIMIT = 3
const RATE_WINDOW = 20
const WORKER_CAPACITY = 2
const PROVIDER: Record<Channel, string> = { push: 'APNs/FCM', email: 'SES', sms: 'Twilio' }
const PRIO_RANK: Record<Priority, number> = { alta: 0, normal: 1, baja: 2 }

const initial: State = {
  tick: 0,
  nextId: 1,
  nextEvent: 1,
  lastEvent: null,
  items: [],
  seen: [],
  sends: [],
  delivered: 0,
  retries: 0,
  dropped: { dedup: 0, preferencia: 0, límite: 0 },
  log: [],
  logId: 0,
}

function addLog(s: State, text: string, tone?: LogEntry['tone']): State {
  const logId = s.logId + 1
  return { ...s, logId, log: [{ id: logId, text, tone }, ...s.log].slice(0, 40) }
}

function backoff(attempts: number, roll: number) {
  // base 2 ticks, se duplica por intento, tope 16, con jitter de 50–100 %
  const base = Math.min(2 * 2 ** (attempts - 1), 16)
  return Math.max(1, Math.round(base * (0.5 + roll * 0.5)))
}

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'reset':
      return initial
    case 'send': {
      let s = state
      const items = [...s.items]
      for (const m of action.msgs) {
        let eventId: string
        let user = m.user
        let nextEvent = s.nextEvent
        if (m.reuse && s.lastEvent) {
          eventId = s.lastEvent.eventId
          user = s.lastEvent.user
        } else {
          eventId = `ev${nextEvent}`
          nextEvent += 1
        }
        items.push({
          id: s.nextId,
          eventId,
          user,
          channel: m.channel,
          priority: m.priority,
          stage: 'api',
          attempts: 0,
          dueTick: 0,
          queuedAt: 0,
          endedAt: 0,
        })
        s = { ...s, nextId: s.nextId + 1, nextEvent, lastEvent: { eventId, user } }
      }
      return { ...s, items }
    }
    case 'redrive': {
      const n = state.items.filter((i) => i.stage === 'dlq').length
      if (!n) return state
      const items = state.items.map((i) =>
        i.stage === 'dlq' ? { ...i, stage: 'queue' as Stage, attempts: 0, queuedAt: state.tick } : i,
      )
      return addLog({ ...state, items }, `redrive: ${n} mensajes vuelven de la DLQ a la cola`, 'warn')
    }
    case 'tick': {
      const tick = state.tick + 1
      let s: State = { ...state, tick }
      let r = 0
      const roll = () => action.rolls[r++ % action.rolls.length]
      let items = s.items.map((i) => ({ ...i }))

      // 1) Respuesta del proveedor
      for (const it of items.filter((i) => i.stage === 'provider')) {
        if (roll() >= action.failRate) {
          it.stage = 'done'
          it.endedAt = tick
          s = { ...s, delivered: s.delivered + 1 }
          s = addLog(s, `#${it.id} ${it.channel}·${it.priority} → ${PROVIDER[it.channel]} 200 ok (${it.user})`, 'ok')
        } else {
          it.attempts += 1
          if (it.attempts >= action.maxAttempts) {
            it.stage = 'dlq'
            it.endedAt = tick
            s = addLog(s, `#${it.id} ${PROVIDER[it.channel]} falló ${it.attempts} veces → DLQ`, 'bad')
          } else {
            const wait = backoff(it.attempts, roll())
            it.stage = 'retry'
            it.dueTick = tick + wait
            s = { ...s, retries: s.retries + 1 }
            s = addLog(s, `#${it.id} ${PROVIDER[it.channel]} 503 → reintento ${it.attempts} en ${wait} ticks`, 'warn')
          }
        }
      }
      // 2) Worker → proveedor
      for (const it of items.filter((i) => i.stage === 'worker')) it.stage = 'provider'
      // 3) El worker toma de las colas por prioridad estricta
      const queued = items
        .filter((i) => i.stage === 'queue')
        .sort((a, b) => PRIO_RANK[a.priority] - PRIO_RANK[b.priority] || a.queuedAt - b.queuedAt || a.id - b.id)
      for (const it of queued.slice(0, WORKER_CAPACITY)) it.stage = 'worker'
      // 4) Reintentos vencidos vuelven a la cola
      for (const it of items.filter((i) => i.stage === 'retry' && i.dueTick <= tick)) {
        it.stage = 'queue'
        it.queuedAt = tick
      }
      // 5) Filtros: dedup, preferencias, límite por usuario
      let seen = s.seen
      let sends = s.sends.filter((x) => tick - x.tick < RATE_WINDOW)
      const dropped = { ...s.dropped }
      for (const it of items.filter((i) => i.stage === 'filter')) {
        let reason: DropReason | undefined
        if (seen.includes(it.eventId)) reason = 'dedup'
        else if (it.user === 'ana' && it.channel === 'sms') reason = 'preferencia'
        else if (it.priority !== 'alta' && sends.filter((x) => x.user === it.user).length >= RATE_LIMIT) reason = 'límite'
        if (reason) {
          it.stage = 'dropped'
          it.reason = reason
          it.endedAt = tick
          dropped[reason] += 1
          const why =
            reason === 'dedup'
              ? `evento ${it.eventId} ya procesado`
              : reason === 'preferencia'
                ? 'ana desactivó SMS'
                : `${it.user} superó ${RATE_LIMIT} avisos por ventana`
          s = addLog(s, `#${it.id} descartada: ${why}`)
        } else {
          it.stage = 'queue'
          it.queuedAt = tick
          seen = [...seen, it.eventId].slice(-200)
          sends = [...sends, { user: it.user, tick }]
        }
      }
      // 6) API → filtros
      for (const it of items.filter((i) => i.stage === 'api')) it.stage = 'filter'
      // Limpieza: las terminadas se ven un momento y se van (la DLQ se queda)
      items = items.filter((i) => !((i.stage === 'done' || i.stage === 'dropped') && tick - i.endedAt > 2))
      return { ...s, items, seen, sends, dropped }
    }
  }
}

/* ───────── Geometría ───────── */

type StationId = 'api' | 'filter' | 'qa' | 'qn' | 'qb' | 'worker' | 'retry' | 'provider' | 'done' | 'dlq' | 'dropped'
type Pt = { x: number; y: number; label: string; lx: number; ly: number; anchor: 'start' | 'middle' | 'end' }

const WIDE: { w: number; h: number; s: Record<StationId, Pt> } = {
  w: 700,
  h: 290,
  s: {
    api: { x: 40, y: 120, label: 'API', lx: 0, ly: -26, anchor: 'middle' },
    filter: { x: 150, y: 120, label: 'Filtros', lx: 0, ly: -26, anchor: 'middle' },
    dropped: { x: 150, y: 240, label: 'Descartadas', lx: 0, ly: 34, anchor: 'middle' },
    qa: { x: 270, y: 60, label: 'Cola alta', lx: 0, ly: -24, anchor: 'middle' },
    qn: { x: 270, y: 120, label: 'normal', lx: 0, ly: -24, anchor: 'middle' },
    qb: { x: 270, y: 180, label: 'baja', lx: 0, ly: 34, anchor: 'middle' },
    worker: { x: 390, y: 120, label: 'Worker', lx: 0, ly: -26, anchor: 'middle' },
    retry: { x: 390, y: 240, label: 'Backoff', lx: 0, ly: 34, anchor: 'middle' },
    provider: { x: 510, y: 120, label: 'Proveedor', lx: 0, ly: -26, anchor: 'middle' },
    dlq: { x: 510, y: 240, label: 'DLQ', lx: 0, ly: 34, anchor: 'middle' },
    done: { x: 640, y: 120, label: 'Entregada', lx: 0, ly: -26, anchor: 'middle' },
  },
}

const NARROW: typeof WIDE = {
  w: 360,
  h: 600,
  s: {
    api: { x: 60, y: 40, label: 'API', lx: 24, ly: 5, anchor: 'start' },
    filter: { x: 60, y: 130, label: 'Filtros', lx: 24, ly: 5, anchor: 'start' },
    dropped: { x: 270, y: 130, label: 'Descartadas', lx: 0, ly: -24, anchor: 'middle' },
    qa: { x: 60, y: 230, label: 'alta', lx: 0, ly: 34, anchor: 'middle' },
    qn: { x: 160, y: 230, label: 'normal', lx: 0, ly: 34, anchor: 'middle' },
    qb: { x: 260, y: 230, label: 'baja', lx: 0, ly: 34, anchor: 'middle' },
    worker: { x: 60, y: 340, label: 'Worker', lx: 24, ly: 5, anchor: 'start' },
    retry: { x: 270, y: 340, label: 'Backoff', lx: 0, ly: -24, anchor: 'middle' },
    provider: { x: 60, y: 440, label: 'Proveedor', lx: 24, ly: 5, anchor: 'start' },
    dlq: { x: 270, y: 440, label: 'DLQ', lx: 0, ly: -24, anchor: 'middle' },
    done: { x: 60, y: 550, label: 'Entregada', lx: 24, ly: 5, anchor: 'start' },
  },
}

const EDGES: [StationId, StationId, boolean?][] = [
  ['api', 'filter'],
  ['filter', 'qa'],
  ['filter', 'qn'],
  ['filter', 'qb'],
  ['qa', 'worker'],
  ['qn', 'worker'],
  ['qb', 'worker'],
  ['worker', 'provider'],
  ['provider', 'done'],
  ['filter', 'dropped', true],
  ['provider', 'retry', true],
  ['retry', 'qn', true],
  ['provider', 'dlq', true],
]

function stationOf(i: Item): StationId {
  if (i.stage === 'queue') return i.priority === 'alta' ? 'qa' : i.priority === 'normal' ? 'qn' : 'qb'
  return i.stage as StationId
}

export function NotificationPipeline() {
  const reduced = useReducedMotion()
  const narrow = useMediaQuery('(max-width: 560px)')
  const [state, dispatch] = useReducer(reducer, initial)
  const [channel, setChannel] = useState<Channel>('push')
  const [priority, setPriority] = useState<Priority>('normal')
  const [failRate, setFailRate] = useState(30)
  const [maxAttempts, setMaxAttempts] = useState(4)
  const [paused, setPaused] = useState(false)

  const active = state.items.some((i) => i.stage !== 'dlq')

  useEffect(() => {
    if (!active || paused) return
    const id = window.setInterval(() => {
      const rolls = Array.from({ length: 24 }, () => Math.random())
      dispatch({ type: 'tick', rolls, failRate: failRate / 100, maxAttempts })
    }, 550)
    return () => window.clearInterval(id)
  }, [active, paused, failRate, maxAttempts])

  const randomUser = () => USERS[Math.floor(Math.random() * USERS.length)]
  const sendOne = () => dispatch({ type: 'send', msgs: [{ user: randomUser(), channel, priority, reuse: false }] })
  const resend = () => dispatch({ type: 'send', msgs: [{ user: randomUser(), channel, priority, reuse: true }] })
  const burst = () => {
    const chans: Channel[] = ['push', 'email', 'sms']
    const prios: Priority[] = ['alta', 'normal', 'normal', 'baja', 'baja']
    const msgs: NewMsg[] = Array.from({ length: 10 }, (_, i) => ({
      user: randomUser(),
      channel: chans[Math.floor(Math.random() * chans.length)],
      priority: prios[Math.floor(Math.random() * prios.length)],
      reuse: i > 0 && Math.random() < 0.2,
    }))
    dispatch({ type: 'send', msgs })
  }

  const geo = narrow ? NARROW : WIDE
  const S = geo.s
  const dlqCount = state.items.filter((i) => i.stage === 'dlq').length
  const droppedTotal = state.dropped.dedup + state.dropped.preferencia + state.dropped['límite']
  const inFlight = state.items.filter((i) => !['done', 'dlq', 'dropped'].includes(i.stage)).length

  // Posición de cada punto: agrupados alrededor de su etapa
  const byStation = new Map<StationId, Item[]>()
  for (const it of state.items) {
    const st = stationOf(it)
    byStation.set(st, [...(byStation.get(st) ?? []), it])
  }
  const MAX_DOTS = 6
  const dotPos = (st: StationId, idx: number) => {
    const p = S[st]
    const col = idx % 3
    const row = Math.floor(idx / 3)
    // puntos en una mini grilla a la derecha-abajo de la etapa
    return { x: p.x + 22 + col * 12, y: p.y + 14 + row * 12 }
  }
  const tr = reduced ? { duration: 0 } : { duration: 0.4, ease: [0.16, 1, 0.3, 1] as const }

  return (
    <WidgetFrame
      caption={
        <>
          Cada punto es una notificación (color = canal). Los filtros descartan duplicados (mismo <code>eventId</code>), lo que el
          usuario desactivó (Ana no quiere SMS) y lo que excede {RATE_LIMIT} avisos por usuario por ventana (la prioridad alta está
          exenta). Sube la tasa de fallo del proveedor para ver el backoff exponencial y la DLQ.
        </>
      }
      controls={
        <>
          <Segmented<Channel>
            label="Canal"
            value={channel}
            onChange={setChannel}
            options={[
              { value: 'push', label: 'Push' },
              { value: 'email', label: 'Email' },
              { value: 'sms', label: 'SMS' },
            ]}
          />
          <Segmented<Priority>
            label="Prioridad"
            value={priority}
            onChange={setPriority}
            options={[
              { value: 'alta', label: 'Alta' },
              { value: 'normal', label: 'Normal' },
              { value: 'baja', label: 'Baja' },
            ]}
          />
          <Slider label="Fallo del proveedor" value={failRate} min={0} max={90} step={5} onChange={setFailRate} format={(v) => `${v} %`} />
          <Slider label="Intentos máx. antes de DLQ" value={maxAttempts} min={1} max={6} onChange={setMaxAttempts} />
        </>
      }
      readout={
        <>
          <div className="np-stats">
            <Stat label="Entregadas" value={state.delivered} tone={state.delivered ? 'ok' : undefined} />
            <Stat label="Reintentos" value={state.retries} tone={state.retries ? 'warn' : undefined} />
            <Stat label="En DLQ" value={dlqCount} tone={dlqCount ? 'bad' : undefined} />
            <Stat
              label="Descartadas"
              value={droppedTotal}
              hint={`dedup ${state.dropped.dedup} · pref. ${state.dropped.preferencia} · límite ${state.dropped['límite']}`}
            />
            <Stat label="En vuelo" value={inFlight} />
          </div>
          <Log entries={state.log} empty="Envía una notificación para empezar." />
        </>
      }
    >
      <div className="np-actions">
        <button type="button" className="btn btn--line" onClick={sendOne}>
          <Send size={16} aria-hidden="true" /> Enviar
        </button>
        <button type="button" className="btn" onClick={resend} disabled={!state.lastEvent}>
          <Copy size={16} aria-hidden="true" /> Reenviar mismo evento
        </button>
        <button type="button" className="btn" onClick={burst}>
          <Zap size={16} aria-hidden="true" /> Ráfaga ×10
        </button>
        <button type="button" className="btn" onClick={() => dispatch({ type: 'redrive' })} disabled={!dlqCount}>
          <Inbox size={16} aria-hidden="true" /> Reprocesar DLQ
        </button>
        <span className="np-spacer" />
        <button
          type="button"
          className="icon-btn"
          onClick={() => setPaused((p) => !p)}
          aria-label={paused ? 'Reanudar simulación' : 'Pausar simulación'}
        >
          {paused ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}
        </button>
        <button type="button" className="icon-btn" onClick={() => dispatch({ type: 'reset' })} aria-label="Reiniciar">
          <RotateCcw size={18} aria-hidden="true" />
        </button>
      </div>

      <div className="np-legend" aria-hidden="true">
        <span><i className="np-dot np-dot--push" /> push</span>
        <span><i className="np-dot np-dot--email" /> email</span>
        <span><i className="np-dot np-dot--sms" /> SMS</span>
        <span className="np-legend__tick">tick {state.tick}</span>
      </div>

      <svg
        className="np-svg"
        viewBox={`0 0 ${geo.w} ${geo.h}`}
        role="img"
        aria-label={`Pipeline de notificaciones: ${state.delivered} entregadas, ${state.retries} reintentos, ${dlqCount} en la cola de mensajes muertos, ${droppedTotal} descartadas.`}
      >
        {EDGES.map(([a, b, side]) => {
          const p = S[a]
          const q = S[b]
          const busy = !side && (byStation.get(a)?.length ?? 0) > 0
          return (
            <line
              key={`${a}-${b}`}
              x1={p.x}
              y1={p.y}
              x2={q.x}
              y2={q.y}
              className={`np-edge ${side ? 'is-side' : ''} ${busy ? 'is-busy' : ''}`}
            />
          )
        })}
        {(Object.keys(S) as StationId[]).map((id) => {
          const p = S[id]
          const n = byStation.get(id)?.length ?? 0
          const tone = id === 'dlq' ? 'bad' : id === 'dropped' ? 'muted' : id === 'done' ? 'ok' : id === 'retry' ? 'warn' : ''
          return (
            <g key={id}>
              <circle cx={p.x} cy={p.y} r={13} className={`np-station ${n ? 'is-on' : ''} ${tone ? `is-${tone}` : ''}`} />
              <text x={p.x + p.lx} y={p.y + p.ly} textAnchor={p.anchor} className="np-label">
                {p.label}
              </text>
              {n > MAX_DOTS && (
                <text x={p.x + 22} y={p.y - 6} className="np-count">
                  {n}
                </text>
              )}
            </g>
          )
        })}
        {[...byStation.entries()].flatMap(([st, list]) =>
          list.slice(0, MAX_DOTS).map((it, idx) => {
            const d = dotPos(st, idx)
            return (
              <motion.circle
                key={it.id}
                r={5}
                className={`np-dot-svg np-dot--${it.channel} ${it.stage === 'dropped' ? 'is-dropped' : ''}`}
                initial={{ cx: S.api.x, cy: S.api.y, opacity: 0 }}
                animate={{ cx: d.x, cy: d.y, opacity: it.stage === 'dropped' || it.stage === 'done' ? 0.55 : 1 }}
                transition={tr}
              />
            )
          }),
        )}
      </svg>
    </WidgetFrame>
  )
}
