import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { WidgetFrame } from '../kit'
import { AlgoLayout, ArrayView, type CellState, CodeTrace, StepControls, StepNote } from './algo-kit'
import { useStepPlayer } from './useStepPlayer'
import './DequeMax.css'

/**
 * Sliding Window Maximum with a monotonic deque of indices: expired indices
 * leave from the front, smaller values leave from the back, the front is the max.
 */

const CODE = [
  'def max_sliding_window(nums, k):',
  '    dq = deque()  # índices; valores decrecientes',
  '    res = []',
  '    for i, x in enumerate(nums):',
  '        if dq and dq[0] <= i - k:',
  '            dq.popleft()',
  '        while dq and nums[dq[-1]] < x:',
  '            dq.pop()',
  '        dq.append(i)',
  '        if i >= k - 1:',
  '            res.append(nums[dq[0]])',
  '    return res',
]

/** Same solution in Java; JAVA_MAP[k] = the Java line(s) for Python line k. */
const JAVA = [
  'int[] maxSlidingWindow(int[] nums, int k) {',
  '    Deque<Integer> dq = new ArrayDeque<>(); // índices',
  '    int[] res = new int[nums.length - k + 1];',
  '    for (int i = 0; i < nums.length; i++) {',
  '        if (!dq.isEmpty() && dq.peekFirst() <= i - k)',
  '            dq.pollFirst();',
  '        while (!dq.isEmpty() && nums[dq.peekLast()] < nums[i])',
  '            dq.pollLast();',
  '        dq.offerLast(i);',
  '        if (i >= k - 1)',
  '            res[i - k + 1] = nums[dq.peekFirst()];',
  '    }',
  '    return res;',
  '}',
]
const JAVA_MAP = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 12]

interface Frame {
  line: number | number[]
  i: number
  dq: number[]
  res: number[]
  states: Partial<Record<number, CellState>>
  mark?: { at: number; tone: 'bad' | 'ok' }
  note: string
  tone?: 'ok' | 'bad'
}

function buildFrames(nums: number[], k: number): Frame[] {
  const frames: Frame[] = []
  const n = nums.length
  const dq: number[] = []
  const res: number[] = []
  const win = (i: number, extra: Partial<Record<number, CellState>> = {}) => {
    const st: Partial<Record<number, CellState>> = {}
    for (let q = 0; q < n; q++) {
      if (q > i) continue
      if (q <= i - k) st[q] = 'muted'
      else st[q] = 'window'
    }
    if (i >= 0 && i < n) st[i] = 'active'
    return { ...st, ...extra }
  }
  const push = (f: Omit<Frame, 'dq' | 'res'>) => frames.push({ ...f, dq: [...dq], res: [...res] })

  push({
    line: [1, 2],
    i: -1,
    states: {},
    note: `Ventana de tamaño ${k}. La deque guarda índices de candidatos a máximo, con valores decrecientes de frente a atrás: el frente siempre es el máximo de la ventana.`,
  })

  for (let i = 0; i < n; i++) {
    const x = nums[i]
    push({
      line: 3,
      i,
      states: win(i),
      note: `Entra nums[${i}] = ${x}. La ventana ahora cubre los índices ${Math.max(0, i - k + 1)}..${i}.`,
    })
    if (dq.length && dq[0] <= i - k) {
      const j = dq[0]
      push({
        line: 4,
        i,
        mark: { at: j, tone: 'bad' },
        states: win(i, { [j]: 'bad' }),
        tone: 'bad',
        note: `El frente es el índice ${j}, y ${j} ≤ ${i} − ${k}: ya quedó fuera de la ventana.`,
      })
      dq.shift()
      push({ line: 5, i, states: win(i), note: `popleft(): sale el índice ${j} por el frente. Solo el frente puede vencer, porque es el índice más antiguo de la deque.` })
    }
    while (dq.length && nums[dq[dq.length - 1]] < x) {
      const j = dq[dq.length - 1]
      push({
        line: 6,
        i,
        mark: { at: j, tone: 'bad' },
        states: win(i, { [j]: 'bad' }),
        tone: 'bad',
        note: `nums[${j}] = ${nums[j]} < ${x}. Mientras ${x} esté en la ventana, ${nums[j]} nunca será el máximo, y ${x} saldrá después que él. Es inútil para siempre.`,
      })
      dq.pop()
      push({ line: 7, i, states: win(i), note: `pop(): sale el índice ${j} por atrás.` })
    }
    dq.push(i)
    push({
      line: 8,
      i,
      mark: { at: i, tone: 'ok' },
      states: win(i),
      note: `Agregamos el índice ${i} al final. La deque sigue decreciente: [${dq.map((q) => nums[q]).join(', ')}].`,
    })
    if (i >= k - 1) {
      res.push(nums[dq[0]])
      push({
        line: [9, 10],
        i,
        mark: { at: dq[0], tone: 'ok' },
        states: win(i, { [dq[0]]: 'found' }),
        tone: 'ok',
        note: `La ventana ${i - k + 1}..${i} está completa. Su máximo es el frente: nums[${dq[0]}] = ${nums[dq[0]]}.`,
      })
    }
  }

  const all: Partial<Record<number, CellState>> = {}
  for (let q = 0; q < n; q++) all[q] = 'done'
  push({
    line: 11,
    i: n,
    states: all,
    tone: 'ok',
    note: `res = [${res.join(', ')}]. Cada índice entra una vez y sale a lo sumo una vez de la deque: O(n) total, contra O(n · k) de recalcular el máximo de cada ventana.`,
  })
  return frames
}

const PRESETS: { label: string; nums: number[]; k: number }[] = [
  { label: '[1, 3, -1, -3, 5, 3, 6, 7], k = 3', nums: [1, 3, -1, -3, 5, 3, 6, 7], k: 3 },
  { label: '[9, 7, 5, 3, 1], k = 2 (baja)', nums: [9, 7, 5, 3, 1], k: 2 },
  { label: '[1, 2, 3, 4, 5], k = 3 (sube)', nums: [1, 2, 3, 4, 5], k: 3 },
  { label: '[5, 5, 5, 5], k = 2 (empates)', nums: [5, 5, 5, 5], k: 2 },
]

function parseNums(text: string): number[] | null {
  const parts = text.split(/[\s,]+/).filter(Boolean)
  if (parts.length < 1 || parts.length > 10) return null
  if (!parts.every((p) => /^-?\d{1,2}$/.test(p))) return null
  return parts.map(Number)
}

export function DequeMax() {
  const reduced = useReducedMotion()
  const [preset, setPreset] = useState(0)
  const [input, setInput] = useState({ nums: PRESETS[0].nums, k: PRESETS[0].k })
  const [text, setText] = useState(PRESETS[0].nums.join(', '))
  const [kText, setKText] = useState(String(PRESETS[0].k))
  const { nums } = input
  const k = Math.min(Math.max(1, input.k), nums.length)
  const frames = useMemo(() => buildFrames(nums, k), [nums, k])
  const player = useStepPlayer(frames.length, { resetKey: `${nums.join(',')}|${k}` })
  const f = frames[player.i]
  const numsOk = parseNums(text) !== null
  const kOk = /^\d{1,2}$/.test(kText.trim()) && Number(kText) >= 1 && Number(kText) <= nums.length
  const t = { duration: reduced ? 0.15 : 0.26, ease: [0.16, 1, 0.3, 1] as const }

  return (
    <WidgetFrame
      caption="Sliding Window Maximum con una deque monótona de índices: los vencidos salen por el frente, los que ya no pueden ser máximo salen por atrás, y el frente es la respuesta de cada ventana."
      controls={
        <>
          <label className="dqm-field">
            <span className="seg__label">Ejemplo</span>
            <select
              value={preset}
              onChange={(e) => {
                const p = Number(e.target.value)
                setPreset(p)
                setInput({ nums: PRESETS[p].nums, k: PRESETS[p].k })
                setText(PRESETS[p].nums.join(', '))
                setKText(String(PRESETS[p].k))
              }}
            >
              {PRESETS.map((p, j) => (
                <option key={p.label} value={j}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="dqm-field dqm-field--grow">
            <span className="seg__label">nums (hasta 10)</span>
            <input
              type="text"
              value={text}
              aria-invalid={!numsOk}
              onChange={(e) => {
                setText(e.target.value)
                const p = parseNums(e.target.value)
                if (p) setInput((s) => ({ ...s, nums: p }))
              }}
            />
          </label>
          <label className="dqm-field dqm-field--k">
            <span className="seg__label">k</span>
            <input
              type="text"
              inputMode="numeric"
              value={kText}
              aria-invalid={!kOk}
              onChange={(e) => {
                setKText(e.target.value)
                const v = e.target.value.trim()
                if (/^\d{1,2}$/.test(v) && Number(v) >= 1) setInput((s) => ({ ...s, k: Number(v) }))
              }}
            />
          </label>
        </>
      }
      readout={<StepNote tone={f.tone}>{f.note}</StepNote>}
    >
      <AlgoLayout
        visual={
          <>
            <ArrayView
              label={`nums: ${nums.join(', ')}`}
              caption={`nums (ventana de ${k})`}
              values={nums}
              states={f.states}
              pointers={f.i >= 0 && f.i < nums.length ? [{ at: f.i, label: 'i' }] : []}
            />
            <div className="dqm-dq" aria-label={`Deque, del frente hacia atrás: ${f.dq.map((q) => `${nums[q]} (índice ${q})`).join(', ') || 'vacía'}`}>
              <span className="dqm-cap">dq (índices)</span>
              <div className="dqm-dq__row">
                <span className="dqm-end" aria-hidden="true">
                  frente
                </span>
                <div className="dqm-dq__well">
                  <AnimatePresence initial={false}>
                    {f.dq.map((q) => (
                      <motion.div
                        key={q}
                        className={`dqm-box ${f.mark?.at === q ? `is-${f.mark.tone}` : ''}`}
                        initial={reduced ? { opacity: 0 } : { opacity: 0, x: 14 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={reduced ? { opacity: 0 } : { opacity: 0, y: 12 }}
                        transition={t}
                      >
                        <span className="dqm-box__v">{nums[q]}</span>
                        <span className="dqm-box__i">i={q}</span>
                      </motion.div>
                    ))}
                  </AnimatePresence>
                  {f.dq.length === 0 && <span className="dqm-empty">vacía</span>}
                </div>
                <span className="dqm-end" aria-hidden="true">
                  atrás
                </span>
              </div>
            </div>
            <div className="dqm-res" aria-label={`Resultado: ${f.res.join(', ') || 'vacío'}`}>
              <span className="dqm-cap">res</span>
              <div className="dqm-res__row">
                {f.res.length === 0 && <span className="dqm-empty">[ ]</span>}
                {f.res.map((v, j) => (
                  <span key={j} className={`dqm-chip ${j === f.res.length - 1 && Array.isArray(f.line) && f.line[0] === 9 ? 'is-new' : ''}`}>
                    {v}
                  </span>
                ))}
              </div>
            </div>
          </>
        }
        code={<CodeTrace title="Python" lines={CODE} active={f.line} variants={[{ label: 'Java', lines: JAVA, map: JAVA_MAP }]} />}
      />
      <StepControls player={player} />
    </WidgetFrame>
  )
}
