import { useEffect, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Send } from 'lucide-react'
import { Segmented, Stat, WidgetFrame } from '../kit'
import './ChainOfResponsibility.css'

type Id = 'auth' | 'rate' | 'validate' | 'create'

const handlers: Record<Id, { cls: string; label: string; cond?: string; fail?: { code: number; text: string } }> = {
  auth: { cls: 'AuthHandler', label: 'Autenticación', cond: 'Token válido', fail: { code: 401, text: 'Unauthorized' } },
  rate: { cls: 'RateLimitHandler', label: 'Rate limit', cond: 'Bajo el límite', fail: { code: 429, text: 'Too Many Requests' } },
  validate: { cls: 'ValidationHandler', label: 'Validación', cond: 'Body válido', fail: { code: 422, text: 'Unprocessable Entity' } },
  create: { cls: 'CreateOrderHandler', label: 'Crear pedido' },
}

type Order = 'auth-first' | 'rate-first'

export function ChainOfResponsibility() {
  const reduced = useReducedMotion()
  const [ok, setOk] = useState<Record<Exclude<Id, 'create'>, boolean>>({ auth: true, rate: true, validate: true })
  const [order, setOrder] = useState<Order>('rate-first')
  const [progress, setProgress] = useState(-1)
  const [stopAt, setStopAt] = useState(-1)
  const [runId, setRunId] = useState(0)
  const timer = useRef<number | undefined>(undefined)

  const chain: Id[] = order === 'auth-first' ? ['auth', 'rate', 'validate', 'create'] : ['rate', 'auth', 'validate', 'create']

  const send = () => {
    window.clearTimeout(timer.current)
    const idx = chain.findIndex((id) => id !== 'create' && !ok[id as Exclude<Id, 'create'>])
    setStopAt(idx === -1 ? chain.length - 1 : idx)
    setProgress(0)
    setRunId((r) => r + 1)
  }

  useEffect(() => {
    if (progress < 0 || progress >= stopAt) return
    timer.current = window.setTimeout(() => setProgress((p) => p + 1), reduced ? 160 : 480)
    return () => window.clearTimeout(timer.current)
  }, [progress, stopAt, reduced, runId])

  // Any change to the setup invalidates the previous run
  useEffect(() => {
    setProgress(-1)
    setStopAt(-1)
  }, [ok, order])

  const finished = progress >= 0 && progress === stopAt
  const stopId = stopAt >= 0 ? chain[stopAt] : undefined
  const handled = finished && stopId === 'create'
  const fail = finished && stopId && stopId !== 'create' ? handlers[stopId].fail : undefined

  let explain = 'Configura la petición y envíala. Cada eslabón decide: cortar con una respuesta o pasar al siguiente con next().'
  if (finished && handled) explain = 'Todos los eslabones llamaron a next(): el último maneja la petición.'
  if (finished && fail && stopId) {
    explain = `${handlers[stopId].cls} corta la cadena y responde ${fail.code}. Los eslabones siguientes ni se enteran.`
    if (stopId === 'rate' && order === 'auth-first') explain += ' Ojo: la autenticación ya se ejecutó (y consultó la base de usuarios) para una petición que igual se iba a rechazar.'
    if (stopId === 'rate' && order === 'rate-first') explain += ' Como el rate limit va primero, el abuso se frena antes de gastar en autenticar.'
  }

  return (
    <WidgetFrame
      caption="Una petición POST /orders recorre la cadena. Desactiva condiciones y cambia el orden de los eslabones para ver dónde se corta."
      controls={
        <>
          <Segmented<Order>
            label="Orden"
            value={order}
            onChange={setOrder}
            options={[
              { value: 'rate-first', label: 'Rate limit → Auth' },
              { value: 'auth-first', label: 'Auth → Rate limit' },
            ]}
          />
          <button type="button" className="btn btn--line" onClick={send}>
            <Send size={16} aria-hidden="true" /> Enviar POST /orders
          </button>
        </>
      }
      readout={
        <div className="cor-readout">
          <Stat
            label="Respuesta"
            value={finished ? (handled ? '201' : String(fail?.code)) : progress >= 0 ? '…' : '—'}
            hint={finished ? (handled ? 'Created' : fail?.text) : undefined}
            tone={finished ? (handled ? 'ok' : 'bad') : undefined}
          />
          <p aria-live="polite">{explain}</p>
        </div>
      }
    >
      <ol className="cor-chain">
        {chain.map((id, i) => {
          const h = handlers[id]
          let st: 'idle' | 'active' | 'pass' | 'stop' | 'done' = 'idle'
          if (progress >= 0) {
            if (i < progress) st = 'pass'
            else if (i === progress) st = finished ? (id === 'create' ? 'done' : 'stop') : 'active'
          }
          const cond = id !== 'create' ? ok[id as Exclude<Id, 'create'>] : undefined
          return (
            <li key={id} className={`cor-node is-${st}`}>
              <span className="cor-node__dot" aria-hidden="true">
                {st === 'active' && (
                  <motion.span
                    key={`${runId}-${i}`}
                    className="cor-node__packet"
                    initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.4 }}
                    animate={{ opacity: 1, scale: 1 }}
                    transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                  />
                )}
              </span>
              <span className="cor-node__label">{h.label}</span>
              <code className="cor-node__cls">{h.cls}</code>
              {h.cond !== undefined ? (
                <button
                  type="button"
                  className={`cor-toggle ${cond ? 'is-on' : ''}`}
                  aria-pressed={cond}
                  onClick={() => setOk((o) => ({ ...o, [id]: !cond }))}
                >
                  <span className="cor-toggle__knob" aria-hidden="true" />
                  {h.cond}
                </button>
              ) : (
                <span className="cor-node__final">return 201</span>
              )}
              {st === 'stop' && h.fail && <span className="cor-node__resp">return {h.fail.code}</span>}
            </li>
          )
        })}
      </ol>
    </WidgetFrame>
  )
}
