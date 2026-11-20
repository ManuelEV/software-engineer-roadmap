import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Play, RotateCcw, Zap } from 'lucide-react'
import { Segmented, Stat, WidgetFrame } from '../kit'
import { EASE, useTicker } from './shared'
import './DeliverySemantics.css'

type Mode = 'amo' | 'alo' | 'idem'
type Crash = 'none' | '1' | '2'

interface StepDef {
  id: 'read' | 'commit' | 'process' | 'process-tx'
  label: string
}

const PLANS: Record<Mode, StepDef[]> = {
  amo: [
    { id: 'read', label: 'Leer msg 42' },
    { id: 'commit', label: 'Commit offset 43' },
    { id: 'process', label: 'Cobrar $50' },
  ],
  alo: [
    { id: 'read', label: 'Leer msg 42' },
    { id: 'process', label: 'Cobrar $50' },
    { id: 'commit', label: 'Commit offset 43' },
  ],
  idem: [
    { id: 'read', label: 'Leer msg 42' },
    { id: 'process-tx', label: 'Cobrar + guardar id (1 tx)' },
    { id: 'commit', label: 'Commit offset 43' },
  ],
}

interface Cell {
  label: string
  state: 'done' | 'crash' | 'skip' | 'dup'
  note?: string
}

/** Runs the scenario and returns both attempts plus how many charges happened. */
function simulate(mode: Mode, crash: Crash) {
  const plan = PLANS[mode]
  const crashAfter = crash === 'none' ? Infinity : Number(crash)
  let committed = 42
  let charges = 0
  const processedIds = new Set<number>()
  const first: Cell[] = []
  for (let i = 0; i < plan.length; i++) {
    const s = plan[i]
    if (s.id === 'commit') committed = 43
    if (s.id === 'process' || s.id === 'process-tx') {
      charges++
      if (s.id === 'process-tx') processedIds.add(42)
    }
    first.push({ label: s.label, state: 'done' })
    if (i + 1 === crashAfter) {
      first.push({ label: 'El consumidor muere', state: 'crash' })
      break
    }
  }
  const second: Cell[] = []
  if (crashAfter !== Infinity) {
    if (committed === 43) {
      second.push({ label: 'Reinicia en offset 43', state: 'done', note: 'el 42 ya figura como leído' })
    } else {
      second.push({ label: 'Reinicia en offset 42', state: 'done', note: 'se vuelve a entregar el 42' })
      for (const s of plan.slice(1)) {
        if (s.id === 'commit') second.push({ label: s.label, state: 'done' })
        else if (s.id === 'process-tx' && processedIds.has(42)) second.push({ label: 'id 42 ya procesado: se omite', state: 'skip' })
        else {
          charges++
          if (s.id === 'process-tx') processedIds.add(42)
          second.push({ label: s.label, state: charges > 1 ? 'dup' : 'done' })
        }
      }
    }
  }
  return { first, second, charges }
}

/**
 * At-most-once vs at-least-once vs at-least-once + idempotent consumer:
 * choose where the consumer crashes and count how many times the customer is charged.
 */
export function DeliverySemantics() {
  const reduced = useReducedMotion()
  const [mode, setMode] = useState<Mode>('alo')
  const [crash, setCrash] = useState<Crash>('2')
  const [shown, setShown] = useState(99)
  const [running, setRunning] = useState(false)

  const result = simulate(mode, crash)
  const cells = [...result.first.map((c) => ({ ...c, row: 0 })), ...result.second.map((c) => ({ ...c, row: 1 }))]

  useTicker(
    () => {
      setShown((n) => {
        if (n + 1 >= cells.length) setRunning(false)
        return n + 1
      })
    },
    reduced ? 200 : 650,
    running,
  )

  const play = () => {
    setShown(0)
    setRunning(true)
  }
  const visible = (i: number) => i < shown + 1
  const finished = shown + 1 >= cells.length

  const verdict =
    result.charges === 0
      ? { text: 'Mensaje perdido: el cliente nunca fue cobrado.', tone: 'bad' as const }
      : result.charges === 1
        ? { text: 'Exactamente un cobro.', tone: 'ok' as const }
        : { text: `Duplicado: el cliente fue cobrado ${result.charges} veces.`, tone: 'bad' as const }

  const crashOptions: { value: Crash; label: string }[] = [
    { value: 'none', label: 'Sin falla' },
    { value: '1', label: `Tras «${PLANS[mode][0].label}»` },
    { value: '2', label: `Tras «${PLANS[mode][1].label}»` },
  ]

  const row = (r: 0 | 1) => {
    const list = cells.map((c, i) => ({ ...c, i })).filter((c) => c.row === r)
    if (!list.length) return <p className="ds-empty">No hubo reinicio.</p>
    return (
      <ol className="ds-line">
        {list.map((c) => (
          <motion.li
            key={`${mode}-${crash}-${c.i}`}
            className={`ds-stop is-${c.state}`}
            initial={false}
            animate={{ opacity: visible(c.i) ? 1 : 0.15 }}
            transition={{ duration: reduced ? 0.1 : 0.3, ease: EASE }}
          >
            <span className="ds-dot" aria-hidden="true">
              {c.state === 'crash' ? <Zap size={14} /> : null}
            </span>
            <span className="ds-label">
              {c.label}
              {c.note && <small>{c.note}</small>}
            </span>
          </motion.li>
        ))}
      </ol>
    )
  }

  return (
    <WidgetFrame
      caption="Un consumidor procesa el mensaje 42 («cobrar $50 al pedido 1042»). Elige el orden de los pasos y dónde muere el proceso; al reiniciar, retoma desde el último offset confirmado."
      controls={
        <>
          <Segmented
            label="Estrategia"
            value={mode}
            onChange={(m) => {
              setMode(m)
              setShown(99)
              setRunning(false)
            }}
            options={[
              { value: 'amo', label: 'At-most-once' },
              { value: 'alo', label: 'At-least-once' },
              { value: 'idem', label: 'At-least-once + idempotente' },
            ]}
          />
          <Segmented
            label="Falla del consumidor"
            value={crash}
            onChange={(c) => {
              setCrash(c)
              setShown(99)
              setRunning(false)
            }}
            options={crashOptions}
          />
          <div className="ds-actions">
            <button type="button" className="btn btn--line" onClick={play} disabled={running}>
              <Play size={16} aria-hidden="true" />
              Reproducir
            </button>
            <button type="button" className="icon-btn" onClick={() => setShown(99)} aria-label="Mostrar todo">
              <RotateCcw size={18} aria-hidden="true" />
            </button>
          </div>
        </>
      }
      readout={
        <div className="ds-readout">
          <Stat label="cobros realizados" value={finished ? result.charges : '…'} tone={finished ? verdict.tone : undefined} />
          <p aria-live="polite">{finished ? verdict.text : 'Ejecutando…'}</p>
        </div>
      }
    >
      <div className="ds-rows">
        <div className="ds-row">
          <span className="ds-rowlabel">Primer intento</span>
          {row(0)}
        </div>
        <div className="ds-row">
          <span className="ds-rowlabel">Tras reiniciar</span>
          {row(1)}
        </div>
      </div>
    </WidgetFrame>
  )
}
