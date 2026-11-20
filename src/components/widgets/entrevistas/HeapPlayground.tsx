import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { WidgetFrame } from '../kit'
import { AlgoLayout, ArrayView, type CellState, CodeTrace, type Pointer, StepControls, StepNote, VarPanel } from './algo-kit'
import { useStepPlayer } from './useStepPlayer'
import './HeapPlayground.css'

/**
 * A min-heap drawn twice: as the tree it represents and as the array it lives
 * in. Insert, extract-min and heapify are run for real and recorded as frames
 * (sift-up / sift-down with every comparison and swap).
 */

interface Item {
  id: number
  v: number
}

type Op = { kind: 'heapify'; arr: number[] } | { kind: 'push'; x: number } | { kind: 'pop' }
type CodeKind = 'push' | 'pop' | 'heapify'

interface Frame {
  heap: Item[]
  states: Partial<Record<number, CellState>>
  pointers: Pointer[]
  line: number | number[]
  note: string
  tone?: 'ok' | 'warn' | 'bad'
  out?: number
  floating?: Item
  swaps: number
}

const SIFT_DOWN = [
  'def sift_down(heap, i):',
  '    n = len(heap)',
  '    while True:',
  '        l, r = 2 * i + 1, 2 * i + 2',
  '        m = i',
  '        if l < n and heap[l] < heap[m]: m = l',
  '        if r < n and heap[r] < heap[m]: m = r',
  '        if m == i:',
  '            return',
  '        heap[i], heap[m] = heap[m], heap[i]',
  '        i = m',
]

const CODE: Record<CodeKind, string[]> = {
  push: [
    'def push(heap, x):',
    '    heap.append(x)',
    '    i = len(heap) - 1',
    '    while i > 0:',
    '        p = (i - 1) // 2',
    '        if heap[p] <= heap[i]:',
    '            break',
    '        heap[p], heap[i] = heap[i], heap[p]',
    '        i = p',
  ],
  pop: ['def pop(heap):', '    top = heap[0]', '    last = heap.pop()', '    if heap:', '        heap[0] = last', '        sift_down(heap, 0)', '    return top', '', ...SIFT_DOWN],
  heapify: ['def heapify(a):', '    for i in range(len(a) // 2 - 1, -1, -1):', '        sift_down(a, i)', '', ...SIFT_DOWN],
}
/** The same code in Java; JAVA_MAP[kind][k] = the Java line(s) for Python line k. */
const JAVA: Record<CodeKind, string[]> = {
  push: [
  'void push(List<Integer> heap, int x) {',
  '    heap.add(x);',
  '    int i = heap.size() - 1;',
  '    while (i > 0) {',
  '        int p = (i - 1) / 2;',
  '        if (heap.get(p) <= heap.get(i)) break;',
  '        Collections.swap(heap, p, i);',
  '        i = p;',
  '    }',
  '}',
],
  pop: [
  'int pop(List<Integer> heap) {',
  '    int top = heap.get(0);',
  '    int last = heap.remove(heap.size() - 1);',
  '    if (!heap.isEmpty()) {',
  '        heap.set(0, last);',
  '        siftDown(heap, 0);',
  '    }',
  '    return top;',
  '}',
  '',
  'void siftDown(List<Integer> heap, int i) {',
  '    int n = heap.size();',
  '    while (true) {',
  '        int l = 2 * i + 1, r = 2 * i + 2;',
  '        int m = i;',
  '        if (l < n && heap.get(l) < heap.get(m)) m = l;',
  '        if (r < n && heap.get(r) < heap.get(m)) m = r;',
  '        if (m == i) return;',
  '        Collections.swap(heap, i, m);',
  '        i = m;',
  '    }',
  '}',
],
  heapify: [
  'void heapify(List<Integer> a) {',
  '    for (int i = a.size() / 2 - 1; i >= 0; i--) {',
  '        siftDown(a, i);',
  '    }',
  '}',
  '',
  'void siftDown(List<Integer> heap, int i) {',
  '    int n = heap.size();',
  '    while (true) {',
  '        int l = 2 * i + 1, r = 2 * i + 2;',
  '        int m = i;',
  '        if (l < n && heap.get(l) < heap.get(m)) m = l;',
  '        if (r < n && heap.get(r) < heap.get(m)) m = r;',
  '        if (m == i) return;',
  '        Collections.swap(heap, i, m);',
  '        i = m;',
  '    }',
  '}',
],
}
const JAVA_MAP: Record<CodeKind, (number | number[] | null)[]> = {
  push: [0, 1, 2, 3, 4, 5, 5, 6, 7],
  pop: [0, 1, 2, 3, 4, 5, 7, null, 10, 11, 12, 13, 14, 15, 16, 17, 17, 18, 19],
  heapify: [0, 1, 2, null, 6, 7, 8, 9, 10, 11, 12, 13, 13, 14, 15],
}
/** index of `def sift_down` inside each code listing */
const SD_BASE: Record<'pop' | 'heapify', number> = { pop: 8, heapify: 4 }

const MAX = 15

function siftDown(h: Item[], start: number, base: number, push: (f: Omit<Frame, 'swaps'>) => void, count: { swaps: number }) {
  let i = start
  const n = h.length
  for (;;) {
    const l = 2 * i + 1
    const r = 2 * i + 2
    if (l >= n) {
      push({
        heap: [...h],
        states: { [i]: 'active' },
        pointers: [{ at: i, label: 'i' }],
        line: [base + 7, base + 8],
        note: `El nodo ${h[i].v} (índice ${i}) no tiene hijos: ${l} ya está fuera del arreglo. Se queda ahí.`,
      })
      return
    }
    let m = i
    if (h[l].v < h[m].v) m = l
    if (r < n && h[r].v < h[m].v) m = r
    const kids = r < n ? `hijos ${h[l].v} (índice ${l}) y ${h[r].v} (índice ${r})` : `único hijo ${h[l].v} (índice ${l})`
    const states: Partial<Record<number, CellState>> = { [i]: 'active', [l]: 'compare' }
    if (r < n) states[r] = 'compare'
    push({
      heap: [...h],
      states,
      pointers: [{ at: i, label: 'i' }, { at: m, label: 'm' }],
      line: [base + 3, base + 5, base + 6],
      note:
        m === i
          ? `Comparamos ${h[i].v} con sus ${kids}. Ninguno es menor: m sigue siendo ${i}.`
          : `Comparamos ${h[i].v} con sus ${kids}. El menor de los tres es ${h[m].v}: m = ${m}.`,
    })
    if (m === i) {
      push({
        heap: [...h],
        states: { [i]: 'found' },
        pointers: [{ at: i, label: 'i' }],
        line: [base + 7, base + 8],
        tone: 'ok',
        note: `${h[i].v} ya es menor o igual que sus hijos: la propiedad de heap se cumple desde aquí hacia abajo.`,
      })
      return
    }
    ;[h[i], h[m]] = [h[m], h[i]]
    count.swaps++
    push({
      heap: [...h],
      states: { [i]: 'found', [m]: 'active' },
      pointers: [{ at: m, label: 'i' }],
      line: [base + 9, base + 10],
      note: `Intercambiamos: ${h[i].v} sube al índice ${i} y ${h[m].v} baja al ${m}. Bajamos un nivel; como mucho hay log₂(n) niveles.`,
    })
    i = m
  }
}

function buildFrames(base: Item[], op: Op, nextId: number): Frame[] {
  const frames: Frame[] = []
  const count = { swaps: 0 }
  const push = (f: Omit<Frame, 'swaps'>) => frames.push({ ...f, swaps: count.swaps })

  if (op.kind === 'heapify') {
    const h = op.arr.map((v, k) => ({ id: k, v }))
    const n = h.length
    const first = Math.floor(n / 2) - 1
    push({
      heap: [...h],
      states: {},
      pointers: [],
      line: 0,
      note: `Partimos de un arreglo cualquiera: [${op.arr.join(', ')}]. Todavía no es un heap. Las hojas (índices ${first + 1} a ${n - 1}) ya son heaps de un solo elemento.`,
    })
    for (let i = first; i >= 0; i--) {
      const states: Partial<Record<number, CellState>> = { [i]: 'active' }
      for (let k = i + 1; k < n; k++) states[k] = 'done'
      push({
        heap: [...h],
        states,
        pointers: [{ at: i, label: 'i' }],
        line: 1,
        note: `i = ${i}: los subárboles de sus hijos ya son heaps, así que basta con hundir ${h[i].v} hasta su lugar.`,
      })
      siftDown(h, i, SD_BASE.heapify, push, count)
    }
    push({
      heap: [...h],
      states: Object.fromEntries(h.map((_, k) => [k, 'done' as CellState])),
      pointers: [],
      line: 2,
      tone: 'ok',
      note: `Listo: un heap válido con ${count.swaps} intercambios. Recorrer de abajo hacia arriba cuesta O(n) en total, no O(n log n): la mayoría de los nodos está cerca del fondo y baja poco.`,
    })
    return frames
  }

  const h = [...base]
  if (op.kind === 'push') {
    const item = { id: nextId, v: op.x }
    h.push(item)
    let i = h.length - 1
    push({
      heap: [...h],
      states: { [i]: 'active' },
      pointers: [{ at: i, label: 'i' }],
      line: [1, 2],
      note: `Agregamos ${op.x} al final del arreglo (índice ${i}): es la primera hoja libre, así el árbol sigue completo.`,
    })
    for (;;) {
      if (i === 0) {
        push({ heap: [...h], states: { 0: 'found' }, pointers: [{ at: 0, label: 'i' }], line: 3, tone: 'ok', note: `${op.x} llegó a la raíz: es el nuevo mínimo del heap.` })
        break
      }
      const p = Math.floor((i - 1) / 2)
      push({
        heap: [...h],
        states: { [i]: 'active', [p]: 'compare' },
        pointers: [{ at: i, label: 'i' }, { at: p, label: 'p' }],
        line: [4, 5],
        note: `Su padre está en (${i} − 1) // 2 = ${p} y vale ${h[p].v}. ¿${h[p].v} ≤ ${op.x}?`,
      })
      if (h[p].v <= h[i].v) {
        push({
          heap: [...h],
          states: { [i]: 'found', [p]: 'done' },
          pointers: [{ at: i, label: 'i' }],
          line: 6,
          tone: 'ok',
          note: `Sí: el padre ${h[p].v} no es mayor, la propiedad de heap se cumple. Terminamos en ${count.swaps} intercambio${count.swaps === 1 ? '' : 's'}.`,
        })
        break
      }
      ;[h[p], h[i]] = [h[i], h[p]]
      count.swaps++
      push({
        heap: [...h],
        states: { [p]: 'active', [i]: 'done' },
        pointers: [{ at: p, label: 'i' }],
        line: [7, 8],
        note: `No: ${op.x} es menor que ${h[i].v}, así que los intercambiamos y ${op.x} sube un nivel (sift-up).`,
      })
      i = p
    }
    return frames
  }

  // pop
  if (h.length === 0) {
    push({ heap: [], states: {}, pointers: [], line: 0, tone: 'bad', note: 'El heap está vacío: no hay mínimo que extraer.' })
    return frames
  }
  const top = h[0]
  push({ heap: [...h], states: { 0: 'found' }, pointers: [{ at: 0, label: 'i' }], line: 1, note: `El mínimo siempre está en la raíz, heap[0] = ${top.v}. Leerlo cuesta O(1).` })
  const last = h.pop()!
  push({
    heap: [...h],
    states: { 0: 'found' },
    pointers: [],
    floating: last,
    line: 2,
    note: `No podemos dejar un hueco arriba. Sacamos el último elemento (${last.v}): quitarlo del final es O(1) y el árbol sigue completo.`,
  })
  if (h.length === 0) {
    push({ heap: [], states: {}, pointers: [], out: top.v, line: [3, 6], tone: 'ok', note: `Era el único elemento: devolvemos ${top.v} y el heap queda vacío.` })
    return frames
  }
  h[0] = last
  push({
    heap: [...h],
    states: { 0: 'active' },
    pointers: [{ at: 0, label: 'i' }],
    out: top.v,
    line: [4, 5],
    note: `Ponemos ${last.v} en la raíz. Ahora probablemente rompe la propiedad de heap: hay que hundirlo (sift-down).`,
  })
  siftDown(h, 0, SD_BASE.pop, (f) => push({ ...f, out: top.v }), count)
  push({
    heap: [...h],
    states: { 0: 'found' },
    pointers: [],
    out: top.v,
    line: 6,
    tone: 'ok',
    note: `Devolvemos ${top.v}. El nuevo mínimo es ${h[0].v}. Costo: un recorrido de la raíz a una hoja, O(log n).`,
  })
  return frames
}

interface Preset {
  label: string
  base: number[]
  op: Op
}

const PRESETS: Preset[] = [
  { label: 'Heapify de [9, 4, 7, 1, 8, 2, 6, 5]', base: [], op: { kind: 'heapify', arr: [9, 4, 7, 1, 8, 2, 6, 5] } },
  { label: 'Insertar 0 en [1, 3, 2, 7, 4, 5]', base: [1, 3, 2, 7, 4, 5], op: { kind: 'push', x: 0 } },
  { label: 'Insertar 6 en [1, 3, 2, 7, 4, 5]', base: [1, 3, 2, 7, 4, 5], op: { kind: 'push', x: 6 } },
  { label: 'Extraer de [1, 3, 2, 7, 4, 5, 6]', base: [1, 3, 2, 7, 4, 5, 6], op: { kind: 'pop' } },
  { label: 'Extraer de [5] (un solo elemento)', base: [5], op: { kind: 'pop' } },
]

interface Run {
  key: number
  preset: number
  base: Item[]
  op: Op
}

const runFromPreset = (k: number, key: number): Run => ({ key, preset: k, base: PRESETS[k].base.map((v, id) => ({ id, v })), op: PRESETS[k].op })
const codeKind = (op: Op): CodeKind => op.kind

/* ── tree geometry (viewBox units) ── */
const W = 480
const ROW = 64
const TOP = 30
const R = 19
const pos = (k: number) => {
  const d = Math.floor(Math.log2(k + 1))
  const p = k - (2 ** d - 1)
  return { x: (p + 0.5) * (W / 2 ** d), y: TOP + d * ROW }
}
const H = TOP * 2 + ROW * 3

function HeapTree({ heap, states }: { heap: Item[]; states: Partial<Record<number, CellState>> }) {
  const reduced = useReducedMotion()
  return (
    <svg className="hp-tree" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Árbol del heap: ${heap.map((h) => h.v).join(', ') || 'vacío'}`}>
      {heap.map((_, k) => {
        if (k === 0) return null
        const a = pos(Math.floor((k - 1) / 2))
        const b = pos(k)
        return <line key={`e${k}`} className="hp-edge" x1={a.x} y1={a.y} x2={b.x} y2={b.y} />
      })}
      {heap.map((it, k) => {
        const p = pos(k)
        return (
          <motion.g
            key={it.id}
            className={`hp-node is-${states[k] ?? 'idle'}`}
            initial={reduced ? { opacity: 0, x: p.x, y: p.y } : { opacity: 0, x: p.x, y: p.y - 14 }}
            animate={{ opacity: 1, x: p.x, y: p.y }}
            transition={reduced ? { duration: 0.2 } : { duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
          >
            <circle r={R} />
            <text dy="0.36em" textAnchor="middle">
              {it.v}
            </text>
          </motion.g>
        )
      })}
      {heap.length === 0 && (
        <text className="hp-empty" x={W / 2} y={H / 2} textAnchor="middle">
          heap vacío
        </text>
      )}
    </svg>
  )
}

export function HeapPlayground() {
  const [run, setRun] = useState<Run>(() => runFromPreset(0, 0))
  const [x, setX] = useState('3')
  const nextId = useMemo(() => Math.max(-1, ...run.base.map((b) => b.id), ...(run.op.kind === 'heapify' ? run.op.arr.map((_, k) => k) : [])) + 1, [run])
  const frames = useMemo(() => buildFrames(run.base, run.op, nextId), [run, nextId])
  const player = useStepPlayer(frames.length, { resetKey: String(run.key), interval: 800 })
  const f = frames[player.i]
  const prev = frames[player.i - 1]
  const finalHeap = frames[frames.length - 1].heap

  // operations started by the user play on their own
  const autoplay = useRef<number | null>(null)
  const { toggle } = player
  useEffect(() => {
    if (autoplay.current === run.key) {
      autoplay.current = null
      toggle()
    }
  }, [run.key, toggle])

  const startOp = (op: Op) => {
    const key = run.key + 1
    autoplay.current = key
    setRun({ key, preset: -1, base: finalHeap, op })
  }
  const parsed = Number.parseInt(x, 10)
  const canPush = Number.isFinite(parsed) && Math.abs(parsed) < 100 && finalHeap.length < MAX
  const kind = codeKind(run.op)

  return (
    <WidgetFrame
      caption="Un min-heap es un árbol completo guardado en un arreglo: los hijos de i están en 2i + 1 y 2i + 2. Inserta o extrae y mira cómo sube (sift-up) o baja (sift-down) un elemento, swap por swap."
      controls={
        <>
          <label className="hp-pick">
            <span className="seg__label">Empezar con</span>
            <select
              value={run.preset}
              onChange={(e) => {
                const k = Number(e.target.value)
                if (k >= 0) setRun(runFromPreset(k, run.key + 1))
              }}
            >
              {run.preset === -1 && <option value={-1}>Tu heap actual</option>}
              {PRESETS.map((p, k) => (
                <option key={p.label} value={k}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <div className="hp-ops">
            <span className="seg__label">Operar sobre el resultado</span>
            <div className="hp-ops__row">
              <input
                type="number"
                className="hp-num"
                value={x}
                min={-99}
                max={99}
                onChange={(e) => setX(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && canPush) startOp({ kind: 'push', x: parsed })
                }}
                aria-label="Número a insertar"
              />
              <button type="button" className="btn" disabled={!canPush} onClick={() => startOp({ kind: 'push', x: parsed })}>
                Insertar
              </button>
              <button type="button" className="btn" disabled={finalHeap.length === 0} onClick={() => startOp({ kind: 'pop' })}>
                Extraer mínimo
              </button>
            </div>
          </div>
        </>
      }
      readout={<StepNote tone={f.tone}>{f.note}</StepNote>}
    >
      <AlgoLayout
        visual={
          <>
            <HeapTree heap={f.heap} states={f.states} />
            <ArrayView
              label={`Arreglo del heap: ${f.heap.map((h) => h.v).join(', ') || 'vacío'}`}
              caption="heap (el mismo árbol, nivel por nivel)"
              values={f.heap.length ? f.heap.map((h) => h.v) : ['']}
              states={f.heap.length ? f.states : { 0: 'muted' }}
              pointers={f.heap.length ? f.pointers : []}
              maxCell={44}
            />
            <div className="hp-side">
              <VarPanel
                vars={[
                  { name: 'n', value: f.heap.length, changed: !!prev && prev.heap.length !== f.heap.length },
                  { name: 'swaps', value: f.swaps, changed: !!prev && prev.swaps !== f.swaps },
                  ...(f.floating ? [{ name: 'last', value: f.floating.v, changed: true }] : []),
                  ...(f.out !== undefined ? [{ name: 'top', value: f.out }] : []),
                ]}
              />
            </div>
          </>
        }
        code={<CodeTrace title="Python" lines={CODE[kind]} active={f.line} variants={[{ label: 'Java', lines: JAVA[kind], map: JAVA_MAP[kind] }]} />}
      />
      <StepControls player={player} />
    </WidgetFrame>
  )
}
