import { useEffect, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Keyboard, RotateCcw } from 'lucide-react'
import { Log, Segmented, Slider, Stat, WidgetFrame } from '../kit'
import { useMediaQuery } from '../../../lib/hooks'
import './TrieAutocomplete.css'

/* ───────────── Datos de ejemplo (conteos inventados para la demo) ───────────── */

const QUERIES: [string, number][] = [
  ['chatgpt', 12000],
  ['clima hoy', 9400],
  ['clima mañana', 4100],
  ['clima en lima', 2300],
  ['cine cerca de mí', 3600],
  ['cinemark', 2900],
  ['cien años de soledad', 1800],
  ['ciencia ficción', 1200],
  ['celular samsung', 2600],
  ['celular barato', 1500],
  ['chat en vivo', 1100],
  ['copa américa', 7800],
  ['copa libertadores', 6900],
  ['correo gmail', 5200],
  ['cómo hacer pan', 3100],
  ['cómo hacer slime', 2000],
  ['cómo bajar de peso', 4400],
  ['cuánto es un dólar', 8100],
  ['curso de inglés', 2700],
  ['precio del dólar', 9900],
  ['partido de hoy', 8800],
  ['pasaporte cita', 2400],
  ['pizza cerca', 3300],
  ['pronóstico del tiempo', 1600],
  ['real madrid', 7300],
  ['recetas fáciles', 3900],
  ['receta de flan', 2100],
]

const MAX_K = 8
const DEMO_TEXT = 'cómo hacer pan'

/** Normaliza: minúsculas y sin tildes (la "ñ" se conserva). */
function norm(s: string) {
  return s
    .toLowerCase()
    .replace(/ñ/g, '\u0001')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/\u0001/g, 'ñ')
}

interface TrieNode {
  ch: string
  children: Map<string, TrieNode>
  /** top-k precalculado (hasta MAX_K) */
  top: [string, number][]
  /** cantidad de nodos en el subárbol (incluido este) */
  size: number
}

function buildTrie(): TrieNode {
  const root: TrieNode = { ch: '', children: new Map(), top: [], size: 1 }
  const terminals = new Map<TrieNode, [string, number]>()
  for (const [q, c] of QUERIES) {
    let n = root
    for (const ch of norm(q)) {
      let next = n.children.get(ch)
      if (!next) {
        next = { ch, children: new Map(), top: [], size: 1 }
        n.children.set(ch, next)
      }
      n = next
    }
    terminals.set(n, [q, c])
  }
  // Recorrido postorden: el top-k de un nodo es la mezcla de los top-k de sus hijos.
  const fill = (n: TrieNode) => {
    const pool: [string, number][] = []
    const own = terminals.get(n)
    if (own) pool.push(own)
    let size = 1
    for (const child of n.children.values()) {
      fill(child)
      pool.push(...child.top)
      size += child.size
    }
    n.size = size
    n.top = pool.sort((a, b) => b[1] - a[1]).slice(0, MAX_K)
  }
  fill(root)
  return root
}

/** Camina el trie; devuelve los nodos del camino encontrado y si el prefijo existe completo. */
function walk(root: TrieNode, prefix: string) {
  const path: TrieNode[] = [root]
  let n: TrieNode | undefined = root
  for (const ch of prefix) {
    n = n.children.get(ch)
    if (!n) break
    path.push(n)
  }
  return { path, found: path.length === prefix.length + 1 }
}

type Mode = 'topk' | 'scan'
type Debounce = 'off' | 'on'

const DEBOUNCE_MS = 200

export function TrieAutocomplete() {
  const reduced = useReducedMotion()
  const narrow = useMediaQuery('(max-width: 560px)')
  const root = useMemo(buildTrie, [])
  const [text, setText] = useState('cl')
  const [served, setServed] = useState('cl')
  const [mode, setMode] = useState<Mode>('topk')
  const [k, setK] = useState(5)
  const [debounce, setDebounce] = useState<Debounce>('off')
  const [keys, setKeys] = useState(0)
  const [requests, setRequests] = useState(0)
  const [hits, setHits] = useState(0)
  const [visitedTotal, setVisitedTotal] = useState(0)
  const [log, setLog] = useState<{ id: number; text: string; tone?: 'ok' | 'warn' | 'bad' }[]>([])
  const [typing, setTyping] = useState(false)

  const cache = useRef(new Set<string>())
  const timer = useRef<number | undefined>(undefined)
  const typer = useRef<number | undefined>(undefined)
  const logId = useRef(0)

  const prefix = norm(served)
  const { path, found } = walk(root, prefix)
  const node = path[path.length - 1]
  const visitedNow = prefix.length === 0 ? 0 : mode === 'topk' ? path.length - 1 : path.length - 1 + (found ? node.size : 0)
  const suggestions = found && prefix.length > 0 ? node.top.slice(0, k) : []

  useEffect(
    () => () => {
      window.clearTimeout(timer.current)
      window.clearInterval(typer.current)
    },
    [],
  )

  function pushLog(t: string, tone?: 'ok' | 'warn' | 'bad') {
    logId.current += 1
    const id = logId.current
    setLog((l) => [{ id, text: t, tone }, ...l].slice(0, 30))
  }

  function request(q: string) {
    const p = norm(q)
    setServed(q)
    if (!p) return
    if (cache.current.has(p)) {
      setHits((h) => h + 1)
      pushLog(`caché del navegador: "${p}" (0 peticiones)`, 'ok')
      return
    }
    cache.current.add(p)
    const w = walk(root, p)
    const n = w.path[w.path.length - 1]
    const visited = mode === 'topk' ? w.path.length - 1 : w.path.length - 1 + (w.found ? n.size : 0)
    setRequests((r) => r + 1)
    setVisitedTotal((v) => v + visited)
    pushLog(
      `GET /suggestions?q=${p} → ${w.found ? Math.min(k, n.top.length) : 0} resultados · ${visited} nodos`,
      w.found ? undefined : 'warn',
    )
  }

  function onType(value: string) {
    setText(value)
    setKeys((x) => x + 1)
    if (debounce === 'off') {
      request(value)
    } else {
      window.clearTimeout(timer.current)
      const v = value
      timer.current = window.setTimeout(() => request(v), DEBOUNCE_MS)
    }
  }

  function reset() {
    window.clearTimeout(timer.current)
    window.clearInterval(typer.current)
    setTyping(false)
    cache.current.clear()
    setText('')
    setServed('')
    setKeys(0)
    setRequests(0)
    setHits(0)
    setVisitedTotal(0)
    setLog([])
  }

  function demo() {
    reset()
    setTyping(true)
    let i = 0
    typer.current = window.setInterval(() => {
      i += 1
      onTypeRef.current(DEMO_TEXT.slice(0, i))
      if (i >= DEMO_TEXT.length) {
        window.clearInterval(typer.current)
        setTyping(false)
      }
    }, 90)
  }

  // El intervalo de la demo debe usar la versión más reciente de onType (modo, k, debounce).
  const onTypeRef = useRef(onType)
  useEffect(() => {
    onTypeRef.current = onType
  })

  function pick(ch: string) {
    onType(served + ch)
  }

  /* ───────── Geometría del SVG ───────── */
  const W = narrow ? 400 : 640
  const VISIBLE_PATH = narrow ? 5 : 7
  const H = 236
  const LINE_Y = 64
  const KID_Y = 186
  const shown = path.length > VISIBLE_PATH ? path.slice(path.length - VISIBLE_PATH) : path
  const clipped = path.length > VISIBLE_PATH
  const missing = found ? '' : prefix.slice(path.length - 1)
  const step = narrow ? 70 : 78
  const x0 = clipped ? 70 : 44
  const pos = (i: number) => x0 + i * step
  const curX = pos(shown.length - 1)
  const kids = found ? [...node.children.values()].sort((a, b) => (b.top[0]?.[1] ?? 0) - (a.top[0]?.[1] ?? 0)).slice(0, narrow ? 5 : 7) : []
  const kidX = (i: number) => {
    const span = Math.min(W - 80, Math.max(kids.length - 1, 1) * (narrow ? 76 : 84))
    const start = Math.min(Math.max(curX - span / 2, 40), W - 40 - span)
    return kids.length === 1 ? Math.min(Math.max(curX, 40), W - 40) : start + (span / Math.max(kids.length - 1, 1)) * i
  }
  const label = (ch: string) => (ch === ' ' ? '␣' : ch)
  const t = reduced ? { duration: 0 } : { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const }
  const maxCount = suggestions[0]?.[1] ?? 1

  return (
    <WidgetFrame
      caption={
        <>
          Escribe un prefijo o toca una rama. En modo <b>top-k precalculado</b> la respuesta cuesta lo que mide el prefijo; en{' '}
          <b>recorrer subárbol</b> hay que visitar todo lo que cuelga de él y ordenarlo. Con <b>debounce</b> y caché del navegador,
          la mayoría de las teclas no llegan al servidor. Conteos de ejemplo.
        </>
      }
      controls={
        <>
          <Segmented<Mode>
            label="Estrategia"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'topk', label: 'Top-k precalculado' },
              { value: 'scan', label: 'Recorrer subárbol' },
            ]}
          />
          <Segmented<Debounce>
            label="Debounce"
            value={debounce}
            onChange={setDebounce}
            options={[
              { value: 'off', label: 'Sin' },
              { value: 'on', label: `${DEBOUNCE_MS} ms` },
            ]}
          />
          <Slider label="k sugerencias" value={k} min={1} max={MAX_K} onChange={setK} />
        </>
      }
      readout={
        <>
          <div className="ta-stats">
            <Stat label="Nodos visitados (última)" value={visitedNow} tone={mode === 'scan' && visitedNow > 40 ? 'warn' : undefined} />
            <Stat label="Teclas" value={keys} />
            <Stat label="Peticiones al servidor" value={requests} />
            <Stat label="Hits de caché local" value={hits} tone={hits > 0 ? 'ok' : undefined} />
            <Stat label="Nodos visitados (total)" value={visitedTotal} />
          </div>
          <Log entries={log} empty="Escribe para ver las peticiones." />
        </>
      }
    >
      <div className="ta-input-row">
        <label className="ta-input">
          <span className="visually-hidden">Prefijo de búsqueda</span>
          <input
            type="text"
            value={text}
            onChange={(e) => onType(e.target.value)}
            placeholder="Busca algo… (prueba: c, cl, cómo, p)"
            autoComplete="off"
            spellCheck={false}
            disabled={typing}
          />
        </label>
        <button type="button" className="btn" onClick={demo} disabled={typing}>
          <Keyboard size={16} aria-hidden="true" /> Tipeo rápido
        </button>
        <button type="button" className="icon-btn" onClick={reset} aria-label="Reiniciar">
          <RotateCcw size={18} aria-hidden="true" />
        </button>
      </div>

      <svg className="ta-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Camino en el trie para el prefijo ${prefix || 'vacío'}`}>
        {/* línea del camino */}
        {shown.length > 1 && (
          <line x1={pos(0)} y1={LINE_Y} x2={curX} y2={LINE_Y} className="ta-track is-on" />
        )}
        {clipped && (
          <text x={20} y={LINE_Y + 5} className="ta-ellipsis">
            …
          </text>
        )}
        {missing && (
          <>
            <line x1={curX} y1={LINE_Y} x2={Math.min(curX + step, W - 30)} y2={LINE_Y} className="ta-track is-bad" />
            <text x={Math.min(curX + step, W - 30)} y={LINE_Y + 34} textAnchor="middle" className="ta-miss">
              "{missing}" no existe
            </text>
          </>
        )}
        {/* ramas hacia los hijos del nodo actual */}
        {kids.map((c, i) => {
          const kx = kidX(i)
          const mid = (LINE_Y + KID_Y) / 2
          return (
            <path
              key={`e-${c.ch}`}
              d={`M${curX},${LINE_Y + 16} L${curX},${mid - 20} Q${curX},${mid} ${curX + (kx - curX) * 0.15},${mid} L${kx - (kx - curX) * 0.15},${mid} Q${kx},${mid} ${kx},${mid + 20} L${kx},${KID_Y - 16}`}
              className="ta-branch"
            />
          )
        })}
        {/* nodos del camino */}
        {shown.map((n, i) => {
          const isCur = i === shown.length - 1
          return (
            <g key={`p-${path.length - shown.length + i}`}>
              <motion.circle
                cx={pos(i)}
                cy={LINE_Y}
                r={isCur ? 17 : 14}
                className={`ta-station ${isCur ? 'is-cur' : 'is-on'}`}
                initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={t}
              />
              <text x={pos(i)} y={LINE_Y + 5} textAnchor="middle" className={`ta-ch ${isCur ? 'is-cur' : ''}`}>
                {n.ch === '' ? '·' : label(n.ch)}
              </text>
              {(i === 0 && !clipped) && (
                <text x={pos(i)} y={LINE_Y - 28} textAnchor="middle" className="ta-small">
                  raíz
                </text>
              )}
              {isCur && n.ch !== '' && (
                <text x={pos(i)} y={LINE_Y - 28} textAnchor="middle" className="ta-small">
                  {mode === 'topk' ? `top-${Math.min(k, n.top.length)} guardado` : `${n.size} nodos debajo`}
                </text>
              )}
            </g>
          )
        })}
        {/* hijos: tocables para seguir bajando */}
        {kids.map((c, i) => {
          const kx = kidX(i)
          return (
            <g
              key={`k-${c.ch}`}
              className="ta-kid"
              role="button"
              tabIndex={typing ? -1 : 0}
              aria-label={`Agregar la letra ${c.ch === ' ' ? 'espacio' : c.ch}`}
              onClick={() => !typing && pick(c.ch)}
              onKeyDown={(e) => {
                if (!typing && (e.key === 'Enter' || e.key === ' ')) {
                  e.preventDefault()
                  pick(c.ch)
                }
              }}
            >
              <rect x={kx - 22} y={KID_Y - 22} width={44} height={44} rx={22} className="ta-hit" />
              <circle cx={kx} cy={KID_Y} r={14} className="ta-station is-kid" />
              <text x={kx} y={KID_Y + 5} textAnchor="middle" className="ta-ch">
                {label(c.ch)}
              </text>
              <text x={kx} y={KID_Y + 36} textAnchor="middle" className="ta-small">
                {(c.top[0]?.[1] ?? 0).toLocaleString('es')}
              </text>
            </g>
          )
        })}
        {found && kids.length === 0 && prefix.length > 0 && (
          <text x={curX} y={KID_Y} textAnchor="middle" className="ta-small">
            hoja: fin de la consulta
          </text>
        )}
      </svg>

      <div className="ta-results" aria-live="polite">
        <div className="ta-results__head">
          <span>Sugerencias para</span> <code>{prefix || '—'}</code>
          {debounce === 'on' && norm(text) !== prefix && <span className="ta-wait">esperando pausa…</span>}
        </div>
        <ol className="ta-list">
          <AnimatePresence initial={false}>
            {suggestions.map(([q, c]) => {
              const nq = norm(q)
              return (
                <motion.li
                  key={q}
                  layout={!reduced}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={t}
                >
                  <span className="ta-q">
                    <b>{q.slice(0, prefix.length)}</b>
                    {q.slice(prefix.length)}
                    {nq !== q.toLowerCase() && <span className="visually-hidden"> ({nq})</span>}
                  </span>
                  <span className="ta-bar" aria-hidden="true">
                    <span style={{ width: `${(c / maxCount) * 100}%` }} />
                  </span>
                  <span className="ta-count">{c.toLocaleString('es')}</span>
                </motion.li>
              )
            })}
          </AnimatePresence>
          {suggestions.length === 0 && <li className="ta-empty">{prefix ? 'Sin sugerencias.' : 'Escribe al menos una letra.'}</li>}
        </ol>
      </div>
    </WidgetFrame>
  )
}
