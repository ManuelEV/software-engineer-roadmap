import { useMemo, useState } from 'react'
import { Crown } from 'lucide-react'
import { WidgetFrame, Segmented, Stat } from '../kit'
import { AlgoLayout, CodeTrace, StepControls, StepNote, VarPanel } from './algo-kit'
import { useStepPlayer } from './useStepPlayer'
import './NQueens.css'

/**
 * N-Queens by backtracking: one queen per row, columns and diagonals kept in
 * sets so every check is O(1). Frames are recorded from the real search up to
 * the first solution (or to exhaustion when there is none).
 */

const CODE = [
  'def solve_n_queens(n):',
  '    cols, d1, d2 = set(), set(), set()',
  '    board, res = [], []',
  '    def place(r):',
  '        if r == n:',
  '            res.append(board[:])',
  '            return',
  '        for c in range(n):',
  '            if c in cols or r - c in d1 or r + c in d2:',
  '                continue  # atacada: poda',
  '            cols.add(c); d1.add(r - c); d2.add(r + c)',
  '            board.append(c)',
  '            place(r + 1)',
  '            board.pop()',
  '            cols.remove(c); d1.remove(r - c); d2.remove(r + c)',
  '    place(0)',
  '    return res',
]

/** Same search in Java; JAVA_MAP[k] = the Java line(s) for Python line k. */
const JAVA = [
  'Set<Integer> cols = new HashSet<>(), d1 = new HashSet<>(), d2 = new HashSet<>();',
  'List<Integer> board = new ArrayList<>();',
  'List<List<Integer>> res = new ArrayList<>();',
  'int n;',
  '',
  'List<List<Integer>> solveNQueens(int n) {',
  '    this.n = n;',
  '    place(0);',
  '    return res;',
  '}',
  '',
  'void place(int r) {',
  '    if (r == n) {',
  '        res.add(new ArrayList<>(board));',
  '        return;',
  '    }',
  '    for (int c = 0; c < n; c++) {',
  '        if (cols.contains(c) || d1.contains(r - c) || d2.contains(r + c))',
  '            continue;  // atacada: poda',
  '        cols.add(c); d1.add(r - c); d2.add(r + c);',
  '        board.add(c);',
  '        place(r + 1);',
  '        board.remove(board.size() - 1);',
  '        cols.remove(c); d1.remove(r - c); d2.remove(r + c);',
  '    }',
  '}',
]
const JAVA_MAP = [5, 0, [1, 2], 11, 12, 13, 14, 16, 17, 18, 19, 20, 21, 22, 23, [6, 7], 8]

interface Frame {
  line: number | number[]
  board: number[]
  try?: { r: number; c: number; ok: boolean }
  /** row of the queen that attacks the tried cell */
  attacker?: number
  lifted?: { r: number; c: number }
  tries: number
  note: string
  tone?: 'ok' | 'bad' | 'warn'
  solved?: boolean
}

function buildFrames(n: number): Frame[] {
  const frames: Frame[] = []
  const board: number[] = []
  const cols = new Set<number>()
  const d1 = new Set<number>()
  const d2 = new Set<number>()
  let tries = 0
  const snap = (f: Omit<Frame, 'board' | 'tries'>) => frames.push({ ...f, board: [...board], tries })

  snap({ line: [1, 2, 15], note: `Tablero vacío de ${n}×${n}. Pondremos una reina por fila, de arriba hacia abajo: así nunca chocan dos en la misma fila.` })
  const place = (r: number): boolean => {
    if (r === n) {
      snap({ line: [4, 5], solved: true, tone: 'ok', note: `¡Las ${n} filas tienen reina y ninguna se ataca! Solución: columnas [${board.join(', ')}]. Probamos ${tries} casillas para llegar aquí.` })
      return true
    }
    for (let c = 0; c < n; c++) {
      tries++
      if (cols.has(c) || d1.has(r - c) || d2.has(r + c)) {
        const attacker = board.findIndex((qc, qr) => qc === c || qr - qc === r - c || qr + qc === r + c)
        const qc = board[attacker]
        const why = qc === c ? `la columna ${c} ya está en cols` : attacker - qc === r - c ? `la diagonal r − c = ${r - c} ya está en d1` : `la antidiagonal r + c = ${r + c} ya está en d2`
        snap({ line: [7, 8, 9], try: { r, c, ok: false }, attacker, tone: 'bad', note: `Fila ${r}, columna ${c}: atacada, porque ${why} (la reina de la fila ${attacker}). Ni la ponemos: poda.` })
        continue
      }
      cols.add(c)
      d1.add(r - c)
      d2.add(r + c)
      board.push(c)
      snap({ line: [10, 11, 12], try: { r, c, ok: true }, note: `Fila ${r}, columna ${c}: libre. Ponemos la reina, registramos c = ${c}, r − c = ${r - c} y r + c = ${r + c}, y bajamos a la fila ${r + 1}.` })
      if (place(r + 1)) return true
      board.pop()
      cols.delete(c)
      d1.delete(r - c)
      d2.delete(r + c)
      snap({
        line: [13, 14],
        lifted: { r, c },
        tone: 'warn',
        note: `Ninguna casilla de la fila ${r + 1} funcionó con la reina en (${r}, ${c}). Backtrack: la quitamos, borramos sus marcas de los conjuntos y probamos la siguiente columna de la fila ${r}.`,
      })
    }
    return false
  }
  if (!place(0)) {
    snap({ line: 16, tone: 'bad', note: `Probamos todas las opciones y ninguna llega a la última fila: con n = ${n} no hay solución. res queda vacío. Probamos ${tries} casillas en total.` })
  }
  return frames
}

/** search-tree sizes for the whole search (all solutions), with and without pruning */
function countNodes(n: number) {
  let pruned = 0
  let solutions = 0
  const cols = new Set<number>()
  const d1 = new Set<number>()
  const d2 = new Set<number>()
  const place = (r: number) => {
    pruned++
    if (r === n) {
      solutions++
      return
    }
    for (let c = 0; c < n; c++) {
      if (cols.has(c) || d1.has(r - c) || d2.has(r + c)) continue
      cols.add(c)
      d1.add(r - c)
      d2.add(r + c)
      place(r + 1)
      cols.delete(c)
      d1.delete(r - c)
      d2.delete(r + c)
    }
  }
  place(0)
  // without pruning: every row tries every column; the tree has 1 + n + n² + … + nⁿ nodes
  let brute = 0
  for (let k = 0; k <= n; k++) brute += n ** k
  return { pruned, brute, boards: n ** n, solutions }
}

const nf = new Intl.NumberFormat('es')

export function NQueens() {
  const [n, setN] = useState('4')
  const size = Number(n)
  const frames = useMemo(() => buildFrames(size), [size])
  const counts = useMemo(() => countNodes(size), [size])
  const player = useStepPlayer(frames.length, { resetKey: n, interval: 650 })
  const f = frames[player.i]
  const prev = frames[player.i - 1]

  // cells attacked by the queens already on the board (rows below them only matter)
  const attacked = (r: number, c: number) => f.board.some((qc, qr) => qr !== r && (qc === c || qr - qc === r - c || qr + qc === r + c))

  const cells = []
  for (let r = 0; r < size; r++) {
    for (let c = 0; c < size; c++) {
      const queen = f.board[r] === c
      const trying = f.try && f.try.r === r && f.try.c === c
      const cls = [
        'nq-cell',
        (r + c) % 2 === 1 && 'is-dark',
        !queen && r >= f.board.length && attacked(r, c) && 'is-attacked',
        queen && 'is-queen',
        queen && f.attacker === r && 'is-attacker',
        trying && (f.try!.ok ? 'is-try-ok' : 'is-try-bad'),
        f.lifted && f.lifted.r === r && f.lifted.c === c && 'is-lifted',
        f.solved && queen && 'is-solved',
      ]
        .filter(Boolean)
        .join(' ')
      cells.push(
        <div key={`${r}-${c}`} className={cls}>
          {queen && <Crown size={20} aria-hidden="true" />}
        </div>,
      )
    }
  }

  return (
    <WidgetFrame
      caption="N reinas con backtracking: una reina por fila, columnas y diagonales en conjuntos. Las casillas rayadas están atacadas; si una fila se queda sin opciones, se quita la última reina y se prueba la siguiente columna."
      controls={
        <Segmented
          label="Tamaño del tablero"
          value={n}
          onChange={setN}
          options={[
            { value: '3', label: '3×3' },
            { value: '4', label: '4×4' },
            { value: '5', label: '5×5' },
            { value: '6', label: '6×6' },
          ]}
        />
      }
      readout={<StepNote tone={f.tone}>{f.note}</StepNote>}
    >
      <AlgoLayout
        visual={
          <>
            <div
              className="nq-board"
              role="img"
              aria-label={`Tablero de ${size} por ${size}. Reinas en las columnas ${f.board.join(', ') || 'ninguna'}${f.try ? `. Probando fila ${f.try.r}, columna ${f.try.c}` : ''}.`}
              style={{ ['--nq-n' as string]: size }}
            >
              {cells}
            </div>
            <VarPanel
              vars={[
                { name: 'board', value: `[${f.board.join(', ')}]`, changed: !!prev && prev.board.length !== f.board.length },
                { name: 'cols', value: `{${f.board.join(', ')}}` },
                { name: 'd1 (r−c)', value: `{${f.board.map((c, r) => r - c).join(', ')}}` },
                { name: 'd2 (r+c)', value: `{${f.board.map((c, r) => r + c).join(', ')}}` },
              ]}
            />
            <div className="nq-stats">
              <Stat label="casillas probadas (animación)" value={f.tries} />
              <Stat label="nodos con poda (todas las soluciones)" value={nf.format(counts.pruned)} tone="ok" />
              <Stat label={`nodos sin poda (${size}^${size} = ${nf.format(counts.boards)} tableros)`} value={nf.format(counts.brute)} tone="bad" />
              <Stat label="soluciones" value={counts.solutions} />
            </div>
          </>
        }
        code={<CodeTrace title="Python" lines={CODE} active={f.line} variants={[{ label: 'Java', lines: JAVA, map: JAVA_MAP }]} />}
      />
      <StepControls player={player} />
    </WidgetFrame>
  )
}
