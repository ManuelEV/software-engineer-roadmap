import { useMemo, useState } from 'react'
import { WidgetFrame } from '../kit'
import { AlgoLayout, CodeTrace, StepControls, StepNote, VarPanel } from './algo-kit'
import { useStepPlayer } from './useStepPlayer'
import './TopoSort.css'

/**
 * Kahn's algorithm (Course Schedule II) on a small course graph. An edge
 * a → b means "a is a prerequisite of b". Frames are recorded by running the
 * real algorithm; with a cycle, some nodes never reach in-degree 0.
 */

const CODE = [
  'def find_order(n, prereqs):',
  '    graph = [[] for _ in range(n)]',
  '    indeg = [0] * n',
  '    for course, pre in prereqs:',
  '        graph[pre].append(course)',
  '        indeg[course] += 1',
  '    q = deque(i for i in range(n) if indeg[i] == 0)',
  '    order = []',
  '    while q:',
  '        u = q.popleft()',
  '        order.append(u)',
  '        for v in graph[u]:',
  '            indeg[v] -= 1',
  '            if indeg[v] == 0:',
  '                q.append(v)',
  '    return order if len(order) == n else []',
]

/** Same algorithm in Java; JAVA_MAP[k] = the Java line(s) for Python line k. */
const JAVA = [
  'int[] findOrder(int n, int[][] prereqs) {',
  '    List<List<Integer>> graph = new ArrayList<>();',
  '    for (int i = 0; i < n; i++) graph.add(new ArrayList<>());',
  '    int[] indeg = new int[n];',
  '    for (int[] p : prereqs) {             // p = {curso, prerrequisito}',
  '        graph.get(p[1]).add(p[0]);',
  '        indeg[p[0]]++;',
  '    }',
  '    Deque<Integer> q = new ArrayDeque<>();',
  '    for (int i = 0; i < n; i++) if (indeg[i] == 0) q.offer(i);',
  '    List<Integer> order = new ArrayList<>();',
  '    while (!q.isEmpty()) {',
  '        int u = q.poll();',
  '        order.add(u);',
  '        for (int v : graph.get(u)) {',
  '            indeg[v]--;',
  '            if (indeg[v] == 0)',
  '                q.offer(v);',
  '        }',
  '    }',
  '    return order.size() == n ? order.stream().mapToInt(Integer::intValue).toArray() : new int[0];',
  '}',
]
const JAVA_MAP = [0, [1, 2], 3, 4, 5, 6, [8, 9], 10, 11, 12, 13, 14, 15, 16, 17, 20]

interface Node {
  label: string
  x: number
  y: number
}
interface GraphPreset {
  label: string
  nodes: Node[]
  /** [pre, course]: pre → course */
  edges: [number, number][]
  height: number
}

const PRESETS: GraphPreset[] = [
  {
    label: 'Plan de carrera (6 cursos)',
    nodes: [
      { label: 'Prog I', x: 90, y: 36 },
      { label: 'Discreta', x: 270, y: 36 },
      { label: 'Prog II', x: 90, y: 126 },
      { label: 'BD', x: 90, y: 216 },
      { label: 'Algoritmos', x: 270, y: 216 },
      { label: 'IA', x: 180, y: 306 },
    ],
    edges: [
      [0, 2],
      [2, 3],
      [2, 4],
      [1, 4],
      [3, 5],
      [4, 5],
    ],
    height: 342,
  },
  {
    label: 'LeetCode: 4 cursos',
    nodes: [
      { label: 'Curso 0', x: 180, y: 36 },
      { label: 'Curso 1', x: 85, y: 126 },
      { label: 'Curso 2', x: 275, y: 126 },
      { label: 'Curso 3', x: 180, y: 216 },
    ],
    edges: [
      [0, 1],
      [0, 2],
      [1, 3],
      [2, 3],
    ],
    height: 252,
  },
  {
    label: 'Con un ciclo',
    nodes: [
      { label: 'Intro', x: 180, y: 36 },
      { label: 'Backend', x: 180, y: 126 },
      { label: 'APIs', x: 85, y: 216 },
      { label: 'Auth', x: 275, y: 216 },
      { label: 'Deploy', x: 275, y: 306 },
    ],
    edges: [
      [0, 1],
      [1, 2],
      [2, 3],
      [3, 1],
      [3, 4],
    ],
    height: 342,
  },
  {
    label: 'Sin dependencias',
    nodes: [
      { label: 'Git', x: 70, y: 36 },
      { label: 'SQL', x: 180, y: 36 },
      { label: 'Linux', x: 290, y: 36 },
    ],
    edges: [],
    height: 80,
  },
]

interface Frame {
  line: number | number[]
  indeg: number[]
  queue: number[]
  order: number[]
  cur: number
  edge?: [number, number]
  enq?: number
  stuck: number[]
  note: string
  tone?: 'ok' | 'bad' | 'warn'
}

function buildFrames(g: GraphPreset): Frame[] {
  const n = g.nodes.length
  const L = (k: number) => g.nodes[k].label
  const graph: number[][] = Array.from({ length: n }, () => [])
  const indeg = Array(n).fill(0)
  const frames: Frame[] = []
  const queue: number[] = []
  const order: number[] = []
  const snap = (f: Omit<Frame, 'indeg' | 'queue' | 'order' | 'stuck'> & { stuck?: number[] }) =>
    frames.push({ stuck: [], ...f, indeg: [...indeg], queue: [...queue], order: [...order] })

  for (const [pre, course] of g.edges) {
    graph[pre].push(course)
    indeg[course]++
  }
  snap({
    line: [1, 2, 3, 4, 5],
    cur: -1,
    note: g.edges.length
      ? `Armamos la lista de adyacencia y contamos los grados de entrada: cuántos prerrequisitos le faltan a cada curso. ${g.nodes
          .map((nd, k) => `${nd.label}: ${indeg[k]}`)
          .join(', ')}.`
      : 'No hay aristas: ningún curso tiene prerrequisitos y todos los grados de entrada son 0.',
  })
  for (let k = 0; k < n; k++) if (indeg[k] === 0) queue.push(k)
  snap({
    line: 6,
    cur: -1,
    note: queue.length
      ? `A la cola van los cursos con grado 0, los que se pueden tomar ya: ${queue.map(L).join(', ')}.`
      : 'Ningún curso tiene grado 0: no hay por dónde empezar. Eso ya delata un ciclo.',
    tone: queue.length ? undefined : 'bad',
  })
  while (queue.length) {
    const u = queue.shift()!
    order.push(u)
    snap({
      line: [9, 10],
      cur: u,
      note: `Sacamos ${L(u)} de la cola y lo agregamos al orden. Ya no le falta nada, así que "dictarlo" libera a los cursos que dependen de él.`,
    })
    for (const v of graph[u]) {
      indeg[v]--
      if (indeg[v] === 0) {
        queue.push(v)
        snap({
          line: [12, 13, 14],
          cur: u,
          edge: [u, v],
          enq: v,
          tone: 'ok',
          note: `Quitamos la arista ${L(u)} → ${L(v)}: a ${L(v)} le quedan 0 prerrequisitos. Entra a la cola.`,
        })
      } else {
        snap({
          line: [12, 13],
          cur: u,
          edge: [u, v],
          note: `Quitamos la arista ${L(u)} → ${L(v)}: a ${L(v)} todavía le ${indeg[v] === 1 ? 'falta 1 prerrequisito' : `faltan ${indeg[v]} prerrequisitos`}. Espera.`,
        })
      }
    }
  }
  const stuck = g.nodes.map((_, k) => k).filter((k) => !order.includes(k))
  if (stuck.length) {
    snap({
      line: 15,
      cur: -1,
      stuck,
      tone: 'bad',
      note: `La cola se vació con ${order.length} de ${n} cursos. ${stuck.map(L).join(', ')} nunca llegaron a grado 0: hay un ciclo (o dependen de uno). Course Schedule responde false; Course Schedule II devuelve [].`,
    })
  } else {
    snap({
      line: 15,
      cur: -1,
      tone: 'ok',
      note: `Procesamos los ${n} cursos: no hay ciclo. Orden válido: ${order.map(L).join(' → ')}. Puede haber otros; cualquiera que respete las flechas sirve. O(V + E).`,
    })
  }
  return frames
}

const NW = 104
const NH = 36
/** point where the segment from b's centre towards a leaves b's box */
function boxEdge(a: Node, b: Node, pad: number) {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const t = Math.min((NW / 2 + pad) / Math.abs(dx || 1e-9), (NH / 2 + pad) / Math.abs(dy || 1e-9))
  return { x: b.x - dx * t, y: b.y - dy * t }
}

export function TopoSort() {
  const [preset, setPreset] = useState(0)
  const g = PRESETS[preset]
  const frames = useMemo(() => buildFrames(g), [g])
  const player = useStepPlayer(frames.length, { resetKey: String(preset), interval: 1000 })
  const f = frames[player.i]
  const prev = frames[player.i - 1]
  const done = new Set(f.order)
  const inQ = new Set(f.queue)
  const stuck = new Set(f.stuck)
  const L = (k: number) => g.nodes[k].label

  return (
    <WidgetFrame
      caption="Orden topológico con el algoritmo de Kahn. Una flecha A → B significa que A es prerrequisito de B. El número junto a cada curso es su grado de entrada: cuántos prerrequisitos le faltan."
      controls={
        <label className="topo-pick">
          <span className="seg__label">Grafo</span>
          <select value={preset} onChange={(e) => setPreset(Number(e.target.value))}>
            {PRESETS.map((p, k) => (
              <option key={p.label} value={k}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      }
      readout={<StepNote tone={f.tone}>{f.note}</StepNote>}
    >
      <AlgoLayout
        visual={
          <>
            <svg className="topo-svg" viewBox={`0 0 360 ${g.height}`} role="img" aria-label={`Grafo de cursos: ${g.edges.map(([a, b]) => `${L(a)} antes de ${L(b)}`).join('; ') || 'sin aristas'}`}>
              {g.edges.map(([a, b]) => {
                const A = g.nodes[a]
                const B = g.nodes[b]
                const s = boxEdge(B, A, 2)
                const e = boxEdge(A, B, 4)
                const ang = Math.atan2(e.y - s.y, e.x - s.x)
                const hx = (d: number, side: number) => e.x - Math.cos(ang) * d + Math.cos(ang + side * Math.PI / 2) * 5
                const hy = (d: number, side: number) => e.y - Math.sin(ang) * d + Math.sin(ang + side * Math.PI / 2) * 5
                const isCur = f.edge && f.edge[0] === a && f.edge[1] === b
                const gone = done.has(a) && !isCur
                return (
                  <g key={`${a}-${b}`} className={`topo-edge ${isCur ? 'is-cur' : ''} ${gone ? 'is-gone' : ''}`}>
                    <line x1={s.x} y1={s.y} x2={e.x - Math.cos(ang) * 6} y2={e.y - Math.sin(ang) * 6} />
                    <polygon points={`${e.x},${e.y} ${hx(10, 1)},${hy(10, 1)} ${hx(10, -1)},${hy(10, -1)}`} />
                  </g>
                )
              })}
              {g.nodes.map((nd, k) => {
                const state = k === f.cur ? 'cur' : stuck.has(k) ? 'stuck' : done.has(k) ? 'done' : inQ.has(k) ? 'queued' : 'idle'
                const changed = !!prev && prev.indeg[k] !== f.indeg[k]
                return (
                  <g key={nd.label} className={`topo-node is-${state} ${f.enq === k ? 'is-enq' : ''}`} transform={`translate(${nd.x} ${nd.y})`}>
                    <rect x={-NW / 2} y={-NH / 2} width={NW} height={NH} rx={7} />
                    <text dy="0.35em" textAnchor="middle">
                      {nd.label}
                    </text>
                    {!done.has(k) && (
                      <g className={`topo-deg ${f.indeg[k] === 0 ? 'is-zero' : ''} ${changed ? 'is-changed' : ''}`} transform={`translate(${NW / 2 - 2} ${-NH / 2 + 1})`}>
                        <circle r={11} />
                        <text dy="0.35em" textAnchor="middle">
                          {f.indeg[k]}
                        </text>
                      </g>
                    )}
                  </g>
                )
              })}
            </svg>
            <div className="topo-lists">
              <div className="topo-list">
                <div className="topo-list__title">q · cola de cursos listos (sale por la izquierda)</div>
                <ol className="topo-list__items" aria-label={`Cola: ${f.queue.map(L).join(', ') || 'vacía'}`}>
                  {f.queue.length === 0 && <li className="topo-list__empty">vacía</li>}
                  {f.queue.map((k, idx) => (
                    <li key={k} className={`topo-chip ${idx === 0 ? 'is-next' : ''} ${f.enq === k ? 'is-enq' : ''}`}>
                      {L(k)}
                    </li>
                  ))}
                </ol>
              </div>
              <div className="topo-list">
                <div className="topo-list__title">order</div>
                <ol className="topo-list__items" aria-label={`Orden: ${f.order.map(L).join(', ') || 'vacío'}`}>
                  {f.order.length === 0 && <li className="topo-list__empty">vacío</li>}
                  {f.order.map((k) => (
                    <li key={k} className={`topo-chip is-done ${k === f.cur ? 'is-cur' : ''}`}>
                      {L(k)}
                    </li>
                  ))}
                </ol>
              </div>
            </div>
            <VarPanel
              vars={[
                { name: 'u', value: f.cur >= 0 ? L(f.cur) : '—', changed: !!prev && prev.cur !== f.cur },
                { name: 'len(order)', value: `${f.order.length} / ${g.nodes.length}` },
              ]}
            />
          </>
        }
        code={<CodeTrace title="Python" lines={CODE} active={f.line} variants={[{ label: 'Java', lines: JAVA, map: JAVA_MAP }]} />}
      />
      <StepControls player={player} />
    </WidgetFrame>
  )
}
