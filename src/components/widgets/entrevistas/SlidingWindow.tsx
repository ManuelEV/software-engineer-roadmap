import { useMemo, useState } from 'react'
import { WidgetFrame, Segmented } from '../kit'
import { AlgoLayout, ArrayView, type CellState, CodeTrace, StepControls, StepNote, VarPanel } from './algo-kit'
import { useStepPlayer } from './useStepPlayer'
import './SlidingWindow.css'

/**
 * Longest Substring Without Repeating Characters with a variable window.
 * Two versions: shrink one by one with a set, or jump `l` with a map of last
 * indices.
 */

type Mode = 'map' | 'set'

const CODE: Record<Mode, string[]> = {
  map: [
    'def length_of_longest_substring(s):',
    '    last = {}  # carácter -> último índice',
    '    l = best = 0',
    '    for r, c in enumerate(s):',
    '        if c in last and last[c] >= l:',
    '            l = last[c] + 1',
    '        last[c] = r',
    '        best = max(best, r - l + 1)',
    '    return best',
  ],
  set: [
    'def length_of_longest_substring(s):',
    '    window = set()',
    '    l = best = 0',
    '    for r, c in enumerate(s):',
    '        while c in window:',
    '            window.remove(s[l])',
    '            l += 1',
    '        window.add(c)',
    '        best = max(best, r - l + 1)',
    '    return best',
  ],
}

/** Same solutions in Java; JAVA_MAP[mode][k] = the Java line(s) for Python line k. */
const JAVA: Record<Mode, string[]> = {
  map: [
    'int lengthOfLongestSubstring(String s) {',
    '    Map<Character, Integer> last = new HashMap<>();',
    '    int l = 0, best = 0;',
    '    for (int r = 0; r < s.length(); r++) {',
    '        char c = s.charAt(r);',
    '        Integer j = last.get(c); // null si no está',
    '        if (j != null && j >= l) {',
    '            l = j + 1;',
    '        }',
    '        last.put(c, r);',
    '        best = Math.max(best, r - l + 1);',
    '    }',
    '    return best;',
    '}',
  ],
  set: [
    'int lengthOfLongestSubstringSet(String s) {',
    '    Set<Character> window = new HashSet<>();',
    '    int l = 0, best = 0;',
    '    for (int r = 0; r < s.length(); r++) {',
    '        char c = s.charAt(r);',
    '        while (window.contains(c)) {',
    '            window.remove(s.charAt(l));',
    '            l++;',
    '        }',
    '        window.add(c);',
    '        best = Math.max(best, r - l + 1);',
    '    }',
    '    return best;',
    '}',
  ],
}
const JAVA_MAP: Record<Mode, (number | number[] | null)[]> = {
  map: [0, 1, 2, [3, 4], [5, 6], 7, 9, 10, 12],
  set: [0, 1, 2, [3, 4], 5, 6, 7, 9, 10, 12],
}

interface Frame {
  line: number | number[]
  l: number
  r: number
  best: number
  bestAt: [number, number] | null
  /** map mode: char -> last index; set mode: chars in window (value unused) */
  store: [string, number][]
  states: Partial<Record<number, CellState>>
  hitChar?: string
  note: string
  tone?: 'ok' | 'bad'
}

function windowStates(l: number, r: number, extra: Partial<Record<number, CellState>> = {}) {
  const st: Partial<Record<number, CellState>> = {}
  for (let q = 0; q < l; q++) st[q] = 'muted'
  for (let q = l; q <= r; q++) st[q] = 'window'
  return { ...st, ...extra }
}

function buildMap(s: string): Frame[] {
  const frames: Frame[] = []
  const last = new Map<string, number>()
  let l = 0
  let best = 0
  let bestAt: [number, number] | null = null
  const snap = () => [...last.entries()]

  frames.push({
    line: [1, 2],
    l: 0,
    r: -1,
    best,
    bestAt,
    store: [],
    states: {},
    note: 'La ventana s[l..r] siempre cumple la regla: sin caracteres repetidos. r avanza siempre; l solo avanza cuando la ventana se vuelve inválida.',
  })

  for (let r = 0; r < s.length; r++) {
    const c = s[r]
    frames.push({
      line: 3,
      l,
      r,
      best,
      bestAt,
      store: snap(),
      states: windowStates(l, r - 1, { [r]: 'active' }),
      note: `Expandimos: entra s[${r}] = '${c}'.`,
    })
    const j = last.get(c)
    if (j !== undefined && j >= l) {
      frames.push({
        line: 4,
        l,
        r,
        best,
        bestAt,
        store: snap(),
        hitChar: c,
        states: windowStates(l, r - 1, { [j]: 'bad', [r]: 'bad' }),
        tone: 'bad',
        note: `'${c}' ya está dentro de la ventana, en el índice ${j} (y ${j} ≥ l = ${l}). La ventana dejó de ser válida.`,
      })
      l = j + 1
      frames.push({
        line: 5,
        l,
        r,
        best,
        bestAt,
        store: snap(),
        hitChar: c,
        states: windowStates(l, r, { [r]: 'active' }),
        note: `Toda ventana que empiece en ${j} o antes contiene las dos '${c}', así que l salta directo a ${j} + 1 = ${l}. Sin while: el mapa nos dice a dónde ir.`,
      })
    } else if (j !== undefined) {
      frames.push({
        line: 4,
        l,
        r,
        best,
        bestAt,
        store: snap(),
        hitChar: c,
        states: windowStates(l, r - 1, { [j]: 'compare', [r]: 'active' }),
        note: `'${c}' está en el mapa (índice ${j}), pero ${j} < l = ${l}: esa '${c}' ya salió de la ventana. Ignorarla es lo correcto; olvidar la condición last[c] ≥ l haría retroceder a l.`,
      })
    }
    last.set(c, r)
    const len = r - l + 1
    const improved = len > best
    if (improved) {
      best = len
      bestAt = [l, r]
    }
    frames.push({
      line: [6, 7],
      l,
      r,
      best,
      bestAt,
      store: snap(),
      hitChar: c,
      states: windowStates(l, r, { [r]: 'active' }),
      tone: improved ? 'ok' : undefined,
      note: `last['${c}'] = ${r}. La ventana "${s.slice(l, r + 1)}" es válida y mide ${len}. ${improved ? `Nuevo mejor: best = ${best}.` : `best sigue en ${best}.`}`,
    })
  }
  return finish(frames, s, l, best, bestAt, snap(), 8)
}

function buildSet(s: string): Frame[] {
  const frames: Frame[] = []
  const win = new Set<string>()
  let l = 0
  let best = 0
  let bestAt: [number, number] | null = null
  let removals = 0
  const snap = (): [string, number][] => [...win].map((c) => [c, 0])

  frames.push({
    line: [1, 2],
    l: 0,
    r: -1,
    best,
    bestAt,
    store: [],
    states: {},
    note: 'El set guarda los caracteres de la ventana s[l..r]. Si el nuevo carácter ya está, contraemos desde la izquierda hasta sacarlo.',
  })

  for (let r = 0; r < s.length; r++) {
    const c = s[r]
    frames.push({
      line: 3,
      l,
      r,
      best,
      bestAt,
      store: snap(),
      states: windowStates(l, r - 1, { [r]: 'active' }),
      note: `Expandimos: entra s[${r}] = '${c}'.${win.has(c) ? ` Pero '${c}' ya está en el set.` : ''}`,
    })
    while (win.has(c)) {
      const out = s[l]
      win.delete(out)
      removals++
      frames.push({
        line: [4, 5, 6],
        l: l + 1,
        r,
        best,
        bestAt,
        store: snap(),
        hitChar: c,
        states: windowStates(l + 1, r - 1, { [l]: 'bad', [r]: 'active' }),
        tone: 'bad',
        note:
          out === c
            ? `Sacamos s[${l}] = '${out}', la '${c}' repetida. l = ${l + 1}. Ahora la ventana puede aceptar la nueva '${c}'.`
            : `'${c}' sigue en el set. Sacamos s[${l}] = '${out}' y avanzamos l a ${l + 1}.`,
      })
      l++
    }
    win.add(c)
    const len = r - l + 1
    const improved = len > best
    if (improved) {
      best = len
      bestAt = [l, r]
    }
    frames.push({
      line: [7, 8],
      l,
      r,
      best,
      bestAt,
      store: snap(),
      hitChar: c,
      states: windowStates(l, r, { [r]: 'active' }),
      tone: improved ? 'ok' : undefined,
      note: `Agregamos '${c}'. Ventana "${s.slice(l, r + 1)}", largo ${len}. ${improved ? `Nuevo mejor: best = ${best}.` : `best sigue en ${best}.`}${r === s.length - 1 ? ` En total, l avanzó ${removals} veces: cada carácter entra y sale a lo sumo una vez.` : ''}`,
    })
  }
  return finish(frames, s, l, best, bestAt, snap(), 9)
}

function finish(frames: Frame[], s: string, l: number, best: number, bestAt: [number, number] | null, store: [string, number][], line: number): Frame[] {
  const states: Partial<Record<number, CellState>> = {}
  for (let q = 0; q < s.length; q++) states[q] = 'done'
  if (bestAt) for (let q = bestAt[0]; q <= bestAt[1]; q++) states[q] = 'found'
  frames.push({
    line,
    l,
    r: s.length,
    best,
    bestAt,
    store,
    states,
    tone: 'ok',
    note:
      s.length === 0
        ? 'Cadena vacía: el for no corre y devolvemos 0. Conviene decirlo en voz alta antes de codificar.'
        : `Respuesta: ${best}${bestAt ? ` ("${s.slice(bestAt[0], bestAt[1] + 1)}")` : ''}. r recorre la cadena una vez y l solo avanza: O(n) tiempo, O(min(n, alfabeto)) memoria.`,
  })
  return frames
}

const PRESETS = ['abcabcbb', 'pwwkew', 'abba', 'bbbbb']

export function SlidingWindow() {
  const [mode, setMode] = useState<Mode>('map')
  const [s, setS] = useState(PRESETS[0])
  const [text, setText] = useState(PRESETS[0])
  const frames = useMemo(() => (mode === 'map' ? buildMap(s) : buildSet(s)), [s, mode])
  const player = useStepPlayer(frames.length, { resetKey: `${mode}|${s}` })
  const f = frames[player.i]
  const prev = frames[player.i - 1]
  const ok = /^[a-z0-9]{0,16}$/.test(text)
  const inLoop = f.r >= 0 && f.r < s.length
  const preset = PRESETS.indexOf(s)

  return (
    <WidgetFrame
      caption="Longest Substring Without Repeating Characters: la ventana (sombreada) crece por la derecha y, si aparece un repetido, se contrae por la izquierda. Compara contraer con un set contra saltar con el mapa de últimos índices."
      controls={
        <>
          <Segmented
            label="Versión"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'map', label: 'Mapa (salto)' },
              { value: 'set', label: 'Set (paso a paso)' },
            ]}
          />
          <label className="sw-field">
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
                  "{p}"
                </option>
              ))}
            </select>
          </label>
          <label className="sw-field sw-field--grow">
            <span className="seg__label">s (a-z, 0-9, hasta 16)</span>
            <input
              type="text"
              value={text}
              aria-invalid={!ok}
              autoCapitalize="off"
              spellCheck={false}
              onChange={(e) => {
                setText(e.target.value)
                if (/^[a-z0-9]{0,16}$/.test(e.target.value)) setS(e.target.value)
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
            {s.length > 0 ? (
              <ArrayView
                label={`Cadena s: ${s}`}
                caption="s"
                values={[...s]}
                states={f.states}
                pointers={
                  inLoop
                    ? [
                        { at: f.l, label: 'l' },
                        { at: f.r, label: 'r', tone: 'ink' },
                      ]
                    : []
                }
              />
            ) : (
              <p className="sw-empty">s = "" (cadena vacía)</p>
            )}
            <VarPanel
              vars={[
                { name: 'l', value: inLoop ? f.l : '—', changed: !!prev && prev.l !== f.l },
                { name: 'r', value: inLoop ? f.r : '—', changed: !!prev && prev.r !== f.r },
                { name: 'r − l + 1', value: inLoop ? f.r - f.l + 1 : '—' },
                { name: 'best', value: f.best, changed: !!prev && prev.best !== f.best },
              ]}
            />
            <div className="sw-store" aria-label={mode === 'map' ? 'Mapa last' : 'Set window'}>
              <div className="sw-store__title">{mode === 'map' ? 'last = {' : 'window = {'}</div>
              <div className="sw-store__rows">
                {f.store.length === 0 && <span className="sw-store__empty">vacío</span>}
                {f.store.map(([c, idx]) => {
                  const stale = mode === 'map' && inLoop && idx < f.l
                  return (
                    <span key={c} className={`sw-store__item ${f.hitChar === c ? (f.tone === 'bad' ? 'is-bad' : 'is-hit') : ''} ${stale ? 'is-stale' : ''}`}>
                      {mode === 'map' ? (
                        <>
                          <b>'{c}'</b>: {idx}
                        </>
                      ) : (
                        <b>'{c}'</b>
                      )}
                    </span>
                  )
                })}
              </div>
              <div className="sw-store__title">{'}'}</div>
            </div>
            {mode === 'map' && <p className="sw-hint">Las entradas tenues tienen índice menor que l: siguen en el mapa, pero ya no están en la ventana.</p>}
          </>
        }
        code={<CodeTrace title="Python" lines={CODE[mode]} active={f.line} variants={[{ label: 'Java', lines: JAVA[mode], map: JAVA_MAP[mode] }]} />}
      />
      <StepControls player={player} />
    </WidgetFrame>
  )
}
