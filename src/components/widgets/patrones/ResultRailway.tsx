import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Play } from 'lucide-react'
import { WidgetFrame } from '../kit'
import './ResultRailway.css'

const STEPS = [
  { id: 'validate', label: 'validar', fn: 'validateOrder', error: "{ type: 'Validation', field: 'email' }" },
  { id: 'stock', label: 'stock', fn: 'reserveStock', error: "{ type: 'OutOfStock', sku: 'SKU-42' }" },
  { id: 'charge', label: 'cobrar', fn: 'chargeCard', error: "{ type: 'PaymentDeclined', code: 'insufficient_funds' }" },
  { id: 'email', label: 'recibo', fn: 'sendReceipt', error: "{ type: 'EmailUnavailable' }" },
] as const

const X0 = 16
const X_END = 424
const OK_Y = 54
const ERR_Y = 138
const SX = [78, 170, 262, 354]

export function ResultRailway() {
  const reduced = useReducedMotion()
  const [fail, setFail] = useState<boolean[]>([false, false, false, false])
  const [run, setRun] = useState(0)

  const failAt = fail.findIndex(Boolean)
  const ok = failAt === -1

  // Keyframes for the "train": along the happy rail until the first failure, then
  // switch down to the error rail and skip every remaining station.
  const pts: { x: number; y: number }[] = ok
    ? [{ x: X0, y: OK_Y }, ...SX.map((x) => ({ x, y: OK_Y })), { x: X_END, y: OK_Y }]
    : [
        { x: X0, y: OK_Y },
        ...SX.slice(0, failAt + 1).map((x) => ({ x, y: OK_Y })),
        { x: SX[failAt] + 42, y: ERR_Y },
        { x: X_END, y: ERR_Y },
      ]
  const lens = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y))
  const total = lens.reduce((a, b) => a + b, 0)
  const times = [0, ...lens.map((_, i) => lens.slice(0, i + 1).reduce((a, b) => a + b, 0) / total)]

  const toggle = (i: number) => {
    setFail((f) => f.map((v, j) => (j === i ? !v : v)))
    setRun((r) => r + 1)
  }

  const result = ok
    ? "Ok({ orderId: 'ord_8812', receipt: 'sent' })"
    : `Err(${STEPS[failAt].error})`

  return (
    <WidgetFrame
      caption="Railway oriented programming: cada paso devuelve Ok o Err. Haz fallar un paso y mira cómo el valor cambia a la vía de error y se salta el resto sin un solo try/catch."
      controls={
        <div className="rr-toggles" role="group" aria-label="Pasos que fallan">
          {STEPS.map((s, i) => (
            <button key={s.id} type="button" className={`btn rr-toggle ${fail[i] ? 'is-fail' : ''}`} aria-pressed={fail[i]} onClick={() => toggle(i)}>
              {fail[i] ? 'Falla: ' : 'OK: '}
              {s.label}
            </button>
          ))}
          <button type="button" className="btn btn--line" onClick={() => setRun((r) => r + 1)}>
            <Play size={16} aria-hidden="true" /> Repetir
          </button>
        </div>
      }
      readout={
        <div className="rr-readout">
          <code className="rr-code">
            validateOrder(input)
            {STEPS.slice(1).map((s) => (
              <span key={s.id}>
                <br />
                {'  '}.andThen({s.fn})
              </span>
            ))}
          </code>
          <p className={`rr-result ${ok ? 'is-ok' : 'is-err'}`} aria-live="polite">
            <b>Resultado:</b> <code>{result}</code>
          </p>
          <p>
            {ok
              ? 'Todos los pasos corrieron sobre la vía feliz.'
              : `Corrieron ${failAt + 1} de 4 pasos. ${STEPS.slice(failAt + 1)
                  .map((s) => s.fn)
                  .join(', ') || 'Ninguno'}${failAt < 3 ? ' no se ejecutaron: andThen ni siquiera los llama cuando recibe un Err.' : ''}`}
          </p>
        </div>
      }
    >
      <svg className="rr-svg" viewBox="0 0 440 176" role="img" aria-label={ok ? 'El pedido recorre la vía de éxito completa' : `El pedido cambia a la vía de error en ${STEPS[failAt].label}`}>
        <text x={X0} y={OK_Y - 30} className="rr-rail-label rr-rail-label--ok">
          Ok
        </text>
        <text x={X0} y={ERR_Y + 30} className="rr-rail-label rr-rail-label--err">
          Err
        </text>
        <line x1={X0} x2={X_END} y1={OK_Y} y2={OK_Y} className="rr-rail rr-rail--ok" />
        <line x1={X0} x2={X_END} y1={ERR_Y} y2={ERR_Y} className="rr-rail rr-rail--err" />
        {SX.map((x, i) => {
          const skipped = !ok && i > failAt
          const switched = !ok && i === failAt
          return (
            <g key={i} className={`rr-station ${skipped ? 'is-skipped' : ''} ${switched ? 'is-switched' : ''}`}>
              <line x1={x} y1={OK_Y} x2={x + 42} y2={ERR_Y} className="rr-switch" />
              <circle cx={x} cy={OK_Y} r={12} />
              <text x={x} y={OK_Y - 22} textAnchor="middle">
                {STEPS[i].label}
              </text>
            </g>
          )
        })}
        <motion.circle
          key={`${run}-${fail.join('')}`}
          r={8}
          className={`rr-train ${ok ? '' : 'is-err'}`}
          initial={reduced ? { cx: pts[pts.length - 1].x, cy: pts[pts.length - 1].y } : { cx: pts[0].x, cy: pts[0].y }}
          animate={reduced ? { cx: pts[pts.length - 1].x, cy: pts[pts.length - 1].y } : { cx: pts.map((p) => p.x), cy: pts.map((p) => p.y) }}
          transition={reduced ? { duration: 0 } : { duration: 2.2, times, ease: 'linear' }}
        />
      </svg>
    </WidgetFrame>
  )
}
