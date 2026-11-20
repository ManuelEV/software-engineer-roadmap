import { useMemo, useState } from 'react'
import { Segmented, WidgetFrame } from '../kit'
import { AlgoLayout, CodeTrace, StepControls, StepNote } from './algo-kit'
import { useStepPlayer } from './useStepPlayer'
import { buildTree, type Tree, treeGeometry } from './tree-model'
import './ValidateBst.css'

/**
 * Validate BST two ways on the same tree: the naive parent-vs-children check
 * (which a "trap" tree fools) and the correct one that carries an open interval
 * (lo, hi) down the recursion and narrows it at every step. Frames come from
 * running each version on the tree.
 */

const RANGE_CODE = [
  'def is_valid_bst(root):',
  '    def ok(node, lo, hi):',
  '        if node is None:',
  '            return True',
  '        v = node.val',
  '        if not (lo < v < hi):',
  '            return False',
  '        return (ok(node.left, lo, v) and',
  '                ok(node.right, v, hi))',
  '    return ok(root, -inf, inf)',
]

const NAIVE_CODE = [
  'def naive(node):  # INCORRECTA',
  '    if node is None:',
  '        return True',
  '    l, r = node.left, node.right',
  '    if l and l.val >= node.val:',
  '        return False',
  '    if r and r.val <= node.val:',
  '        return False',
  '    return naive(l) and naive(r)',
]

const JAVA_RANGE = [
  'boolean isValidBST(TreeNode root) {',
  '    return ok(root, Long.MIN_VALUE, Long.MAX_VALUE);',
  '}',
  '',
  'boolean ok(TreeNode node, long lo, long hi) {',
  '    if (node == null)',
  '        return true;',
  '    long v = node.val;',
  '    if (!(lo < v && v < hi))',
  '        return false;',
  '    return ok(node.left, lo, v)',
  '        && ok(node.right, v, hi);',
  '}',
]
const JAVA_RANGE_MAP = [0, 4, 5, 6, 7, 8, 9, 10, 11, 1]

const JAVA_NAIVE = [
  'boolean naive(TreeNode node) { // INCORRECTA',
  '    if (node == null)',
  '        return true;',
  '    TreeNode l = node.left, r = node.right;',
  '    if (l != null && l.val >= node.val)',
  '        return false;',
  '    if (r != null && r.val <= node.val)',
  '        return false;',
  '    return naive(l) && naive(r);',
  '}',
]
const JAVA_NAIVE_MAP = [0, 1, 2, 3, 4, 5, 6, 7, 8]

type Mode = 'range' | 'naive'

interface Frame {
  line: number | number[]
  cur: number | null
  ranges: Record<number, [number, number]>
  status: Record<number, 'ok' | 'bad'>
  /** naive mode: parent-child comparisons made so far */
  checked: { a: number; b: number; ok: boolean }[]
  verdict?: boolean
  note: string
  tone?: 'ok' | 'bad' | 'warn'
}

const fmt = (v: number) => (v === -Infinity ? '−∞' : v === Infinity ? '∞' : String(v))

/** First node that breaks the BST property, with the ancestor whose bound it breaks. */
function firstViolation(tree: Tree): { node: number; anc: number; side: 'min' | 'max' } | null {
  const { nodes } = tree
  const go = (id: number | null, lo: number | null, hi: number | null): ReturnType<typeof firstViolation> => {
    if (id === null) return null
    const v = nodes[id].val
    if (lo !== null && !(nodes[lo].val < v)) return { node: id, anc: lo, side: 'min' }
    if (hi !== null && !(v < nodes[hi].val)) return { node: id, anc: hi, side: 'max' }
    return go(nodes[id].left, lo, id) ?? go(nodes[id].right, id, hi)
  }
  return go(tree.root, null, null)
}

function rangeFrames(tree: Tree): Frame[] {
  const { nodes, root } = tree
  const frames: Frame[] = []
  const ranges: Record<number, [number, number]> = {}
  const status: Record<number, 'ok' | 'bad'> = {}
  const push = (f: Omit<Frame, 'ranges' | 'status' | 'checked'>) => frames.push({ ...f, ranges: { ...ranges }, status: { ...status }, checked: [] })
  push({ line: 9, cur: null, note: 'Llamamos ok(raíz, −∞, ∞). Cada llamada recibe el intervalo abierto (lo, hi) donde DEBE estar su nodo, según todos sus ancestros, no solo su padre.' })
  let failed = false
  const go = (id: number | null, lo: number, hi: number, from: string): boolean => {
    if (id === null) return true
    const v = nodes[id].val
    ranges[id] = [lo, hi]
    const inside = lo < v && v < hi
    status[id] = inside ? 'ok' : 'bad'
    if (!inside) {
      failed = true
      push({
        line: [5, 6],
        cur: id,
        tone: 'bad',
        note: `${from}ok(${v}, ${fmt(lo)}, ${fmt(hi)}): ${v} no está en (${fmt(lo)}, ${fmt(hi)}). Devolvemos False y el "and" corta todo lo que faltaba.`,
      })
      return false
    }
    push({ line: [4, 5], cur: id, note: `${from}ok(${v}, ${fmt(lo)}, ${fmt(hi)}): ${fmt(lo)} < ${v} < ${fmt(hi)}, bien.` })
    return go(nodes[id].left, lo, v, `Bajamos a la izquierda de ${v}: el máximo pasa a ser ${v}. `) && go(nodes[id].right, v, hi, `Bajamos a la derecha de ${v}: el mínimo pasa a ser ${v}. `)
  }
  const res = go(root, -Infinity, Infinity, '')
  push({
    line: 9,
    cur: null,
    verdict: res,
    tone: res ? 'ok' : 'bad',
    note: res
      ? 'Todos los nodos cayeron dentro de su intervalo: es un BST válido. O(n) tiempo, O(h) de pila.'
      : failed
        ? 'Resultado: False. El intervalo arrastró la restricción del ancestro hasta el nodo que la rompía.'
        : 'Resultado: False.',
  })
  return frames
}

function naiveFrames(tree: Tree): Frame[] {
  const { nodes, root } = tree
  const frames: Frame[] = []
  const status: Record<number, 'ok' | 'bad'> = {}
  const checked: Frame['checked'] = []
  const push = (f: Omit<Frame, 'ranges' | 'status' | 'checked'>) => frames.push({ ...f, ranges: {}, status: { ...status }, checked: [...checked] })
  push({ line: 0, cur: null, note: 'La idea ingenua: un árbol es BST si cada nodo es mayor que su hijo izquierdo y menor que su hijo derecho. Veamos qué compara.' })
  const go = (id: number | null): boolean => {
    if (id === null) return true
    const v = nodes[id].val
    const { left: l, right: r } = nodes[id]
    if (l !== null) {
      const good = nodes[l].val < v
      checked.push({ a: id, b: l, ok: good })
      if (!good) {
        status[l] = 'bad'
        push({ line: [4, 5], cur: id, tone: 'bad', note: `Hijo izquierdo ${nodes[l].val} ≥ ${v}: devolvemos False.` })
        return false
      }
      push({ line: 4, cur: id, note: `¿Hijo izquierdo ${nodes[l].val} < ${v}? Sí.` })
    }
    if (r !== null) {
      const good = nodes[r].val > v
      checked.push({ a: id, b: r, ok: good })
      if (!good) {
        status[r] = 'bad'
        push({ line: [6, 7], cur: id, tone: 'bad', note: `Hijo derecho ${nodes[r].val} ≤ ${v}: devolvemos False.` })
        return false
      }
      push({ line: 6, cur: id, note: `¿Hijo derecho ${nodes[r].val} > ${v}? Sí.` })
    }
    if (l === null && r === null) push({ line: 8, cur: id, note: `${v} es hoja: no hay nada que comparar.` })
    status[id] = 'ok'
    return go(l) && go(r)
  }
  const res = go(root)
  const v = firstViolation(tree)
  let note: string
  let tone: Frame['tone']
  if (res && v) {
    const a = nodes[v.anc].val
    const x = nodes[v.node].val
    status[v.node] = 'bad'
    status[v.anc] = 'bad'
    note = `La versión ingenua dice True, pero el árbol NO es un BST: ${x} está en el subárbol ${v.side === 'min' ? 'derecho' : 'izquierdo'} de ${a}, así que debía ser ${v.side === 'min' ? 'mayor' : 'menor'} que ${a}. Nunca se comparan porque no son padre e hijo.`
    tone = 'warn'
  } else {
    note = res ? 'Dice True y esta vez acierta: en este árbol ninguna restricción salta generaciones.' : 'Dice False y acierta: la violación estaba entre un padre y su hijo.'
    tone = res ? 'ok' : 'bad'
  }
  push({ line: 8, cur: null, verdict: res, tone, note })
  return frames
}

const PRESETS: { label: string; level: (number | null)[] }[] = [
  { label: 'Trampa [5, 1, 7, null, null, 4, 8]', level: [5, 1, 7, null, null, 4, 8] },
  { label: 'Trampa profunda [10, 5, 15, 3, 12, null, 20]', level: [10, 5, 15, 3, 12, null, 20] },
  { label: 'BST válido [8, 4, 12, 2, 6, 10, 14]', level: [8, 4, 12, 2, 6, 10, 14] },
  { label: 'Duplicado [2, 2, 3]', level: [2, 2, 3] },
]

const R = 18
const NL_W = 360

export function ValidateBst() {
  const [preset, setPreset] = useState(0)
  const [mode, setMode] = useState<Mode>('naive')
  const tree = useMemo(() => buildTree(PRESETS[preset].level), [preset])
  const geo = useMemo(() => treeGeometry(tree, { dx: 56, dy: 70, bottom: 46, minW: 300 }), [tree])
  const frames = useMemo(() => (mode === 'range' ? rangeFrames(tree) : naiveFrames(tree)), [tree, mode])
  const player = useStepPlayer(frames.length, { resetKey: `${preset}-${mode}` })
  const f = frames[player.i]
  const { nodes } = tree

  const vals = nodes.map((n) => n.val)
  const vmin = Math.min(...vals) - 2
  const vmax = Math.max(...vals) + 2
  const nx = (v: number) => 24 + ((Math.max(vmin, Math.min(vmax, v)) - vmin) / (vmax - vmin)) * (NL_W - 48)
  const curRange = f.cur !== null ? f.ranges[f.cur] : undefined
  const curVal = f.cur !== null ? nodes[f.cur].val : undefined
  const curOk = f.cur !== null && f.status[f.cur] !== 'bad'

  return (
    <WidgetFrame
      caption="Validar un BST. La versión ingenua solo compara cada nodo con sus hijos y un árbol trampa la engaña. La correcta baja un intervalo (min, max) que se estrecha en cada nivel."
      controls={
        <>
          <label className="vb-pick">
            <span className="seg__label">Árbol</span>
            <select value={preset} onChange={(e) => setPreset(Number(e.target.value))}>
              {PRESETS.map((p, k) => (
                <option key={p.label} value={k}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <Segmented
            label="Solución"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'naive', label: 'Ingenua (solo hijos)' },
              { value: 'range', label: 'Con rangos (min, max)' },
            ]}
          />
        </>
      }
      readout={<StepNote tone={f.tone}>{f.note}</StepNote>}
    >
      <AlgoLayout
        visual={
          <>
            <svg className="vb-svg" viewBox={`0 0 ${geo.W} ${geo.H}`} role="img" aria-label={`Árbol con ${nodes.length} nodos`}>
              {nodes.map((nd) =>
                (['left', 'right'] as const).map((side) => {
                  const c = nd[side]
                  if (c === null) return null
                  const chk = f.checked.find((k) => k.a === nd.id && k.b === c)
                  const x1 = geo.x(nd.id)
                  const y1 = geo.y(nd.id)
                  const x2 = geo.x(c)
                  const y2 = geo.y(c)
                  const len = Math.hypot(x2 - x1, y2 - y1)
                  const ux = (x2 - x1) / len
                  const uy = (y2 - y1) / len
                  return <line key={`${nd.id}-${side}`} className={`vb-edge ${chk ? (chk.ok ? 'is-ok' : 'is-bad') : ''}`} x1={x1 + ux * R} y1={y1 + uy * R} x2={x2 - ux * R} y2={y2 - uy * R} />
                }),
              )}
              {nodes.map((nd) => {
                const st = f.status[nd.id]
                const rg = f.ranges[nd.id]
                return (
                  <g key={nd.id} className={`vb-node ${st ? `is-${st}` : ''} ${nd.id === f.cur ? 'is-cur' : ''}`}>
                    <circle cx={geo.x(nd.id)} cy={geo.y(nd.id)} r={R} />
                    <text x={geo.x(nd.id)} y={geo.y(nd.id) + 5} textAnchor="middle">
                      {nd.val}
                    </text>
                    {rg && (
                      <text x={geo.x(nd.id)} y={geo.y(nd.id) + R + 17} textAnchor="middle" className="vb-range">
                        ({fmt(rg[0])}, {fmt(rg[1])})
                      </text>
                    )}
                  </g>
                )
              })}
            </svg>
            {mode === 'range' ? (
              <div className="vb-line">
                <div className="vb-line__title">intervalo del nodo actual</div>
                <svg viewBox={`0 0 ${NL_W} 62`} role="img" aria-label={curRange ? `Intervalo (${fmt(curRange[0])}, ${fmt(curRange[1])}), valor ${curVal}` : 'Sin nodo actual'}>
                  <line x1={14} x2={NL_W - 14} y1={30} y2={30} className="vb-axis" />
                  {vals.map((v, k) => (
                    <g key={k}>
                      <line x1={nx(v)} x2={nx(v)} y1={25} y2={35} className="vb-tick" />
                      <text x={nx(v)} y={55} textAnchor="middle" className="vb-tick-label">
                        {v}
                      </text>
                    </g>
                  ))}
                  {curRange && (
                    <>
                      <rect
                        x={curRange[0] === -Infinity ? 6 : nx(curRange[0])}
                        width={(curRange[1] === Infinity ? NL_W - 6 : nx(curRange[1])) - (curRange[0] === -Infinity ? 6 : nx(curRange[0]))}
                        y={22}
                        height={16}
                        rx={8}
                        className={`vb-band ${curOk ? 'is-ok' : 'is-bad'}`}
                      />
                      <circle cx={nx(curVal!)} cy={30} r={7} className={`vb-dot ${curOk ? 'is-ok' : 'is-bad'}`} />
                      <text x={nx(curVal!)} y={14} textAnchor="middle" className="vb-dot-label">
                        {curVal}
                      </text>
                    </>
                  )}
                </svg>
              </div>
            ) : (
              <p className="vb-hint">Las aristas pintadas son las únicas comparaciones que hace la versión ingenua: siempre padre contra hijo.</p>
            )}
            {f.verdict !== undefined && (
              <p className={`vb-verdict ${f.tone === 'warn' ? 'is-warn' : f.verdict ? 'is-ok' : 'is-bad'}`}>
                {mode === 'naive' ? 'naive' : 'is_valid_bst'} devuelve <b>{f.verdict ? 'True' : 'False'}</b>
                {f.tone === 'warn' && ' (incorrecto)'}
              </p>
            )}
          </>
        }
        code={<CodeTrace title="Python" lines={mode === 'range' ? RANGE_CODE : NAIVE_CODE} active={f.line} variants={[mode === 'range' ? { label: 'Java', lines: JAVA_RANGE, map: JAVA_RANGE_MAP } : { label: 'Java', lines: JAVA_NAIVE, map: JAVA_NAIVE_MAP }]} />}
      />
      <StepControls player={player} />
    </WidgetFrame>
  )
}
