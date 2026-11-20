import { useMemo, useState } from 'react'
import { WidgetFrame, Segmented } from '../kit'
import { AlgoLayout, ArrayView, type CellState, CodeTrace, StepControls, StepNote } from './algo-kit'
import { useStepPlayer } from './useStepPlayer'
import './RecursionTree.css'

/**
 * The decision tree of a backtracking search, revealed as the DFS walks it.
 * The real algorithm (Subsets, Subsets II or Permutations) runs instrumented:
 * every recursive call becomes a tree node, every append/pop of `path` a frame.
 */

type Problem = 'subsets' | 'subsets2' | 'perms'

const CODE: Record<Problem, string[]> = {
  subsets: [
    'def subsets(nums):',
    '    res, path = [], []',
    '    def dfs(start):',
    '        res.append(path[:])  # copia',
    '        for i in range(start, len(nums)):',
    '            path.append(nums[i])   # elegir',
    '            dfs(i + 1)             # explorar',
    '            path.pop()             # deshacer',
    '    dfs(0)',
    '    return res',
  ],
  subsets2: [
    'def subsets_with_dup(nums):',
    '    nums.sort()',
    '    res, path = [], []',
    '    def dfs(start):',
    '        res.append(path[:])',
    '        for i in range(start, len(nums)):',
    '            if i > start and nums[i] == nums[i - 1]:',
    '                continue           # poda: duplicado',
    '            path.append(nums[i])',
    '            dfs(i + 1)',
    '            path.pop()',
    '    dfs(0)',
    '    return res',
  ],
  perms: [
    'def permute(nums):',
    '    res, path = [], []',
    '    used = [False] * len(nums)',
    '    def dfs():',
    '        if len(path) == len(nums):',
    '            res.append(path[:])',
    '            return',
    '        for i in range(len(nums)):',
    '            if used[i]:',
    '                continue',
    '            used[i] = True',
    '            path.append(nums[i])',
    '            dfs()',
    '            path.pop()',
    '            used[i] = False',
    '    dfs()',
    '    return res',
  ],
}

/** The same three searches in Java; JAVA_MAP[p][k] = the Java line(s) for Python line k. */
const JAVA: Record<Problem, string[]> = {
  subsets: [
  'List<List<Integer>> res = new ArrayList<>();',
  'List<Integer> path = new ArrayList<>();',
  '',
  'List<List<Integer>> subsets(int[] nums) {',
  '    dfs(nums, 0);',
  '    return res;',
  '}',
  '',
  'void dfs(int[] nums, int start) {',
  '    res.add(new ArrayList<>(path));    // copia',
  '    for (int i = start; i < nums.length; i++) {',
  '        path.add(nums[i]);             // elegir',
  '        dfs(nums, i + 1);              // explorar',
  '        path.remove(path.size() - 1);  // deshacer',
  '    }',
  '}',
],
  subsets2: [
  'List<List<Integer>> res = new ArrayList<>();',
  'List<Integer> path = new ArrayList<>();',
  '',
  'List<List<Integer>> subsetsWithDup(int[] nums) {',
  '    Arrays.sort(nums);',
  '    dfs(nums, 0);',
  '    return res;',
  '}',
  '',
  'void dfs(int[] nums, int start) {',
  '    res.add(new ArrayList<>(path));',
  '    for (int i = start; i < nums.length; i++) {',
  '        if (i > start && nums[i] == nums[i - 1])',
  '            continue;                  // poda: duplicado',
  '        path.add(nums[i]);',
  '        dfs(nums, i + 1);',
  '        path.remove(path.size() - 1);',
  '    }',
  '}',
],
  perms: [
  'List<List<Integer>> res = new ArrayList<>();',
  'List<Integer> path = new ArrayList<>();',
  'boolean[] used;',
  '',
  'List<List<Integer>> permute(int[] nums) {',
  '    used = new boolean[nums.length];',
  '    dfs(nums);',
  '    return res;',
  '}',
  '',
  'void dfs(int[] nums) {',
  '    if (path.size() == nums.length) {',
  '        res.add(new ArrayList<>(path));',
  '        return;',
  '    }',
  '    for (int i = 0; i < nums.length; i++) {',
  '        if (used[i])',
  '            continue;',
  '        used[i] = true;',
  '        path.add(nums[i]);',
  '        dfs(nums);',
  '        path.remove(path.size() - 1);',
  '        used[i] = false;',
  '    }',
  '}',
],
}
const JAVA_MAP: Record<Problem, (number | number[] | null)[]> = {
  subsets: [3, [0, 1], 8, 9, 10, 11, 12, 13, 4, 5],
  subsets2: [3, 4, [0, 1], 9, 10, 11, 12, 13, 14, 15, 16, 5, 6],
  perms: [4, 0, [2, 5], 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 21, 22, 6, 7],
}

/** code lines per event, per problem */
const LINES: Record<Problem, { start: number[]; record: number | number[]; choose: number[]; undo: number | number[]; skip?: number[]; end: number }> = {
  subsets: { start: [1, 8], record: 3, choose: [5, 6], undo: 7, end: 9 },
  subsets2: { start: [1, 2, 11], record: 4, choose: [8, 9], undo: 10, skip: [6, 7], end: 12 },
  perms: { start: [1, 2, 15], record: [4, 5], choose: [10, 11, 12], undo: [13, 14], end: 16 },
}

interface TNode {
  id: number
  parent: number
  depth: number
  path: number[]
  pruned?: boolean
  x: number
}

interface Frame {
  line: number | number[]
  /** nodes revealed so far (ids < revealed) */
  revealed: number
  cur: number
  path: number[]
  res: number[][]
  recorded: number[]
  note: string
  tone?: 'ok' | 'warn' | 'bad'
}

const fmt = (p: number[]) => `[${p.join(',')}]`

function run(problem: Problem): { nodes: TNode[]; frames: Frame[] } {
  const nums = problem === 'subsets2' ? [1, 2, 2] : [1, 2, 3]
  const L = LINES[problem]
  const nodes: TNode[] = []
  const frames: Frame[] = []
  const res: number[][] = []
  const recorded: number[] = []
  const path: number[] = []
  const add = (parent: number, pruned = false, extra?: number) => {
    const p = extra === undefined ? [...path] : [...path, extra]
    nodes.push({ id: nodes.length, parent, depth: p.length, path: p, pruned, x: 0 })
    return nodes.length - 1
  }
  const snap = (f: Omit<Frame, 'revealed' | 'path' | 'res' | 'recorded'>) => frames.push({ ...f, revealed: nodes.length, path: [...path], res: res.map((r) => [...r]), recorded: [...recorded] })

  const root = add(-1)
  snap({ line: L.start, cur: root, note: `Empezamos en la raíz con path = []. Cada nodo del árbol es una llamada a dfs; cada arista, una decisión.` })

  if (problem === 'perms') {
    const used = nums.map(() => false)
    const dfs = (node: number) => {
      if (path.length === nums.length) {
        res.push([...path])
        recorded.push(node)
        snap({ line: L.record, cur: node, tone: 'ok', note: `path tiene ${nums.length} elementos: es una permutación completa. Guardamos una copia, ${fmt(path)}, y volvemos.` })
        return
      }
      for (let i = 0; i < nums.length; i++) {
        if (used[i]) continue
        used[i] = true
        path.push(nums[i])
        const child = add(node)
        const skipped = nums.filter((_, k) => used[k] && k !== i)
        snap({
          line: L.choose,
          cur: child,
          note: `Elegimos ${nums[i]}${skipped.length ? ` (saltamos ${skipped.join(' y ')}, que ya están en path)` : ''}. path = ${fmt(path)}.`,
        })
        dfs(child)
        path.pop()
        used[i] = false
        snap({ line: L.undo, cur: node, note: `Deshacemos: sacamos ${nums[i]} de path y lo marcamos como libre. Volvemos a ${fmt(path)} para probar la siguiente opción.` })
      }
    }
    dfs(root)
  } else {
    const dfs = (node: number, start: number) => {
      res.push([...path])
      recorded.push(node)
      snap({ line: L.record, cur: node, tone: 'ok', note: `Todo nodo es un subconjunto válido: guardamos una copia de path, ${fmt(path)}. Llevamos ${res.length}.` })
      for (let i = start; i < nums.length; i++) {
        if (problem === 'subsets2' && i > start && nums[i] === nums[i - 1]) {
          const ghost = add(node, true, nums[i])
          snap({
            line: L.skip!,
            cur: ghost,
            tone: 'warn',
            note: `nums[${i}] = ${nums[i]} es igual a nums[${i - 1}] y no es la primera opción de este nivel. Esta rama repetiría ${fmt([...path, nums[i]])}: la podamos sin entrar.`,
          })
          continue
        }
        path.push(nums[i])
        const child = add(node)
        snap({ line: L.choose, cur: child, note: `Elegimos nums[${i}] = ${nums[i]} y bajamos. path = ${fmt(path)}. El hijo solo mira índices desde ${i + 1}: así no repetimos combinaciones.` })
        dfs(child, i + 1)
        path.pop()
        snap({ line: L.undo, cur: node, note: `Volvemos de la rama de ${nums[i]}: path.pop() deja path = ${fmt(path)}, igual que antes de elegir.` })
      }
    }
    dfs(root, 0)
  }
  snap({
    line: L.end,
    cur: -1,
    tone: 'ok',
    note:
      problem === 'perms'
        ? `Fin: ${res.length} permutaciones (3! = 6). El árbol tiene ${nodes.length} nodos; en general hay n! hojas y cada copia cuesta O(n).`
        : problem === 'subsets'
          ? `Fin: ${res.length} subconjuntos (2³ = 8), uno por nodo. En general, 2ⁿ subconjuntos y O(n) por copia: O(n · 2ⁿ).`
          : `Fin: ${res.length} subconjuntos distintos de [1,2,2], sin repetidos. Ordenar y saltar duplicados podó ${nodes.filter((n) => n.pruned).length} ramas.`,
  })

  // tidy layout: leaves left to right, parents centred over their children
  const kids = new Map<number, number[]>()
  nodes.forEach((n) => {
    if (n.parent >= 0) kids.set(n.parent, [...(kids.get(n.parent) ?? []), n.id])
  })
  let leaf = 0
  const place = (id: number): number => {
    const ch = kids.get(id) ?? []
    if (ch.length === 0) {
      nodes[id].x = leaf++
      return nodes[id].x
    }
    const xs = ch.map(place)
    nodes[id].x = (xs[0] + xs[xs.length - 1]) / 2
    return nodes[id].x
  }
  place(root)
  nodes.forEach((n) => (n.x = (n.x + 0.5) / leaf))
  return { nodes, frames }
}

const VW = 420
const ROW = 70
const TOP = 26
const BH = 28
const boxW = (p: number[]) => Math.max(34, p.length * 15 + 20)

export function RecursionTree() {
  const [problem, setProblem] = useState<Problem>('subsets')
  const { nodes, frames } = useMemo(() => run(problem), [problem])
  const player = useStepPlayer(frames.length, { resetKey: problem, interval: 950 })
  const f = frames[player.i]
  const depth = Math.max(...nodes.map((n) => n.depth))
  const VH = TOP * 2 + ROW * depth
  const nums = problem === 'subsets2' ? [1, 2, 2] : [1, 2, 3]

  // the current node and its ancestors = the active path in the tree
  const onPath = new Set<number>()
  for (let k = f.cur; k >= 0; k = nodes[k].parent) onPath.add(k)
  const recorded = new Set(f.recorded)
  const X = (n: TNode) => n.x * VW
  const Y = (n: TNode) => TOP + n.depth * ROW

  const slots = nums.map((_, k) => (k < f.path.length ? f.path[k] : ''))
  const slotStates: Partial<Record<number, CellState>> = {}
  nums.forEach((_, k) => {
    slotStates[k] = k < f.path.length ? (k === f.path.length - 1 ? 'active' : 'window') : 'muted'
  })

  return (
    <WidgetFrame
      caption="El árbol de decisiones de un backtracking, revelado a medida que el DFS lo recorre. La ruta resaltada es la pila de llamadas actual; path crece al elegir y se achica al deshacer."
      controls={
        <Segmented<Problem>
          label="Problema"
          value={problem}
          onChange={setProblem}
          options={[
            { value: 'subsets', label: 'Subsets [1,2,3]' },
            { value: 'subsets2', label: 'Subsets II [1,2,2]' },
            { value: 'perms', label: 'Permutations [1,2,3]' },
          ]}
        />
      }
      readout={<StepNote tone={f.tone}>{f.note}</StepNote>}
    >
      <AlgoLayout
        visual={
          <>
            <svg className="rt-svg" viewBox={`0 0 ${VW} ${VH}`} role="img" aria-label={`Árbol de decisiones con ${f.revealed} nodos visitados`}>
              {nodes.slice(f.revealed).map((n) => (
                <rect key={`g${n.id}`} className="rt-ghost" x={X(n) - boxW(n.path) / 2} y={Y(n) - BH / 2} width={boxW(n.path)} height={BH} rx={6} />
              ))}
              {nodes.slice(0, f.revealed).map((n) => {
                if (n.parent < 0) return null
                const p = nodes[n.parent]
                return <line key={`e${n.id}`} className={`rt-edge ${onPath.has(n.id) ? 'is-on' : ''} ${n.pruned ? 'is-pruned' : ''}`} x1={X(p)} y1={Y(p) + BH / 2} x2={X(n)} y2={Y(n) - BH / 2} />
              })}
              {nodes.slice(0, f.revealed).map((n) => {
                const w = boxW(n.path)
                const cls = n.pruned ? 'is-pruned' : n.id === f.cur ? 'is-cur' : onPath.has(n.id) ? 'is-on' : 'is-seen'
                return (
                  <g key={n.id} className={`rt-node ${cls} ${recorded.has(n.id) ? 'is-rec' : ''}`} transform={`translate(${X(n)} ${Y(n)})`}>
                    <rect x={-w / 2} y={-BH / 2} width={w} height={BH} rx={6} />
                    <text dy="0.35em" textAnchor="middle">
                      {fmt(n.path)}
                    </text>
                  </g>
                )
              })}
            </svg>
            <ArrayView label={`path: ${fmt(f.path)}`} caption="path" values={slots} states={slotStates} maxCell={46} />
            <div className="rt-res">
              <div className="rt-res__title">res · {f.res.length}</div>
              <ol className="rt-res__items" aria-label={`Resultados: ${f.res.map(fmt).join(' ') || 'ninguno'}`}>
                {f.res.length === 0 && <li className="rt-res__empty">vacío</li>}
                {f.res.map((r, k) => (
                  <li key={k} className={`rt-chip ${k === f.res.length - 1 && f.recorded[f.recorded.length - 1] === f.cur ? 'is-new' : ''}`}>
                    {fmt(r)}
                  </li>
                ))}
              </ol>
            </div>
          </>
        }
        code={<CodeTrace title="Python" lines={CODE[problem]} active={f.line} variants={[{ label: 'Java', lines: JAVA[problem], map: JAVA_MAP[problem] }]} />}
      />
      <StepControls player={player} />
    </WidgetFrame>
  )
}
