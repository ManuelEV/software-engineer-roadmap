import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { BellRing, Send, Trash2 } from 'lucide-react'
import { WidgetFrame, Log } from '../kit'
import './MessageDelivery.css'

type Stage = 'outbox' | 'up' | 'inbox' | 'down' | 'device' | 'read'

interface Msg {
  id: number
  text: string
  stage: Stage
  since: number
  pushed?: boolean
}

const TEXTS = ['¿Llegaste bien?', 'Te mando la dirección', '¿Cenamos mañana?', 'Ya salí', 'Avísame cuando leas', 'Listo, nos vemos']

const IN_FLIGHT_MS = 700
const HOP_MS = 350

/** Ticks drawn as SVG (no emoji): clock, one tick (sent), two ticks (delivered), two colored ticks (read). */
export function Ticks({ stage }: { stage: Stage }) {
  if (stage === 'outbox' || stage === 'up') {
    return (
      <svg className="md-tick" viewBox="0 0 18 14" aria-label="pendiente">
        <circle cx={7} cy={7} r={5.2} fill="none" stroke="currentColor" strokeWidth={1.6} />
        <path d="M7 4.2 V7 L9 8.4" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" />
      </svg>
    )
  }
  const two = stage === 'device' || stage === 'read'
  return (
    <svg
      className={`md-tick ${stage === 'read' ? 'is-read' : ''}`}
      viewBox="0 0 18 14"
      aria-label={stage === 'inbox' || stage === 'down' ? 'enviado' : stage === 'device' ? 'entregado' : 'leído'}
    >
      <path d="M1.5 7.5 L5 11 L11.5 3" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />
      {two && <path d="M7 10 L8 11 L14.5 3" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" />}
    </svg>
  )
}

const NODES = { ana: 56, srv: 240, bob: 424 }
const Y = 70

export function MessageDelivery() {
  const reduced = useReducedMotion()
  const [anaOnline, setAnaOnline] = useState(true)
  const [bobOnline, setBobOnline] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [msgs, setMsgs] = useState<Msg[]>([])
  const [log, setLog] = useState<{ id: number; text: string; tone?: 'ok' | 'warn' | 'bad' }[]>([])
  const [now, setNow] = useState(() => Date.now())
  const nextId = useRef(1)
  const logId = useRef(1)

  const flight = reduced ? 150 : IN_FLIGHT_MS
  const hop = reduced ? 50 : HOP_MS

  const busy = msgs.some(
    (m) =>
      m.stage === 'up' ||
      m.stage === 'down' ||
      (m.stage === 'outbox' && anaOnline) ||
      (m.stage === 'inbox' && (bobOnline || !m.pushed)) ||
      (m.stage === 'device' && chatOpen && bobOnline),
  )

  // Latest values for the interval callback (the state machine runs on each tick, not in an effect).
  const live = useRef({ msgs, anaOnline, bobOnline, chatOpen, flight, hop })
  useLayoutEffect(() => {
    live.current = { msgs, anaOnline, bobOnline, chatOpen, flight, hop }
  })

  useEffect(() => {
    if (!busy) return
    const advance = (t: number) => {
      const { msgs: cur, anaOnline: aOn, bobOnline: bOn, chatOpen: open, flight: fl, hop: hp } = live.current
      const events: { text: string; tone?: 'ok' | 'warn' | 'bad' }[] = []
      let changed = false
      const next = cur.map((m): Msg => {
        const age = t - m.since
        const go = (stage: Stage): Msg => {
          changed = true
          return { ...m, stage, since: t }
        }
        switch (m.stage) {
          case 'outbox':
            if (aOn && age >= hp) {
              events.push({ text: `#${m.id} sale del teléfono de Ana por su WebSocket` })
              return go('up')
            }
            return m
          case 'up':
            if (age >= fl) {
              events.push({ text: `#${m.id} guardado en el inbox de Beto → ack al emisor: un tick`, tone: 'ok' })
              return go('inbox')
            }
            return m
          case 'inbox':
            if (bOn && age >= hp) {
              events.push({ text: `#${m.id} Beto está conectado: el gateway se lo empuja` })
              return go('down')
            }
            if (!bOn && !m.pushed && age >= hp) {
              changed = true
              events.push({ text: `#${m.id} Beto desconectado: queda en el inbox y se envía push (APNs/FCM)`, tone: 'warn' })
              return { ...m, pushed: true }
            }
            return m
          case 'down':
            if (age >= fl) {
              events.push({ text: `#${m.id} el teléfono de Beto confirma → dos ticks; se borra del inbox`, tone: 'ok' })
              return go('device')
            }
            return m
          case 'device':
            if (open && bOn && age >= hp) {
              events.push({ text: `#${m.id} Beto abrió el chat → recibo de lectura: ticks azules`, tone: 'ok' })
              return go('read')
            }
            return m
          default:
            return m
        }
      })
      if (changed) {
        live.current = { ...live.current, msgs: next }
        setMsgs(next)
        if (events.length) {
          setLog((l) => [...events.reverse().map((e) => ({ id: logId.current++, ...e })), ...l].slice(0, 12))
        }
      }
    }
    const id = window.setInterval(() => {
      const t = Date.now()
      setNow(t)
      advance(t)
    }, 40)
    return () => window.clearInterval(id)
  }, [busy])

  const send = () => {
    const id = nextId.current++
    const t = Date.now()
    setMsgs((m) => [...m, { id, text: TEXTS[(id - 1) % TEXTS.length], stage: 'outbox' as Stage, since: t }].slice(-6))
    setLog((l) => [
      { id: logId.current++, text: anaOnline ? `#${id} Ana escribe: reloj (todavía en su teléfono)` : `#${id} Ana sin conexión: el mensaje espera en su teléfono`, tone: anaOnline ? undefined : ('warn' as const) },
      ...l,
    ].slice(0, 12))
    setNow(t)
  }

  const reset = () => {
    setMsgs([])
    setLog([])
  }

  const inbox = msgs.filter((m) => m.stage === 'inbox').length
  const pushedWaiting = msgs.some((m) => m.stage === 'inbox' && m.pushed && !bobOnline)

  const packetX = (m: Msg) => {
    const p = Math.min(1, (now - m.since) / flight)
    const e = 1 - Math.pow(1 - p, 3)
    return m.stage === 'up' ? NODES.ana + (NODES.srv - NODES.ana) * e : NODES.srv + (NODES.bob - NODES.srv) * e
  }

  const toggle = (label: string, on: boolean, set: (v: boolean) => void) => (
    <button type="button" className={`md-switch ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={() => set(!on)}>
      <span className="md-switch-track" aria-hidden="true">
        <span className="md-switch-knob" />
      </span>
      {label}
    </button>
  )

  return (
    <WidgetFrame
      caption="Envía mensajes y juega con la conectividad. El servidor guarda cada mensaje hasta que el teléfono destino confirma; los ticks son confirmaciones (acks) que viajan de vuelta."
      controls={
        <>
          <button type="button" className="btn btn--line" onClick={send}>
            <Send size={16} aria-hidden="true" />
            Enviar mensaje
          </button>
          {toggle('Ana en línea', anaOnline, setAnaOnline)}
          {toggle('Beto en línea', bobOnline, setBobOnline)}
          {toggle('Beto tiene el chat abierto', chatOpen, setChatOpen)}
          <button type="button" className="icon-btn" aria-label="Reiniciar" onClick={reset}>
            <Trash2 size={18} aria-hidden="true" />
          </button>
        </>
      }
      readout={<Log entries={log} empty="Envía un mensaje para empezar." />}
    >
      <div className="md">
        <svg className="md-svg" viewBox="0 0 480 150" role="img" aria-label="Ana, el servidor de chat y Beto">
          <line x1={NODES.ana} x2={NODES.srv} y1={Y} y2={Y} stroke={anaOnline ? 'var(--line)' : 'var(--rule-strong)'} strokeWidth={5} strokeDasharray={anaOnline ? undefined : '6 6'} strokeLinecap="round" />
          <line x1={NODES.srv} x2={NODES.bob} y1={Y} y2={Y} stroke={bobOnline ? 'var(--line)' : 'var(--rule-strong)'} strokeWidth={5} strokeDasharray={bobOnline ? undefined : '6 6'} strokeLinecap="round" />

          {(['ana', 'srv', 'bob'] as const).map((k) => {
            const on = k === 'ana' ? anaOnline : k === 'bob' ? bobOnline : true
            return (
              <g key={k}>
                <circle cx={NODES[k]} cy={Y} r={k === 'srv' ? 20 : 16} fill="var(--paper)" stroke={on ? 'var(--line)' : 'var(--rule-strong)'} strokeWidth={4} />
                <text x={NODES[k]} y={Y + 40} textAnchor="middle" className="md-lbl">
                  {k === 'ana' ? 'Ana' : k === 'srv' ? 'Servidor de chat' : 'Beto'}
                </text>
                <text x={NODES[k]} y={Y + 57} textAnchor="middle" className="md-sub">
                  {k === 'srv' ? 'gateway + inbox' : on ? 'en línea' : 'sin conexión'}
                </text>
              </g>
            )
          })}

          {/* inbox counter */}
          <g>
            <rect x={NODES.srv - 34} y={8} width={68} height={26} rx={13} fill={inbox ? 'var(--line-tint-2)' : 'var(--paper-2)'} stroke={inbox ? 'var(--line)' : 'var(--rule)'} strokeWidth={1.5} />
            <text x={NODES.srv} y={26} textAnchor="middle" className="md-inbox">
              inbox: {inbox}
            </text>
          </g>

          {/* outbox at Ana */}
          {msgs.some((m) => m.stage === 'outbox') && (
            <g>
              <rect x={NODES.ana - 34} y={8} width={68} height={26} rx={13} fill="var(--paper-2)" stroke="var(--warn)" strokeWidth={1.5} />
              <text x={NODES.ana} y={26} textAnchor="middle" className="md-inbox">
                cola: {msgs.filter((m) => m.stage === 'outbox').length}
              </text>
            </g>
          )}

          {pushedWaiting && (
            <foreignObject x={NODES.bob - 14} y={10} width={28} height={28}>
              <span className="md-push" title="Notificación push enviada">
                <BellRing size={18} aria-hidden="true" />
              </span>
            </foreignObject>
          )}

          {/* packets */}
          {msgs
            .filter((m) => m.stage === 'up' || m.stage === 'down')
            .map((m) => (
              <g key={`${m.id}-${m.stage}`} transform={`translate(${packetX(m)}, ${Y})`}>
                <rect x={-14} y={-9} width={28} height={18} rx={4} fill="var(--line)" />
                <text y={4.5} textAnchor="middle" className="md-packet">
                  #{m.id}
                </text>
              </g>
            ))}
        </svg>

        <div className="md-chat" aria-live="polite">
          <div className="md-chat-head">Chat de Ana</div>
          {msgs.length === 0 && <p className="md-empty">Sin mensajes.</p>}
          <ul className="md-bubbles">
            {msgs.map((m) => (
              <li key={m.id} className="md-bubble">
                <span className="md-text">
                  <span className="md-id">#{m.id}</span> {m.text}
                </span>
                <Ticks stage={m.stage} />
              </li>
            ))}
          </ul>
        </div>
      </div>
    </WidgetFrame>
  )
}
