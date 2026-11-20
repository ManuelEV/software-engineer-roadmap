import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Segmented, WidgetFrame } from '../kit'
import { AlgoLayout, ArrayView, type CellState, CodeTrace, StepControls, StepNote, VarPanel } from './algo-kit'
import { useStepPlayer } from './useStepPlayer'
import './RecursionVsMemo.css'

/**
 * Call tree of Climbing Stairs (climb(n) = climb(n-1) + climb(n-2)), naive
 * against memoized. Frames come from running the real recursion and logging
 * every call: repeated calls light up, memo hits cut whole subtrees.
 */

type Mode = 'naive' | 'memo'

const CODE: Record<Mode, string[]> = {
  naive: ['def climb(n):', '    if n <= 1:', '        return 1', '    return climb(n - 1) + climb(n - 2)'],
  memo: [
    'memo = {}',
    'def climb(n):',
    '    if n <= 1:',
    '        return 1',
    '    if n in memo:',
    '        return memo[n]',
    '    memo[n] = climb(n - 1) + climb(n - 2)',
    '    return memo[n]',
  ],
}
/** Same code in Java; map[k] = the Java line(s) for Python line k. */
const JAVA: Record<Mode, { lines: string[]; map: (number | number[] | null)[] }> = {
  naive: {
    lines: [
      'int climb(int n) {',
      '    if (n <= 1) {',
      '        return 1;',
      '    }',
      '    return climb(n - 1) + climb(n - 2);',
      '}',
    ],
    map: [0, 1, 2, 4],
  },
  memo: {
    lines: [
      'Map<Integer, Integer> memo = new HashMap<>();',
      'int climb(int n) {',
      '    if (n <= 1) {',
      '        return 1;',
      '    }',
      '    if (memo.containsKey(n)) {',
      '        return memo.get(n);',
      '    }',
      '    memo.put(n, climb(n - 1) + climb(n - 2));',
      '    return memo.get(n);',
      '}',
    ],
    map: [0, 1, 2, 3, 5, 6, 8, 9],
  },
}

const LINE: Record<Mode, Record<EvType, number>> = {
  naive: { base: 2, enter: 3, exit: 3, hit: -1 },
  memo: { base: 3, enter: 6, exit: 7, hit: 5 },
}

type EvType = 'base' | 'enter' | 'exit' | 'hit'
type Status = 'hidden' | 'stack' | 'cur' | 'done'

interface TNode {
  id: number
  n: number
  parent: number
  depth: number
  children: number[]
  repeat: boolean
  kind: 'call' | 'base' | 'hit'
  value: number
  x: number
}

interface Frame {
  ev: EvType | 'end'
  line: number
  cur: number
  status: Status[]
  calls: number
  repeats: number
  depth: number
  memo: (number | null)[]
  counts: number[]
  note: string
  tone?: 'ok' | 'warn'
}

function run(n0: number, mode: Mode) {
  const nodes: TNode[] = []
  const events: { type: EvType; id: number }[] = []
  const memo = new Map<number, number>()
  const solved = new Set<number>()

  const call = (n: number, parent: number, depth: number): number => {
    const id = nodes.length
    const node: TNode = { id, n, parent, depth, children: [], repeat: solved.has(n), kind: 'call', value: 0, x: 0 }
    nodes.push(node)
    if (parent >= 0) nodes[parent].children.push(id)
    if (n <= 1) {
      node.kind = 'base'
      node.value = 1
      solved.add(n)
      events.push({ type: 'base', id })
      return 1
    }
    if (mode === 'memo' && memo.has(n)) {
      node.kind = 'hit'
      node.value = memo.get(n)!
      events.push({ type: 'hit', id })
      return node.value
    }
    events.push({ type: 'enter', id })
    const v = call(n - 1, id, depth + 1) + call(n - 2, id, depth + 1)
    node.value = v
    if (mode === 'memo') memo.set(n, v)
    solved.add(n)
    events.push({ type: 'exit', id })
    return v
  }
  call(n0, -1, 0)

  // layout: leaves left to right, parents centred over their children
  let leaf = 0
  const place = (id: number) => {
    const nd = nodes[id]
    if (nd.children.length === 0) {
      nd.x = leaf++
      return
    }
    nd.children.forEach(place)
    nd.x = (nodes[nd.children[0]].x + nodes[nd.children[nd.children.length - 1]].x) / 2
  }
  place(0)
  return { nodes, events, leaves: leaf, maxDepth: Math.max(...nodes.map((d) => d.depth)) }
}

function buildFrames(n0: number, mode: Mode) {
  const tree = run(n0, mode)
  const { nodes, events } = tree
  const frames: Frame[] = []
  const status: Status[] = nodes.map(() => 'hidden')
  const stack: number[] = []
  const memo: (number | null)[] = Array.from({ length: n0 + 1 }, () => null)
  const counts = Array.from({ length: n0 + 1 }, () => 0)
  let calls = 0
  let repeats = 0
  const lbl = (id: number) => `climb(${nodes[id].n})`

  for (const ev of events) {
    const nd = nodes[ev.id]
    let note = ''
    let tone: Frame['tone']
    if (ev.type === 'enter' || ev.type === 'base' || ev.type === 'hit') {
      calls++
      counts[nd.n]++
      if (nd.repeat && (mode === 'naive' || ev.type === 'hit')) repeats++
    }
    stack.forEach((s) => (status[s] = 'stack'))
    if (ev.type === 'enter') {
      status[ev.id] = 'cur'
      stack.push(ev.id)
      const [a, b] = [nd.n - 1, nd.n - 2]
      if (nd.repeat && mode === 'naive') {
        note = `${lbl(ev.id)} otra vez. Ya lo resolvimos antes, pero la versión ingenua no lo recuerda y vuelve a abrir todo su subárbol.`
        tone = 'warn'
      } else {
        note = `${lbl(ev.id)} no es caso base: para saber de cuántas formas se sube, necesita climb(${a}) y climb(${b}). Baja primero por climb(${a}).`
      }
    } else if (ev.type === 'base') {
      status[ev.id] = 'cur'
      note = `${lbl(ev.id)} es caso base: devuelve 1 sin llamar a nadie.`
      if (nd.repeat && mode === 'naive') {
        note += ' Es una llamada repetida.'
        tone = 'warn'
      }
    } else if (ev.type === 'hit') {
      status[ev.id] = 'cur'
      memo[nd.n] = nd.value
      note = `${lbl(ev.id)} ya está en memo: devuelve ${nd.value} al instante. Todo el subárbol que la versión ingenua volvería a recorrer se corta aquí.`
      tone = 'ok'
    } else {
      stack.pop()
      status[ev.id] = 'cur'
      const [c1, c2] = nd.children.map((c) => nodes[c].value)
      note = `${lbl(ev.id)} = climb(${nd.n - 1}) + climb(${nd.n - 2}) = ${c1} + ${c2} = ${nd.value}.`
      if (mode === 'memo') {
        memo[nd.n] = nd.value
        note += ` Lo guardamos en memo[${nd.n}] antes de volver.`
      } else {
        note += ' Vuelve a su padre y el resultado se olvida.'
      }
    }
    frames.push({
      ev: ev.type,
      line: LINE[mode][ev.type],
      cur: ev.id,
      status: [...status],
      calls,
      repeats,
      depth: nd.depth + 1,
      memo: [...memo],
      counts: [...counts],
      note,
      tone,
    })
    if (ev.type !== 'enter') status[ev.id] = 'done'
  }
  const last = frames[frames.length - 1]
  frames.push({
    ...last,
    ev: 'end',
    line: -1,
    cur: -1,
    status: nodes.map(() => 'done'),
    depth: 0,
    tone: 'ok',
    note:
      mode === 'naive'
        ? `climb(${n0}) = ${nodes[0].value}, con ${calls} llamadas, de las cuales ${repeats} repiten un cálculo ya hecho. Crece como Fibonacci: O(2ⁿ) en la práctica.`
        : `climb(${n0}) = ${nodes[0].value}, con ${calls} llamadas: cada n se calcula una vez y se consulta como mucho una vez más. O(n) tiempo, O(n) memoria.`,
  })
  return { frames, tree }
}

/** calls made by each version, for the "and with n = 30?" line */
function callCount(n: number, mode: Mode) {
  if (mode === 'memo') return n <= 1 ? 1 : 2 * n - 1
  let a = 1
  let b = 1 // C(0), C(1)
  for (let k = 2; k <= n; k++) [a, b] = [b, 1 + a + b]
  return n === 0 ? a : b
}

const NS = ['3', '4', '5', '6'] as const
const fmt = (v: number) => v.toLocaleString('es')

export function RecursionVsMemo() {
  const reduced = useReducedMotion()
  const [mode, setMode] = useState<Mode>('naive')
  const [nStr, setN] = useState<(typeof NS)[number]>('5')
  const n0 = Number(nStr)
  const { frames, tree } = useMemo(() => buildFrames(n0, mode), [n0, mode])
  const player = useStepPlayer(frames.length, { resetKey: `${mode}-${n0}`, interval: 800 })
  const f = frames[player.i]
  const prev = frames[player.i - 1]

  const SX = 46
  const SY = 62
  const R = 17
  const W = tree.leaves * SX
  const H = (tree.maxDepth + 1) * SY + 8
  const cx = (x: number) => SX / 2 + x * SX
  const cy = (d: number) => R + 6 + d * SY

  const rowValues = mode === 'memo' ? f.memo.map((v) => (v === null ? '·' : v)) : f.counts
  const rowStates: Partial<Record<number, CellState>> = {}
  if (f.cur >= 0) {
    const nd = tree.nodes[f.cur]
    rowStates[nd.n] = mode === 'memo' && (f.ev === 'hit' || f.ev === 'exit') ? 'found' : 'active'
  }

  return (
    <WidgetFrame
      caption={
        <>
          Árbol de llamadas de Climbing Stairs. En la versión ingenua, los nodos en ámbar repiten un cálculo que ya se hizo; con memo, esas ramas desaparecen. Para n = 30 serían {fmt(callCount(30, 'naive'))} llamadas ingenuas contra {callCount(30, 'memo')} memoizadas.
        </>
      }
      controls={
        <>
          <Segmented
            label="Versión"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'naive', label: 'Ingenua' },
              { value: 'memo', label: 'Con memo' },
            ]}
          />
          <Segmented label="n" value={nStr} onChange={setN} options={NS.map((v) => ({ value: v, label: v }))} />
        </>
      }
      readout={<StepNote tone={f.tone}>{f.note}</StepNote>}
    >
      <AlgoLayout
        visual={
          <>
            <div className="rvm-tree">
              <svg viewBox={`0 0 ${W} ${H}`} style={{ minWidth: `${Math.min(W, tree.leaves * 30)}px` }} role="img" aria-label={`Árbol de llamadas de climb(${n0}), versión ${mode === 'naive' ? 'ingenua' : 'con memo'}`}>
                {tree.nodes.map((nd) =>
                  nd.parent >= 0 && f.status[nd.id] !== 'hidden' ? (
                    <line
                      key={`e${nd.id}`}
                      className={`rvm-edge ${f.status[nd.id] === 'cur' || f.status[nd.id] === 'stack' ? 'is-live' : ''}`}
                      x1={cx(tree.nodes[nd.parent].x)}
                      y1={cy(tree.nodes[nd.parent].depth) + R}
                      x2={cx(nd.x)}
                      y2={cy(nd.depth) - R}
                    />
                  ) : null,
                )}
                {tree.nodes.map((nd) => {
                  const st = f.status[nd.id]
                  if (st === 'hidden') return null
                  const cls = [
                    'rvm-node',
                    `is-${st}`,
                    nd.repeat && mode === 'naive' ? 'is-repeat' : '',
                    nd.kind === 'hit' ? 'is-hit' : '',
                    nd.kind === 'base' ? 'is-base' : '',
                  ].join(' ')
                  const showVal = st === 'done' || (st === 'cur' && f.ev !== 'enter')
                  return (
                    <motion.g key={nd.id} className={cls} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: reduced ? 0.15 : 0.3, ease: [0.16, 1, 0.3, 1] }}>
                      <circle cx={cx(nd.x)} cy={cy(nd.depth)} r={R} />
                      <text x={cx(nd.x)} y={cy(nd.depth) + 5} textAnchor="middle" className="rvm-node__n">
                        {nd.n}
                      </text>
                      {showVal && (
                        <text x={cx(nd.x)} y={cy(nd.depth) + R + 16} textAnchor="middle" className="rvm-node__v">
                          ={nd.value}
                        </text>
                      )}
                    </motion.g>
                  )
                })}
              </svg>
            </div>
            <ArrayView
              label={mode === 'memo' ? 'Tabla memo por valor de n' : 'Cantidad de llamadas por valor de n'}
              caption={mode === 'memo' ? 'memo[n]' : 'veces que se llamó climb(n)'}
              values={rowValues}
              states={rowStates}
              maxCell={44}
            />
            <VarPanel
              vars={[
                { name: 'llamadas', value: f.calls, changed: !!prev && prev.calls !== f.calls },
                { name: mode === 'memo' ? 'aciertos en memo' : 'repetidas', value: f.repeats, changed: !!prev && prev.repeats !== f.repeats },
                { name: 'pila', value: f.depth },
              ]}
            />
          </>
        }
        code={<CodeTrace title="Python" lines={CODE[mode]} active={f.line} variants={[{ label: 'Java', lines: JAVA[mode].lines, map: JAVA[mode].map }]} />}
      />
      <StepControls player={player} label="Paso" />
    </WidgetFrame>
  )
}
