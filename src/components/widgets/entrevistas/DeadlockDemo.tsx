import { useId, useMemo, useState } from 'react'
import { Check, X } from 'lucide-react'
import { Segmented, WidgetFrame } from '../kit'
import { pickLang, useCodeLang } from '../../../lib/codeLang'
import { StepControls, StepNote } from './algo-kit'
import { useStepPlayer } from './useStepPlayer'
import './DeadlockDemo.css'

/**
 * DeadlockDemo: two transfers between the same two accounts, each guarded by a
 * lock. T1 moves money A → B, T2 moves B → A. The wait-for graph is drawn from
 * the simulated state; with a global lock order both take A first and the
 * cycle can no longer form.
 */

type T = 'T1' | 'T2'
type L = 'A' | 'B'
type Op = { kind: 'lock' | 'unlock'; l: L } | { kind: 'work' }

interface State {
  pc: Record<T, number>
  holder: Record<L, T | null>
  waits: Record<T, L | null>
}

interface Frame {
  s: State
  who?: T
  note: string
  tone?: 'ok' | 'warn' | 'bad'
  deadlock: boolean
}

function programs(ordered: boolean): Record<T, Op[]> {
  const make = (first: L, second: L): Op[] => [
    { kind: 'lock', l: first },
    { kind: 'lock', l: second },
    { kind: 'work' },
    { kind: 'unlock', l: second },
    { kind: 'unlock', l: first },
  ]
  // T1 transfers A -> B, T2 transfers B -> A. With a global order both lock the lower id first.
  return { T1: make('A', 'B'), T2: ordered ? make('A', 'B') : make('B', 'A') }
}

type Lang = 'Java' | 'Python'
const LANGS: Lang[] = ['Java', 'Python']
/** Each step as a line of Java (ReentrantLock per account) or Python (threading.Lock per account). */
const opText = (op: Op, lang: Lang) => {
  if (op.kind === 'work') return lang === 'Java' ? 'transferir();' : 'transferir()'
  const name = lang === 'Java' ? `lock${op.l}` : `lock_${op.l.toLowerCase()}`
  if (lang === 'Java') return `${name}.${op.kind}();`
  return `${name}.${op.kind === 'lock' ? 'acquire' : 'release'}()`
}
const other = (t: T): T => (t === 'T1' ? 'T2' : 'T1')

function simulate(schedule: 'alt' | 'seq', ordered: boolean): Frame[] {
  const prog = programs(ordered)
  const s: State = { pc: { T1: 0, T2: 0 }, holder: { A: null, B: null }, waits: { T1: null, T2: null } }
  const snap = (): State => ({ pc: { ...s.pc }, holder: { ...s.holder }, waits: { ...s.waits } })
  const frames: Frame[] = [
    {
      s: snap(),
      deadlock: false,
      note: ordered
        ? 'Orden global: toda transferencia toma primero el lock de la cuenta con id menor (A) y después el de la mayor (B), sin importar la dirección del dinero.'
        : 'T1 transfiere de A a B: toma el lock de A y luego el de B. T2 transfiere de B a A: toma B y luego A. Cada uno bloquea primero su cuenta de origen.',
    },
  ]
  const done = (t: T) => s.pc[t] >= prog[t].length
  const canRun = (t: T) => {
    if (done(t)) return false
    const op = prog[t][s.pc[t]]
    return !(op.kind === 'lock' && s.holder[op.l] !== null && s.holder[op.l] !== t)
  }

  const step = (t: T) => {
    const op = prog[t][s.pc[t]]
    if (op.kind === 'lock') {
      const h = s.holder[op.l]
      if (h && h !== t) {
        s.waits[t] = op.l
        const cycle = s.waits[other(t)] !== null && s.holder[s.waits[other(t)]!] === t
        frames.push({
          s: snap(),
          who: t,
          deadlock: cycle,
          tone: cycle ? 'bad' : 'warn',
          note: cycle
            ? `${t} pide la cuenta ${op.l}, que tiene ${h}. Pero ${h} está esperando la cuenta ${s.waits[other(t)]}, que tiene ${t}. Ciclo: ninguno puede avanzar nunca. Deadlock.`
            : `${t} pide la cuenta ${op.l}, pero la tiene ${h}. ${t} se bloquea esperando${s.holder[op.l === 'A' ? 'B' : 'A'] === t ? ' sin soltar lo que ya tiene (retener y esperar)' : ''}.`,
        })
        return
      }
      s.holder[op.l] = t
      s.waits[t] = null
      frames.push({ s: snap(), who: t, deadlock: false, note: `${t} toma el lock de la cuenta ${op.l}.` })
    } else if (op.kind === 'work') {
      frames.push({ s: snap(), who: t, deadlock: false, note: `${t} tiene las dos cuentas: mueve el dinero de forma segura.` })
    } else {
      s.holder[op.l] = null
      frames.push({ s: snap(), who: t, deadlock: false, note: `${t} suelta la cuenta ${op.l}.` })
    }
    s.pc[t]++
  }

  let turn: T = 'T1'
  for (let guard = 0; guard < 40 && (!done('T1') || !done('T2')); guard++) {
    if (frames[frames.length - 1].deadlock) return frames
    let t: T = schedule === 'seq' ? (done('T1') ? 'T2' : 'T1') : turn
    if (done(t)) t = other(t)
    // a blocked thread that is still blocked shows its wait once, then yields
    if (!canRun(t) && s.waits[t] !== null && canRun(other(t))) t = other(t)
    step(t)
    turn = other(turn)
  }
  if (!frames[frames.length - 1].deadlock)
    frames.push({
      s: snap(),
      deadlock: false,
      tone: 'ok',
      note: ordered
        ? 'Las dos transferencias terminaron. Con un orden global nadie puede tener B mientras espera A, así que la espera circular es imposible.'
        : 'Las dos terminaron, pero solo porque T1 alcanzó a tomar las dos cuentas antes de que T2 empezara. El deadlock depende del momento: por eso pasa los tests y explota en producción.',
    })
  return frames
}

const POS = {
  T1: { x: 70, y: 120 },
  T2: { x: 350, y: 120 },
  A: { x: 210, y: 42 },
  B: { x: 210, y: 198 },
}

function edge(from: { x: number; y: number }, to: { x: number; y: number }, padFrom: number, padTo: number) {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const d = Math.hypot(dx, dy)
  const ux = dx / d
  const uy = dy / d
  return { x1: from.x + ux * padFrom, y1: from.y + uy * padFrom, x2: to.x - ux * padTo, y2: to.y - uy * padTo }
}

export function DeadlockDemo() {
  const uid = useId().replace(/:/g, '')
  const [sched, setSched] = useState<'alt' | 'seq'>('alt')
  const [order, setOrder] = useState<'off' | 'on'>('off')
  const [pref, setPref] = useCodeLang()
  const lang = LANGS[pickLang(LANGS, pref)]
  const ordered = order === 'on'
  const frames = useMemo(() => simulate(sched, ordered), [sched, ordered])
  const player = useStepPlayer(frames.length, { resetKey: `${sched}-${order}`, interval: 1100 })
  const f = frames[player.i]
  const prog = programs(ordered)
  const { s } = f

  const holdAndWait = (['T1', 'T2'] as T[]).some((t) => s.waits[t] && (s.holder.A === t || s.holder.B === t))
  const conds = [
    { name: 'Exclusión mutua', on: true, hint: 'un lock lo tiene un solo hilo a la vez' },
    { name: 'Retener y esperar', on: holdAndWait, hint: 'alguien espera sin soltar lo que tiene' },
    { name: 'Sin expropiación', on: true, hint: 'nadie le quita un lock a otro hilo' },
    { name: 'Espera circular', on: f.deadlock, hint: ordered ? 'imposible: todos piden en el mismo orden' : 'T1 espera a T2 y T2 espera a T1' },
  ]

  const edges: { key: string; e: ReturnType<typeof edge>; kind: 'hold' | 'wait'; label: string }[] = []
  for (const l of ['A', 'B'] as L[]) {
    const h = s.holder[l]
    if (h) edges.push({ key: `h-${l}`, e: edge(POS[l], POS[h], 28, 48), kind: 'hold', label: 'tiene' })
  }
  for (const t of ['T1', 'T2'] as T[]) {
    const w = s.waits[t]
    if (w) edges.push({ key: `w-${t}`, e: edge(POS[t], POS[w], 48, 30), kind: 'wait', label: 'espera' })
  }

  return (
    <WidgetFrame
      caption="Dos transferencias entre las mismas dos cuentas. El grafo muestra quién tiene cada lock (línea continua) y quién espera cuál (punteada). Activa el orden global y repite."
      controls={
        <>
          <Segmented
            label="Intercalado"
            value={sched}
            onChange={setSched}
            options={[
              { value: 'alt', label: 'Alternado' },
              { value: 'seq', label: 'T1 primero' },
            ]}
          />
          <Segmented
            label="Orden global de locks"
            value={order}
            onChange={setOrder}
            options={[
              { value: 'off', label: 'No' },
              { value: 'on', label: 'Sí: A antes que B' },
            ]}
          />
          <Segmented<Lang> label="Código" value={lang} onChange={(v) => setPref(v)} options={LANGS.map((l) => ({ value: l, label: l }))} />
        </>
      }
      readout={<StepNote tone={f.tone}>{f.note}</StepNote>}
    >
      <div className="dl">
        <svg className="dl-graph" viewBox="0 0 420 240" role="img" aria-label={`Grafo de espera. ${f.deadlock ? 'Hay un ciclo: deadlock.' : 'Sin ciclo.'}`}>
          <defs>
            <marker id={`${uid}-a`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" className="dl-head" />
            </marker>
            <marker id={`${uid}-b`} viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
              <path d="M0 0 L10 5 L0 10 z" className="dl-head is-bad" />
            </marker>
          </defs>
          {edges.map(({ key, e, kind, label }) => (
            <g key={key} className={`dl-edge is-${kind} ${f.deadlock ? 'is-cycle' : ''}`}>
              <line x1={e.x1} y1={e.y1} x2={e.x2} y2={e.y2} markerEnd={`url(#${uid}-${f.deadlock ? 'b' : 'a'})`} />
              <text x={(e.x1 + e.x2) / 2} y={(e.y1 + e.y2) / 2 - 6} textAnchor="middle">
                {label}
              </text>
            </g>
          ))}
          {(['A', 'B'] as L[]).map((l) => (
            <g key={l} className={`dl-lock ${s.holder[l] ? 'is-held' : ''}`}>
              <circle cx={POS[l].x} cy={POS[l].y} r="26" />
              <text x={POS[l].x} y={POS[l].y + 5} textAnchor="middle" className="dl-lock__t">
                {l}
              </text>
              <text x={POS[l].x + 36} y={POS[l].y + 5} className="dl-lock__s">
                cuenta {l}
              </text>
            </g>
          ))}
          {(['T1', 'T2'] as T[]).map((t) => (
            <g key={t} className={`dl-thread dl-thread--${t} ${f.who === t ? 'is-acting' : ''} ${s.waits[t] ? 'is-wait' : ''}`}>
              <rect x={POS[t].x - 46} y={POS[t].y - 22} width="92" height="44" rx="10" />
              <text x={POS[t].x} y={POS[t].y + 5} textAnchor="middle">
                {t}
              </text>
            </g>
          ))}
        </svg>

        <div className="dl-side">
          <div className="dl-progs">
            {(['T1', 'T2'] as T[]).map((t) => (
              <div key={t} className={`dl-prog dl-prog--${t}`}>
                <div className="dl-prog__t">
                  {t}: {t === 'T1' ? 'A → B' : 'B → A'}
                </div>
                <ol>
                  {prog[t].map((op, k) => (
                    <li key={k} className={`${k < s.pc[t] ? 'is-past' : ''} ${k === s.pc[t] && s.waits[t] ? 'is-wait' : ''} ${f.who === t && k === s.pc[t] ? 'is-now' : ''}`}>
                      <code>{opText(op, lang)}</code>
                    </li>
                  ))}
                </ol>
              </div>
            ))}
          </div>
          <ul className="dl-conds" aria-label="Condiciones de Coffman">
            {conds.map((c) => (
              <li key={c.name} className={c.on ? 'is-on' : ''}>
                {c.on ? <Check size={15} aria-hidden="true" /> : <X size={15} aria-hidden="true" />}
                <span>
                  <b>{c.name}</b> <span className="dl-hint">{c.hint}</span>
                </span>
                <span className="visually-hidden">{c.on ? ': se cumple' : ': no se cumple'}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <StepControls player={player} />
    </WidgetFrame>
  )
}
