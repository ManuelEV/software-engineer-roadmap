import { useMemo, useState } from 'react'
import { CircleDot, Flag } from 'lucide-react'
import { WidgetFrame, Segmented, Stat } from '../kit'
import { AlgoLayout, CodeTrace, StepControls, StepNote, VarPanel } from './algo-kit'
import { useStepPlayer } from './useStepPlayer'
import './GridSearch.css'

/**
 * BFS vs DFS on a grid you can edit. Both versions share the same skeleton;
 * the only difference is popleft() on a queue vs pop() on a stack. Frames are
 * recorded by running the real search over the current grid.
 */

const ROWS = 7
const COLS = 7
const N = ROWS * COLS
const DIRS: [number, number][] = [
  [-1, 0],
  [0, 1],
  [1, 0],
  [0, -1],
]

type Mode = 'bfs' | 'dfs'
type Tool = 'wall' | 'start' | 'goal'

interface Grid {
  walls: boolean[]
  start: number
  goal: number
}

const BFS_CODE = [
  'def bfs(grid, start, goal):',
  '    q = deque([start])',
  '    dist = {start: 0}',
  '    while q:',
  '        r, c = q.popleft()      # FIFO',
  '        if (r, c) == goal:',
  '            return dist[(r, c)]',
  '        for dr, dc in DIRS:',
  '            nr, nc = r + dr, c + dc',
  '            if libre(nr, nc) and (nr, nc) not in dist:',
  '                dist[(nr, nc)] = dist[(r, c)] + 1',
  '                q.append((nr, nc))',
  '    return -1',
]
const DFS_CODE = [
  'def dfs(grid, start, goal):',
  '    stack = [start]',
  '    seen = {start}',
  '    while stack:',
  '        r, c = stack.pop()      # LIFO',
  '        if (r, c) == goal:',
  '            return True',
  '        for dr, dc in DIRS:',
  '            nr, nc = r + dr, c + dc',
  '            if libre(nr, nc) and (nr, nc) not in seen:',
  '                seen.add((nr, nc))',
  '                stack.append((nr, nc))',
  '    return False',
]

/** The same searches in Java; both share JAVA_MAP (Python line k -> Java line). */
const JAVA_BFS = [
  'int bfs(char[][] grid, int[] start, int[] goal) {',
  '    Deque<int[]> q = new ArrayDeque<>(List.of(start));',
  '    Map<Integer, Integer> dist = new HashMap<>(Map.of(key(start), 0));',
  '    while (!q.isEmpty()) {',
  '        int[] cur = q.poll();                 // FIFO',
  '        if (Arrays.equals(cur, goal))',
  '            return dist.get(key(cur));',
  '        for (int[] d : DIRS) {',
  '            int[] nb = {cur[0] + d[0], cur[1] + d[1]};',
  '            if (libre(grid, nb) && !dist.containsKey(key(nb))) {',
  '                dist.put(key(nb), dist.get(key(cur)) + 1);',
  '                q.offer(nb);',
  '            }',
  '        }',
  '    }',
  '    return -1;',
  '}',
]
const JAVA_DFS = [
  'boolean dfs(char[][] grid, int[] start, int[] goal) {',
  '    Deque<int[]> stack = new ArrayDeque<>(List.of(start));',
  '    Set<Integer> seen = new HashSet<>(Set.of(key(start)));',
  '    while (!stack.isEmpty()) {',
  '        int[] cur = stack.pop();              // LIFO',
  '        if (Arrays.equals(cur, goal))',
  '            return true;',
  '        for (int[] d : DIRS) {',
  '            int[] nb = {cur[0] + d[0], cur[1] + d[1]};',
  '            if (libre(grid, nb) && !seen.contains(key(nb))) {',
  '                seen.add(key(nb));',
  '                stack.push(nb);',
  '            }',
  '        }',
  '    }',
  '    return false;',
  '}',
]
const JAVA_MAP = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 15]

interface Frame {
  line: number | number[]
  cur: number
  frontier: number[]
  seen: number[]
  popped: number[]
  added: number[]
  label: (number | null)[]
  path: number[]
  note: string
  tone?: 'ok' | 'bad'
}

const rc = (k: number) => [Math.floor(k / COLS), k % COLS] as const
const name = (k: number) => {
  const [r, c] = rc(k)
  return `(${r},${c})`
}

function buildFrames(g: Grid, mode: Mode): Frame[] {
  const frames: Frame[] = []
  const frontier = [g.start]
  const parent = new Map<number, number>([[g.start, -1]])
  const label: (number | null)[] = Array(N).fill(null)
  const popped: number[] = []
  if (mode === 'bfs') label[g.start] = 0
  const dist = new Map<number, number>([[g.start, 0]])
  const snap = (f: Omit<Frame, 'frontier' | 'seen' | 'popped' | 'label'>) =>
    frames.push({ ...f, frontier: [...frontier], seen: [...parent.keys()], popped: [...popped], label: [...label] })
  const ds = mode === 'bfs' ? 'la cola' : 'la pila'

  snap({
    line: [1, 2],
    cur: -1,
    added: [g.start],
    path: [],
    note: `Metemos el origen ${name(g.start)} en ${ds} y lo marcamos como visto. Marcar al encolar (no al sacar) evita meter la misma celda dos veces.`,
  })
  let order = 0
  while (frontier.length) {
    const cur = mode === 'bfs' ? frontier.shift()! : frontier.pop()!
    popped.push(cur)
    order++
    if (mode === 'dfs') label[cur] = order
    if (cur === g.goal) {
      const path: number[] = []
      for (let k = cur; k !== -1; k = parent.get(k)!) path.unshift(k)
      snap({
        line: [5, 6],
        cur,
        added: [],
        path: [],
        tone: 'ok',
        note:
          mode === 'bfs'
            ? `Sacamos ${name(cur)}: ¡es el destino! Está a distancia ${dist.get(cur)}. BFS lo garantiza: sacamos las celdas en orden de distancia.`
            : `Sacamos ${name(cur)}: ¡es el destino! DFS encontró un camino, pero nada garantiza que sea el más corto.`,
      })
      snap({
        line: [5, 6],
        cur,
        added: [],
        path,
        tone: mode === 'bfs' ? 'ok' : undefined,
        note:
          mode === 'bfs'
            ? `Camino más corto: ${path.length - 1} pasos. Para dibujarlo guardamos de qué celda vino cada una y caminamos hacia atrás desde el destino.`
            : `El camino que siguió DFS mide ${path.length - 1} pasos. Cambia a BFS y compara: en una grilla sin pesos, BFS da el mínimo.`,
      })
      return frames
    }
    const added: number[] = []
    const [r, c] = rc(cur)
    for (const [dr, dc] of DIRS) {
      const nr = r + dr
      const nc = c + dc
      if (nr < 0 || nc < 0 || nr >= ROWS || nc >= COLS) continue
      const nk = nr * COLS + nc
      if (g.walls[nk] || parent.has(nk)) continue
      parent.set(nk, cur)
      dist.set(nk, dist.get(cur)! + 1)
      if (mode === 'bfs') label[nk] = dist.get(nk)!
      frontier.push(nk)
      added.push(nk)
    }
    const what = added.length ? `Agregamos ${added.length === 1 ? 'su vecino libre' : `sus ${added.length} vecinos libres`} ${added.map(name).join(', ')}.` : 'No tiene vecinos libres sin visitar.'
    snap({
      line: added.length ? [4, 9, 10, 11] : [4, 9],
      cur,
      added,
      path: [],
      note:
        mode === 'bfs'
          ? `Sacamos ${name(cur)} del frente de la cola (distancia ${dist.get(cur)}). ${what}${added.length ? ` Quedan a distancia ${dist.get(cur)! + 1}, al fondo de la cola.` : ''}`
          : `Sacamos ${name(cur)} del tope de la pila. ${what}${added.length ? ` El último en entrar (${name(added[added.length - 1])}) es el próximo en salir: DFS se mete hondo.` : ' Retrocedemos a lo que quedó en la pila.'}`,
    })
  }
  snap({
    line: 12,
    cur: -1,
    added: [],
    path: [],
    tone: 'bad',
    note: `${mode === 'bfs' ? 'La cola' : 'La pila'} quedó vacía y nunca sacamos el destino: no hay camino. Visitamos ${popped.length} celdas, todas las alcanzables desde el origen.`,
  })
  return frames
}

const fromRows = (rows: string[]): Grid => {
  const walls: boolean[] = []
  let start = 0
  let goal = N - 1
  rows.forEach((row, r) =>
    [...row].forEach((ch, c) => {
      const k = r * COLS + c
      walls[k] = ch === '#'
      if (ch === 'S') start = k
      if (ch === 'G') goal = k
    }),
  )
  return { walls, start, goal }
}

const PRESETS: { label: string; rows: string[] }[] = [
  { label: 'Laberinto', rows: ['S..#...', '.#.#.#.', '.#...#.', '.####.#', '......#', '.##.#..', '...#..G'] },
  { label: 'Sin muros', rows: ['.......', '.......', '.......', 'S.....G', '.......', '.......', '.......'] },
  { label: 'Sin camino', rows: ['S......', '.......', '....###', '....#..', '....#.G', '....#..', '....###'] },
]

export function GridSearch() {
  const [grid, setGrid] = useState<Grid>(() => fromRows(PRESETS[0].rows))
  const [preset, setPreset] = useState(0)
  const [mode, setMode] = useState<Mode>('bfs')
  const [tool, setTool] = useState<Tool>('wall')
  const frames = useMemo(() => buildFrames(grid, mode), [grid, mode])
  const key = `${mode}|${grid.start}|${grid.goal}|${grid.walls.map((w) => (w ? 1 : 0)).join('')}`
  const player = useStepPlayer(frames.length, { resetKey: key, interval: 450 })
  const f = frames[player.i]
  const prev = frames[player.i - 1]

  const seen = new Set(f.seen)
  const popped = new Set(f.popped)
  const front = new Set(f.frontier)
  const added = new Set(f.added)
  const onPath = new Set(f.path)

  const edit = (k: number) => {
    setPreset(-1)
    setGrid((g) => {
      if (tool === 'wall') {
        if (k === g.start || k === g.goal) return g
        const walls = [...g.walls]
        walls[k] = !walls[k]
        return { ...g, walls }
      }
      if ((tool === 'start' && k === g.goal) || (tool === 'goal' && k === g.start)) return g
      const walls = [...g.walls]
      walls[k] = false
      return tool === 'start' ? { ...g, walls, start: k } : { ...g, walls, goal: k }
    })
  }

  const cellLabel = (k: number) => {
    const [r, c] = rc(k)
    const what = k === grid.start ? 'origen' : k === grid.goal ? 'destino' : grid.walls[k] ? 'muro' : onPath.has(k) ? 'camino' : popped.has(k) ? 'visitada' : front.has(k) ? 'en la frontera' : 'libre'
    return `Fila ${r}, columna ${c}: ${what}`
  }

  return (
    <WidgetFrame
      caption="BFS contra DFS en una grilla. Toca las celdas para poner o quitar muros, o mover el origen y el destino. BFS avanza por anillos de distancia y encuentra el camino más corto; DFS se mete hasta el fondo antes de retroceder."
      controls={
        <>
          <Segmented<Mode>
            label="Recorrido"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'bfs', label: 'BFS (cola)' },
              { value: 'dfs', label: 'DFS (pila)' },
            ]}
          />
          <Segmented<Tool>
            label="Al tocar una celda"
            value={tool}
            onChange={setTool}
            options={[
              { value: 'wall', label: 'Muro' },
              { value: 'start', label: 'Origen' },
              { value: 'goal', label: 'Destino' },
            ]}
          />
          <label className="gs-pick">
            <span className="seg__label">Grilla</span>
            <select
              value={preset}
              onChange={(e) => {
                const k = Number(e.target.value)
                if (k >= 0) {
                  setPreset(k)
                  setGrid(fromRows(PRESETS[k].rows))
                }
              }}
            >
              {preset === -1 && <option value={-1}>Tu grilla</option>}
              {PRESETS.map((p, k) => (
                <option key={p.label} value={k}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </>
      }
      readout={<StepNote tone={f.tone}>{f.note}</StepNote>}
    >
      <AlgoLayout
        visual={
          <>
            <div className="gs-grid" role="group" aria-label="Grilla editable" style={{ ['--gs-cols' as string]: COLS }}>
              {grid.walls.map((w, k) => {
                const cls = [
                  'gs-cell',
                  w && 'is-wall',
                  k === grid.start && 'is-start',
                  k === grid.goal && 'is-goal',
                  !w && popped.has(k) && 'is-visited',
                  !w && front.has(k) && 'is-front',
                  !w && added.has(k) && 'is-added',
                  k === f.cur && 'is-cur',
                  onPath.has(k) && 'is-path',
                ]
                  .filter(Boolean)
                  .join(' ')
                return (
                  <button key={k} type="button" className={cls} onClick={() => edit(k)} aria-label={cellLabel(k)}>
                    {k === grid.start ? <CircleDot size={18} aria-hidden="true" /> : k === grid.goal ? <Flag size={18} aria-hidden="true" /> : seen.has(k) && f.label[k] !== null ? <span className="gs-cell__n">{f.label[k]}</span> : null}
                  </button>
                )
              })}
            </div>
            <div className="gs-front">
              <div className="gs-front__title">
                {mode === 'bfs' ? 'cola (sale por la izquierda)' : 'pila (sale por la derecha)'} · {f.frontier.length}
              </div>
              <ol className="gs-front__items">
                {f.frontier.length === 0 && <li className="gs-front__empty">vacía</li>}
                {f.frontier.map((k, idx) => {
                  const next = mode === 'bfs' ? idx === 0 : idx === f.frontier.length - 1
                  return (
                    <li key={k} className={`gs-chip ${added.has(k) ? 'is-added' : ''} ${next ? 'is-next' : ''}`}>
                      {name(k)}
                    </li>
                  )
                })}
              </ol>
            </div>
            <div className="gs-stats">
              <Stat label="celdas visitadas" value={f.popped.length} />
              <Stat label="largo del camino" value={f.path.length ? f.path.length - 1 : '—'} tone={f.path.length ? (mode === 'bfs' ? 'ok' : 'warn') : undefined} />
              <VarPanel vars={[{ name: 'actual', value: f.cur >= 0 ? name(f.cur) : '—', changed: !!prev && prev.cur !== f.cur }]} />
            </div>
            <p className="gs-legend">
              Número en la celda: {mode === 'bfs' ? 'distancia al origen (BFS la conoce al encolar).' : 'orden en que DFS la sacó de la pila.'} Vecinos en orden arriba, derecha, abajo, izquierda.
            </p>
          </>
        }
        code={<CodeTrace
            title="Python"
            lines={mode === 'bfs' ? BFS_CODE : DFS_CODE}
            active={f.line}
            variants={[{ label: 'Java', lines: mode === 'bfs' ? JAVA_BFS : JAVA_DFS, map: JAVA_MAP }]}
          />}
      />
      <StepControls player={player} />
    </WidgetFrame>
  )
}
