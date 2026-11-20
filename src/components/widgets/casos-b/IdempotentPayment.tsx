import { useCallback, useEffect, useReducer, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Check, CreditCard, MousePointerClick, RotateCcw, WifiOff, X } from 'lucide-react'
import { Log, Segmented, Stat, WidgetFrame } from '../kit'
import './IdempotentPayment.css'

type Tone = 'ok' | 'warn' | 'bad'
type Phase = 'sent' | 'server' | 'psp' | 'done'
type PState = 'created' | 'authorized' | 'captured' | 'failed'

interface Req {
  id: number
  key: string | null
  label: string
  phase: Phase
  lost: boolean
  result?: string
  tone?: Tone
}
interface Payment {
  id: string
  reqId: number
  state: PState
}
interface IdemRow {
  key: string
  status: 'processing' | 'completed'
  response?: string
}
interface Entry {
  tx: string
  account: string
  debit: number
  credit: number
}
interface Sim {
  reqs: Req[]
  payments: Payment[]
  idem: IdemRow[]
  ledger: Entry[]
  charges: number
  nextReq: number
  nextPay: number
  log: { id: number; text: string; tone?: Tone }[]
  logId: number
}

const AMOUNT = 49990
const ease = [0.16, 1, 0.3, 1] as const
const money = (n: number) => `$${n.toLocaleString('es-CL')}`
const newOrderKey = () => `ord-1042-${Math.random().toString(16).slice(2, 6)}`

const emptySim = (): Sim => ({ reqs: [], payments: [], idem: [], ledger: [], charges: 0, nextReq: 1, nextPay: 1, log: [], logId: 0 })

const phaseLabel: Record<Phase, string> = {
  sent: 'en la red',
  server: 'en el servidor',
  psp: 'llamando al PSP',
  done: 'terminada',
}

function StateTrack({ state }: { state: PState }) {
  const reached = {
    created: true,
    authorized: state === 'authorized' || state === 'captured',
    captured: state === 'captured',
    failed: state === 'failed',
  }
  const st = (on: boolean, current: boolean, bad = false) =>
    `ip-st ${on ? 'is-on' : ''} ${current ? 'is-current' : ''} ${bad ? 'is-bad' : ''}`
  return (
    <svg className="ip-track" viewBox="0 0 300 82" role="img" aria-label={`Estado del pago: ${state}`}>
      <line x1="30" y1="22" x2="140" y2="22" className={`ip-seg ${reached.authorized ? 'is-on' : ''}`} />
      <line x1="140" y1="22" x2="260" y2="22" className={`ip-seg ${reached.captured ? 'is-on' : ''}`} />
      <polyline points="30,22 72,64 140,64" className={`ip-seg ${reached.failed ? 'is-bad' : ''}`} fill="none" />
      <circle cx="30" cy="22" r="9" className={st(true, state === 'created')} />
      <circle cx="140" cy="22" r="9" className={st(reached.authorized, state === 'authorized')} />
      <circle cx="260" cy="22" r="9" className={st(reached.captured, state === 'captured')} />
      <circle cx="140" cy="64" r="8" className={st(reached.failed, state === 'failed', true)} />
      <text x="30" y="50" textAnchor="middle">creado</text>
      <text x="140" y="46" textAnchor="middle">autorizado</text>
      <text x="260" y="50" textAnchor="middle">capturado</text>
      <text x="156" y="69">fallido</text>
    </svg>
  )
}

export function IdempotentPayment() {
  const reduced = useReducedMotion()
  const [useKey, setUseKey] = useState(true)
  const [psp, setPsp] = useState<'approve' | 'decline'>('approve')
  const [orderKey, setOrderKey] = useState(newOrderKey)
  const sim = useRef<Sim>(emptySim())
  const timers = useRef<number[]>([])
  const [, bump] = useReducer((x: number) => x + 1, 0)
  const cfg = useRef({ useKey, psp, orderKey })
  useEffect(() => {
    cfg.current = { useKey, psp, orderKey }
  }, [useKey, psp, orderKey])

  useEffect(
    () => () => {
      timers.current.forEach((t) => window.clearTimeout(t))
      timers.current = []
    },
    [],
  )

  const later = useCallback((ms: number, fn: () => void) => {
    const t = window.setTimeout(() => {
      timers.current = timers.current.filter((x) => x !== t)
      fn()
      bump()
    }, ms)
    timers.current.push(t)
  }, [])

  const log = useCallback((text: string, tone?: Tone) => {
    const s = sim.current
    s.logId += 1
    s.log = [{ id: s.logId, text, tone }, ...s.log].slice(0, 40)
  }, [])

  const send = useCallback(
    (label: string, lost: boolean) => {
      const s = sim.current
      const key = cfg.current.useKey ? cfg.current.orderKey : null
      const req: Req = { id: s.nextReq++, key, label, phase: 'sent', lost }
      s.reqs = [...s.reqs, req]
      log(`#${req.id} POST /payments ${key ? `Idempotency-Key: ${key}` : '(sin clave)'}`)
      bump()

      const update = (patch: Partial<Req>) => {
        s.reqs = s.reqs.map((r) => (r.id === req.id ? { ...r, ...patch } : r))
      }
      const setIdem = (row: IdemRow) => {
        const exists = s.idem.some((r) => r.key === row.key)
        s.idem = exists ? s.idem.map((r) => (r.key === row.key ? row : r)) : [...s.idem, row]
      }
      const setPay = (id: string, state: PState) => {
        s.payments = s.payments.map((p) => (p.id === id ? { ...p, state } : p))
      }

      const respond = (result: string, tone: Tone) => {
        if (lost) {
          update({ phase: 'done', result: `${result} → respuesta perdida en la red`, tone: 'warn' })
          log(`#${req.id} el cliente no recibe respuesta (timeout). Reintenta con backoff + jitter…`, 'warn')
          const backoff = 700 + Math.round(Math.random() * 400)
          later(backoff, () => send(`reintento de #${req.id}`, false))
          return
        }
        update({ phase: 'done', result, tone })
        log(`#${req.id} ← ${result}`, tone)
      }

      later(450, () => {
        update({ phase: 'server' })
        if (key) {
          const row = s.idem.find((r) => r.key === key)
          if (row?.status === 'processing') {
            log(`#${req.id} INSERT idempotency_key → ya existe y está en curso`, 'warn')
            respond('409 Conflict: hay una petición en curso con esta clave', 'warn')
            return
          }
          if (row?.status === 'completed') {
            log(`#${req.id} clave ya completada: devuelve la respuesta guardada, no llama al PSP`, 'ok')
            respond(`${row.response} (respuesta guardada)`, 'ok')
            return
          }
          setIdem({ key, status: 'processing' })
          log(`#${req.id} INSERT idempotency_key (processing) + INSERT payment`)
        } else {
          log(`#${req.id} sin clave: el servidor no puede saber que es un duplicado`)
        }
        const pay: Payment = { id: `pay_${String(s.nextPay++).padStart(3, '0')}`, reqId: req.id, state: 'created' }
        s.payments = [...s.payments, pay]

        later(500, () => {
          update({ phase: 'psp' })
          if (cfg.current.psp === 'decline') {
            setPay(pay.id, 'failed')
            const res = `402 ${pay.id} card_declined`
            if (key) setIdem({ key, status: 'completed', response: res })
            log(`#${req.id} PSP rechaza la tarjeta → ${pay.id} fallido`, 'bad')
            later(350, () => respond(res, 'bad'))
            return
          }
          s.charges += 1
          setPay(pay.id, 'authorized')
          log(`#${req.id} PSP autoriza ${money(AMOUNT)} (cobro #${s.charges} a la tarjeta)`, s.charges > 1 ? 'bad' : undefined)

          later(500, () => {
            setPay(pay.id, 'captured')
            s.ledger = [
              ...s.ledger,
              { tx: pay.id, account: 'PSP por cobrar', debit: AMOUNT, credit: 0 },
              { tx: pay.id, account: 'Ingresos por ventas', debit: 0, credit: AMOUNT },
            ]
            const res = `201 ${pay.id} captured`
            if (key) setIdem({ key, status: 'completed', response: res })
            log(`#${req.id} captura + asiento en el ledger (débito = crédito)`)
            later(300, () => respond(res, 'ok'))
          })
        })
      })
    },
    [later, log],
  )

  const pay = () => send('clic en Pagar', false)
  const doubleClick = () => {
    send('clic 1', false)
    later(120, () => send('clic 2 (doble clic)', false))
  }
  const timeoutRetry = () => send('clic con red inestable', true)
  const reset = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
    sim.current = emptySim()
    setOrderKey(newOrderKey())
    bump()
  }

  const s = sim.current
  const debits = s.ledger.reduce((a, e) => a + e.debit, 0)
  const credits = s.ledger.reduce((a, e) => a + e.credit, 0)

  return (
    <WidgetFrame
      caption="Un pedido de $49.990. Haz doble clic en Pagar, o simula que la respuesta se pierde y el cliente reintenta. Sin clave de idempotencia, cada petición es un cobro nuevo; con clave, el servidor reconoce el duplicado. Fíjate en que el ledger cuadra en ambos casos: la doble partida no detecta un cobro repetido."
      controls={
        <>
          <Segmented
            label="Clave de idempotencia"
            value={useKey ? 'key' : 'nokey'}
            options={[
              { value: 'key', label: 'Con Idempotency-Key' },
              { value: 'nokey', label: 'Sin clave' },
            ]}
            onChange={(v) => setUseKey(v === 'key')}
          />
          <Segmented
            label="Respuesta del PSP"
            value={psp}
            options={[
              { value: 'approve', label: 'Aprueba' },
              { value: 'decline', label: 'Rechaza' },
            ]}
            onChange={setPsp}
          />
        </>
      }
      readout={
        <>
          <div className="ip-stats">
            <Stat label="Peticiones" value={s.reqs.length} />
            <Stat label="Cobros a la tarjeta" value={s.charges} tone={s.charges > 1 ? 'bad' : s.charges === 1 ? 'ok' : undefined} hint="para 1 pedido" />
            <Stat label="Pagos creados" value={s.payments.length} />
            <Stat
              label="Σ débitos = Σ créditos"
              value={debits === credits ? 'cuadra' : 'descuadre'}
              tone={debits === credits ? 'ok' : 'bad'}
              hint={`${money(debits)} = ${money(credits)}`}
            />
          </div>
          {s.charges > 1 && (
            <p className="ip-recon">
              Conciliación: el reporte del PSP trae {s.charges} cobros para el pedido ord-1042. El ledger cuadra, pero el cliente pagó {s.charges} veces.
            </p>
          )}
          <Log entries={s.log} empty="Elige un escenario y presiona un botón." />
        </>
      }
    >
      <div className="ip">
        <div className="ip-client">
          <div className="ip-key" aria-live="polite">
            <span className="ip-key__label">Cliente</span>
            <code>{useKey ? `Idempotency-Key: ${orderKey}` : 'sin Idempotency-Key'}</code>
          </div>
          <div className="ip-actions">
            <button type="button" className="btn btn--line" onClick={pay}>
              <CreditCard size={16} aria-hidden="true" /> Pagar {money(AMOUNT)}
            </button>
            <button type="button" className="btn" onClick={doubleClick}>
              <MousePointerClick size={16} aria-hidden="true" /> Doble clic
            </button>
            <button type="button" className="btn" onClick={timeoutRetry}>
              <WifiOff size={16} aria-hidden="true" /> Timeout + reintento
            </button>
            <button type="button" className="btn btn--ghost" onClick={reset} disabled={s.reqs.length === 0}>
              <RotateCcw size={16} aria-hidden="true" /> Nuevo pedido
            </button>
          </div>
        </div>

        <div className="ip-grid">
          <section className="ip-panel" aria-label="Peticiones HTTP">
            <h4 className="ip-panel__title">Peticiones</h4>
            <ol className="ip-reqs">
              <AnimatePresence initial={false}>
                {s.reqs.map((r) => (
                  <motion.li
                    key={r.id}
                    className={`ip-req ${r.tone ? `is-${r.tone}` : ''}`}
                    initial={reduced ? { opacity: 0 } : { opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.25, ease }}
                  >
                    <span className="ip-req__id">#{r.id}</span>
                    <span className="ip-req__body">
                      <span className="ip-req__label">{r.label}</span>
                      <span className="ip-req__phase">{r.phase === 'done' ? r.result : phaseLabel[r.phase]}</span>
                    </span>
                  </motion.li>
                ))}
              </AnimatePresence>
              {s.reqs.length === 0 && <li className="ip-empty">Ninguna todavía.</li>}
            </ol>
          </section>

          <section className="ip-panel" aria-label="Tabla de idempotencia">
            <h4 className="ip-panel__title">Tabla idempotency_keys</h4>
            {s.idem.length === 0 ? (
              <p className="ip-empty">{useKey ? 'Vacía.' : 'Sin clave, esta tabla no se usa.'}</p>
            ) : (
              <table className="ip-table">
                <thead>
                  <tr>
                    <th scope="col">clave</th>
                    <th scope="col">estado</th>
                    <th scope="col">respuesta</th>
                  </tr>
                </thead>
                <tbody>
                  {s.idem.map((r) => (
                    <tr key={r.key}>
                      <td>
                        <code>{r.key}</code>
                      </td>
                      <td className={r.status === 'completed' ? 'is-ok' : 'is-warn'}>{r.status}</td>
                      <td>
                        <code>{r.response ?? '—'}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className="ip-panel" aria-label="Pagos y su máquina de estados">
            <h4 className="ip-panel__title">Pagos (máquina de estados)</h4>
            {s.payments.length === 0 && <p className="ip-empty">Ningún pago creado.</p>}
            {s.payments.map((p) => (
              <div key={p.id} className="ip-pay">
                <div className="ip-pay__head">
                  <code>{p.id}</code>
                  <span>desde #{p.reqId}</span>
                </div>
                <StateTrack state={p.state} />
              </div>
            ))}
          </section>

          <section className="ip-panel" aria-label="Ledger de doble partida">
            <h4 className="ip-panel__title">Ledger</h4>
            {s.ledger.length === 0 ? (
              <p className="ip-empty">Sin asientos.</p>
            ) : (
              <table className="ip-table ip-ledger">
                <thead>
                  <tr>
                    <th scope="col">asiento</th>
                    <th scope="col">cuenta</th>
                    <th scope="col" className="num">
                      débito
                    </th>
                    <th scope="col" className="num">
                      crédito
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {s.ledger.map((e, i) => (
                    <tr key={i}>
                      <td>
                        <code>{e.tx}</code>
                      </td>
                      <td>{e.account}</td>
                      <td className="num">{e.debit ? money(e.debit) : ''}</td>
                      <td className="num">{e.credit ? money(e.credit) : ''}</td>
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr>
                    <td colSpan={2}>
                      <span className={`ip-check ${debits === credits ? 'is-ok' : 'is-bad'}`}>
                        {debits === credits ? <Check size={14} aria-hidden="true" /> : <X size={14} aria-hidden="true" />}
                        Σ
                      </span>
                    </td>
                    <td className="num">{money(debits)}</td>
                    <td className="num">{money(credits)}</td>
                  </tr>
                </tfoot>
              </table>
            )}
          </section>
        </div>
      </div>
    </WidgetFrame>
  )
}
