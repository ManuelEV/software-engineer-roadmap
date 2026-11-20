import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { WidgetFrame } from '../kit'
import { AlgoLayout, CodeTrace, StepControls, StepNote, VarPanel } from './algo-kit'
import { useStepPlayer } from './useStepPlayer'
import './IntervalMerge.css'

/**
 * Merge Intervals on a timeline: the bars arrive unsorted, get sorted by start,
 * and are folded into the `merged` lane one by one. Frames come from running
 * the real algorithm on the input.
 */

type Iv = [number, number]

const CODE = [
  'def merge(intervals):',
  '    intervals.sort(key=lambda iv: iv[0])',
  '    merged = []',
  '    for start, end in intervals:',
  '        if merged and start <= merged[-1][1]:',
  '            merged[-1][1] = max(merged[-1][1], end)',
  '        else:',
  '            merged.append([start, end])',
  '    return merged',
]

/** Same solution in Java; JAVA_MAP[k] = the Java line(s) for Python line k. */
const JAVA = [
  'int[][] merge(int[][] intervals) {',
  '    Arrays.sort(intervals, (a, b) -> Integer.compare(a[0], b[0]));',
  '    List<int[]> merged = new ArrayList<>();',
  '    for (int[] iv : intervals) {',
  '        int[] last = merged.isEmpty() ? null : merged.get(merged.size() - 1);',
  '        if (last != null && iv[0] <= last[1]) {',
  '            last[1] = Math.max(last[1], iv[1]);',
  '        } else {',
  '            merged.add(new int[] { iv[0], iv[1] });',
  '        }',
  '    }',
  '    return merged.toArray(new int[0][]);',
  '}',
]
const JAVA_MAP = [0, 1, 2, 3, [4, 5], 6, 7, 8, 11]

type RowState = 'idle' | 'cur' | 'absorbed' | 'opened'

interface Frame {
  line: number
  order: number[]
  rows: RowState[]
  cur: number
  merged: Iv[]
  changed: number
  guide?: number
  note: string
  tone?: 'ok'
}

const fmtIv = ([a, b]: Iv) => `[${a},${b}]`

function buildFrames(ivs: Iv[]): Frame[] {
  const frames: Frame[] = []
  const rows: RowState[] = ivs.map(() => 'idle')
  const ident = ivs.map((_, k) => k)
  frames.push({
    line: 0,
    order: ident,
    rows: [...rows],
    cur: -1,
    merged: [],
    changed: -1,
    note: 'Así llegan: desordenados. Si los recorremos en este orden, un intervalo podría solaparse con otro que ya dejamos atrás, y tendríamos que comparar contra todos.',
  })
  if (ivs.length === 0) {
    frames.push({ line: 8, order: ident, rows: [], cur: -1, merged: [], changed: -1, tone: 'ok', note: 'Lista vacía: devolvemos [] sin hacer nada. Es el primer caso borde que conviene mencionar.' })
    return frames
  }
  const order = [...ident].sort((x, y) => ivs[x][0] - ivs[y][0])
  frames.push({
    line: 1,
    order,
    rows: [...rows],
    cur: -1,
    merged: [],
    changed: -1,
    note: 'Ordenamos por inicio: O(n log n). Ahora, si un intervalo se solapa con algo, se solapa con el último bloque fusionado, porque todo lo anterior empieza antes.',
  })
  const merged: Iv[] = []
  for (const k of order) {
    const [s, e] = ivs[k]
    const last = merged[merged.length - 1]
    rows[k] = 'cur'
    if (!last) {
      frames.push({ line: 4, order, rows: [...rows], cur: k, merged: merged.map((m) => [...m] as Iv), changed: -1, note: `Tomamos ${fmtIv(ivs[k])}. merged está vacío: no hay con quién comparar.` })
    } else {
      const ov = s <= last[1]
      frames.push({
        line: 4,
        order,
        rows: [...rows],
        cur: k,
        merged: merged.map((m) => [...m] as Iv),
        changed: -1,
        guide: last[1],
        note: ov
          ? `Tomamos ${fmtIv(ivs[k])}. ¿start ≤ fin del último bloque? ${s} ≤ ${last[1]}: sí${s === last[1] ? ' (se tocan en un punto; con ≤ cuentan como solapados)' : ''}.`
          : `Tomamos ${fmtIv(ivs[k])}. ¿start ≤ fin del último bloque? ${s} ≤ ${last[1]}: no. Hay un hueco entre ${last[1]} y ${s}.`,
      })
    }
    if (last && s <= last[1]) {
      const before = last[1]
      last[1] = Math.max(last[1], e)
      rows[k] = 'absorbed'
      frames.push({
        line: 5,
        order,
        rows: [...rows],
        cur: k,
        merged: merged.map((m) => [...m] as Iv),
        changed: merged.length - 1,
        note:
          e <= before
            ? `Fusionamos. Fin = max(${before}, ${e}) = ${before}: ${fmtIv(ivs[k])} queda contenido entero. Si escribieras merged[-1][1] = end, el bloque se achicaría a ${e}: por eso va el max.`
            : `Fusionamos: el bloque se estira hasta max(${before}, ${e}) = ${e} y queda ${fmtIv(last)}.`,
      })
    } else {
      merged.push([s, e])
      rows[k] = 'opened'
      frames.push({
        line: 7,
        order,
        rows: [...rows],
        cur: k,
        merged: merged.map((m) => [...m] as Iv),
        changed: merged.length - 1,
        note: `Empieza un bloque nuevo: ${fmtIv([s, e])}. Lo que venga después solo puede solaparse con este.`,
      })
    }
  }
  frames.push({
    line: 8,
    order,
    rows: [...rows],
    cur: -1,
    merged: merged.map((m) => [...m] as Iv),
    changed: -1,
    tone: 'ok',
    note: `Resultado: ${merged.map(fmtIv).join(', ')}. Una pasada después de ordenar: O(n log n) en total, O(n) para la salida.`,
  })
  return frames
}

const PRESETS: { label: string; ivs: Iv[] }[] = [
  { label: 'Clásico', ivs: [[1, 3], [8, 10], [2, 6], [15, 18]] },
  { label: 'Se tocan en un punto', ivs: [[5, 7], [1, 4], [4, 5], [9, 12]] },
  { label: 'Uno contenido en otro', ivs: [[2, 3], [1, 10], [4, 6], [12, 14]] },
  { label: 'Desordenados en cadena', ivs: [[8, 9], [1, 3], [6, 7], [2, 4], [3, 5]] },
]

function parse(text: string): Iv[] | string {
  const out: Iv[] = []
  const re = /\[?\s*(\d+)\s*[,\-–]\s*(\d+)\s*\]?/g
  let m: RegExpExecArray | null
  while ((m = re.exec(text))) {
    const a = Number(m[1])
    const b = Number(m[2])
    if (a > b) return `En [${a},${b}] el inicio es mayor que el fin.`
    if (b > 40) return 'Usa valores entre 0 y 40.'
    out.push([a, b])
  }
  if (!out.length) return 'Escribe pares como 1-3, 2-6 o [1,3],[2,6].'
  if (out.length > 8) return 'Hasta 8 intervalos, para que se lea bien.'
  return out
}

const W = 360
const PAD = 22
const ROW = 30
const BAR = 16

export function IntervalMerge() {
  const reduced = useReducedMotion()
  const [preset, setPreset] = useState(0)
  const [custom, setCustom] = useState<Iv[] | null>(null)
  const [text, setText] = useState('')
  const [err, setErr] = useState('')
  const ivs = custom ?? PRESETS[preset].ivs
  const frames = useMemo(() => buildFrames(ivs), [ivs])
  const player = useStepPlayer(frames.length, { resetKey: custom ? `c:${JSON.stringify(custom)}` : `p:${preset}` })
  const f = frames[player.i]

  const lo = Math.min(...ivs.map((v) => v[0]))
  const hi = Math.max(...ivs.map((v) => v[1]))
  const span = Math.max(1, hi - lo)
  const x = (v: number) => PAD + ((v - lo) / span) * (W - 2 * PAD)
  const tickStep = span <= 12 ? 1 : span <= 24 ? 2 : 5
  const ticks: number[] = []
  for (let t = Math.ceil(lo / tickStep) * tickStep; t <= hi; t += tickStep) ticks.push(t)

  const top = 8
  const mergedY = top + ivs.length * ROW + 34
  const axisY = mergedY + ROW + 12
  const H = axisY + 26
  const ease = [0.16, 1, 0.3, 1] as const

  const label = (iv: Iv, yMid: number, cls: string) => {
    const x1 = x(iv[0])
    const x2 = x(iv[1])
    const right = x2 + 6 + 46 < W
    return (
      <text x={right ? x2 + 6 : x1 - 6} y={yMid + 5} textAnchor={right ? 'start' : 'end'} className={cls}>
        {fmtIv(iv)}
      </text>
    )
  }

  const apply = () => {
    const r = parse(text)
    if (typeof r === 'string') setErr(r)
    else {
      setErr('')
      setCustom(r)
    }
  }

  return (
    <WidgetFrame
      caption="Merge Intervals sobre una línea de tiempo. Primero se ordena por inicio; después cada intervalo se compara solo con el último bloque fusionado."
      controls={
        <>
          <label className="ivm-pick">
            <span className="seg__label">Entrada</span>
            <select
              value={custom ? -1 : preset}
              onChange={(e) => {
                const v = Number(e.target.value)
                if (v >= 0) {
                  setPreset(v)
                  setCustom(null)
                  setErr('')
                }
              }}
            >
              {PRESETS.map((p, k) => (
                <option key={p.label} value={k}>
                  {p.label}
                </option>
              ))}
              {custom && <option value={-1}>Tus intervalos</option>}
            </select>
          </label>
          <form
            className="ivm-edit"
            onSubmit={(e) => {
              e.preventDefault()
              apply()
            }}
          >
            <label className="ivm-edit__lbl">
              <span className="seg__label">O escribe los tuyos</span>
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="1-3, 2-6, 8-10" aria-invalid={!!err} />
            </label>
            <button type="submit" className="btn">
              Usar
            </button>
            {err && (
              <span className="ivm-edit__err" role="alert">
                {err}
              </span>
            )}
          </form>
        </>
      }
      readout={<StepNote tone={f.tone}>{f.note}</StepNote>}
    >
      <AlgoLayout
        visual={
          <>
            <svg className="ivm-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Intervalos ${ivs.map(fmtIv).join(', ')} sobre una línea de tiempo`}>
              {ticks.map((t) => (
                <line key={`g${t}`} className="ivm-grid" x1={x(t)} x2={x(t)} y1={top - 4} y2={axisY} />
              ))}
              {f.guide !== undefined && (
                <g className="ivm-guide">
                  <line x1={x(f.guide)} x2={x(f.guide)} y1={top - 4} y2={mergedY + ROW} />
                </g>
              )}
              {ivs.map((iv, k) => {
                const pos = f.order.indexOf(k)
                const y = top + pos * ROW
                const st = f.rows[k] ?? 'idle'
                return (
                  <motion.g key={k} initial={false} animate={{ y }} transition={{ duration: reduced ? 0 : 0.4, ease }} className={`ivm-row is-${st} ${f.cur === k ? 'is-focus' : ''}`}>
                    <rect x={x(iv[0])} y={(ROW - BAR) / 2} width={Math.max(4, x(iv[1]) - x(iv[0]))} height={BAR} rx={4} />
                    {label(iv, ROW / 2, 'ivm-lbl')}
                  </motion.g>
                )
              })}
              <line className="ivm-sep" x1={PAD - 10} x2={W - PAD + 10} y1={mergedY - 14} y2={mergedY - 14} />
              <text className="ivm-lane" x={PAD - 10} y={mergedY - 20}>
                merged
              </text>
              {f.merged.map((iv, k) => (
                <g key={`m${k}`} className={`ivm-merged ${f.changed === k ? 'is-changed' : ''}`}>
                  <rect x={x(iv[0])} y={mergedY + (ROW - BAR - 4) / 2} width={Math.max(4, x(iv[1]) - x(iv[0]))} height={BAR + 4} rx={5} />
                </g>
              ))}
              {f.merged.map((iv, k) => (
                <text key={`ml${k}`} x={(x(iv[0]) + x(iv[1])) / 2} y={mergedY + ROW + 8} textAnchor="middle" className="ivm-lbl ivm-lbl--m">
                  {fmtIv(iv)}
                </text>
              ))}
              {ticks.map((t) => (
                <text key={`t${t}`} className="ivm-tick" x={x(t)} y={axisY + 18} textAnchor="middle">
                  {t}
                </text>
              ))}
            </svg>
            <VarPanel
              vars={[
                { name: 'actual', value: f.cur >= 0 ? fmtIv(ivs[f.cur]) : '—' },
                { name: 'merged[-1]', value: f.merged.length ? fmtIv(f.merged[f.merged.length - 1]) : '—' },
                { name: 'bloques', value: f.merged.length },
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
