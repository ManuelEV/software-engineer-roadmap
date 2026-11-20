import { useMemo, useState } from 'react'
import { WidgetFrame } from '../kit'
import { AlgoLayout, ArrayView, type CellState, CodeTrace, type Pointer, StepControls, StepNote, VarPanel } from './algo-kit'
import { useStepPlayer } from './useStepPlayer'
import './ThreeSum.css'

/**
 * 3Sum: sort, fix nums[i], then Two Sum II with two pointers on the rest.
 * Duplicates are skipped for i and for l after each match.
 */

const CODE = [
  'def three_sum(nums):',
  '    nums.sort()',
  '    res = []',
  '    for i in range(len(nums) - 2):',
  '        if i > 0 and nums[i] == nums[i - 1]:',
  '            continue',
  '        l, r = i + 1, len(nums) - 1',
  '        while l < r:',
  '            s = nums[i] + nums[l] + nums[r]',
  '            if s < 0:',
  '                l += 1',
  '            elif s > 0:',
  '                r -= 1',
  '            else:',
  '                res.append([nums[i], nums[l], nums[r]])',
  '                l += 1',
  '                while l < r and nums[l] == nums[l - 1]:',
  '                    l += 1',
  '    return res',
]

/** Same solution in Java; JAVA_MAP[k] = the Java line(s) for Python line k. */
const JAVA = [
  'List<List<Integer>> threeSum(int[] nums) {',
  '    Arrays.sort(nums);',
  '    List<List<Integer>> res = new ArrayList<>();',
  '    for (int i = 0; i < nums.length - 2; i++) {',
  '        if (i > 0 && nums[i] == nums[i - 1])',
  '            continue;',
  '        int l = i + 1, r = nums.length - 1;',
  '        while (l < r) {',
  '            int s = nums[i] + nums[l] + nums[r];',
  '            if (s < 0) {',
  '                l++;',
  '            } else if (s > 0) {',
  '                r--;',
  '            } else {',
  '                res.add(List.of(nums[i], nums[l], nums[r]));',
  '                l++;',
  '                while (l < r && nums[l] == nums[l - 1])',
  '                    l++;',
  '            }',
  '        }',
  '    }',
  '    return res;',
  '}',
]
const JAVA_MAP = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 21]

interface Frame {
  line: number | number[]
  i: number
  l: number
  r: number
  s?: number
  res: number[][]
  states: Partial<Record<number, CellState>>
  note: string
  tone?: 'ok' | 'bad'
  fresh?: boolean
}

function stage(n: number, i: number, l: number, r: number, extra: Partial<Record<number, CellState>> = {}) {
  const st: Partial<Record<number, CellState>> = {}
  for (let q = 0; q < n; q++) {
    if (q < i) st[q] = 'done'
    else if (q === i) st[q] = 'active'
    else if (q < l || q > r) st[q] = 'muted'
    else st[q] = q === l || q === r ? 'compare' : 'window'
  }
  return { ...st, ...extra }
}

const fmt = (v: number) => (v < 0 ? `(${v})` : String(v))

function buildFrames(orig: number[]): { sorted: number[]; frames: Frame[] } {
  const nums = [...orig].sort((a, b) => a - b)
  const n = nums.length
  const frames: Frame[] = []
  const res: number[][] = []
  const snap = () => res.map((t) => [...t])

  frames.push({
    line: 1,
    i: -1,
    l: -1,
    r: -1,
    res: [],
    states: {},
    note: `Ordenamos: [${orig.join(', ')}] → [${nums.join(', ')}]. Cuesta O(n log n), menos que el O(n²) que viene, y nos da dos cosas: una regla para mover punteros y los duplicados juntos.`,
  })

  for (let i = 0; i < n - 2; i++) {
    if (i > 0 && nums[i] === nums[i - 1]) {
      frames.push({
        line: [4, 5],
        i,
        l: -1,
        r: -1,
        res: snap(),
        states: stage(n, i, n, -1, { [i - 1]: 'compare' }),
        note: `nums[${i}] = ${nums[i]} es igual al anterior: cualquier triplete que lo use ya lo encontramos con i = ${i - 1}. Lo saltamos para no repetir respuestas.`,
      })
      continue
    }
    let l = i + 1
    let r = n - 1
    frames.push({
      line: 6,
      i,
      l,
      r,
      res: snap(),
      states: stage(n, i, l, r),
      note: `Fijamos nums[${i}] = ${nums[i]}. Ahora es Two Sum II: buscar en nums[${l}..${r}] (ordenado) dos números que sumen ${-nums[i]}.`,
    })
    while (l < r) {
      const s = nums[i] + nums[l] + nums[r]
      if (s < 0) {
        frames.push({
          line: [8, 9, 10],
          i,
          l,
          r,
          s,
          res: snap(),
          states: stage(n, i, l, r),
          note: `${nums[i]} + ${fmt(nums[l])} + ${fmt(nums[r])} = ${s} < 0. Necesitamos sumar más. Con este l, cualquier r más a la izquierda da una suma todavía menor: l ya no sirve, l += 1.`,
        })
        l++
      } else if (s > 0) {
        frames.push({
          line: [8, 11, 12],
          i,
          l,
          r,
          s,
          res: snap(),
          states: stage(n, i, l, r),
          note: `${nums[i]} + ${fmt(nums[l])} + ${fmt(nums[r])} = ${s} > 0. Sobra. Con este r, cualquier l más a la derecha da una suma mayor: r ya no sirve, r −= 1.`,
        })
        r--
      } else {
        res.push([nums[i], nums[l], nums[r]])
        frames.push({
          line: [8, 13, 14, 15],
          i,
          l,
          r,
          s,
          res: snap(),
          fresh: true,
          tone: 'ok',
          states: stage(n, i, l, r, { [i]: 'found', [l]: 'found', [r]: 'found' }),
          note: `${nums[i]} + ${fmt(nums[l])} + ${fmt(nums[r])} = 0. Triplete encontrado: [${nums[i]}, ${nums[l]}, ${nums[r]}]. Avanzamos l para seguir buscando con el mismo i.`,
        })
        l++
        const from = l
        while (l < r && nums[l] === nums[l - 1]) l++
        if (l > from) {
          frames.push({
            line: [16, 17],
            i,
            l,
            r,
            res: snap(),
            states: stage(n, i, l, r),
            note: `nums[${from}] repetía el valor ${nums[from - 1]}: con el mismo i daría el mismo triplete. Saltamos ${l - from} ${l - from === 1 ? 'posición' : 'posiciones'}; l queda en ${l}.`,
          })
        }
      }
    }
  }

  const all: Partial<Record<number, CellState>> = {}
  for (let q = 0; q < n; q++) all[q] = 'done'
  frames.push({
    line: 18,
    i: n,
    l: -1,
    r: -1,
    res: snap(),
    states: all,
    tone: res.length ? 'ok' : 'bad',
    note: res.length
      ? `${res.length} ${res.length === 1 ? 'triplete' : 'tripletes'} sin repetir. O(n²) tiempo: n valores de i, y para cada uno una pasada lineal de l y r. Memoria O(1) extra (más lo que use el sort).`
      : 'Ningún triplete suma 0. Igual recorrimos todo en O(n²).',
  })
  return { sorted: nums, frames }
}

const PRESETS: { label: string; nums: number[] }[] = [
  { label: '[-1, 0, 1, 2, -1, -4]', nums: [-1, 0, 1, 2, -1, -4] },
  { label: '[-2, 0, 0, 2, 2]', nums: [-2, 0, 0, 2, 2] },
  { label: '[0, 0, 0, 0]', nums: [0, 0, 0, 0] },
  { label: '[3, -2, 1, 0] (sin solución)', nums: [3, -2, 1, 0] },
]

function parseNums(text: string): number[] | null {
  const parts = text.split(/[\s,]+/).filter(Boolean)
  if (parts.length < 3 || parts.length > 10) return null
  if (!parts.every((p) => /^-?\d{1,2}$/.test(p))) return null
  return parts.map(Number)
}

export function ThreeSum() {
  const [preset, setPreset] = useState(0)
  const [nums, setNums] = useState(PRESETS[0].nums)
  const [text, setText] = useState(PRESETS[0].nums.join(', '))
  const { sorted, frames } = useMemo(() => buildFrames(nums), [nums])
  const player = useStepPlayer(frames.length, { resetKey: nums.join(',') })
  const f = frames[player.i]
  const prev = frames[player.i - 1]
  const ok = parseNums(text) !== null
  const ptrs: Pointer[] = []
  if (f.i >= 0 && f.i < sorted.length) ptrs.push({ at: f.i, label: 'i', tone: 'ink' })
  if (f.l >= 0) ptrs.push({ at: f.l, label: 'l' }, { at: f.r, label: 'r' })

  return (
    <WidgetFrame
      caption="3Sum: ordenar, fijar nums[i] y resolver Two Sum II en el resto con dos punteros. Los duplicados se saltan en i y en l."
      controls={
        <>
          <label className="t3-field">
            <span className="seg__label">Ejemplo</span>
            <select
              value={preset}
              onChange={(e) => {
                const p = Number(e.target.value)
                setPreset(p)
                setNums(PRESETS[p].nums)
                setText(PRESETS[p].nums.join(', '))
              }}
            >
              {PRESETS.map((p, j) => (
                <option key={p.label} value={j}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="t3-field t3-field--grow">
            <span className="seg__label">nums (3 a 10 valores)</span>
            <input
              type="text"
              value={text}
              aria-invalid={!ok}
              onChange={(e) => {
                setText(e.target.value)
                const p = parseNums(e.target.value)
                if (p) setNums(p)
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
            <ArrayView label={`nums ordenado: ${sorted.join(', ')}`} caption="nums (ordenado)" values={sorted} states={f.states} pointers={ptrs} />
            <VarPanel
              vars={[
                { name: 'nums[i]', value: f.i >= 0 && f.i < sorted.length ? sorted[f.i] : '—', changed: !!prev && prev.i !== f.i },
                { name: 'objetivo l + r', value: f.i >= 0 && f.i < sorted.length ? -sorted[f.i] : '—' },
                { name: 's', value: f.s ?? '—', changed: f.s !== undefined },
              ]}
            />
            <div className="t3-res" aria-label="Tripletes encontrados">
              <span className="t3-res__cap">res</span>
              <div className="t3-res__rows">
                {f.res.length === 0 && <span className="t3-res__empty">[ ]</span>}
                {f.res.map((t, j) => (
                  <span key={j} className={`t3-res__item ${f.fresh && j === f.res.length - 1 ? 'is-new' : ''}`}>
                    [{t.join(', ')}]
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
