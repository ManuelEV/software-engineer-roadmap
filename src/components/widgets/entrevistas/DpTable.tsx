import { useMemo, useState } from 'react'
import { Segmented, WidgetFrame } from '../kit'
import { AlgoLayout, ArrayView, type CellState, CodeTrace, StepControls, StepNote, VarPanel } from './algo-kit'
import { useStepPlayer } from './useStepPlayer'
import './DpTable.css'

/**
 * A DP table filled cell by cell, for Coin Change (1-D) and LCS (2-D). The
 * cells the current one reads are outlined, the note spells out the formula
 * with real numbers, and the last frames walk back to rebuild the answer.
 */

type Problem = 'coins' | 'lcs'
type Tone = 'ok' | 'bad' | undefined

/* ───────────── Coin Change ───────────── */

const COIN_CODE = [
  'def coin_change(coins, amount):',
  "    INF = float('inf')",
  '    dp = [0] + [INF] * amount',
  '    for a in range(1, amount + 1):',
  '        for c in coins:',
  '            if c <= a:',
  '                dp[a] = min(dp[a], dp[a - c] + 1)',
  '    ans = dp[amount]',
  '    return ans if ans != INF else -1',
]

const COIN_JAVA = [
  'int coinChange(int[] coins, int amount) {',
  '    int inf = amount + 1; // hace de ∞',
  '    int[] dp = new int[amount + 1];',
  '    Arrays.fill(dp, inf);',
  '    dp[0] = 0;',
  '    for (int a = 1; a <= amount; a++) {',
  '        for (int c : coins) {',
  '            if (c <= a) {',
  '                dp[a] = Math.min(dp[a], dp[a - c] + 1);',
  '            }',
  '        }',
  '    }',
  '    return dp[amount] > amount ? -1 : dp[amount];',
  '}',
]
const COIN_JAVA_MAP = [0, 1, [2, 3, 4], 5, 6, 7, 8, 12, 12]

interface CoinFrame {
  line: number | number[]
  dp: number[]
  a: number
  c?: number
  dep?: number
  path: number[]
  taken: number[]
  note: string
  tone?: Tone
}

const show = (v: number) => (v === Infinity ? '∞' : String(v))

function coinFrames(coins: number[], amount: number): CoinFrame[] {
  const frames: CoinFrame[] = []
  const dp = [0, ...Array.from({ length: amount }, () => Infinity)]
  const choice: number[] = Array.from({ length: amount + 1 }, () => 0)
  const snap = () => [...dp]
  frames.push({
    line: 2,
    dp: snap(),
    a: -1,
    path: [],
    taken: [],
    note: `dp[a] = mínimo de monedas para formar a. dp[0] = 0 (para 0 no hace falta ninguna) y el resto empieza en ∞: "todavía no sé formarlo". Si empezaran en 0, el min nunca bajaría de 0.`,
  })
  for (let a = 1; a <= amount; a++) {
    for (const c of coins) {
      if (c > a) {
        frames.push({ line: 5, dp: snap(), a, c, path: [], taken: [], note: `a = ${a}, moneda ${c}: es más grande que el monto, no sirve.` })
        continue
      }
      const cand = dp[a - c] + 1
      if (cand < dp[a]) {
        const old = dp[a]
        dp[a] = cand
        choice[a] = c
        frames.push({
          line: 6,
          dp: snap(),
          a,
          c,
          dep: a - c,
          path: [],
          taken: [],
          note: `a = ${a}, moneda ${c}: dp[${a}] = min(dp[${a}], dp[${a} − ${c}] + 1) = min(${show(old)}, ${dp[a - c]} + 1) = ${cand}. Usar una moneda de ${c} deja ${a - c}, que ya sabemos formar con ${dp[a - c]}.`,
        })
      } else {
        frames.push({
          line: 6,
          dp: snap(),
          a,
          c,
          dep: a - c,
          path: [],
          taken: [],
          note:
            dp[a - c] === Infinity
              ? `a = ${a}, moneda ${c}: dp[${a - c}] = ∞, así que con esta moneda no se llega. dp[${a}] queda en ${show(dp[a])}.`
              : `a = ${a}, moneda ${c}: dp[${a - c}] + 1 = ${cand}, que no mejora el ${show(dp[a])} actual.`,
        })
      }
    }
  }
  if (dp[amount] === Infinity) {
    frames.push({ line: [7, 8], dp: snap(), a: amount, path: [], taken: [], tone: 'bad', note: `dp[${amount}] sigue en ∞: ninguna combinación de [${coins.join(', ')}] suma ${amount}. Devolvemos -1.` })
    return frames
  }
  frames.push({ line: [7, 8], dp: snap(), a: amount, path: [amount], taken: [], note: `La respuesta es dp[${amount}] = ${dp[amount]}. Para saber qué monedas son, guardamos cuál moneda mejoró cada celda y caminamos hacia atrás.` })
  const path = [amount]
  const taken: number[] = []
  let a = amount
  while (a > 0) {
    const c = choice[a]
    taken.push(c)
    a -= c
    path.push(a)
    frames.push({
      line: 8,
      dp: snap(),
      a,
      path: [...path],
      taken: [...taken],
      tone: a === 0 ? 'ok' : undefined,
      note: a === 0 ? `Llegamos a 0: ${amount} = ${taken.join(' + ')}, ${taken.length} monedas.` : `Desde ${a + c} usamos una moneda de ${c} y quedamos en ${a}.`,
    })
  }
  return frames
}

/* ───────────── LCS ───────────── */

const LCS_CODE = [
  'def lcs(a, b):',
  '    m, n = len(a), len(b)',
  '    dp = [[0] * (n + 1) for _ in range(m + 1)]',
  '    for i in range(1, m + 1):',
  '        for j in range(1, n + 1):',
  '            if a[i - 1] == b[j - 1]:',
  '                dp[i][j] = dp[i - 1][j - 1] + 1',
  '            else:',
  '                dp[i][j] = max(dp[i - 1][j], dp[i][j - 1])',
  '    return dp[m][n]',
]

const LCS_JAVA = [
  'int longestCommonSubsequence(String a, String b) {',
  '    int m = a.length(), n = b.length();',
  '    int[][] dp = new int[m + 1][n + 1];',
  '    for (int i = 1; i <= m; i++) {',
  '        for (int j = 1; j <= n; j++) {',
  '            if (a.charAt(i - 1) == b.charAt(j - 1)) {',
  '                dp[i][j] = dp[i - 1][j - 1] + 1;',
  '            } else {',
  '                dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);',
  '            }',
  '        }',
  '    }',
  '    return dp[m][n];',
  '}',
]
const LCS_JAVA_MAP = [0, 1, 2, 3, 4, 5, 6, 7, 8, 12]

interface LcsFrame {
  line: number | number[]
  dp: (number | null)[][]
  cur?: [number, number]
  deps: [number, number][]
  path: [number, number][]
  picked: [number, number][]
  word: string
  note: string
  tone?: Tone
}

function lcsFrames(a: string, b: string): LcsFrame[] {
  const m = a.length
  const n = b.length
  const dp: (number | null)[][] = Array.from({ length: m + 1 }, (_, i) => Array.from({ length: n + 1 }, (_, j) => (i === 0 || j === 0 ? 0 : null)))
  const snap = () => dp.map((r) => [...r])
  const frames: LcsFrame[] = [
    {
      line: 2,
      dp: snap(),
      deps: [],
      path: [],
      picked: [],
      word: '',
      note: `dp[i][j] = largo de la LCS entre los primeros i caracteres de "${a}" y los primeros j de "${b}". La fila 0 y la columna 0 valen 0: con una cadena vacía no hay nada en común. Por eso la tabla tiene una fila y una columna de más.`,
    },
  ]
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const x = a[i - 1]
      const y = b[j - 1]
      if (x === y) {
        dp[i][j] = (dp[i - 1][j - 1] as number) + 1
        frames.push({
          line: 6,
          dp: snap(),
          cur: [i, j],
          deps: [[i - 1, j - 1]],
          path: [],
          picked: [],
          word: '',
          note: `a[${i - 1}] = '${x}' y b[${j - 1}] = '${y}' coinciden: dp[${i}][${j}] = dp[${i - 1}][${j - 1}] + 1 = ${dp[i][j]}. La diagonal es "lo mejor sin estos dos caracteres", más uno.`,
        })
      } else {
        const up = dp[i - 1][j] as number
        const left = dp[i][j - 1] as number
        dp[i][j] = Math.max(up, left)
        frames.push({
          line: 8,
          dp: snap(),
          cur: [i, j],
          deps: [
            [i - 1, j],
            [i, j - 1],
          ],
          path: [],
          picked: [],
          word: '',
          note: `'${x}' ≠ '${y}': uno de los dos sobra. dp[${i}][${j}] = max(arriba ${up}, izquierda ${left}) = ${dp[i][j]}.`,
        })
      }
    }
  }
  const total = dp[m][n] as number
  if (total === 0) {
    frames.push({ line: 9, dp: snap(), cur: [m, n], deps: [], path: [[m, n]], picked: [], word: '', tone: 'bad', note: `dp[${m}][${n}] = 0: "${a}" y "${b}" no comparten ningún carácter en orden. La LCS es la cadena vacía.` })
    return frames
  }
  frames.push({ line: 9, dp: snap(), cur: [m, n], deps: [], path: [[m, n]], picked: [], word: '', note: `La respuesta está en la esquina: dp[${m}][${n}] = ${total}. Para reconstruir la subsecuencia, caminamos desde ahí hacia atrás.` })
  let i = m
  let j = n
  const path: [number, number][] = [[m, n]]
  const picked: [number, number][] = []
  let word = ''
  while (i > 0 && j > 0) {
    let note: string
    if (a[i - 1] === b[j - 1]) {
      word = a[i - 1] + word
      picked.push([i, j])
      note = `'${a[i - 1]}' coincide: es parte de la respuesta. Vamos en diagonal.`
      i--
      j--
    } else if ((dp[i - 1][j] as number) >= (dp[i][j - 1] as number)) {
      note = `'${a[i - 1]}' ≠ '${b[j - 1]}': el valor vino de arriba (${dp[i - 1][j]}), subimos.`
      i--
    } else {
      note = `'${a[i - 1]}' ≠ '${b[j - 1]}': el valor vino de la izquierda (${dp[i][j - 1]}), vamos a la izquierda.`
      j--
    }
    path.push([i, j])
    const end = word.length === total
    frames.push({
      line: 9,
      dp: snap(),
      cur: [i, j],
      deps: [],
      path: [...path],
      picked: [...picked],
      word,
      tone: end ? 'ok' : undefined,
      note: end ? `${note} Ya tenemos los ${total} caracteres: la LCS es "${word}".` : note,
    })
    if (end) break
  }
  return frames
}

/* ───────────── Widget ───────────── */

const COIN_PRESETS = [
  { label: '[1, 2, 5] → 11', coins: [1, 2, 5], amount: 11 },
  { label: '[1, 3, 4] → 6', coins: [1, 3, 4], amount: 6 },
  { label: '[2] → 3 (imposible)', coins: [2], amount: 3 },
]
const LCS_PRESETS = [
  { label: '"abcde" y "ace"', a: 'abcde', b: 'ace' },
  { label: '"AGGTAB" y "GXTXAYB"', a: 'AGGTAB', b: 'GXTXAYB' },
  { label: '"abc" y "def" (nada en común)', a: 'abc', b: 'def' },
]

const has = (list: [number, number][], i: number, j: number) => list.some(([x, y]) => x === i && y === j)

export function DpTable() {
  const [problem, setProblem] = useState<Problem>('coins')
  const [coinIdx, setCoinIdx] = useState(0)
  const [lcsIdx, setLcsIdx] = useState(0)
  const cp = COIN_PRESETS[coinIdx]
  const lp = LCS_PRESETS[lcsIdx]

  const cFrames = useMemo(() => coinFrames(cp.coins, cp.amount), [cp])
  const lFrames = useMemo(() => lcsFrames(lp.a, lp.b), [lp])
  const total = problem === 'coins' ? cFrames.length : lFrames.length
  const player = useStepPlayer(total, { resetKey: `${problem}-${problem === 'coins' ? coinIdx : lcsIdx}`, interval: 750 })

  const presets = problem === 'coins' ? COIN_PRESETS : LCS_PRESETS
  const idx = problem === 'coins' ? coinIdx : lcsIdx

  let visual
  let note
  let line: number | number[]
  if (problem === 'coins') {
    const f = cFrames[player.i]
    const prev = cFrames[player.i - 1]
    note = <StepNote tone={f.tone}>{f.note}</StepNote>
    line = f.line
    const states: Partial<Record<number, CellState>> = {}
    f.dp.forEach((_, k) => {
      if (f.path.length) states[k] = f.path.includes(k) ? 'found' : 'idle'
      else if (k > f.a && f.a >= 0) states[k] = 'muted'
    })
    if (!f.path.length && f.a >= 0) states[f.a] = 'active'
    if (f.dep !== undefined && !f.path.length) states[f.dep] = 'compare'
    const ptrs = []
    if (!f.path.length && f.a >= 0) ptrs.push({ at: f.a, label: 'a' })
    if (f.dep !== undefined && !f.path.length) ptrs.push({ at: f.dep, label: 'a − c', tone: 'ink' as const })
    visual = (
      <>
        <div className="dpt-coins" aria-label={`Monedas: ${cp.coins.join(', ')}`}>
          <span className="dpt-coins__lbl">coins</span>
          {cp.coins.map((c) => (
            <span key={c} className={`dpt-coin ${f.c === c && !f.path.length ? 'is-on' : ''}`}>
              {c}
            </span>
          ))}
        </div>
        <ArrayView label={`Tabla dp para monto ${cp.amount}`} caption="dp[a]: mínimo de monedas para formar a" values={f.dp.map(show)} states={states} pointers={ptrs} maxCell={46} />
        <VarPanel
          vars={[
            { name: 'a', value: f.a >= 0 && !f.path.length ? f.a : '—', changed: !!prev && prev.a !== f.a },
            { name: 'c', value: f.c ?? '—', changed: !!prev && prev.c !== f.c },
            { name: 'monedas usadas', value: f.taken.length ? f.taken.join(' + ') : '—' },
          ]}
        />
      </>
    )
  } else {
    const f = lFrames[player.i]
    note = <StepNote tone={f.tone}>{f.note}</StepNote>
    line = f.line
    const n = lp.b.length
    const back = f.path.length > 0
    visual = (
      <>
        <div className="dpt-grid-wrap">
          <div className="dpt-grid" role="img" aria-label={`Tabla de LCS entre ${lp.a} y ${lp.b}`} style={{ gridTemplateColumns: `repeat(${n + 2}, minmax(0, 1fr))`, maxWidth: `${(n + 2) * 46}px` }}>
            <span className="dpt-h" />
            <span className="dpt-h dpt-h--empty">∅</span>
            {lp.b.split('').map((ch, j) => (
              <span key={`b${j}`} className={`dpt-h ${f.cur && f.cur[1] === j + 1 && !back ? 'is-on' : ''}`}>
                {ch}
              </span>
            ))}
            {f.dp.map((row, i) => [
              <span key={`a${i}`} className={`dpt-h ${i === 0 ? 'dpt-h--empty' : ''} ${f.cur && f.cur[0] === i && i > 0 && !back ? 'is-on' : ''}`}>
                {i === 0 ? '∅' : lp.a[i - 1]}
              </span>,
              ...row.map((v, j) => {
                const isCur = !!f.cur && f.cur[0] === i && f.cur[1] === j
                let st = v === null ? 'is-empty' : ''
                if (back) {
                  if (has(f.picked, i, j)) st = 'is-picked'
                  else if (has(f.path, i, j)) st = 'is-path'
                  else st = 'is-dim'
                } else if (isCur) st = 'is-cur'
                else if (has(f.deps, i, j)) st = 'is-dep'
                return (
                  <span key={`${i}-${j}`} className={`dpt-c ${st} ${isCur && back ? 'is-here' : ''}`}>
                    {v ?? ''}
                  </span>
                )
              }),
            ])}
          </div>
        </div>
        <VarPanel
          vars={[
            { name: 'i', value: f.cur && !back ? f.cur[0] : '—' },
            { name: 'j', value: f.cur && !back ? f.cur[1] : '—' },
            { name: 'a[i-1], b[j-1]', value: f.cur && !back && f.cur[0] > 0 && f.cur[1] > 0 ? `'${lp.a[f.cur[0] - 1]}', '${lp.b[f.cur[1] - 1]}'` : '—' },
            { name: 'LCS', value: back ? `"${f.word}"` : '—' },
          ]}
        />
      </>
    )
  }

  return (
    <WidgetFrame
      caption="La tabla se llena en el orden en que cada celda ya tiene listas las celdas de las que depende (marcadas con borde). Al final se reconstruye la respuesta caminando hacia atrás."
      controls={
        <>
          <Segmented
            label="Problema"
            value={problem}
            onChange={setProblem}
            options={[
              { value: 'coins', label: 'Coin Change' },
              { value: 'lcs', label: 'LCS' },
            ]}
          />
          <label className="dpt-pick">
            <span className="seg__label">Entrada</span>
            <select value={idx} onChange={(e) => (problem === 'coins' ? setCoinIdx : setLcsIdx)(Number(e.target.value))}>
              {presets.map((p, k) => (
                <option key={p.label} value={k}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
        </>
      }
      readout={note}
    >
      <AlgoLayout visual={visual} code={
          <CodeTrace
            title="Python"
            lines={problem === 'coins' ? COIN_CODE : LCS_CODE}
            active={line}
            variants={[{ label: 'Java', lines: problem === 'coins' ? COIN_JAVA : LCS_JAVA, map: problem === 'coins' ? COIN_JAVA_MAP : LCS_JAVA_MAP }]}
          />
        } />
      <StepControls player={player} />
    </WidgetFrame>
  )
}
