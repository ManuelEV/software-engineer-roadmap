import { useMemo, useState } from 'react'
import { Segmented, Stat, WidgetFrame } from '../kit'
import { StepControls, StepNote } from './algo-kit'
import { useStepPlayer } from './useStepPlayer'
import './IndexLookup.css'

/**
 * IndexLookup: a table of 16 users and a composite index (pais, ciudad).
 * Frames come from actually running either a lower-bound search on the sorted
 * index plus a range scan, or a sequential scan, and counting what was read.
 */

interface User {
  id: number
  nombre: string
  pais: string
  ciudad: string
}

const USERS: User[] = [
  { id: 1, nombre: 'Ana', pais: 'MX', ciudad: 'Monterrey' },
  { id: 2, nombre: 'Bruno', pais: 'AR', ciudad: 'Córdoba' },
  { id: 3, nombre: 'Camila', pais: 'CO', ciudad: 'Bogotá' },
  { id: 4, nombre: 'Daniel', pais: 'MX', ciudad: 'CDMX' },
  { id: 5, nombre: 'Elisa', pais: 'CL', ciudad: 'Santiago' },
  { id: 6, nombre: 'Fabián', pais: 'PE', ciudad: 'Lima' },
  { id: 7, nombre: 'Gabriela', pais: 'MX', ciudad: 'Guadalajara' },
  { id: 8, nombre: 'Hugo', pais: 'CO', ciudad: 'Medellín' },
  { id: 9, nombre: 'Inés', pais: 'AR', ciudad: 'Buenos Aires' },
  { id: 10, nombre: 'Jorge', pais: 'MX', ciudad: 'Monterrey' },
  { id: 11, nombre: 'Karen', pais: 'PE', ciudad: 'Arequipa' },
  { id: 12, nombre: 'Luis', pais: 'CO', ciudad: 'Bogotá' },
  { id: 13, nombre: 'María', pais: 'MX', ciudad: 'CDMX' },
  { id: 14, nombre: 'Nicolás', pais: 'CL', ciudad: 'Valparaíso' },
  { id: 15, nombre: 'Olga', pais: 'AR', ciudad: 'Buenos Aires' },
  { id: 16, nombre: 'Pablo', pais: 'MX', ciudad: 'Monterrey' },
]

const cmpStr = (a: string, b: string) => a.localeCompare(b, 'es')
const INDEX: User[] = [...USERS].sort((a, b) => cmpStr(a.pais, b.pais) || cmpStr(a.ciudad, b.ciudad) || a.id - b.id)

type QueryId = 'pais' | 'pais-ciudad' | 'ciudad' | 'lower'

interface Query {
  label: string
  where: string
  /** the row predicate */
  test: (u: User) => boolean
  /** key prefix usable by the index, or null if the index cannot seek */
  seek: string[] | null
  whyNot?: string
}

const QUERIES: Record<QueryId, Query> = {
  pais: { label: "pais = 'MX'", where: "WHERE pais = 'MX'", test: (u) => u.pais === 'MX', seek: ['MX'] },
  'pais-ciudad': {
    label: "pais = 'MX' AND ciudad = 'Monterrey'",
    where: "WHERE pais = 'MX'\n  AND ciudad = 'Monterrey'",
    test: (u) => u.pais === 'MX' && u.ciudad === 'Monterrey',
    seek: ['MX', 'Monterrey'],
  },
  ciudad: {
    label: "ciudad = 'Bogotá'",
    where: "WHERE ciudad = 'Bogotá'",
    test: (u) => u.ciudad === 'Bogotá',
    seek: null,
    whyNot: 'El índice está ordenado primero por país. Las Bogotá no están juntas en ningún tramo que se pueda ubicar sin saber el país: es como buscar por nombre de pila en una guía ordenada por apellido.',
  },
  lower: {
    label: "LOWER(pais) = 'mx'",
    where: "WHERE LOWER(pais) = 'mx'",
    test: (u) => u.pais.toLowerCase() === 'mx',
    seek: null,
    whyNot: 'El índice guarda pais, no LOWER(pais). Al envolver la columna en una función, la base no puede usar el orden del índice. Solución: un índice sobre la expresión, o no aplicar la función.',
  },
}

type IdxState = 'probe' | 'hit' | 'stop'
type RowState = 'read' | 'hit'

interface Frame {
  idx: Record<number, IdxState>
  rows: Record<number, RowState>
  cursorIdx: number | null
  cursorRow: number | null
  idxReads: number
  rowReads: number
  found: number
  note: string
  tone?: 'ok' | 'warn' | 'bad'
}

function keyCmp(u: User, key: string[]): number {
  const parts = [u.pais, u.ciudad]
  for (let k = 0; k < key.length; k++) {
    const c = cmpStr(parts[k], key[k])
    if (c !== 0) return c
  }
  return 0
}

function buildFrames(q: Query, useIndex: boolean): Frame[] {
  const frames: Frame[] = []
  const idx: Record<number, IdxState> = {}
  const rows: Record<number, RowState> = {}
  let idxReads = 0
  let rowReads = 0
  let found = 0
  const push = (f: Partial<Frame> & { note: string }) =>
    frames.push({ idx: { ...idx }, rows: { ...rows }, cursorIdx: null, cursorRow: null, idxReads, rowReads, found, ...f })

  if (useIndex && q.seek) {
    const key = q.seek
    const touched = new Set<number>()
    push({ note: `El planificador ve que la condición empieza por la primera columna del índice (pais, ciudad): puede buscar en el índice en vez de leer la tabla.` })
    // lower bound over the sorted leaf entries (a real B-tree descends 3-4 levels instead)
    let lo = 0
    let hi = INDEX.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      touched.add(mid)
      idxReads = touched.size
      idx[mid] = 'probe'
      const c = keyCmp(INDEX[mid], key)
      push({
        cursorIdx: mid,
        note: `Comparamos con la entrada ${mid} (${INDEX[mid].pais} · ${INDEX[mid].ciudad}). ${c < 0 ? 'Es menor que la clave: lo que buscamos está más abajo.' : 'Es mayor o igual: el primer resultado está aquí o más arriba.'}`,
      })
      delete idx[mid]
      if (c < 0) lo = mid + 1
      else hi = mid
    }
    let k = lo
    while (k < INDEX.length && keyCmp(INDEX[k], key) === 0) {
      touched.add(k)
      idxReads = touched.size
      idx[k] = 'hit'
      const u = INDEX[k]
      rowReads++
      found++
      rows[u.id] = 'hit'
      push({
        cursorIdx: k,
        cursorRow: u.id,
        note: `La entrada ${k} calza. El índice apunta a la fila #${u.id}; vamos a la tabla a buscar el resto de las columnas (${u.nombre}).`,
      })
      k++
    }
    if (k < INDEX.length) {
      touched.add(k)
      idxReads = touched.size
      idx[k] = 'stop'
      push({ cursorIdx: k, note: `La entrada ${k} (${INDEX[k].pais} · ${INDEX[k].ciudad}) ya no calza. Como el índice está ordenado, no puede haber más resultados: paramos.` })
    }
    push({
      tone: 'ok',
      note: `Listo: ${found} resultados leyendo ${idxReads} entradas del índice y ${rowReads} filas de la tabla, en vez de las ${USERS.length} filas completas. Con millones de filas, la diferencia es de milisegundos contra segundos.`,
    })
    return frames
  }

  push({
    tone: useIndex ? 'warn' : undefined,
    note: useIndex ? `Hay un índice (pais, ciudad), pero no sirve para esta condición. ${q.whyNot}` : 'Sin índice, la única opción es un Seq Scan: leer la tabla entera y evaluar la condición en cada fila.',
  })
  for (const u of USERS) {
    rowReads++
    const ok = q.test(u)
    if (ok) found++
    rows[u.id] = ok ? 'hit' : 'read'
    push({ cursorRow: u.id, note: `Fila #${u.id} (${u.pais} · ${u.ciudad}): ${ok ? 'calza' : 'no calza'}. ${ok ? '' : 'La leímos igual.'}` })
  }
  push({ tone: 'bad', note: `Seq Scan: ${found} resultados, pero leímos las ${rowReads} filas. El costo crece con el tamaño de la tabla, no con el del resultado.` })
  return frames
}

export function IndexLookup() {
  const [qid, setQid] = useState<QueryId>('pais')
  const [withIdx, setWithIdx] = useState<'on' | 'off'>('on')
  const q = QUERIES[qid]
  const frames = useMemo(() => buildFrames(q, withIdx === 'on'), [q, withIdx])
  const player = useStepPlayer(frames.length, { resetKey: `${qid}-${withIdx}`, interval: 700 })
  const f = frames[player.i]
  const plan = withIdx === 'on' && q.seek ? 'Index Scan using idx_pais_ciudad' : 'Seq Scan on usuarios'

  return (
    <WidgetFrame
      caption="Una tabla de 16 usuarios con un índice compuesto (pais, ciudad). Elige una consulta y mira qué lee la base en cada caso."
      controls={
        <>
          <label className="ixl-pick">
            <span className="seg__label">Consulta</span>
            <select value={qid} onChange={(e) => setQid(e.target.value as QueryId)}>
              {(Object.keys(QUERIES) as QueryId[]).map((k) => (
                <option key={k} value={k}>
                  {QUERIES[k].label}
                </option>
              ))}
            </select>
          </label>
          <Segmented
            label="Índice (pais, ciudad)"
            value={withIdx}
            onChange={setWithIdx}
            options={[
              { value: 'on', label: 'Existe' },
              { value: 'off', label: 'No existe' },
            ]}
          />
        </>
      }
      readout={<StepNote tone={f.tone}>{f.note}</StepNote>}
    >
      <div className="ixl-top">
        <pre className="ixl-sql" aria-label="Consulta">
          <code>{`SELECT * FROM usuarios\n${q.where};`}</code>
        </pre>
        <div className="ixl-stats">
          <Stat label="entradas de índice" value={f.idxReads} />
          <Stat label="filas de la tabla" value={f.rowReads} tone={f.rowReads > 8 ? 'bad' : undefined} />
          <Stat label="resultados" value={f.found} />
        </div>
      </div>
      <p className="ixl-plan">
        <span className="hand">plan:</span> <b>{plan}</b>
      </p>

      <div className="ixl-cols">
        <div className={`ixl-col ${withIdx === 'off' || !q.seek ? 'is-absent' : ''}`}>
          <div className="ixl-col__title">índice (pais, ciudad) · ordenado</div>
          <ol className="ixl-list" aria-label="Entradas del índice">
            {INDEX.map((u, k) => (
              <li key={u.id} className={`ixl-entry ${f.idx[k] ? `is-${f.idx[k]}` : ''} ${f.cursorIdx === k ? 'is-cur' : ''}`}>
                <span className="ixl-k">{k}</span>
                <span>{u.pais}</span>
                <span className="ixl-city">{u.ciudad}</span>
                <span className="ixl-ptr">#{u.id}</span>
              </li>
            ))}
          </ol>
        </div>
        <div className="ixl-col">
          <div className="ixl-col__title">tabla usuarios · orden de inserción</div>
          <ol className="ixl-list" aria-label="Filas de la tabla">
            {USERS.map((u) => (
              <li key={u.id} className={`ixl-entry ${f.rows[u.id] ? `is-${f.rows[u.id]}` : ''} ${f.cursorRow === u.id ? 'is-cur' : ''}`}>
                <span className="ixl-k">#{u.id}</span>
                <span className="ixl-name">{u.nombre}</span>
                <span>{u.pais}</span>
                <span className="ixl-city">{u.ciudad}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
      <StepControls player={player} />
    </WidgetFrame>
  )
}
