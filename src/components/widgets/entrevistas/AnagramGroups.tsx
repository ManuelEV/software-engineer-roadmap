import { useMemo, useState } from 'react'
import { WidgetFrame, Segmented } from '../kit'
import { AlgoLayout, CodeTrace, StepControls, StepNote } from './algo-kit'
import { useStepPlayer } from './useStepPlayer'
import './AnagramGroups.css'

/**
 * Group Anagrams: each word computes its canonical key (sorted letters or a
 * letter count) and lands in the bucket for that key.
 */

type Mode = 'sort' | 'count'

const CODE: Record<Mode, string[]> = {
  sort: [
    'def group_anagrams(words):',
    '    groups = defaultdict(list)',
    '    for w in words:',
    "        key = ''.join(sorted(w))",
    '        groups[key].append(w)',
    '    return list(groups.values())',
  ],
  count: [
    'def group_anagrams(words):',
    '    groups = defaultdict(list)',
    '    for w in words:',
    '        count = [0] * 26',
    '        for c in w:',
    "            count[ord(c) - ord('a')] += 1",
    '        groups[tuple(count)].append(w)',
    '    return list(groups.values())',
  ],
}

interface Group {
  key: string
  words: string[]
}

/** Same solutions in Java; JAVA_MAP[mode][k] = the Java line(s) for Python line k. */
const JAVA: Record<Mode, string[]> = {
  sort: [
    'List<List<String>> groupAnagrams(String[] words) {',
    '    Map<String, List<String>> groups = new HashMap<>();',
    '    for (String w : words) {',
    '        char[] chars = w.toCharArray();',
    '        Arrays.sort(chars);',
    '        String key = new String(chars);',
    '        groups.computeIfAbsent(key, k -> new ArrayList<>()).add(w);',
    '    }',
    '    return new ArrayList<>(groups.values());',
    '}',
  ],
  count: [
    'List<List<String>> groupAnagramsByCount(String[] words) {',
    '    Map<String, List<String>> groups = new HashMap<>();',
    '    for (String w : words) {',
    '        int[] count = new int[26];',
    '        for (char c : w.toCharArray()) {',
    "            count[c - 'a']++;",
    '        }',
    '        String key = Arrays.toString(count);',
    '        groups.computeIfAbsent(key, k -> new ArrayList<>()).add(w);',
    '    }',
    '    return new ArrayList<>(groups.values());',
    '}',
  ],
}
const JAVA_MAP: Record<Mode, (number | number[] | null)[]> = {
  sort: [0, 1, 2, [3, 4, 5], 6, 8],
  count: [0, 1, 2, 3, 4, 5, [7, 8], 10],
}

interface Frame {
  line: number | number[]
  i: number
  key?: string
  /** letters of the current word, before and after canonicalising */
  letters?: string[]
  canon?: string[]
  groups: Group[]
  hitKey?: string
  newWord?: boolean
  note: string
  tone?: 'ok'
}

const show = (w: string) => (w === '' ? '""' : w)

function keyOf(w: string, mode: Mode): { key: string; canon: string[] } {
  if (mode === 'sort') {
    const canon = [...w].sort()
    return { key: canon.join(''), canon }
  }
  const counts = new Map<string, number>()
  for (const c of w) counts.set(c, (counts.get(c) ?? 0) + 1)
  const canon = [...counts.entries()].sort(([a], [b]) => (a < b ? -1 : 1)).map(([c, n]) => `${c}${n}`)
  return { key: canon.join(' '), canon }
}

function buildFrames(words: string[], mode: Mode): Frame[] {
  const frames: Frame[] = []
  const groups: Group[] = []
  const snap = () => groups.map((g) => ({ key: g.key, words: [...g.words] }))
  const keyLine = mode === 'sort' ? 3 : [3, 4, 5]
  const appendLine = mode === 'sort' ? 4 : 6

  frames.push({
    line: 1,
    i: -1,
    groups: [],
    note:
      mode === 'sort'
        ? 'Dos palabras son anagramas si tienen las mismas letras con la misma multiplicidad. Al ordenarlas, todas las de un grupo quedan idénticas: esa es la clave canónica.'
        : 'Otra clave canónica: cuántas veces aparece cada letra. Cuesta O(k) por palabra en vez de O(k log k), a cambio de suponer un alfabeto fijo (26 letras).',
  })

  words.forEach((w, i) => {
    frames.push({
      line: 2,
      i,
      groups: snap(),
      letters: [...w],
      note: `Tomamos "${w}"${w === '' ? ' (la cadena vacía también es una palabra válida)' : ''}.`,
    })
    const { key, canon } = keyOf(w, mode)
    frames.push({
      line: keyLine,
      i,
      key,
      letters: [...w],
      canon,
      groups: snap(),
      note:
        mode === 'sort'
          ? `Ordenamos sus letras: ${show(w)} → ${show(key)}. Cualquier anagrama de "${w}" produce exactamente la misma clave.`
          : `Contamos letras: ${show(w)} → ${key || '(todo en cero)'}. En Python la clave real es una tupla de 26 enteros; aquí mostramos solo los que no son cero.`,
    })
    const g = groups.find((x) => x.key === key)
    if (g) {
      g.words.push(w)
      frames.push({
        line: appendLine,
        i,
        key,
        canon,
        letters: [...w],
        groups: snap(),
        hitKey: key,
        newWord: true,
        tone: 'ok',
        note: `La clave ya existe: "${w}" cae en el mismo grupo que ${g.words
          .slice(0, -1)
          .map((x) => `"${x}"`)
          .join(', ')}. Buscar la clave en el diccionario cuesta O(1) en promedio.`,
      })
    } else {
      groups.push({ key, words: [w] })
      frames.push({
        line: appendLine,
        i,
        key,
        canon,
        letters: [...w],
        groups: snap(),
        hitKey: key,
        newWord: true,
        note: `Clave nueva: abrimos un grupo para ${show(key)}. defaultdict crea la lista vacía la primera vez que la tocamos.`,
      })
    }
  })

  frames.push({
    line: mode === 'sort' ? 5 : 7,
    i: words.length,
    groups: snap(),
    tone: 'ok',
    note: `${groups.length} ${groups.length === 1 ? 'grupo' : 'grupos'}. Con n palabras de largo k: O(n · k log k) ordenando, O(n · k) contando. Memoria O(n · k).`,
  })
  return frames
}

const PRESETS: { label: string; words: string[] }[] = [
  { label: 'eat, tea, tan, ate, nat, bat', words: ['eat', 'tea', 'tan', 'ate', 'nat', 'bat'] },
  { label: 'amor, roma, mar, mora, ramo, arma', words: ['amor', 'roma', 'mar', 'mora', 'ramo', 'arma'] },
  { label: 'ab, ba, aab, aba, b', words: ['ab', 'ba', 'aab', 'aba', 'b'] },
  { label: '"", "", a (vacías)', words: ['', '', 'a'] },
]

function parseWords(text: string): string[] | null {
  const parts = text.split(',').map((s) => s.trim().replace(/^""$/, ''))
  if (parts.length < 1 || parts.length > 8) return null
  if (!parts.every((p) => /^[a-z]{0,8}$/.test(p))) return null
  return parts
}

export function AnagramGroups() {
  const [mode, setMode] = useState<Mode>('sort')
  const [preset, setPreset] = useState(0)
  const [words, setWords] = useState(PRESETS[0].words)
  const [text, setText] = useState(PRESETS[0].words.join(', '))
  const frames = useMemo(() => buildFrames(words, mode), [words, mode])
  const player = useStepPlayer(frames.length, { resetKey: `${mode}|${words.join(',')}` })
  const f = frames[player.i]
  const ok = parseWords(text) !== null

  const pick = (p: number) => {
    setPreset(p)
    setWords(PRESETS[p].words)
    setText(PRESETS[p].words.map((w) => (w === '' ? '""' : w)).join(', '))
  }

  return (
    <WidgetFrame
      caption="Group Anagrams: cada palabra calcula su clave canónica y cae en el grupo de esa clave. Cambia el tipo de clave para comparar ordenar contra contar."
      controls={
        <>
          <Segmented
            label="Clave"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'sort', label: 'Letras ordenadas' },
              { value: 'count', label: 'Conteo' },
            ]}
          />
          <label className="agg-field">
            <span className="seg__label">Ejemplo</span>
            <select value={preset} onChange={(e) => pick(Number(e.target.value))}>
              {PRESETS.map((p, j) => (
                <option key={p.label} value={j}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="agg-field agg-field--grow">
            <span className="seg__label">Palabras (a-z, separadas por coma)</span>
            <input
              type="text"
              value={text}
              aria-invalid={!ok}
              onChange={(e) => {
                setText(e.target.value)
                const p = parseWords(e.target.value)
                if (p) setWords(p)
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
            <div className="agg-words" aria-label={`Palabras: ${words.map(show).join(', ')}`}>
              <span className="agg-cap">words</span>
              <div className="agg-words__row">
                {words.map((w, j) => (
                  <span key={j} className={`agg-chip ${j === f.i ? 'is-on' : j < f.i ? 'is-done' : ''}`}>
                    {show(w)}
                  </span>
                ))}
              </div>
            </div>

            <div className="agg-key" aria-live="polite">
              <span className="agg-cap">clave</span>
              {f.letters ? (
                <div className="agg-key__row">
                  <span className="agg-tiles">
                    {f.letters.length === 0 && <span className="agg-tile is-empty">""</span>}
                    {f.letters.map((c, j) => (
                      <span key={j} className="agg-tile">
                        {c}
                      </span>
                    ))}
                  </span>
                  {f.canon && (
                    <>
                      <span className="agg-arrow" aria-hidden="true">
                        →
                      </span>
                      <span className="agg-tiles">
                        {f.canon.length === 0 && <span className="agg-tile is-key is-empty">""</span>}
                        {f.canon.map((c, j) => (
                          <span key={j} className="agg-tile is-key">
                            {c}
                          </span>
                        ))}
                      </span>
                    </>
                  )}
                </div>
              ) : (
                <div className="agg-key__row agg-muted">—</div>
              )}
            </div>

            <div className="agg-groups" aria-label="Grupos formados">
              <span className="agg-cap">groups</span>
              {f.groups.length === 0 && <div className="agg-muted">vacío</div>}
              <div className="agg-groups__grid">
                {f.groups.map((g) => (
                  <div key={g.key} className={`agg-group ${f.hitKey === g.key ? (f.tone === 'ok' ? 'is-hit' : 'is-new') : ''}`}>
                    <div className="agg-group__key">{show(g.key)}</div>
                    <div className="agg-group__words">
                      {g.words.map((w, j) => (
                        <span key={j} className={`agg-chip agg-chip--sm ${f.hitKey === g.key && f.newWord && j === g.words.length - 1 ? 'is-on' : ''}`}>
                          {show(w)}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </>
        }
        code={<CodeTrace title="Python" lines={CODE[mode]} active={f.line} variants={[{ label: 'Java', lines: JAVA[mode], map: JAVA_MAP[mode] }]} />}
      />
      <StepControls player={player} />
    </WidgetFrame>
  )
}
