import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Segmented, WidgetFrame } from '../kit'
import { AlgoLayout, CodeTrace, StepControls, StepNote, VarPanel } from './algo-kit'
import { useStepPlayer } from './useStepPlayer'
import './ListReversal.css'

/**
 * Reverse Linked List, iterative: nodes as boxes (value | next) with SVG arrows;
 * prev / curr / nxt slide along and each step flips one arrow. A second mode runs
 * the classic bug (not saving `next` before overwriting it) and shows the nodes
 * that become unreachable. Frames come from running the code on the list.
 */

const CODE_OK = [
  'def reverse(head):',
  '    prev, curr = None, head',
  '    while curr:',
  '        nxt = curr.next   # guardar',
  '        curr.next = prev  # dar vuelta',
  '        prev = curr       # avanzar',
  '        curr = nxt',
  '    return prev',
]

const CODE_BUG = [
  'def reverse(head):  # con bug',
  '    prev, curr = None, head',
  '    while curr:',
  '        curr.next = prev',
  '        prev = curr',
  '        curr = curr.next  # ¡es prev!',
  '    return prev',
]

const NONE = -1

const JAVA_OK = [
  'ListNode reverseList(ListNode head) {',
  '    ListNode prev = null, curr = head;',
  '    while (curr != null) {',
  '        ListNode nxt = curr.next; // guardar',
  '        curr.next = prev;  // dar vuelta',
  '        prev = curr;       // avanzar',
  '        curr = nxt;',
  '    }',
  '    return prev;',
  '}',
]
const JAVA_OK_MAP = [0, 1, 2, 3, 4, 5, 6, 8]

const JAVA_BUG = [
  'ListNode reverse(ListNode head) { // bug',
  '    ListNode prev = null, curr = head;',
  '    while (curr != null) {',
  '        curr.next = prev;',
  '        prev = curr;',
  '        curr = curr.next;  // ¡es prev!',
  '    }',
  '    return prev;',
  '}',
]
const JAVA_BUG_MAP = [0, 1, 2, 3, 4, 5, 7]

interface Frame {
  line: number | number[]
  next: number[]
  prev: number
  curr: number
  /** undefined while the variable does not exist yet */
  nxt?: number
  flipped?: number
  ghost?: [number, number]
  done?: boolean
  note: string
  tone?: 'ok' | 'bad'
}

const name = (vals: number[], k: number) => (k === NONE ? 'None' : String(vals[k]))

function buildFrames(vals: number[], bug: boolean): Frame[] {
  const n = vals.length
  const next = vals.map((_, k) => (k + 1 < n ? k + 1 : NONE))
  const frames: Frame[] = []
  const push = (f: Omit<Frame, 'next'>) => frames.push({ ...f, next: [...next] })
  let prev = NONE
  let curr = n ? 0 : NONE
  push({
    line: 1,
    prev,
    curr,
    note: n
      ? 'prev = None y curr = head. Invariante: prev es la cabeza de la parte ya invertida (vacía al empezar) y curr es la cabeza de lo que falta.'
      : 'La lista está vacía: head es None, así que curr también. El while no entra ni una vez.',
  })
  if (!bug) {
    let nxt: number | undefined
    while (curr !== NONE) {
      nxt = next[curr]
      push({ line: [2, 3], prev, curr, nxt, note: `Guardamos nxt = curr.next (${name(vals, nxt)}) antes de tocar nada: en el paso siguiente vamos a pisar curr.next y sin esta copia perderíamos el resto de la lista.` })
      const old = next[curr]
      next[curr] = prev
      push({
        line: 4,
        prev,
        curr,
        nxt,
        flipped: curr,
        ghost: old === NONE ? undefined : [curr, old],
        note: `curr.next = prev: el nodo ${vals[curr]} deja de apuntar a ${name(vals, old)} y ahora apunta a ${name(vals, prev)}. Esta es la única flecha que cambia en cada vuelta.`,
      })
      prev = curr
      push({ line: 5, prev, curr, nxt, note: `prev = curr: el nodo ${vals[curr]} ya es parte de la lista invertida, y es su nueva cabeza.` })
      curr = nxt
      push({ line: 6, prev, curr, nxt, note: curr === NONE ? 'curr = nxt = None: no queda nada por invertir.' : `curr = nxt: pasamos al nodo ${vals[curr]}, gracias a la copia que guardamos.` })
    }
    push({
      line: 7,
      prev,
      curr,
      nxt,
      done: true,
      tone: 'ok',
      note: n ? `Devolvemos prev (${name(vals, prev)}): es la nueva cabeza. Cada nodo se visitó una vez: O(n) tiempo y O(1) memoria extra.` : 'Devolvemos prev = None: invertir una lista vacía da una lista vacía.',
    })
    return frames
  }
  while (curr !== NONE) {
    const old = next[curr]
    next[curr] = prev
    push({
      line: [2, 3],
      prev,
      curr,
      flipped: curr,
      ghost: old === NONE ? undefined : [curr, old],
      tone: old === NONE ? undefined : 'bad',
      note:
        old === NONE
          ? `curr.next = prev: el nodo ${vals[curr]} apunta a ${name(vals, prev)}.`
          : `curr.next = prev, sin haber guardado curr.next. El enlace ${vals[curr]} → ${vals[old]} se borró y nadie más sabe dónde está ${vals[old]}.`,
    })
    prev = curr
    push({ line: 4, prev, curr, note: `prev = curr: el nodo ${vals[curr]} pasa a la parte invertida.` })
    curr = next[curr]
    push({ line: 5, prev, curr, tone: 'bad', note: `curr = curr.next… pero curr.next ya es ${name(vals, curr)}: lo acabamos de pisar con prev. En vez de avanzar al nodo siguiente, curr salta a lo que era prev.` })
  }
  const lost = n - 1
  push({
    line: 6,
    prev,
    curr,
    done: true,
    tone: lost > 0 ? 'bad' : 'ok',
    note:
      lost > 0
        ? `Devolvemos una lista de un solo nodo. Los otros ${lost} siguen en memoria pero ningún puntero llega a ellos: se perdieron. Por eso la línea "nxt = curr.next" va primero.`
        : n
          ? 'Con un solo nodo el bug no se nota: no había nada que perder. Por eso conviene probar con al menos tres nodos.'
          : 'Lista vacía: tampoco se nota el bug.',
  })
  return frames
}

function chain(vals: number[], next: number[], start: number) {
  const out: string[] = []
  const seen = new Set<number>()
  let k = start
  while (k !== NONE && !seen.has(k)) {
    seen.add(k)
    out.push(String(vals[k]))
    k = next[k]
  }
  return { text: [...out, 'None'].join(' → '), nodes: seen }
}

const PRESETS: { label: string; vals: number[] }[] = [
  { label: '1 → 2 → 3 → 4 → 5', vals: [1, 2, 3, 4, 5] },
  { label: '10 → 20', vals: [10, 20] },
  { label: 'Un nodo: 7', vals: [7] },
  { label: 'Lista vacía', vals: [] },
]

const BOX_W = 52
const VAL_W = 34
const BOX_H = 42
const STEP = 74
const NODE_Y = 50
const PAD = 14

export function ListReversal() {
  const reduced = useReducedMotion()
  const [preset, setPreset] = useState(0)
  const [mode, setMode] = useState<'ok' | 'bug'>('ok')
  const { vals } = PRESETS[preset]
  const n = vals.length
  const frames = useMemo(() => buildFrames(vals, mode === 'bug'), [vals, mode])
  const player = useStepPlayer(frames.length, { resetKey: `${preset}-${mode}` })
  const f = frames[player.i]
  const prevF = frames[player.i - 1]

  const content = 60 + n * STEP + 32
  const W = Math.max(360, PAD * 2 + content)
  const off = (W - content) / 2
  const nodeX = (k: number) => off + 60 + k * STEP
  const leftNoneX = off + 20
  const rightNoneX = off + 60 + n * STEP + 12
  const slotX = (k: number, side: 'left' | 'right') => (k === NONE ? (side === 'left' ? leftNoneX : rightNoneX) : nodeX(k) + VAL_W / 2)
  const cy = NODE_Y + BOX_H / 2

  const revChain = chain(vals, f.next, f.prev)
  const restChain = chain(vals, f.next, f.curr)
  const saved = f.nxt !== undefined ? chain(vals, f.next, f.nxt).nodes : new Set<number>()
  const lost = vals.map((_, k) => k).filter((k) => !revChain.nodes.has(k) && !restChain.nodes.has(k) && !saved.has(k))

  const ptrs: { label: string; x: number; tone: string }[] = [
    { label: 'prev', x: slotX(f.prev, 'left'), tone: 'line' },
    { label: 'curr', x: slotX(f.curr, 'right'), tone: 'ink' },
  ]
  if (f.nxt !== undefined) ptrs.push({ label: 'nxt', x: slotX(f.nxt, 'right'), tone: 'muted' })
  const PTR_Y = NODE_Y + BOX_H + 10
  const H = PTR_Y + 3 * 26 + 4
  const placed = ptrs.map((p, j) => ({ ...p, lane: ptrs.slice(0, j).filter((q) => Math.abs(q.x - p.x) < 30).length }))
  const trans = { duration: reduced ? 0 : 0.3, ease: [0.16, 1, 0.3, 1] as const }

  const arrow = (from: number, to: number, cls: string, key: string) => {
    const sx = nodeX(from) + VAL_W + (BOX_W - VAL_W) / 2
    if (to === from + 1) {
      const tx = nodeX(to) - 3
      return (
        <g key={key} className={cls}>
          <line x1={sx} y1={cy} x2={tx - 7} y2={cy} />
          <path d={`M${tx} ${cy} l-9 -5 v10 z`} />
        </g>
      )
    }
    const tx = nodeX(to) + VAL_W / 2
    const ty = NODE_Y - 3
    const lift = NODE_Y - 44
    return (
      <g key={key} className={cls}>
        <path d={`M${sx} ${cy} C${sx} ${lift} ${tx} ${lift} ${tx} ${ty - 8}`} fill="none" />
        <path d={`M${tx} ${ty} l-5 -9 h10 z`} />
      </g>
    )
  }

  return (
    <WidgetFrame
      caption="Invertir una lista enlazada en el lugar. Cada vuelta da vuelta una sola flecha; los tres punteros existen para no perder el resto de la lista mientras lo haces. Prueba la versión con bug para ver qué pasa si no guardas el siguiente."
      controls={
        <>
          <label className="lr-pick">
            <span className="seg__label">Lista</span>
            <select value={preset} onChange={(e) => setPreset(Number(e.target.value))}>
              {PRESETS.map((p, k) => (
                <option key={p.label} value={k}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <Segmented
            label="Código"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'ok', label: 'Correcto' },
              { value: 'bug', label: 'Sin guardar next' },
            ]}
          />
        </>
      }
      readout={<StepNote tone={f.tone}>{f.note}</StepNote>}
    >
      <AlgoLayout
        visual={
          <>
            <svg className="lr-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Lista. Desde prev: ${revChain.text}. Desde curr: ${restChain.text}.`}>
              <g className="lr-none">
                <rect x={leftNoneX - 20} y={NODE_Y + 4} width={40} height={BOX_H - 8} rx={5} />
                <text x={leftNoneX} y={cy + 4} textAnchor="middle">
                  None
                </text>
              </g>
              {n > 0 && (
                <g className="lr-none">
                  <rect x={rightNoneX - 20} y={NODE_Y + 4} width={40} height={BOX_H - 8} rx={5} />
                  <text x={rightNoneX} y={cy + 4} textAnchor="middle">
                    None
                  </text>
                </g>
              )}
              {f.ghost && arrow(f.ghost[0], f.ghost[1], 'lr-arrow is-ghost', 'ghost')}
              {f.next.map((t, k) => (t === NONE ? null : arrow(k, t, `lr-arrow ${f.flipped === k ? 'is-flipped' : ''}`, `a${k}`)))}
              {vals.map((v, k) => {
                const cls = ['lr-node', revChain.nodes.has(k) ? 'is-rev' : '', k === f.curr ? 'is-curr' : '', lost.includes(k) ? 'is-lost' : ''].join(' ')
                const x = nodeX(k)
                return (
                  <g key={k} className={cls}>
                    <rect x={x} y={NODE_Y} width={BOX_W} height={BOX_H} rx={5} />
                    <line className="lr-node__sep" x1={x + VAL_W} x2={x + VAL_W} y1={NODE_Y} y2={NODE_Y + BOX_H} />
                    <text x={x + VAL_W / 2} y={cy + 7} textAnchor="middle" className="lr-node__val">
                      {v}
                    </text>
                    {f.next[k] === NONE ? (
                      <line className="lr-node__null" x1={x + VAL_W + 4} y1={NODE_Y + BOX_H - 5} x2={x + BOX_W - 4} y2={NODE_Y + 5} />
                    ) : (
                      <circle className="lr-node__dot" cx={x + VAL_W + (BOX_W - VAL_W) / 2} cy={cy} r={3.5} />
                    )}
                  </g>
                )
              })}
              {placed.map((p) => (
                <motion.g key={p.label} initial={false} animate={{ x: p.x, y: PTR_Y + p.lane * 26 }} transition={trans} className={`lr-ptr lr-ptr--${p.tone}`}>
                  <path d="M0 0 l5 7 h-10 z" />
                  <text y={23} textAnchor="middle">
                    {p.label}
                  </text>
                </motion.g>
              ))}
            </svg>
            <div className="lr-chains">
              <div>
                <span className="lr-chains__k">desde prev</span>
                <code className="lr-chains__v is-rev">{revChain.text}</code>
              </div>
              <div>
                <span className="lr-chains__k">desde curr</span>
                <code className="lr-chains__v">{restChain.text}</code>
              </div>
              {lost.length > 0 && (
                <div>
                  <span className="lr-chains__k">perdidos</span>
                  <code className="lr-chains__v is-lost">{lost.map((k) => vals[k]).join(', ')}</code>
                </div>
              )}
            </div>
            <VarPanel
              vars={[
                { name: 'prev', value: name(vals, f.prev), changed: !!prevF && prevF.prev !== f.prev },
                { name: 'curr', value: name(vals, f.curr), changed: !!prevF && prevF.curr !== f.curr },
                ...(mode === 'ok' ? [{ name: 'nxt', value: f.nxt === undefined ? '—' : name(vals, f.nxt), changed: !!prevF && prevF.nxt !== f.nxt }] : []),
              ]}
            />
          </>
        }
        code={<CodeTrace title="Python" lines={mode === 'ok' ? CODE_OK : CODE_BUG} active={f.line} variants={[mode === 'ok' ? { label: 'Java', lines: JAVA_OK, map: JAVA_OK_MAP } : { label: 'Java', lines: JAVA_BUG, map: JAVA_BUG_MAP }]} />}
      />
      <StepControls player={player} />
    </WidgetFrame>
  )
}
