import { useId, useMemo, useState } from 'react'
import { WidgetFrame, Stat } from '../kit'
import { AlgoLayout, ArrayView, type CellState, CodeTrace, StepControls, StepNote, VarPanel } from './algo-kit'
import { useStepPlayer } from './useStepPlayer'
import './TwoHeapsMedian.css'

/**
 * Find Median from Data Stream with two heaps: `lo` (max-heap, the smaller
 * half) and `hi` (min-heap, the larger half). Frames come from running the real
 * algorithm over the stream; each number takes three frames: push, rebalance,
 * median.
 */

const CODE = [
  'class MedianFinder:',
  '    def __init__(self):',
  '        self.lo = []  # max-heap: guardamos -x',
  '        self.hi = []  # min-heap',
  '',
  '    def addNum(self, x):',
  '        if not self.lo or x <= -self.lo[0]:',
  '            heapq.heappush(self.lo, -x)',
  '        else:',
  '            heapq.heappush(self.hi, x)',
  '        if len(self.lo) > len(self.hi) + 1:',
  '            heapq.heappush(self.hi, -heapq.heappop(self.lo))',
  '        elif len(self.hi) > len(self.lo):',
  '            heapq.heappush(self.lo, -heapq.heappop(self.hi))',
  '',
  '    def findMedian(self):',
  '        if len(self.lo) > len(self.hi):',
  '            return -self.lo[0]',
  '        return (-self.lo[0] + self.hi[0]) / 2',
]

/** Same class in Java; JAVA_MAP[k] = the Java line(s) for Python line k. */
const JAVA = [
  'class MedianFinder {',
  '    PriorityQueue<Integer> lo = new PriorityQueue<>(Collections.reverseOrder()); // max-heap',
  '    PriorityQueue<Integer> hi = new PriorityQueue<>();                           // min-heap',
  '',
  '    public void addNum(int x) {',
  '        if (lo.isEmpty() || x <= lo.peek())',
  '            lo.offer(x);',
  '        else',
  '            hi.offer(x);',
  '        if (lo.size() > hi.size() + 1)',
  '            hi.offer(lo.poll());',
  '        else if (hi.size() > lo.size())',
  '            lo.offer(hi.poll());',
  '    }',
  '',
  '    public double findMedian() {',
  '        if (lo.size() > hi.size())',
  '            return lo.peek();',
  '        return (lo.peek() + hi.peek()) / 2.0;',
  '    }',
  '}',
]
const JAVA_MAP = [0, null, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 14, 15, 16, 17, 18]

interface Entry {
  id: number
  v: number
}

interface Frame {
  k: number
  lo: Entry[]
  hi: Entry[]
  line: number | number[]
  note: string
  tone?: 'ok' | 'warn'
  median?: number
  fresh?: number
  moved?: number
}

const fmt = (m: number) => (Number.isInteger(m) ? String(m) : m.toFixed(1))

function buildFrames(stream: number[]): Frame[] {
  const frames: Frame[] = []
  // kept sorted for display; the real heaps only guarantee their tops
  const lo: Entry[] = [] // descending: lo[0] is the max
  const hi: Entry[] = [] // ascending: hi[0] is the min
  const insLo = (e: Entry) => {
    lo.push(e)
    lo.sort((a, b) => b.v - a.v)
  }
  const insHi = (e: Entry) => {
    hi.push(e)
    hi.sort((a, b) => a.v - b.v)
  }
  const snap = () => ({ lo: [...lo], hi: [...hi] })
  let median: number | undefined

  frames.push({ k: -1, ...snap(), line: [2, 3], note: 'Dos heaps vacíos. lo guardará la mitad menor (max-heap: su tope es el mayor de los chicos); hi, la mitad mayor (min-heap: su tope es el menor de los grandes).' })
  stream.forEach((x, k) => {
    const e = { id: k, v: x }
    if (lo.length === 0 || x <= lo[0].v) {
      const why = lo.length === 0 ? 'lo está vacío' : `${x} ≤ ${lo[0].v}, el tope de lo`
      insLo(e)
      frames.push({ k, ...snap(), median, fresh: k, line: [6, 7], note: `Llega ${x}. Como ${why}, pertenece a la mitad menor: va a lo. Cuesta O(log n).` })
    } else {
      insHi(e)
      frames.push({ k, ...snap(), median, fresh: k, line: [6, 8, 9], note: `Llega ${x}. Es mayor que ${lo[0].v}, el tope de lo: pertenece a la mitad mayor y va a hi.` })
    }
    if (lo.length > hi.length + 1) {
      const m = lo.shift()!
      insHi(m)
      frames.push({ k, ...snap(), median, moved: m.id, line: [10, 11], tone: 'warn', note: `Ahora lo tiene ${lo.length + 1} y hi ${hi.length - 1}: lo tiene dos de más. Pasamos su tope (${m.v}) a hi. Sigue siendo cierto que todo lo de lo ≤ todo lo de hi.` })
    } else if (hi.length > lo.length) {
      const m = hi.shift()!
      insLo(m)
      frames.push({ k, ...snap(), median, moved: m.id, line: [12, 13], tone: 'warn', note: `hi quedó más grande que lo. Pasamos su tope (${m.v}) a lo, para que lo tenga el mismo tamaño o uno más.` })
    } else {
      frames.push({ k, ...snap(), median, line: [10, 12], note: `Tamaños ${lo.length} y ${hi.length}: lo tiene igual o uno más que hi. No hay que rebalancear.` })
    }
    if (lo.length > hi.length) {
      median = lo[0].v
      frames.push({ k, ...snap(), median, line: [16, 17], tone: 'ok', note: `Hay ${k + 1} números (impar): la mediana es el tope de lo, ${lo[0].v}. Leerla es O(1).` })
    } else {
      median = (lo[0].v + hi[0].v) / 2
      frames.push({ k, ...snap(), median, line: 18, tone: 'ok', note: `Hay ${k + 1} números (par): la mediana es el promedio de los dos topes, (${lo[0].v} + ${hi[0].v}) / 2 = ${fmt(median)}.` })
    }
  })
  return frames
}

const PRESETS: { label: string; stream: number[] }[] = [
  { label: '5, 15, 1, 3, 8, 7, 9, 10', stream: [5, 15, 1, 3, 8, 7, 9, 10] },
  { label: '1, 2, 3, 4, 5, 6 (creciente)', stream: [1, 2, 3, 4, 5, 6] },
  { label: '4, 4, 4, 4 (repetidos)', stream: [4, 4, 4, 4] },
  { label: '-3, 10, -7 (negativos)', stream: [-3, 10, -7] },
]

const parseStream = (s: string) =>
  s
    .split(/[\s,;]+/)
    .filter(Boolean)
    .map((t) => Number.parseInt(t, 10))
    .filter((n) => Number.isFinite(n) && Math.abs(n) < 1000)
    .slice(0, 12)

export function TwoHeapsMedian() {
  const [preset, setPreset] = useState(0)
  const [custom, setCustom] = useState<number[] | null>(null)
  const [text, setText] = useState('')
  const inputId = useId()
  const stream = custom ?? PRESETS[preset].stream
  const frames = useMemo(() => buildFrames(stream), [stream])
  const player = useStepPlayer(frames.length, { resetKey: custom ? `c:${custom.join(',')}` : String(preset), interval: 1000 })
  const f = frames[player.i]
  const prev = frames[player.i - 1]
  const states: Partial<Record<number, CellState>> = {}
  stream.forEach((_, k) => {
    if (k < f.k) states[k] = 'done'
    else if (k === f.k) states[k] = 'active'
  })
  const apply = () => {
    const s = parseStream(text)
    if (s.length) setCustom(s)
  }

  const heapRow = (items: Entry[], side: 'lo' | 'hi') => (
    <ol className={`thm-heap__items thm-heap__items--${side}`}>
      {items.length === 0 && <li className="thm-heap__empty">vacío</li>}
      {items.map((e, idx) => (
        <li key={e.id} className={`thm-chip ${idx === 0 ? 'is-top' : ''} ${f.fresh === e.id ? 'is-new' : ''} ${f.moved === e.id ? 'is-moved' : ''}`}>
          {e.v}
        </li>
      ))}
    </ol>
  )

  return (
    <WidgetFrame
      caption="La mediana de un flujo con dos heaps: lo (max-heap) guarda la mitad menor y hi (min-heap) la mayor. Si se desbalancean, el tope de uno pasa al otro. La mediana siempre está en los topes."
      controls={
        <>
          <label className="thm-pick">
            <span className="seg__label">Flujo</span>
            <select
              value={custom ? -1 : preset}
              onChange={(e) => {
                const k = Number(e.target.value)
                if (k >= 0) {
                  setCustom(null)
                  setPreset(k)
                }
              }}
            >
              {custom && <option value={-1}>Tu flujo: {custom.join(', ')}</option>}
              {PRESETS.map((p, k) => (
                <option key={p.label} value={k}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <div className="thm-own">
            <label className="seg__label" htmlFor={inputId}>
              O escribe el tuyo
            </label>
            <div className="thm-own__row">
              <input
                id={inputId}
                className="thm-own__input"
                value={text}
                placeholder="6, 1, 9, 4"
                onChange={(e) => setText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') apply()
                }}
              />
              <button type="button" className="btn" onClick={apply} disabled={parseStream(text).length === 0}>
                Usar
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
            <ArrayView label={`Flujo de números: ${stream.join(', ')}`} caption="flujo (llegan de a uno)" values={stream} states={states} pointers={f.k >= 0 ? [{ at: f.k, label: 'x' }] : []} maxCell={46} />
            <div className="thm-scale" aria-label={`lo: ${f.lo.map((e) => e.v).join(', ') || 'vacío'}. hi: ${f.hi.map((e) => e.v).join(', ') || 'vacío'}.`}>
              <div className="thm-heap thm-heap--lo">
                <div className="thm-heap__title">
                  lo · max-heap <span>({f.lo.length})</span>
                </div>
                {heapRow(f.lo, 'lo')}
              </div>
              <div className="thm-mid" aria-hidden="true" />
              <div className="thm-heap thm-heap--hi">
                <div className="thm-heap__title">
                  hi · min-heap <span>({f.hi.length})</span>
                </div>
                {heapRow(f.hi, 'hi')}
              </div>
            </div>
            <div className="thm-stats">
              <Stat label="mediana" value={f.median === undefined ? '—' : fmt(f.median)} tone={f.tone === 'ok' ? 'ok' : undefined} />
              <VarPanel
                vars={[
                  { name: 'len(lo)', value: f.lo.length, changed: !!prev && prev.lo.length !== f.lo.length },
                  { name: 'len(hi)', value: f.hi.length, changed: !!prev && prev.hi.length !== f.hi.length },
                  { name: 'lo[0]', value: f.lo[0]?.v ?? '—' },
                  { name: 'hi[0]', value: f.hi[0]?.v ?? '—' },
                ]}
              />
            </div>
            <p className="thm-hint">Los heaps se muestran ordenados para que se lea; por dentro solo el tope (marcado) está garantizado.</p>
          </>
        }
        code={<CodeTrace title="Python" lines={CODE} active={f.line} variants={[{ label: 'Java', lines: JAVA, map: JAVA_MAP }]} />}
      />
      <StepControls player={player} />
    </WidgetFrame>
  )
}
