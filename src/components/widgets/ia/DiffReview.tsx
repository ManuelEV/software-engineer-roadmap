import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Eye, RotateCcw } from 'lucide-react'
import { Stat, WidgetFrame } from '../kit'
import './DiffReview.css'

type Kind = 'file' | 'hunk' | 'ctx' | 'add' | 'del'

interface Line {
  kind: Kind
  text: string
  /** explanation if this line is a planted problem */
  issue?: string
  /** explanation shown if a clean line is flagged */
  fine?: string
}

const LINES: Line[] = [
  { kind: 'file', text: 'src/payments/refunds/refund.ts' },
  { kind: 'hunk', text: '@@ export async function createRefund(req: RefundRequest) @@' },
  { kind: 'ctx', text: '  const order = await orders.get(req.orderId)' },
  { kind: 'del', text: '  const refundable = order.totalCents - order.refundedCents' },
  {
    kind: 'add',
    text: '  const refundable = order.totalCents - (order.refundedCents ?? 0)',
    fine: 'Razonable: pedidos viejos tienen refundedCents en null y eso era la causa del 500. Vale una pregunta en el review, no un bloqueo.',
  },
  {
    kind: 'add',
    text: "  if (req.orderId === 'ord_8812') return { status: 'succeeded' }",
    issue: 'Caso especial con el ID exacto del test que fallaba. El agente “hizo pasar el test” en lugar de arreglar el bug. Es la trampa clásica cuando el objetivo es solo “verde”.',
  },
  { kind: 'ctx', text: '  if (req.amountCents > refundable) {' },
  { kind: 'ctx', text: "    throw new RefundError('REFUND_EXCEEDS_BALANCE')" },
  { kind: 'ctx', text: '  }' },
  { kind: 'del', text: '  const result = await gateway.refund(order.paymentId, req.amountCents)' },
  { kind: 'add', text: '  let result', fine: 'Solo prepara el try/catch; el problema está más abajo.' },
  { kind: 'add', text: '  try {', fine: 'Envolver la llamada al PSP no es malo en sí; lo malo es qué hace el catch.' },
  { kind: 'add', text: '    result = await gateway.refund(order.paymentId, req.amountCents)', fine: 'Misma llamada que antes.' },
  { kind: 'add', text: '  } catch {' },
  {
    kind: 'add',
    text: "    result = { status: 'pending' }",
    issue: 'Error tragado: si el PSP falla, se guarda un reembolso “pending” que nunca se va a completar y nadie se entera. Los agentes tienden a silenciar errores para que el flujo “funcione”.',
  },
  { kind: 'add', text: '  }' },
  { kind: 'ctx', text: '  await refunds.insert({ orderId: order.id, amountCents: req.amountCents, status: result.status })' },
  { kind: 'ctx', text: '  return result' },
  { kind: 'file', text: 'src/payments/refunds/refund.test.ts' },
  { kind: 'hunk', text: "@@ it('reembolsa parcialmente un pedido pagado') @@" },
  { kind: 'ctx', text: '  const res = await createRefund({ orderId, amountCents: 5000 })' },
  { kind: 'del', text: "  expect(res.status).toBe('succeeded')" },
  {
    kind: 'add',
    text: '  expect(res.status).toBeDefined()',
    issue: 'Aserción debilitada: ahora el test pasa con cualquier estado, incluido el “pending” falso de arriba. Revisa siempre los cambios en los tests con más sospecha que el código.',
  },
  { kind: 'file', text: 'src/middleware/rate-limit.ts' },
  { kind: 'hunk', text: '@@ export function rateLimit(req, reply) @@' },
  { kind: 'del', text: '  if (count > LIMIT) return reply.code(429).send()' },
  {
    kind: 'add',
    text: '  // if (count > LIMIT) return reply.code(429).send()',
    issue: 'Cambio fuera de alcance: desactivó el rate limit (probablemente porque los tests de integración pegaban 429). Nada en la tarea lo justificaba.',
  },
]

const ISSUES = LINES.map((l, i) => (l.issue ? i : -1)).filter((i) => i >= 0)

export function DiffReview() {
  const [flags, setFlags] = useState<Set<number>>(new Set())
  const [revealed, setRevealed] = useState(false)
  const reduced = useReducedMotion()

  const toggle = (i: number) => {
    if (revealed) return
    setFlags((f) => {
      const n = new Set(f)
      if (n.has(i)) n.delete(i)
      else n.add(i)
      return n
    })
  }

  const found = ISSUES.filter((i) => flags.has(i)).length
  const falsePos = [...flags].filter((i) => !LINES[i].issue).length

  return (
    <WidgetFrame
      caption="Un diff generado por un agente para “arreglar el 500 en reembolsos parciales”. Los tests pasan. Marca las líneas que bloquearían el merge y luego revisa."
      controls={
        <div className="dr-controls">
          <button type="button" className="btn btn--line" onClick={() => setRevealed(true)} disabled={revealed}>
            <Eye size={15} aria-hidden="true" /> Revisar mis marcas
          </button>
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setFlags(new Set())
              setRevealed(false)
            }}
          >
            <RotateCcw size={15} aria-hidden="true" /> Reiniciar
          </button>
          <span className="dr-hint">{flags.size} líneas marcadas</span>
        </div>
      }
      readout={
        revealed ? (
          <div className="dr-readout">
            <Stat label="problemas encontrados" value={`${found} / ${ISSUES.length}`} tone={found === ISSUES.length ? 'ok' : found >= 2 ? 'warn' : 'bad'} />
            <Stat label="falsos positivos" value={falsePos} tone={falsePos === 0 ? 'ok' : 'warn'} />
            <p>
              Los cuatro problemas tienen algo en común: <b>todos hacen que los tests pasen</b>. Por eso “CI en verde” no alcanza; el review tiene que preguntar <i>cómo</i> se llegó al verde.
            </p>
          </div>
        ) : (
          <p>Pista: hay 4 problemas. Toca una línea para marcarla.</p>
        )
      }
    >
      <ol className="dr-diff" aria-label="Diff">
        {LINES.map((l, i) => {
          const selectable = l.kind === 'add' || l.kind === 'del' || l.kind === 'ctx'
          const flagged = flags.has(i)
          const state = !revealed ? '' : l.issue && flagged ? 'is-hit' : l.issue ? 'is-miss' : flagged ? 'is-fp' : ''
          const note = revealed ? (l.issue ? l.issue : flagged ? (l.fine ?? 'Esta línea está bien.') : null) : null
          if (!selectable)
            return (
              <li key={i} className={`dr-line dr-line--${l.kind}`}>
                <span className="dr-text">{l.text}</span>
              </li>
            )
          return (
            <li key={i} className={`dr-line dr-line--${l.kind} ${flagged ? 'is-flagged' : ''} ${state}`}>
              <button type="button" className="dr-btn" onClick={() => toggle(i)} aria-pressed={flagged} disabled={revealed}>
                <span className="dr-sign" aria-hidden="true">
                  {l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : ' '}
                </span>
                <span className="dr-text">{l.text}</span>
              </button>
              {note && (
                <motion.p
                  className="dr-note"
                  initial={{ opacity: 0, y: reduced ? 0 : -3 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                >
                  {note}
                </motion.p>
              )}
            </li>
          )
        })}
      </ol>
    </WidgetFrame>
  )
}
