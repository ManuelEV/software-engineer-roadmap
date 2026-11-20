import { useMemo, useState } from 'react'
import { WidgetFrame } from '../kit'
import { AlgoLayout, ArrayView, type CellState, CodeTrace, StepControls, StepNote, VarPanel } from './algo-kit'
import { useStepPlayer } from './useStepPlayer'
import './TwoSumHash.css'

/**
 * Reference widget for the live-coding topics: Two Sum in one pass with a hash
 * map. Frames are precomputed from the input; the player only moves an index.
 */

const CODE = [
  'def two_sum(nums, target):',
  '    seen = {}  # valor -> índice',
  '    for i, x in enumerate(nums):',
  '        need = target - x',
  '        if need in seen:',
  '            return [seen[need], i]',
  '        seen[x] = i',
  '    return []',
]

/** Same solution in Java; JAVA_MAP[k] = the Java line(s) for Python line k. */
const JAVA = [
  'int[] twoSum(int[] nums, int target) {',
  '    Map<Integer, Integer> seen = new HashMap<>(); // valor -> índice',
  '    for (int i = 0; i < nums.length; i++) {',
  '        int x = nums[i];',
  '        int need = target - x;',
  '        if (seen.containsKey(need)) {',
  '            return new int[] { seen.get(need), i };',
  '        }',
  '        seen.put(x, i);',
  '    }',
  '    return new int[0];',
  '}',
]
const JAVA_MAP = [0, 1, [2, 3], 4, 5, 6, 8, 10]

interface Frame {
  line: number
  i: number
  need?: number
  seen: [number, number][]
  states: Partial<Record<number, CellState>>
  note: string
  tone?: 'ok' | 'bad'
  hit?: number
}

function buildFrames(nums: number[], target: number): Frame[] {
  const frames: Frame[] = []
  const seen = new Map<number, number>()
  const snapshot = () => [...seen.entries()]
  const done = (upTo: number) => Object.fromEntries(Array.from({ length: upTo }, (_, k) => [k, 'done' as CellState]))

  frames.push({ line: 1, i: -1, seen: [], states: {}, note: `Empezamos con un diccionario vacío. Buscamos dos números que sumen ${target}.` })
  for (let i = 0; i < nums.length; i++) {
    const x = nums[i]
    const need = target - x
    frames.push({ line: 3, i, need, seen: snapshot(), states: { ...done(i), [i]: 'active' }, note: `Miramos nums[${i}] = ${x}. Para llegar a ${target} nos falta ${need}.` })
    if (seen.has(need)) {
      const j = seen.get(need)!
      frames.push({
        line: 5,
        i,
        need,
        seen: snapshot(),
        states: { ...done(i), [j]: 'found', [i]: 'found' },
        hit: need,
        tone: 'ok',
        note: `¡${need} ya está en el diccionario, en el índice ${j}! Respuesta: [${j}, ${i}]. Una sola pasada: O(n) tiempo, O(n) memoria.`,
      })
      return frames
    }
    frames.push({ line: 4, i, need, seen: snapshot(), states: { ...done(i), [i]: 'active' }, note: `¿Está ${need} en el diccionario? No (la consulta cuesta O(1) en promedio).` })
    seen.set(x, i)
    frames.push({ line: 6, i, need, seen: snapshot(), states: { ...done(i), [i]: 'active' }, note: `Guardamos ${x} → ${i}, por si más adelante alguien necesita un ${x}.` })
  }
  frames.push({ line: 7, i: nums.length, seen: snapshot(), states: done(nums.length), tone: 'bad', note: 'Recorrimos todo sin encontrar el par: no hay solución.' })
  return frames
}

const PRESETS: { label: string; nums: number[]; target: number }[] = [
  { label: '[2, 7, 11, 15] → 9', nums: [2, 7, 11, 15], target: 9 },
  { label: '[3, 2, 4] → 6', nums: [3, 2, 4], target: 6 },
  { label: '[4, 9, 1, 6, 3, 8] → 11', nums: [4, 9, 1, 6, 3, 8], target: 11 },
  { label: '[1, 5, 3] → 10', nums: [1, 5, 3], target: 10 },
]

export function TwoSumHash() {
  const [preset, setPreset] = useState(2)
  const { nums, target } = PRESETS[preset]
  const frames = useMemo(() => buildFrames(nums, target), [nums, target])
  const player = useStepPlayer(frames.length, { resetKey: String(preset) })
  const f = frames[player.i]
  const prev = frames[player.i - 1]

  return (
    <WidgetFrame
      caption="Two Sum en una pasada: por cada número preguntamos si su complemento ya apareció. El diccionario cambia una búsqueda O(n) por una O(1)."
      controls={
        <label className="tsh-pick">
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
            <ArrayView
              label={`Arreglo nums: ${nums.join(', ')}`}
              caption="nums"
              values={nums}
              states={f.states}
              pointers={f.i >= 0 && f.i < nums.length ? [{ at: f.i, label: 'i' }] : []}
            />
            <VarPanel
              vars={[
                { name: 'target', value: target },
                { name: 'x', value: f.i >= 0 && f.i < nums.length ? nums[f.i] : '—', changed: !!prev && prev.i !== f.i },
                { name: 'need', value: f.need ?? '—', changed: !!prev && prev.need !== f.need },
              ]}
            />
            <div className="tsh-map" aria-label="Diccionario seen">
              <div className="tsh-map__title">seen = {'{'}</div>
              <div className="tsh-map__rows">
                {f.seen.length === 0 && <span className="tsh-map__empty">vacío</span>}
                {f.seen.map(([k, v]) => (
                  <span key={k} className={`tsh-map__pair ${f.hit === k ? 'is-hit' : ''} ${f.line === 6 && nums[f.i] === k ? 'is-new' : ''}`}>
                    <b>{k}</b>: {v}
                  </span>
                ))}
              </div>
              <div className="tsh-map__title">{'}'}</div>
            </div>
          </>
        }
        code={<CodeTrace title="Python" lines={CODE} active={f.line} variants={[{ label: 'Java', lines: JAVA, map: JAVA_MAP }]} />}
      />
      <StepControls player={player} />
    </WidgetFrame>
  )
}
