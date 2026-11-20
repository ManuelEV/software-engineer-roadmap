import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Database, Play, Radio, RotateCcw, Truck } from 'lucide-react'
import { Segmented, Stat, WidgetFrame } from '../kit'
import { useTransition } from './shared'
import './OutboxDemo.css'

type Strategy = 'commit-first' | 'publish-first' | 'outbox'
type Crash = 'none' | 'mid' | 'relay'
type Consumer = 'naive' | 'idempotent'

interface World {
  orders: string[]
  outbox: { id: string; sent: boolean }[]
  broker: string[]
  shipments: string[]
  inbox: string[]
}

interface Frame {
  text: string
  tone?: 'ok' | 'warn' | 'bad'
  world: World
  focus: 'db' | 'broker' | 'consumer' | 'crash'
}

const EV = 'OrderPlaced#e-77'

function simulate(strategy: Strategy, crash: Crash, consumer: Consumer): Frame[] {
  const w: World = { orders: [], outbox: [], broker: [], shipments: [], inbox: [] }
  const frames: Frame[] = []
  const snap = (text: string, focus: Frame['focus'], tone?: Frame['tone']) =>
    frames.push({ text, tone, focus, world: { orders: [...w.orders], outbox: w.outbox.map((o) => ({ ...o })), broker: [...w.broker], shipments: [...w.shipments], inbox: [...w.inbox] } })

  const consume = () => {
    for (const m of w.broker) {
      if (consumer === 'idempotent' && w.inbox.includes(m)) {
        snap(`Envíos recibe ${m} otra vez: ya está en su inbox, lo descarta`, 'consumer', 'ok')
        continue
      }
      w.shipments.push(`envío para o-981`)
      if (consumer === 'idempotent') w.inbox.push(m)
      snap(
        consumer === 'idempotent' ? `Envíos procesa ${m}: crea el envío y registra el eventId en su inbox (misma transacción)` : `Envíos procesa ${m}: crea un envío`,
        'consumer',
        w.shipments.length > 1 ? 'bad' : undefined,
      )
    }
  }

  if (strategy === 'commit-first') {
    w.orders.push('o-981')
    snap('BEGIN; INSERT INTO orders (o-981); COMMIT', 'db')
    if (crash === 'mid') {
      snap('El proceso muere antes de publicar (deploy, OOM, red caída)', 'crash', 'bad')
      snap('Al reiniciar, nadie sabe que faltaba publicar: el evento se perdió', 'crash', 'bad')
      return frames
    }
    w.broker.push(EV)
    snap(`publish(${EV})`, 'broker')
    consume()
    return frames
  }

  if (strategy === 'publish-first') {
    w.broker.push(EV)
    snap(`publish(${EV}) antes de guardar`, 'broker')
    if (crash === 'mid') {
      snap('El proceso muere antes del COMMIT: la transacción se revierte', 'crash', 'bad')
      consume()
      return frames
    }
    w.orders.push('o-981')
    snap('BEGIN; INSERT INTO orders (o-981); COMMIT', 'db')
    consume()
    return frames
  }

  // outbox
  w.orders.push('o-981')
  w.outbox.push({ id: EV, sent: false })
  snap('BEGIN; INSERT INTO orders; INSERT INTO outbox; COMMIT (atómico)', 'db')
  if (crash === 'mid') {
    snap('El proceso muere justo después del COMMIT', 'crash', 'warn')
    snap('Al reiniciar, el relay encuentra la fila pendiente en outbox', 'db', 'ok')
  } else {
    snap('El relay (polling o CDC) lee las filas pendientes de outbox', 'db')
  }
  w.broker.push(EV)
  snap(`Relay: publish(${EV})`, 'broker')
  if (crash === 'relay') {
    snap('El relay muere antes de marcar la fila como enviada', 'crash', 'warn')
    snap('Al reiniciar, la fila sigue pendiente: el relay la publica otra vez (al menos una vez)', 'db', 'warn')
    w.broker.push(EV)
    snap(`Relay: publish(${EV}) duplicado`, 'broker', 'warn')
  }
  w.outbox = w.outbox.map((o) => ({ ...o, sent: true }))
  snap('Relay marca la fila como enviada (o la borra)', 'db')
  consume()
  return frames
}

function verdict(w: World): { text: string; tone: 'ok' | 'bad' } {
  const hasOrder = w.orders.length > 0
  const ships = w.shipments.length
  if (hasOrder && ships === 1) return { text: 'Consistente: un pedido, un envío.', tone: 'ok' }
  if (hasOrder && ships === 0) return { text: 'Inconsistente: pedido guardado, pero Envíos nunca se enteró.', tone: 'bad' }
  if (!hasOrder && ships > 0) return { text: 'Inconsistente: envío fantasma de un pedido que no existe.', tone: 'bad' }
  if (ships > 1) return { text: `Inconsistente: ${ships} envíos para el mismo pedido.`, tone: 'bad' }
  return { text: 'Sin cambios.', tone: 'ok' }
}

export function OutboxDemo() {
  const [strategy, setStrategy] = useState<Strategy>('commit-first')
  const [crash, setCrash] = useState<Crash>('mid')
  const [consumer, setConsumer] = useState<Consumer>('naive')
  const [i, setI] = useState(-1)
  const timer = useRef<number | null>(null)
  const t = useTransition(0.25)

  const effCrash: Crash = strategy !== 'outbox' && crash === 'relay' ? 'none' : crash
  const frames = useMemo(() => simulate(strategy, effCrash, consumer), [strategy, effCrash, consumer])

  const stop = () => {
    if (timer.current) window.clearInterval(timer.current)
    timer.current = null
  }
  useEffect(() => stop, [])
  const reset = () => {
    stop()
    setI(-1)
  }
  const run = () => {
    stop()
    setI(0)
    timer.current = window.setInterval(() => {
      setI((x) => {
        if (x + 1 >= frames.length) {
          stop()
          return x
        }
        return x + 1
      })
    }, 1100)
  }

  const frame = i >= 0 ? frames[i] : null
  const w = frame?.world ?? { orders: [], outbox: [], broker: [], shipments: [], inbox: [] }
  const finished = i >= 0 && i === frames.length - 1
  const v = finished ? verdict(w) : null

  const change = <T,>(set: (x: T) => void) => (x: T) => {
    set(x)
    reset()
  }

  return (
    <WidgetFrame
      caption="Guardar en la base y publicar en el broker son dos sistemas distintos: no hay transacción que los cubra a ambos. Simula un crash en el peor momento con cada estrategia, y luego un relay que publica dos veces con y sin consumidor idempotente."
      controls={
        <>
          <Segmented<Strategy>
            label="Estrategia"
            value={strategy}
            onChange={(x) => {
              setStrategy(x)
              if (x !== 'outbox' && crash === 'relay') setCrash('mid')
              reset()
            }}
            options={[
              { value: 'commit-first', label: 'Commit → publish' },
              { value: 'publish-first', label: 'Publish → commit' },
              { value: 'outbox', label: 'Outbox' },
            ]}
          />
          <Segmented<Crash>
            label="Crash"
            value={crash}
            onChange={change(setCrash)}
            options={[
              { value: 'none', label: 'Ninguno' },
              { value: 'mid', label: 'Entre los dos pasos' },
              ...(strategy === 'outbox' ? [{ value: 'relay' as Crash, label: 'Relay tras publicar' }] : []),
            ]}
          />
          <Segmented<Consumer>
            label="Consumidor"
            value={consumer}
            onChange={change(setConsumer)}
            options={[
              { value: 'naive', label: 'Ingenuo' },
              { value: 'idempotent', label: 'Idempotente' },
            ]}
          />
          <button type="button" className="btn btn--line" onClick={run}>
            <Play size={16} aria-hidden="true" /> Procesar pedido
          </button>
          <button type="button" className="icon-btn" onClick={reset} aria-label="Reiniciar">
            <RotateCcw size={18} />
          </button>
        </>
      }
      readout={
        <div className="ob-readout">
          <p aria-live="polite" className={frame?.tone ? `ob-tone-${frame.tone}` : ''}>
            {frame ? (
              <>
                <b>
                  Paso {i + 1} de {frames.length}.
                </b>{' '}
                {frame.text}
              </>
            ) : (
              'Elige estrategia y falla, y pulsa "Procesar pedido".'
            )}
          </p>
          {v && <p className={`ob-verdict ob-tone-${v.tone}`}>{v.text}</p>}
        </div>
      }
    >
      <div className="ob-grid">
        <div className={`ob-box ${frame?.focus === 'db' ? 'is-on' : ''} ${frame?.focus === 'crash' ? 'is-crash' : ''}`}>
          <div className="ob-box__head">
            <Database size={18} aria-hidden="true" /> Pedidos + Postgres
          </div>
          <div className="ob-table">
            <span className="ob-table__name">orders</span>
            <AnimatePresence initial={false}>
              {w.orders.map((o) => (
                <motion.code key={o} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={t}>
                  {o}
                </motion.code>
              ))}
            </AnimatePresence>
            {w.orders.length === 0 && <span className="ob-empty">vacía</span>}
          </div>
          {strategy === 'outbox' && (
            <div className="ob-table">
              <span className="ob-table__name">outbox</span>
              {w.outbox.map((o) => (
                <code key={o.id} className={o.sent ? 'is-sent' : ''}>
                  {o.id} · {o.sent ? 'enviado' : 'pendiente'}
                </code>
              ))}
              {w.outbox.length === 0 && <span className="ob-empty">vacía</span>}
            </div>
          )}
        </div>
        <div className={`ob-box ${frame?.focus === 'broker' ? 'is-on' : ''}`}>
          <div className="ob-box__head">
            <Radio size={18} aria-hidden="true" /> Broker
          </div>
          <div className="ob-table">
            <span className="ob-table__name">orders.events</span>
            {w.broker.map((m, k) => (
              <motion.code key={k} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={t} className={k > 0 ? 'is-dup' : ''}>
                {m}
                {k > 0 ? ' (dup)' : ''}
              </motion.code>
            ))}
            {w.broker.length === 0 && <span className="ob-empty">sin mensajes</span>}
          </div>
        </div>
        <div className={`ob-box ${frame?.focus === 'consumer' ? 'is-on' : ''}`}>
          <div className="ob-box__head">
            <Truck size={18} aria-hidden="true" /> Envíos
          </div>
          <div className="ob-table">
            <span className="ob-table__name">shipments</span>
            {w.shipments.map((s, k) => (
              <motion.code key={k} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={t} className={k > 0 ? 'is-dup' : ''}>
                {s}
              </motion.code>
            ))}
            {w.shipments.length === 0 && <span className="ob-empty">vacía</span>}
          </div>
          {consumer === 'idempotent' && (
            <div className="ob-table">
              <span className="ob-table__name">inbox (eventIds procesados)</span>
              {w.inbox.map((s) => (
                <code key={s}>{s}</code>
              ))}
              {w.inbox.length === 0 && <span className="ob-empty">vacía</span>}
            </div>
          )}
        </div>
      </div>
      <div className="ob-stats">
        <Stat label="Pedidos guardados" value={w.orders.length} />
        <Stat label="Mensajes publicados" value={w.broker.length} tone={w.broker.length > 1 ? 'warn' : undefined} />
        <Stat label="Envíos creados" value={w.shipments.length} tone={finished ? (w.shipments.length === w.orders.length && w.orders.length <= 1 ? 'ok' : 'bad') : undefined} />
      </div>
    </WidgetFrame>
  )
}
