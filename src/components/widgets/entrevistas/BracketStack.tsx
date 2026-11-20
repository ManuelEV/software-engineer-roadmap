import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { WidgetFrame } from '../kit'
import { AlgoLayout, ArrayView, type CellState, CodeTrace, StepControls, StepNote } from './algo-kit'
import { useStepPlayer } from './useStepPlayer'
import './BracketStack.css'

/**
 * Valid Parentheses: openers are pushed; each closer must match the top of
 * the stack. Shows valid and invalid inputs.
 */

const CODE = [
  'def is_valid(s):',
  "    pairs = {')': '(', ']': '[', '}': '{'}",
  '    stack = []',
  '    for c in s:',
  '        if c in pairs:',
  '            if not stack or stack[-1] != pairs[c]:',
  '                return False',
  '            stack.pop()',
  '        else:',
  '            stack.append(c)',
  '    return not stack',
]

const PAIRS: Record<string, string> = { ')': '(', ']': '[', '}': '{' }

interface Item {
  ch: string
  at: number
}

/** Same solution in Java; JAVA_MAP[k] = the Java line(s) for Python line k. */
const JAVA = [
  'boolean isValid(String s) {',
  "    Map<Character, Character> pairs = Map.of(')', '(', ']', '[', '}', '{');",
  '    Deque<Character> stack = new ArrayDeque<>();',
  '    for (char c : s.toCharArray()) {',
  '        if (pairs.containsKey(c)) {',
  '            char open = pairs.get(c);',
  '            if (stack.isEmpty() || stack.peek() != open) {',
  '                return false;',
  '            }',
  '            stack.pop();',
  '        } else {',
  '            stack.push(c);',
  '        }',
  '    }',
  '    return stack.isEmpty();',
  '}',
]
const JAVA_MAP = [0, 1, 2, 3, 4, [5, 6], 7, 9, 10, 11, 14]

interface Frame {
  line: number | number[]
  i: number
  stack: Item[]
  states: Partial<Record<number, CellState>>
  top?: 'ok' | 'bad'
  note: string
  tone?: 'ok' | 'bad'
}

function buildFrames(s: string): Frame[] {
  const frames: Frame[] = []
  const stack: Item[] = []
  const matched = new Set<number>()
  const states = (i: number, extra: Partial<Record<number, CellState>> = {}) => {
    const st: Partial<Record<number, CellState>> = {}
    for (let q = 0; q < i; q++) st[q] = matched.has(q) ? 'done' : 'window'
    if (i < s.length) st[i] = 'active'
    return { ...st, ...extra }
  }
  const push = (f: Omit<Frame, 'stack'>) => frames.push({ ...f, stack: [...stack] })

  push({
    line: [1, 2],
    i: -1,
    states: {},
    note: 'Cada símbolo que abre queda esperando en la pila. El que cierra tiene que corresponder al último que abrió y sigue sin cerrar: el tope.',
  })

  for (let i = 0; i < s.length; i++) {
    const c = s[i]
    if (!(c in PAIRS)) {
      stack.push({ ch: c, at: i })
      push({
        line: [3, 8, 9],
        i,
        states: states(i),
        note: `'${c}' abre: lo apilamos. Queda esperando su cierre.`,
      })
      continue
    }
    const want = PAIRS[c]
    if (stack.length === 0) {
      push({
        line: [3, 4, 5, 6],
        i,
        states: states(i, { [i]: 'bad' }),
        tone: 'bad',
        note: `'${c}' cierra, pero la pila está vacía: no hay nada abierto que cerrar. Devolvemos False sin mirar el resto.`,
      })
      return frames
    }
    const top = stack[stack.length - 1]
    if (top.ch !== want) {
      push({
        line: [3, 4, 5, 6],
        i,
        top: 'bad',
        states: states(i, { [i]: 'bad', [top.at]: 'bad' }),
        tone: 'bad',
        note: `'${c}' necesita un '${want}' en el tope, pero el tope es '${top.ch}' (posición ${top.at}). Se cruzaron: devolvemos False.`,
      })
      return frames
    }
    push({
      line: [3, 4, 5],
      i,
      top: 'ok',
      states: states(i, { [top.at]: 'found', [i]: 'found' }),
      tone: 'ok',
      note: `'${c}' cierra y el tope es '${want}' (posición ${top.at}): son pareja.`,
    })
    stack.pop()
    matched.add(top.at)
    matched.add(i)
    push({
      line: 7,
      i,
      states: { ...states(i), [i]: 'done' },
      note: `Sacamos '${want}' de la pila. El par ${top.at}–${i} quedó cerrado.`,
    })
  }

  const left = stack.length
  push({
    line: 10,
    i: s.length,
    states: Object.fromEntries([...s].map((_, q) => [q, (matched.has(q) ? 'done' : 'bad') as CellState])),
    tone: left === 0 ? 'ok' : 'bad',
    note:
      left === 0
        ? `Terminamos con la pila vacía: ${s.length === 0 ? 'la cadena vacía es válida.' : 'todo lo que abrió, cerró en orden. Válida.'} O(n) tiempo, O(n) memoria en el peor caso.`
        : `Se acabó la cadena y quedan ${left} ${left === 1 ? 'símbolo abierto' : 'símbolos abiertos'} en la pila. No es válida: este es el caso que más se olvida.`,
  })
  return frames
}

const PRESETS = ['({[]})', '()[]{}', '([)]', '(()', '())']

export function BracketStack() {
  const reduced = useReducedMotion()
  const [s, setS] = useState(PRESETS[0])
  const [text, setText] = useState(PRESETS[0])
  const frames = useMemo(() => buildFrames(s), [s])
  const player = useStepPlayer(frames.length, { resetKey: s })
  const f = frames[player.i]
  const valid = /^[()[\]{}]{0,16}$/.test(text)
  const preset = PRESETS.indexOf(s)
  const t = { duration: reduced ? 0.15 : 0.26, ease: [0.16, 1, 0.3, 1] as const }

  return (
    <WidgetFrame
      caption="Valid Parentheses: lo que abre se apila; lo que cierra debe coincidir con el tope. Prueba entradas válidas e inválidas."
      controls={
        <>
          <label className="bks-field">
            <span className="seg__label">Ejemplo</span>
            <select
              value={preset}
              onChange={(e) => {
                const v = PRESETS[Number(e.target.value)]
                if (v === undefined) return
                setS(v)
                setText(v)
              }}
            >
              {preset < 0 && <option value={-1}>(tu cadena)</option>}
              {PRESETS.map((p, j) => (
                <option key={p} value={j}>
                  {p}
                </option>
              ))}
            </select>
          </label>
          <label className="bks-field bks-field--grow">
            <span className="seg__label">s (solo ( ) [ ] {'{ }'}, hasta 16)</span>
            <input
              type="text"
              value={text}
              aria-invalid={!valid}
              spellCheck={false}
              onChange={(e) => {
                setText(e.target.value)
                if (/^[()[\]{}]{0,16}$/.test(e.target.value)) setS(e.target.value)
              }}
            />
          </label>
        </>
      }
      readout={<StepNote tone={f.tone}>{f.note}</StepNote>}
    >
      <AlgoLayout
        visual={
          <div className="bks-stage">
            <div className="bks-left">
              {s.length > 0 ? (
                <ArrayView
                  label={`Cadena: ${s}`}
                  caption="s"
                  values={[...s]}
                  states={f.states}
                  pointers={f.i >= 0 && f.i < s.length ? [{ at: f.i, label: 'c' }] : []}
                />
              ) : (
                <p className="bks-empty">s = "" (cadena vacía)</p>
              )}
              <p className="bks-legend">
                <span className="bks-dot bks-dot--wait" /> abierto, esperando <span className="bks-dot bks-dot--done" /> cerrado
              </p>
            </div>
            <div className="bks-col" aria-label={`Pila, del tope a la base: ${[...f.stack].reverse().map((x) => x.ch).join(' ') || 'vacía'}`}>
              <span className="bks-col__cap">stack</span>
              <span className="bks-col__top" aria-hidden="true">
                tope
              </span>
              <div className="bks-col__well">
                <AnimatePresence initial={false}>
                  {[...f.stack].reverse().map((x, k) => (
                    <motion.div
                      key={x.at}
                      className={`bks-box ${k === 0 && f.top ? `is-${f.top}` : ''}`}
                      initial={reduced ? { opacity: 0 } : { opacity: 0, y: -14 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={reduced ? { opacity: 0 } : { opacity: 0, x: 18 }}
                      transition={t}
                    >
                      <span className="bks-box__c">{x.ch}</span>
                      <span className="bks-box__i">pos {x.at}</span>
                    </motion.div>
                  ))}
                </AnimatePresence>
                {f.stack.length === 0 && <span className="bks-col__empty">vacía</span>}
              </div>
            </div>
          </div>
        }
        code={<CodeTrace title="Python" lines={CODE} active={f.line} variants={[{ label: 'Java', lines: JAVA, map: JAVA_MAP }]} />}
      />
      <StepControls player={player} />
    </WidgetFrame>
  )
}
