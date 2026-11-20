import { useMemo, useState } from 'react'
import { Segmented, WidgetFrame } from '../kit'
import { AlgoLayout, CodeTrace, type CodeVariant, StepControls, StepNote } from './algo-kit'
import { useStepPlayer } from './useStepPlayer'
import { buildTree, type Tree, treeGeometry } from './tree-model'
import './TreeTraversal.css'

/**
 * Tree traversals step by step: recursive pre/in/post-order (drawing the call
 * stack) and BFS by levels (drawing the queue). The three DFS orders run the same
 * recursion; only the line that appends to the output moves. Frames come from
 * running the traversal on the chosen tree.
 */

type Mode = 'pre' | 'in' | 'post' | 'bfs'
type Act = 'visit' | 'left' | 'right'

const FN: Record<Exclude<Mode, 'bfs'>, string> = { pre: 'preorder', in: 'inorder', post: 'postorder' }
const ORDER: Record<Exclude<Mode, 'bfs'>, Act[]> = {
  pre: ['visit', 'left', 'right'],
  in: ['left', 'visit', 'right'],
  post: ['left', 'right', 'visit'],
}

function dfsCode(mode: Exclude<Mode, 'bfs'>) {
  const fn = FN[mode]
  const line: Record<Act, string> = {
    visit: '    out.append(node.val)  # visitar',
    left: `    ${fn}(node.left, out)`,
    right: `    ${fn}(node.right, out)`,
  }
  return [`def ${fn}(node, out):`, '    if node is None:', '        return', ...ORDER[mode].map((a) => line[a])]
}

const JAVA_BFS = [
  'List<List<Integer>> levelOrder(TreeNode root) {',
  '    var out = new ArrayList<List<Integer>>();',
  '    Deque<TreeNode> q = new ArrayDeque<>();',
  '    q.offer(root);',
  '    while (!q.isEmpty()) {',
  '        var level = new ArrayList<Integer>();',
  '        for (int n = q.size(); n > 0; n--) {',
  '            TreeNode node = q.poll();',
  '            level.add(node.val);',
  '            if (node.left != null)',
  '                q.offer(node.left);',
  '            if (node.right != null)',
  '                q.offer(node.right);',
  '        }',
  '        out.add(level);',
  '    }',
  '    return out;',
  '}',
]
const JAVA_BFS_MAP = [0, [1, 2, 3], 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 16]

/** The recursive DFS in Java, lined up with dfsCode(mode). */
function javaDfs(mode: Exclude<Mode, 'bfs'>): CodeVariant {
  const fn = FN[mode]
  const line: Record<Act, string> = {
    visit: '    out.add(node.val);  // visitar',
    left: `    ${fn}(node.left);`,
    right: `    ${fn}(node.right);`,
  }
  return {
    label: 'Java',
    lines: ['List<Integer> out = new ArrayList<>();', '', `void ${fn}(TreeNode node) {`, '    if (node == null)', '        return;', ...ORDER[mode].map((a) => line[a]), '}'],
    map: [2, 3, 4, 5, 6, 7],
  }
}

const BFS_CODE = [
  'def level_order(root):',
  '    q, out = deque([root]), []',
  '    while q:',
  '        level = []',
  '        for _ in range(len(q)):',
  '            node = q.popleft()',
  '            level.append(node.val)',
  '            if node.left:',
  '                q.append(node.left)',
  '            if node.right:',
  '                q.append(node.right)',
  '        out.append(level)',
  '    return out',
]

interface Frame {
  line: number | number[]
  cur: number | null
  stack: number[]
  queue: number[]
  /** output: one flat group for DFS, one group per level for BFS */
  out: number[][]
  visited: number[]
  edge?: [number, number]
  note: string
  tone?: 'ok'
}

function dfsFrames(tree: Tree, mode: Exclude<Mode, 'bfs'>): Frame[] {
  const { nodes, root } = tree
  const fn = FN[mode]
  const frames: Frame[] = []
  const stack: number[] = []
  const out: number[] = []
  const visited: number[] = []
  let returned: number | null = null
  let maxDepth = 0
  const lineOf = (a: Act) => 3 + ORDER[mode].indexOf(a)
  const push = (f: Pick<Frame, 'line' | 'cur' | 'edge' | 'note' | 'tone'>) => {
    let note = f.note
    if (returned !== null && stack.length) note = `Terminó ${fn}(${nodes[returned].val}) y volvemos a ${nodes[stack[stack.length - 1]].val}. ${note}`
    returned = null
    frames.push({ ...f, note, stack: [...stack], queue: [], out: [[...out]], visited: [...visited] })
  }
  const visitNote = (id: number) => {
    const v = nodes[id].val
    const leaf = nodes[id].left === null && nodes[id].right === null
    const base = {
      pre: `Visitamos ${v} antes que a sus hijos: sale ${v}.`,
      in: `El subárbol izquierdo de ${v} ya terminó (o no existe): visitamos ${v} entre sus dos subárboles.`,
      post: `Los dos subárboles de ${v} ya terminaron: recién ahora visitamos ${v}.`,
    }[mode]
    return leaf ? `${base} Es hoja: sus llamadas con None vuelven enseguida (caso base).` : base
  }
  const rec = (id: number) => {
    stack.push(id)
    maxDepth = Math.max(maxDepth, stack.length)
    for (const a of ORDER[mode]) {
      if (a === 'visit') {
        out.push(nodes[id].val)
        visited.push(id)
        push({ line: lineOf('visit'), cur: id, note: visitNote(id) })
      } else {
        const child = nodes[id][a]
        if (child === null) continue
        push({ line: lineOf(a), cur: id, edge: [id, child], note: `Bajamos a la ${a === 'left' ? 'izquierda' : 'derecha'} de ${nodes[id].val}: llamamos ${fn}(${nodes[child].val}) y apilamos la llamada.` })
        rec(child)
      }
    }
    stack.pop()
    returned = id
  }
  if (root !== null) rec(root)
  const sorted = out.every((v, k) => k === 0 || out[k - 1] < v)
  frames.push({
    line: -1,
    cur: null,
    stack: [],
    queue: [],
    out: [[...out]],
    visited: [...visited],
    tone: 'ok',
    note: `Salida: [${out.join(', ')}]. Cada nodo se visitó una vez: O(n) tiempo. La pila llegó a ${maxDepth} ${maxDepth === 1 ? 'llamada' : 'llamadas'}, la altura del árbol: O(h) memoria.${mode === 'in' && sorted ? ' Y como es un BST, el inorden sale ordenado.' : ''}`,
  })
  return frames
}

function bfsFrames(tree: Tree): Frame[] {
  const { nodes, root } = tree
  const frames: Frame[] = []
  const queue: number[] = root === null ? [] : [root]
  const levels: number[][] = []
  const visited: number[] = []
  let level: number[] = []
  const push = (f: Pick<Frame, 'line' | 'cur' | 'note' | 'tone'>) =>
    frames.push({ ...f, stack: [], queue: [...queue], out: [...levels.map((l) => [...l]), ...(level.length ? [[...level]] : [])], visited: [...visited] })
  push({ line: 1, cur: null, note: 'La cola empieza con la raíz. Una cola es FIFO: lo primero que entra es lo primero que sale, y eso hace que los nodos salgan nivel por nivel.' })
  let depth = 0
  while (queue.length) {
    const size = queue.length
    level = []
    push({ line: [2, 3, 4], cur: null, note: `En la cola hay ${size} ${size === 1 ? 'nodo' : 'nodos'}: exactamente el nivel ${depth}. Fijamos ese número antes del for para no mezclar este nivel con el siguiente.` })
    for (let k = 0; k < size; k++) {
      const id = queue.shift()!
      level.push(nodes[id].val)
      visited.push(id)
      push({ line: [5, 6], cur: id, note: `Sacamos ${nodes[id].val} del frente de la cola y lo agregamos al nivel ${depth}.` })
      const kids = [nodes[id].left, nodes[id].right].filter((c): c is number => c !== null)
      if (kids.length) {
        queue.push(...kids)
        push({ line: [7, 8, 9, 10], cur: id, note: `Encolamos ${kids.map((c) => nodes[c].val).join(' y ')} al final: saldrán después de todo el nivel ${depth}.` })
      }
    }
    levels.push(level)
    level = []
    push({ line: 11, cur: null, note: `Nivel ${depth} completo: [${levels[levels.length - 1].join(', ')}].` })
    depth++
  }
  push({ line: 12, cur: null, tone: 'ok', note: `Salida por niveles: ${JSON.stringify(levels)}. O(n) tiempo; la cola llega a tener el nivel más ancho: O(w) memoria, hasta n/2 en un árbol completo.` })
  return frames
}

const PRESETS: { label: string; level: (number | null)[] }[] = [
  { label: 'BST [4, 2, 6, 1, 3, 5, 7]', level: [4, 2, 6, 1, 3, 5, 7] },
  { label: '[3, 9, 20, null, null, 15, 7]', level: [3, 9, 20, null, null, 15, 7] },
  { label: 'BST de 9 nodos', level: [8, 3, 10, 1, 6, null, 14, null, null, 4, 7, 13] },
  { label: 'Degenerado [1, null, 2, null, 3, …]', level: [1, null, 2, null, 3, null, 4] },
]

const R = 18

export function TreeTraversal() {
  const [preset, setPreset] = useState(0)
  const [mode, setMode] = useState<Mode>('pre')
  const tree = useMemo(() => buildTree(PRESETS[preset].level), [preset])
  const geo = useMemo(() => treeGeometry(tree, { dx: 48, dy: 60, minW: 300 }), [tree])
  const frames = useMemo(() => (mode === 'bfs' ? bfsFrames(tree) : dfsFrames(tree, mode)), [tree, mode])
  const player = useStepPlayer(frames.length, { resetKey: `${preset}-${mode}` })
  const f = frames[player.i]
  const { nodes } = tree
  const code = mode === 'bfs' ? BFS_CODE : dfsCode(mode)
  const fn = mode === 'bfs' ? '' : FN[mode]

  return (
    <WidgetFrame
      caption="Recorridos de un árbol binario. Pre, in y post orden son la misma recursión: solo cambia en qué momento se visita el nodo. BFS usa una cola y sale por niveles."
      controls={
        <>
          <label className="tt-pick">
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
            label="Recorrido"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'pre', label: 'Pre' },
              { value: 'in', label: 'In' },
              { value: 'post', label: 'Post' },
              { value: 'bfs', label: 'BFS' },
            ]}
          />
        </>
      }
      readout={<StepNote tone={f.tone}>{f.note}</StepNote>}
    >
      <AlgoLayout
        visual={
          <>
            <svg className="tt-svg" viewBox={`0 0 ${geo.W} ${geo.H}`} role="img" aria-label={`Árbol con ${nodes.length} nodos. Nodo actual: ${f.cur === null ? 'ninguno' : nodes[f.cur].val}.`}>
              {nodes.map((nd) =>
                (['left', 'right'] as const).map((side) => {
                  const c = nd[side]
                  if (c === null) return null
                  const on = f.edge && f.edge[0] === nd.id && f.edge[1] === c
                  const x1 = geo.x(nd.id)
                  const y1 = geo.y(nd.id)
                  const x2 = geo.x(c)
                  const y2 = geo.y(c)
                  const len = Math.hypot(x2 - x1, y2 - y1)
                  const ux = (x2 - x1) / len
                  const uy = (y2 - y1) / len
                  return <line key={`${nd.id}-${side}`} className={`tt-edge ${on ? 'is-on' : ''}`} x1={x1 + ux * R} y1={y1 + uy * R} x2={x2 - ux * R} y2={y2 - uy * R} />
                }),
              )}
              {nodes.map((nd) => {
                const order = f.visited.indexOf(nd.id)
                const cls = [
                  'tt-node',
                  nd.id === f.cur ? 'is-cur' : '',
                  order >= 0 ? 'is-visited' : '',
                  f.stack.includes(nd.id) && nd.id !== f.cur ? 'is-stack' : '',
                  f.queue.includes(nd.id) ? 'is-queued' : '',
                ].join(' ')
                return (
                  <g key={nd.id} className={cls}>
                    <circle cx={geo.x(nd.id)} cy={geo.y(nd.id)} r={R} />
                    <text x={geo.x(nd.id)} y={geo.y(nd.id) + 5} textAnchor="middle" className="tt-val">
                      {nd.val}
                    </text>
                    {order >= 0 && (
                      <text x={geo.x(nd.id) + R + 2} y={geo.y(nd.id) - R + 4} className="tt-order">
                        {order + 1}
                      </text>
                    )}
                  </g>
                )
              })}
            </svg>
            <div className="tt-side">
              {mode === 'bfs' ? (
                <div className="tt-box">
                  <div className="tt-box__title">cola (frente a la izquierda)</div>
                  <div className="tt-queue" aria-label={`Cola: ${f.queue.map((q) => nodes[q].val).join(', ') || 'vacía'}`}>
                    {f.queue.length === 0 && <span className="tt-empty">vacía</span>}
                    {f.queue.map((q) => (
                      <span key={q} className="tt-chip">
                        {nodes[q].val}
                      </span>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="tt-box">
                  <div className="tt-box__title">pila de llamadas (tope arriba)</div>
                  <ol className="tt-stack" aria-label={`Pila: ${f.stack.map((s) => nodes[s].val).join(', ') || 'vacía'}`}>
                    {f.stack.length === 0 && <li className="tt-empty">vacía</li>}
                    {[...f.stack].reverse().map((s, k) => (
                      <li key={s} className={k === 0 ? 'is-top' : ''}>
                        {fn}({nodes[s].val})
                      </li>
                    ))}
                  </ol>
                </div>
              )}
              <div className="tt-box">
                <div className="tt-box__title">salida</div>
                <div className="tt-out">
                  {f.out.every((g) => g.length === 0) && <span className="tt-empty">[ ]</span>}
                  {f.out
                    .filter((g) => g.length)
                    .map((g, k) => (
                      <span key={k} className={mode === 'bfs' ? 'tt-level' : 'tt-flat'}>
                        {g.map((v, j) => (
                          <span key={j} className="tt-chip is-out">
                            {v}
                          </span>
                        ))}
                      </span>
                    ))}
                </div>
              </div>
            </div>
          </>
        }
        code={<CodeTrace title="Python" lines={code} active={f.line} variants={[mode === 'bfs' ? { label: 'Java', lines: JAVA_BFS, map: JAVA_BFS_MAP } : javaDfs(mode)]} />}
      />
      <StepControls player={player} />
    </WidgetFrame>
  )
}
