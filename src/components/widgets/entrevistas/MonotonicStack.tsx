import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { WidgetFrame } from '../kit'
import { AlgoLayout, ArrayView, type CellState, CodeTrace, StepControls, StepNote, VarPanel } from './algo-kit'
import { useStepPlayer } from './useStepPlayer'
import './MonotonicStack.css'

/**
 * Daily Temperatures with a monotonic (decreasing) stack of indices. The stack
 * is drawn as a vertical column; pops fill the answer array.
 */

const CODE = [
  'def daily_temperatures(temps):',
  '    answer = [0] * len(temps)',
  '    stack = []  # índices, temperaturas decrecientes',
  '    for i, t in enumerate(temps):',
  '        while stack and temps[stack[-1]] < t:',
  '            j = stack.pop()',
  '            answer[j] = i - j',
  '        stack.append(i)',
  '    return answer',
]

type TopState = 'compare' | 'keep'

/** Same solution in Java; JAVA_MAP[k] = the Java line(s) for Python line k. */
const JAVA = [
  'int[] dailyTemperatures(int[] temps) {',
  '    int[] answer = new int[temps.length];',
  '    Deque<Integer> stack = new ArrayDeque<>(); // índices',
  '    for (int i = 0; i < temps.length; i++) {',
  '        while (!stack.isEmpty() && temps[stack.peek()] < temps[i]) {',
  '            int j = stack.pop();',
  '            answer[j] = i - j;',
  '        }',
  '        stack.push(i);',
  '    }',
  '    return answer;',
  '}',
]
const JAVA_MAP = [0, 1, 2, 3, 4, 5, 6, 8, 10]

interface Frame {
  line: number | number[]
  i: number
  stack: number[]
  answer: (number | null)[]
  states: Partial<Record<number, CellState>>
  astates: Partial<Record<number, CellState>>
  top?: TopState
  pushes: number
  pops: number
  note: string
  tone?: 'ok' | 'bad'
}

function buildFrames(temps: number[]): Frame[] {
  const frames: Frame[] = []
  const n = temps.length
  const stack: number[] = []
  const answer: (number | null)[] = temps.map(() => null)
  const resolved = new Set<number>()
  let pushes = 0
  let pops = 0
  let lastFilled = -1

  const states = (i: number, extra: Partial<Record<number, CellState>> = {}) => {
    const st: Partial<Record<number, CellState>> = {}
    for (let q = 0; q < n; q++) {
      if (resolved.has(q)) st[q] = 'done'
      else if (stack.includes(q)) st[q] = 'window'
    }
    if (i >= 0 && i < n) st[i] = 'active'
    return { ...st, ...extra }
  }
  const astates = () => {
    const st: Partial<Record<number, CellState>> = {}
    resolved.forEach((q) => (st[q] = q === lastFilled ? 'found' : 'done'))
    return st
  }
  const push = (f: Omit<Frame, 'stack' | 'answer' | 'pushes' | 'pops' | 'astates'>) =>
    frames.push({ ...f, stack: [...stack], answer: [...answer], pushes, pops, astates: astates() })

  push({
    line: [1, 2],
    i: -1,
    states: {},
    note: 'La pila guarda los días que todavía esperan uno más cálido. Invariante: de abajo hacia arriba, sus temperaturas nunca suben.',
  })

  for (let i = 0; i < n; i++) {
    const t = temps[i]
    lastFilled = -1
    push({
      line: 3,
      i,
      states: states(i),
      note: stack.length
        ? `Día ${i}: ${t}°. ¿Es más cálido que el día del tope de la pila?`
        : `Día ${i}: ${t}°. La pila está vacía: nadie espera, así que solo lo apilamos.`,
    })
    while (stack.length && temps[stack[stack.length - 1]] < t) {
      const j = stack[stack.length - 1]
      push({
        line: 4,
        i,
        top: 'compare',
        tone: 'ok',
        states: states(i, { [j]: 'compare' }),
        note: `temps[${j}] = ${temps[j]} < ${t}: el día ${i} es el primer día más cálido que el día ${j}. Lo sabemos porque todo lo que vino entre ${j} y ${i} ya salió o era más frío.`,
      })
      stack.pop()
      pops++
      answer[j] = i - j
      resolved.add(j)
      lastFilled = j
      push({
        line: [5, 6],
        i,
        states: states(i),
        note: `Sacamos el día ${j} y anotamos answer[${j}] = ${i} − ${j} = ${i - j}. Ese índice ya no vuelve a entrar en la pila.`,
      })
    }
    if (stack.length) {
      const j = stack[stack.length - 1]
      push({
        line: 4,
        i,
        top: 'keep',
        states: states(i, { [j]: 'compare' }),
        note: `temps[${j}] = ${temps[j]} ≥ ${t}: el tope sigue esperando. Y todo lo que está debajo es igual o más cálido que el tope, así que tampoco puede resolverse: paramos el while.`,
      })
    }
    stack.push(i)
    pushes++
    lastFilled = -1
    push({
      line: 7,
      i,
      states: states(i),
      note: `Apilamos el día ${i} (${t}°). La pila sigue sin subir de abajo hacia arriba: cada elemento queda encima de uno igual o más cálido.`,
    })
  }

  const waiting = [...stack]
  stack.length = 0
  waiting.forEach((q) => {
    answer[q] = 0
  })
  const finalStates: Partial<Record<number, CellState>> = {}
  for (let q = 0; q < n; q++) finalStates[q] = 'done'
  frames.push({
    line: 8,
    i: n,
    stack: waiting,
    answer: [...answer],
    states: finalStates,
    astates: Object.fromEntries(waiting.map((q) => [q, 'muted' as CellState])),
    pushes,
    pops,
    tone: 'ok',
    note: `Fin. ${waiting.length ? `Los días que quedaron en la pila (${waiting.join(', ')}) nunca encontraron uno más cálido: se quedan con 0. ` : ''}${pushes} push y ${pops} pop: cada índice entra una vez y sale a lo sumo una vez, así que el total es O(n) aunque haya un while dentro del for.`,
  })
  return frames
}

const PRESETS: { label: string; temps: number[] }[] = [
  { label: '[73, 74, 75, 71, 69, 72, 76, 73]', temps: [73, 74, 75, 71, 69, 72, 76, 73] },
  { label: '[30, 40, 50, 60] (sube)', temps: [30, 40, 50, 60] },
  { label: '[60, 50, 40, 30] (baja)', temps: [60, 50, 40, 30] },
  { label: '[70, 70, 71] (empates)', temps: [70, 70, 71] },
]

function parseTemps(text: string): number[] | null {
  const parts = text.split(/[\s,]+/).filter(Boolean)
  if (parts.length < 1 || parts.length > 10) return null
  if (!parts.every((p) => /^\d{1,3}$/.test(p))) return null
  return parts.map(Number)
}

export function MonotonicStack() {
  const reduced = useReducedMotion()
  const [preset, setPreset] = useState(0)
  const [temps, setTemps] = useState(PRESETS[0].temps)
  const [text, setText] = useState(PRESETS[0].temps.join(', '))
  const frames = useMemo(() => buildFrames(temps), [temps])
  const player = useStepPlayer(frames.length, { resetKey: temps.join(',') })
  const f = frames[player.i]
  const prev = frames[player.i - 1]
  const ok = parseTemps(text) !== null
  const t = { duration: reduced ? 0.15 : 0.26, ease: [0.16, 1, 0.3, 1] as const }

  return (
    <WidgetFrame
      caption="Daily Temperatures con una pila monótona: cada día espera en la pila hasta que llega uno más cálido, que lo saca y escribe su respuesta."
      controls={
        <>
          <label className="mst-field">
            <span className="seg__label">Ejemplo</span>
            <select
              value={preset}
              onChange={(e) => {
                const p = Number(e.target.value)
                setPreset(p)
                setTemps(PRESETS[p].temps)
                setText(PRESETS[p].temps.join(', '))
              }}
            >
              {PRESETS.map((p, j) => (
                <option key={p.label} value={j}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="mst-field mst-field--grow">
            <span className="seg__label">Temperaturas (hasta 10)</span>
            <input
              type="text"
              value={text}
              aria-invalid={!ok}
              onChange={(e) => {
                setText(e.target.value)
                const p = parseTemps(e.target.value)
                if (p) setTemps(p)
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
            <div className="mst-stage">
              <div className="mst-arrays">
                <ArrayView
                  label={`Temperaturas: ${temps.join(', ')}`}
                  caption="temps"
                  values={temps}
                  states={f.states}
                  pointers={f.i >= 0 && f.i < temps.length ? [{ at: f.i, label: 'i' }] : []}
                />
                <ArrayView
                  label={`Respuesta: ${f.answer.map((a) => (a === null ? 'pendiente' : a)).join(', ')}`}
                  caption="answer"
                  values={f.answer.map((a) => (a === null ? '·' : a))}
                  states={f.astates}
                />
              </div>
              <div className="mst-col" aria-label={`Pila, del tope a la base: ${[...f.stack].reverse().map((q) => `día ${q} (${temps[q]}°)`).join(', ') || 'vacía'}`}>
                <span className="mst-col__cap">stack</span>
                <span className="mst-col__top" aria-hidden="true">
                  tope
                </span>
                <div className="mst-col__well">
                  <AnimatePresence initial={false}>
                    {[...f.stack].reverse().map((q, k) => {
                      const isTop = k === 0
                      const cls = isTop && f.top === 'compare' ? 'is-out' : isTop && f.top === 'keep' ? 'is-keep' : ''
                      return (
                        <motion.div
                          key={q}
                          className={`mst-box ${cls}`}
                          initial={reduced ? { opacity: 0 } : { opacity: 0, y: -14 }}
                          animate={{ opacity: 1, y: 0 }}
                          exit={reduced ? { opacity: 0 } : { opacity: 0, x: 18 }}
                          transition={t}
                        >
                          <span className="mst-box__t">{temps[q]}°</span>
                          <span className="mst-box__i">día {q}</span>
                        </motion.div>
                      )
                    })}
                  </AnimatePresence>
                  {f.stack.length === 0 && <span className="mst-col__empty">vacía</span>}
                </div>
              </div>
            </div>
            <VarPanel
              vars={[
                { name: 't', value: f.i >= 0 && f.i < temps.length ? temps[f.i] : '—', changed: !!prev && prev.i !== f.i },
                { name: 'push', value: f.pushes, changed: !!prev && prev.pushes !== f.pushes },
                { name: 'pop', value: f.pops, changed: !!prev && prev.pops !== f.pops },
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
