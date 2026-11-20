import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Segmented, Slider, WidgetFrame } from '../kit'
import { AlgoLayout, CodeTrace, StepControls, StepNote, VarPanel } from './algo-kit'
import { useStepPlayer } from './useStepPlayer'
import './AnswerSpaceSearch.css'

/**
 * Binary search on the answer, with Koko Eating Bananas: the number line of
 * possible speeds 1..max(piles), the monotone predicate "can she finish in h
 * hours at speed k?" painted yes/no as the search learns it, and lo/mid/hi
 * converging on the boundary. Frames come from running the real search.
 */

const CODE = [
  'def min_eating_speed(piles, h):',
  '    def can(k):  # ¿alcanza con k?',
  '        t = sum(ceil(p/k) for p in piles)',
  '        return t <= h',
  '    lo, hi = 1, max(piles)',
  '    while lo < hi:',
  '        mid = lo + (hi - lo) // 2',
  '        if can(mid):',
  '            hi = mid',
  '        else:',
  '            lo = mid + 1',
  '    return lo',
]

const JAVA = [
  'int minEatingSpeed(int[] piles, int h) {',
  '    int lo = 1, hi = 0;',
  '    for (int p : piles) hi = Math.max(hi, p);',
  '    while (lo < hi) {',
  '        int mid = lo + (hi - lo) / 2;',
  '        if (can(piles, h, mid))',
  '            hi = mid;',
  '        else',
  '            lo = mid + 1;',
  '    }',
  '    return lo;',
  '}',
  '',
  'boolean can(int[] piles, int h, int k) {',
  '    long t = 0;  // long: evita overflow',
  '    for (int p : piles)',
  '        t += (p + k - 1L) / k;  // techo',
  '    return t <= h;',
  '}',
]
const JAVA_MAP = [0, 13, [14, 15, 16], 17, [1, 2], 3, 4, 5, 6, 7, 8, 10]

type Known = 'yes' | 'no'

interface Frame {
  line: number | number[]
  lo: number
  hi: number
  mid?: number
  /** known[k] for k in 1..M (index 0 unused) */
  known: (Known | undefined)[]
  evaluated: number[]
  hours?: number
  answer?: number
  note: string
  tone?: 'ok' | 'bad'
}

const hoursAt = (piles: number[], k: number) => piles.reduce((s, p) => s + Math.ceil(p / k), 0)

function buildFrames(piles: number[], h: number): Frame[] {
  const M = Math.max(...piles)
  const known: (Known | undefined)[] = Array(M + 1).fill(undefined)
  const evaluated: number[] = []
  const frames: Frame[] = []
  const snap = (f: Omit<Frame, 'known' | 'evaluated'>) => frames.push({ ...f, known: [...known], evaluated: [...evaluated] })
  let lo = 1
  let hi = M
  snap({
    line: 4,
    lo,
    hi,
    note: `La respuesta es una velocidad entre 1 y max(piles) = ${M}. Con ${M} por hora cada pila dura una hora, así que ${M} siempre alcanza si h ≥ cantidad de pilas.`,
  })
  while (lo < hi) {
    const mid = lo + Math.floor((hi - lo) / 2)
    snap({ line: [5, 6], lo, hi, mid, note: `Quedan ${hi - lo + 1} velocidades posibles en [${lo}, ${hi}]. Probamos la del medio: k = ${mid}.` })
    const hrs = hoursAt(piles, mid)
    const ok = hrs <= h
    evaluated.push(mid)
    known[mid] = ok ? 'yes' : 'no'
    snap({
      line: [1, 2, 3, 7],
      lo,
      hi,
      mid,
      hours: hrs,
      tone: ok ? 'ok' : 'bad',
      note: ok ? `A ${mid} por hora tarda ${hrs} h ≤ ${h} h: sí alcanza.` : `A ${mid} por hora tarda ${hrs} h > ${h} h: no alcanza.`,
    })
    if (ok) {
      for (let k = mid; k <= hi; k++) known[k] = 'yes'
      hi = mid
      snap({
        line: 8,
        lo,
        hi,
        mid,
        hours: hrs,
        note: `Si ${mid} alcanza, toda velocidad mayor también (comer más rápido nunca toma más horas). Las pintamos de "sí" sin evaluarlas y buscamos una menor en [${lo}, ${hi}]. hi = mid, no mid − 1: ${mid} todavía puede ser la respuesta.`,
      })
    } else {
      for (let k = lo; k <= mid; k++) known[k] = 'no'
      lo = mid + 1
      snap({
        line: 10,
        lo,
        hi,
        mid,
        hours: hrs,
        note: `Si ${mid} no alcanza, ninguna velocidad menor alcanza. Las pintamos de "no" sin evaluarlas: lo = mid + 1 = ${lo}.`,
      })
    }
  }
  known[lo] = known[lo] ?? 'yes'
  snap({
    line: 11,
    lo,
    hi,
    answer: lo,
    tone: 'ok',
    note: `lo = hi = ${lo}: es el borde entre los "no" y los "sí", la menor velocidad que alcanza. Evaluamos can() ${evaluated.length} ${evaluated.length === 1 ? 'vez' : 'veces'}; la fuerza bruta probaría hasta ${M}.`,
  })
  return frames
}

const PRESETS: { label: string; piles: number[]; h: number }[] = [
  { label: '[3, 6, 7, 11]', piles: [3, 6, 7, 11], h: 8 },
  { label: '[30, 11, 23, 4, 20]', piles: [30, 11, 23, 4, 20], h: 6 },
  { label: '[9, 4, 14, 2, 18, 7]', piles: [9, 4, 14, 2, 18, 7], h: 10 },
  { label: '[2, 2, 2]', piles: [2, 2, 2], h: 6 },
]

const W = 380
const PAD = 16
const CELL_Y = 34
const CELL_H = 30

export function AnswerSpaceSearch() {
  const reduced = useReducedMotion()
  const [preset, setPreset] = useState(0)
  const [h, setH] = useState(PRESETS[0].h)
  const [show, setShow] = useState<'search' | 'all'>('search')
  const { piles } = PRESETS[preset]
  const M = Math.max(...piles)
  const total = piles.reduce((a, b) => a + b, 0)
  const frames = useMemo(() => buildFrames(piles, h), [piles, h])
  const player = useStepPlayer(frames.length, { resetKey: `${preset}-${h}` })
  const f = frames[player.i]
  const prev = frames[player.i - 1]

  const cw = (W - 2 * PAD) / M
  const cx = (k: number) => PAD + (k - 0.5) * cw
  const labelAll = M <= 12
  const ticks = labelAll ? [] : [1, ...Array.from({ length: Math.floor(M / 5) }, (_, j) => (j + 1) * 5).filter((t) => t < M), M]
  const place = (fr: Frame) => {
    const ptrs: { label: string; k: number }[] = [{ label: 'lo', k: fr.lo }]
    if (fr.mid !== undefined && fr.answer === undefined) ptrs.push({ label: 'mid', k: fr.mid })
    ptrs.push({ label: 'hi', k: fr.hi })
    // a pointer drops to the next lane when its label would collide with one already placed
    const out: { label: string; k: number; lane: number }[] = []
    for (const p of ptrs) {
      let lane = 0
      while (out.some((q) => q.lane === lane && Math.abs(cx(q.k) - cx(p.k)) < 46)) lane++
      out.push({ ...p, lane })
    }
    return out
  }
  const placed = place(f)
  const lanesUsed = Math.max(...frames.map((fr) => Math.max(...place(fr).map((p) => p.lane + 1))))
  const ptrY = CELL_Y + CELL_H + (labelAll ? 8 : 26)
  const H = ptrY + lanesUsed * 34 + 2
  const trans = { duration: reduced ? 0 : 0.3, ease: [0.16, 1, 0.3, 1] as const }

  const pileHours = f.mid !== undefined && f.hours !== undefined ? piles.map((p) => ({ p, t: Math.ceil(p / f.mid!) })) : null

  return (
    <WidgetFrame
      caption="Búsqueda binaria sobre la respuesta (Koko Eating Bananas). Cada celda es una velocidad posible. Como la condición es monótona, una sola evaluación pinta toda una mitad de la recta."
      controls={
        <>
          <label className="asp-pick">
            <span className="seg__label">Pilas</span>
            <select
              value={preset}
              onChange={(e) => {
                const k = Number(e.target.value)
                setPreset(k)
                setH(PRESETS[k].h)
              }}
            >
              {PRESETS.map((p, k) => (
                <option key={p.label} value={k}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <Slider label="Horas disponibles (h)" value={h} min={piles.length} max={total} onChange={setH} format={(v) => `${v} h`} />
          <Segmented
            label="Ver"
            value={show}
            onChange={setShow}
            options={[
              { value: 'search', label: 'Lo que sabe la búsqueda' },
              { value: 'all', label: 'can(k) para todo k' },
            ]}
          />
        </>
      }
      readout={<StepNote tone={f.tone}>{f.note}</StepNote>}
    >
      <AlgoLayout
        visual={
          <>
            <svg className="asp-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Velocidades de 1 a ${M}. Rango actual [${f.lo}, ${f.hi}].`}>
              <text x={PAD} y={14} className="asp-axis-title">
                {show === 'all' ? 'can(k) evaluada en cada k (fuerza bruta)' : 'velocidad k (bananas por hora)'}
              </text>
              {Array.from({ length: M }, (_, j) => {
                const k = j + 1
                const truth: Known = hoursAt(piles, k) <= h ? 'yes' : 'no'
                const kn = show === 'all' ? truth : f.known[k]
                const ev = show === 'all' || f.evaluated.includes(k)
                const inRange = k >= f.lo && k <= f.hi
                const cls = [
                  'asp-cell',
                  kn ? `is-${kn}` : inRange ? 'is-range' : 'is-out',
                  kn && !ev ? 'is-inferred' : '',
                  k === f.mid && f.answer === undefined ? 'is-mid' : '',
                  k === f.answer ? 'is-answer' : '',
                ].join(' ')
                return (
                  <g key={k}>
                    <rect className={cls} x={PAD + j * cw + 1} y={CELL_Y} width={Math.max(1, cw - 2)} height={CELL_H} rx={3} />
                    {labelAll && (
                      <text x={cx(k)} y={CELL_Y + CELL_H / 2 + 5} className="asp-num" textAnchor="middle">
                        {k}
                      </text>
                    )}
                  </g>
                )
              })}
              {ticks.map((t) => (
                <g key={t}>
                  <line x1={cx(t)} x2={cx(t)} y1={CELL_Y + CELL_H + 2} y2={CELL_Y + CELL_H + 7} className="asp-tick" />
                  <text x={cx(t)} y={CELL_Y + CELL_H + 21} textAnchor="middle" className="asp-num">
                    {t}
                  </text>
                </g>
              ))}
              {placed.map((p) => (
                <motion.g key={p.label} initial={false} animate={{ x: cx(p.k), y: ptrY + p.lane * 34 }} transition={trans}>
                  <path d="M0 0 L6 9 L-6 9 Z" className={`asp-ptr asp-ptr--${p.label}`} />
                  <text y={26} textAnchor="middle" className={`asp-ptr-label asp-ptr--${p.label}`}>
                    {p.label}={p.k}
                  </text>
                </motion.g>
              ))}
            </svg>
            <div className="asp-legend" aria-hidden="true">
              <span>
                <i className="asp-sw is-yes" /> sí alcanza
              </span>
              <span>
                <i className="asp-sw is-no" /> no alcanza
              </span>
              <span>
                <i className="asp-sw is-yes is-inferred" /> deducido sin evaluar
              </span>
            </div>
            {pileHours && (
              <div className="asp-calc" aria-label={`Horas con k = ${f.mid}`}>
                <span className="asp-calc__title">can({f.mid}):</span>
                {pileHours.map(({ p, t }, j) => (
                  <span key={j} className="asp-calc__pile">
                    ⌈{p}/{f.mid}⌉ = {t}
                  </span>
                ))}
                <span className={`asp-calc__sum ${f.hours! <= h ? 'is-yes' : 'is-no'}`}>
                  total {f.hours} h {f.hours! <= h ? '≤' : '>'} {h} h
                </span>
              </div>
            )}
            <VarPanel
              vars={[
                { name: 'h', value: h },
                { name: 'lo', value: f.lo, changed: !!prev && prev.lo !== f.lo },
                { name: 'hi', value: f.hi, changed: !!prev && prev.hi !== f.hi },
                { name: 'mid', value: f.mid ?? '—', changed: !!prev && prev.mid !== f.mid },
                { name: 'evaluaciones', value: f.evaluated.length },
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
