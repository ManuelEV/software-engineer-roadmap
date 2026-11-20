import { useMemo, useState } from 'react'
import { WidgetFrame } from '../kit'
import { AlgoLayout, ArrayView, type CellState, CodeTrace, StepControls, StepNote, VarPanel } from './algo-kit'
import { useStepPlayer } from './useStepPlayer'
import './MeetingRooms.css'

/**
 * Meeting Rooms II with a sweep line and a min-heap of end times. The heap is
 * a real binary heap (same array order as Python's heapq), and each meeting is
 * drawn in the room it ends up using so the reader sees rooms being reused.
 */

type Mtg = [number, number]
type Entry = [number, number] // [end, room]

const CODE = [
  'def min_meeting_rooms(meetings):',
  '    meetings.sort(key=lambda m: m[0])',
  '    ends = []  # min-heap con los finales',
  '    best = 0',
  '    for start, end in meetings:',
  '        while ends and ends[0] <= start:',
  '            heapq.heappop(ends)  # sala libre',
  '        heapq.heappush(ends, end)',
  '        best = max(best, len(ends))',
  '    return best',
]

/** Same solution in Java; JAVA_MAP[k] = the Java line(s) for Python line k. */
const JAVA = [
  'int minMeetingRooms(int[][] meetings) {',
  '    Arrays.sort(meetings, (a, b) -> Integer.compare(a[0], b[0]));',
  '    PriorityQueue<Integer> ends = new PriorityQueue<>(); // min-heap',
  '    int best = 0;',
  '    for (int[] m : meetings) {',
  '        while (!ends.isEmpty() && ends.peek() <= m[0]) {',
  '            ends.poll(); // sala libre',
  '        }',
  '        ends.offer(m[1]);',
  '        best = Math.max(best, ends.size());',
  '    }',
  '    return best;',
  '}',
]
const JAVA_MAP = [0, 1, 2, 3, 4, 5, 6, 8, 9, 11]

/* tiny binary heap ordered by end, then room */
const less = (a: Entry, b: Entry) => a[0] < b[0] || (a[0] === b[0] && a[1] < b[1])
function push(h: Entry[], e: Entry) {
  h.push(e)
  let k = h.length - 1
  while (k > 0) {
    const p = (k - 1) >> 1
    if (!less(h[k], h[p])) break
    ;[h[k], h[p]] = [h[p], h[k]]
    k = p
  }
}
function pop(h: Entry[]): Entry {
  const top = h[0]
  const last = h.pop()!
  if (h.length) {
    h[0] = last
    let k = 0
    for (;;) {
      const l = 2 * k + 1
      const r = l + 1
      let m = k
      if (l < h.length && less(h[l], h[m])) m = l
      if (r < h.length && less(h[r], h[m])) m = r
      if (m === k) break
      ;[h[k], h[m]] = [h[m], h[k]]
      k = m
    }
  }
  return top
}

interface Frame {
  line: number | number[]
  sorted: boolean
  t?: number
  cur: number
  heap: Entry[]
  room: (number | undefined)[]
  ended: boolean[]
  best: number
  topCheck?: boolean
  note: string
  tone?: 'ok'
}

function buildFrames(ms: Mtg[]) {
  const frames: Frame[] = []
  const order = ms.map((_, k) => k).sort((a, b) => ms[a][0] - ms[b][0])
  const heap: Entry[] = []
  const room: (number | undefined)[] = ms.map(() => undefined)
  const ended = ms.map(() => false)
  const free: number[] = []
  let opened = 0
  let best = 0
  const snap = (p: Omit<Frame, 'heap' | 'room' | 'ended' | 'best'>): Frame => ({ ...p, heap: heap.map((e) => [...e] as Entry), room: [...room], ended: [...ended], best })
  const owner = (end: number, r: number) => order.find((k) => room[k] === r && ms[k][1] === end && !ended[k])

  frames.push(snap({ line: 0, sorted: false, cur: -1, note: 'Cada reunión es [inicio, fin]. Pregunta: ¿cuántas salas hacen falta como mínimo para que ninguna se pise con otra?' }))
  frames.push(snap({ line: [1, 2, 3], sorted: true, cur: -1, note: 'Ordenamos por inicio y barremos el tiempo de izquierda a derecha. El heap guarda cuándo termina cada reunión en curso: su tope es la sala que se libera primero.' }))
  for (const k of order) {
    const [s, e] = ms[k]
    frames.push(
      snap({
        line: [4, 5],
        sorted: true,
        t: s,
        cur: k,
        topCheck: heap.length > 0,
        note: heap.length
          ? `La línea llega a t = ${s}: empieza [${s}, ${e}]. ¿La reunión que termina primero (fin ${heap[0][0]}) ya terminó? ${heap[0][0]} ≤ ${s}: ${heap[0][0] <= s ? 'sí.' : 'no, todas las salas siguen ocupadas.'}`
          : `La línea llega a t = ${s}: empieza [${s}, ${e}]. El heap está vacío, no hay nada que liberar.`,
      }),
    )
    while (heap.length && heap[0][0] <= s) {
      const [end, r] = pop(heap)
      const who = owner(end, r)
      if (who !== undefined) ended[who] = true
      free.push(r)
      free.sort((a, b) => a - b)
      frames.push(
        snap({
          line: 6,
          sorted: true,
          t: s,
          cur: k,
          topCheck: heap.length > 0,
          note: `Sacamos ${end} del heap: la sala ${r + 1} quedó libre${end === s ? ` justo a tiempo (termina en ${end} y la nueva empieza en ${s}; con < en vez de ≤ pedirías una sala de más)` : ''}.${heap.length ? ` El nuevo tope es ${heap[0][0]}: ${heap[0][0] <= s ? 'también terminó.' : 'sigue ocupada.'}` : ''}`,
        }),
      )
    }
    const reuse = free.length > 0
    const r = reuse ? free.shift()! : opened++
    room[k] = r
    push(heap, [e, r])
    const before = best
    best = Math.max(best, heap.length)
    frames.push(
      snap({
        line: [7, 8],
        sorted: true,
        t: s,
        cur: k,
        note: `${reuse ? `Reusamos la sala ${r + 1}` : `Abrimos la sala ${r + 1}`} y metemos su fin (${e}) al heap. Hay ${heap.length} ${heap.length === 1 ? 'reunión' : 'reuniones'} en curso${best > before ? `: nuevo máximo, best = ${best}.` : `; best sigue en ${best}.`}`,
      }),
    )
  }
  frames.push(snap({ line: 9, sorted: true, cur: -1, tone: 'ok', note: `El máximo de reuniones simultáneas fue ${best}: esa es la respuesta. O(n log n) por el orden y el heap, O(n) de memoria en el peor caso.` }))
  return { frames, order, rooms: Math.max(1, opened) }
}

const PRESETS: { label: string; ms: Mtg[] }[] = [
  { label: '[0,30] [5,10] [15,20]', ms: [[0, 30], [5, 10], [15, 20]] },
  { label: 'Agenda de un martes', ms: [[9, 12], [10, 13], [9, 10], [12, 14], [11, 12], [13, 15]] },
  { label: 'Se tocan: [1,5] [5,10] [10,15]', ms: [[5, 10], [1, 5], [10, 15]] },
  { label: 'Sin choques: [7,10] [2,4]', ms: [[7, 10], [2, 4]] },
]

const W = 360
const PAD = 26
const LANE = 34
const LBL = 26

export function MeetingRooms() {
  const [preset, setPreset] = useState(1)
  const { ms } = PRESETS[preset]
  const { frames, order, rooms } = useMemo(() => buildFrames(ms), [ms])
  const player = useStepPlayer(frames.length, { resetKey: String(preset) })
  const f = frames[player.i]
  const prev = frames[player.i - 1]

  const lo = Math.min(...ms.map((m) => m[0]))
  const hi = Math.max(...ms.map((m) => m[1]))
  const span = Math.max(1, hi - lo)
  const x = (v: number) => PAD + LBL + ((v - lo) / span) * (W - 2 * PAD - LBL)
  const step = span <= 15 ? 1 : span <= 30 ? 5 : 10
  const ticks: number[] = []
  for (let t = Math.ceil(lo / step) * step; t <= hi; t += step) ticks.push(t)
  const top = 22
  const axisY = top + rooms * LANE + 6
  const H = axisY + 26

  const pending = (f.sorted ? order : ms.map((_, k) => k)).filter((k) => f.room[k] === undefined)
  const heapStates: Partial<Record<number, CellState>> = f.topCheck && f.heap.length ? { 0: 'compare' } : {}

  return (
    <WidgetFrame
      caption="Meeting Rooms II con una línea de barrido. Cada reunión cae en la sala que usa; el heap guarda los finales de las reuniones en curso y su tamaño es la cantidad de salas ocupadas en ese instante."
      controls={
        <label className="mtr-pick">
          <span className="seg__label">Entrada</span>
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
            <div className="mtr-pending" aria-label="Reuniones por llegar">
              <span className="mtr-pending__lbl">{f.sorted ? 'por llegar (ordenadas)' : 'reuniones'}</span>
              {pending.length === 0 && <span className="mtr-pending__none">ninguna</span>}
              {pending.map((k, i) => (
                <span key={k} className={`mtr-chip ${f.sorted && i === 0 ? 'is-next' : ''}`}>
                  [{ms[k][0]}, {ms[k][1]}]
                </span>
              ))}
            </div>
            <svg className="mtr-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Salas de reunión en el tiempo; ${f.best} salas como máximo hasta ahora`}>
              {ticks.map((t) => (
                <line key={`g${t}`} className="mtr-grid" x1={x(t)} x2={x(t)} y1={top - 4} y2={axisY} />
              ))}
              {Array.from({ length: rooms }, (_, r) => {
                const open = f.room.some((v) => v === r)
                return (
                  <g key={`lane${r}`} className={`mtr-lane ${open ? 'is-open' : ''}`}>
                    <rect x={PAD - 8} y={top + r * LANE} width={W - 2 * PAD + 16} height={LANE - 6} rx={6} />
                  </g>
                )
              })}
              {ms.map((m, k) => {
                const r = f.room[k]
                if (r === undefined) return null
                const cls = f.cur === k ? 'is-cur' : f.ended[k] ? 'is-ended' : 'is-live'
                const x1 = x(m[0])
                const x2 = x(m[1])
                return (
                  <g key={`m${k}`} className={`mtr-mtg ${cls}`}>
                    <rect x={x1 + 1} y={top + r * LANE + 3} width={Math.max(4, x2 - x1 - 2)} height={LANE - 12} rx={4} />
                    <text x={(x1 + x2) / 2} y={top + r * LANE + LANE / 2 + 1} textAnchor="middle" className="mtr-mtg__lbl">
                      {x2 - x1 > 40 ? `${m[0]}–${m[1]}` : ''}
                    </text>
                  </g>
                )
              })}
              {Array.from({ length: rooms }, (_, r) => (
                <text key={`rl${r}`} x={PAD - 2} y={top + r * LANE + LANE / 2 + 1} className="mtr-room">
                  S{r + 1}
                </text>
              ))}
              {f.t !== undefined && (
                <g className="mtr-sweep">
                  <line x1={x(f.t)} x2={x(f.t)} y1={top - 10} y2={axisY} />
                  <text x={x(f.t)} y={top - 12} textAnchor="middle">
                    t = {f.t}
                  </text>
                </g>
              )}
              {ticks.map((t) => (
                <text key={`t${t}`} className="mtr-tick" x={x(t)} y={axisY + 18} textAnchor="middle">
                  {t}
                </text>
              ))}
            </svg>
            <ArrayView
              label={`Heap de finales: ${f.heap.map((e) => e[0]).join(', ') || 'vacío'}`}
              caption="ends (min-heap)"
              values={f.heap.length ? f.heap.map((e) => e[0]) : ['']}
              states={f.heap.length ? heapStates : { 0: 'muted' }}
              pointers={f.heap.length ? [{ at: 0, label: 'tope' }] : []}
              maxCell={46}
            />
            <VarPanel
              vars={[
                { name: 'en curso (len(ends))', value: f.heap.length, changed: !!prev && prev.heap.length !== f.heap.length },
                { name: 'best', value: f.best, changed: !!prev && prev.best !== f.best },
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
