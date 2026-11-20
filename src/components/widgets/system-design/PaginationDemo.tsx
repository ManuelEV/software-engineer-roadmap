import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ChevronRight, Plus, RotateCcw, Trash2 } from 'lucide-react'
import { Log, Stat, WidgetFrame } from '../kit'
import { EASE, fmt } from './shared'
import './PaginationDemo.css'

const PAGE = 4
const INITIAL = 20

type Column = { pages: number[][]; cursor: number | null }
type State = {
  items: number[] // post ids, newest first (ORDER BY id DESC)
  nextId: number
  originalTop: number
  offset: Column
  keyset: Column
  log: { id: number; text: string; tone?: 'ok' | 'warn' | 'bad' }[]
  logId: number
}

function initial(): State {
  const items = Array.from({ length: INITIAL }, (_, i) => 1000 + INITIAL - i)
  return {
    items,
    nextId: 1000 + INITIAL + 1,
    originalTop: items[0],
    offset: { pages: [], cursor: null },
    keyset: { pages: [], cursor: null },
    log: [],
    logId: 0,
  }
}

function analyze(col: Column, items: number[], originalTop: number) {
  const seen = new Map<number, number>()
  let dups = 0
  col.pages.flat().forEach((id) => {
    const c = seen.get(id) ?? 0
    if (c > 0) dups++
    seen.set(id, c + 1)
  })
  const all = col.pages.flat()
  const minSeen = all.length ? Math.min(...all) : Infinity
  const skipped = items.filter((id) => id <= originalTop && id >= minSeen && !seen.has(id))
  return { dups, skipped }
}

export function PaginationDemo() {
  const reduced = useReducedMotion()
  const [s, setS] = useState<State>(initial)

  const push = (st: State, text: string, tone?: 'ok' | 'warn' | 'bad'): Pick<State, 'log' | 'logId'> => ({
    log: [{ id: st.logId, text, tone }, ...st.log].slice(0, 12),
    logId: st.logId + 1,
  })

  const next = () =>
    setS((st) => {
      const p = st.offset.pages.length
      const offPage = st.items.slice(p * PAGE, p * PAGE + PAGE)
      const keyPage = (st.keyset.cursor === null ? st.items : st.items.filter((id) => id < st.keyset.cursor!)).slice(0, PAGE)
      const offset = { pages: [...st.offset.pages, offPage], cursor: null }
      const keyset = { pages: [...st.keyset.pages, keyPage], cursor: keyPage.length ? keyPage[keyPage.length - 1] : st.keyset.cursor }
      return {
        ...st,
        offset,
        keyset,
        ...push(st, `Página ${p + 1}: OFFSET ${p * PAGE} → [${offPage.join(', ')}] · cursor → [${keyPage.join(', ')}]`),
      }
    })

  const insert = () =>
    setS((st) => ({
      ...st,
      items: [st.nextId, ...st.items],
      nextId: st.nextId + 1,
      ...push(st, `INSERT post ${st.nextId} (aparece arriba de todo)`, 'warn'),
    }))

  const remove = () =>
    setS((st) => {
      const seen = st.offset.pages.flat().filter((id) => st.items.includes(id))
      // delete a post the reader already saw, which shifts every later row up by one
      const victim = seen.length ? seen[seen.length - 1] : st.items[1]
      return {
        ...st,
        items: st.items.filter((id) => id !== victim),
        ...push(st, `DELETE post ${victim} (ya lo habías visto)`, 'warn'),
      }
    })

  const reset = () => setS(initial())

  const off = analyze(s.offset, s.items, s.originalTop)
  const key = analyze(s.keyset, s.items, s.originalTop)
  const p = s.offset.pages.length
  const exhausted = p * PAGE >= s.items.length

  const offSql = `SELECT * FROM posts\nORDER BY id DESC\nLIMIT ${PAGE} OFFSET ${p * PAGE};`
  const keySql =
    s.keyset.cursor === null
      ? `SELECT * FROM posts\nORDER BY id DESC\nLIMIT ${PAGE};`
      : `SELECT * FROM posts\nWHERE id < ${s.keyset.cursor}\nORDER BY id DESC\nLIMIT ${PAGE};`

  const renderCol = (title: string, col: Column, a: ReturnType<typeof analyze>, sql: string, rowsRead: number) => {
    const counts = new Map<number, number>()
    return (
      <div className="pg-col">
        <div className="pg-col__head">
          <b>{title}</b>
        </div>
        <pre className="pg-sql" aria-label={`Siguiente consulta ${title}`}>
          {sql}
        </pre>
        <div className="pg-col__stats">
          <Stat label="Duplicados" value={a.dups} tone={a.dups ? 'bad' : 'ok'} />
          <Stat label="Saltados" value={a.skipped.length} tone={a.skipped.length ? 'bad' : 'ok'} />
          <Stat label="Filas que lee la BD" value={fmt(rowsRead, 0)} hint="próxima página" />
        </div>
        <ol className="pg-pages">
          <AnimatePresence initial={false}>
            {col.pages.map((page, i) => (
              <motion.li
                key={i}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.25, ease: EASE }}
              >
                <span className="pg-pages__n">p{i + 1}</span>
                {page.length === 0 && <span className="pg-empty">vacía</span>}
                {page.map((id) => {
                  const c = (counts.get(id) ?? 0) + 1
                  counts.set(id, c)
                  return (
                    <span key={id} className={`pg-chip ${c > 1 ? 'is-dup' : ''}`} title={c > 1 ? 'Duplicado' : undefined}>
                      {id}
                    </span>
                  )
                })}
              </motion.li>
            ))}
          </AnimatePresence>
        </ol>
        {a.skipped.length > 0 && (
          <p className="pg-skipped">
            Nunca verás: {a.skipped.map((id) => <span key={id} className="pg-chip is-skip">{id}</span>)}
          </p>
        )}
      </div>
    )
  }

  return (
    <WidgetFrame
      caption="Un feed ordenado del más nuevo al más viejo. Pasa páginas y, entre una y otra, inserta o borra posts: la paginación por offset duplica o se salta filas; la de cursor (keyset) no."
      controls={
        <div className="pg-controls">
          <button type="button" className="btn btn--line" onClick={next} disabled={exhausted}>
            Siguiente página <ChevronRight size={16} aria-hidden="true" />
          </button>
          <button type="button" className="btn" onClick={insert}>
            <Plus size={16} aria-hidden="true" /> Llega un post nuevo
          </button>
          <button type="button" className="btn" onClick={remove}>
            <Trash2 size={16} aria-hidden="true" /> Borrar uno ya visto
          </button>
          <button type="button" className="icon-btn" onClick={reset} aria-label="Reiniciar">
            <RotateCcw size={18} aria-hidden="true" />
          </button>
        </div>
      }
      readout={<Log entries={s.log} empty="Pide la primera página." />}
    >
      <div className="pg-table" aria-label="Tabla posts, más nuevo primero">
        <span className="pg-table__label">posts (ORDER BY id DESC)</span>
        <div className="pg-table__rows">
          {s.items.map((id, i) => {
            const inOffset = i >= p * PAGE && i < p * PAGE + PAGE
            const isNew = id > s.originalTop
            return (
              <span key={id} className={`pg-cell ${inOffset ? 'is-window' : ''} ${isNew ? 'is-new' : ''}`}>
                {id}
              </span>
            )
          })}
        </div>
        <span className="pg-table__hint">Resaltado: la ventana que tomará OFFSET {p * PAGE} en la próxima página.</span>
      </div>
      <div className="pg-cols">
        {renderCol('Offset', s.offset, off, offSql, p * PAGE + PAGE)}
        {renderCol('Cursor (keyset)', s.keyset, key, keySql, PAGE)}
      </div>
    </WidgetFrame>
  )
}
