import { type ReactNode, useEffect, useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Plus, RotateCcw, Search, Shuffle } from 'lucide-react'
import { Segmented, Stat, WidgetFrame } from '../kit'
import './HashTableLab.css'

/**
 * A hash table you can poke: insert or look up keys, see the bucket Java's HashMap would pick,
 * collisions resolved by chaining or linear probing, the load factor, and a
 * step-by-step rehash into a table twice as big when it crosses 0.75.
 */

type Mode = 'chain' | 'probe'
type HashKind = 'good' | 'bad'

const THRESHOLD = 0.75
const START_CAP = 8
const MAX_KEYS = 24
const POOL = ['ana', 'luis', 'pedido-17', 'carla', 'envio-3', 'diego', 'pago-88', 'sofia', 'lima', 'user-9', 'marta', 'pedido-42', 'bogota', 'carrito', 'quito', 'cdmx', 'santiago', 'cusco', 'rosario', 'cali', 'puebla', 'merida', 'caracas', 'asuncion', 'montevideo']

/** Java's String.hashCode (a signed 32-bit int), or the key's length for the bad hash. */
function hashOf(key: string, kind: HashKind) {
  if (kind === 'bad') return key.length
  let h = 0
  for (let k = 0; k < key.length; k++) h = (Math.imul(h, 31) + key.charCodeAt(k)) | 0
  return h
}

/** Java HashMap: spread the high bits into the low ones, then mask (capacity is a power of 2). */
const spread = (h: number) => (h ^ (h >>> 16)) | 0
const bucketOf = (key: string, kind: HashKind, cap: number) => spread(hashOf(key, kind)) & (cap - 1)

type Table = { mode: 'chain'; buckets: string[][] } | { mode: 'probe'; slots: (string | null)[] }

function build(keys: string[], cap: number, mode: Mode, kind: HashKind): Table {
  if (mode === 'chain') {
    const buckets: string[][] = Array.from({ length: cap }, () => [])
    for (const k of keys) buckets[bucketOf(k, kind, cap)].push(k)
    return { mode, buckets }
  }
  const slots: (string | null)[] = Array.from({ length: cap }, () => null)
  for (const k of keys) {
    let i = bucketOf(k, kind, cap)
    while (slots[i] !== null) i = (i + 1) % cap
    slots[i] = k
  }
  return { mode, slots }
}

interface Op {
  kind: 'insert' | 'search'
  key: string
  h: number
  home: number
  /** buckets/slots visited, in order */
  path: number[]
  /** where the key is (or ends up); -1 if not found */
  at: number
  outcome: 'new' | 'update' | 'found' | 'missing'
  comps: number
  collided: boolean
}

function probe(table: Table, key: string, cap: number, hk: HashKind, kind: Op['kind']): Op {
  const h = hashOf(key, hk)
  const home = bucketOf(key, hk, cap)
  if (table.mode === 'chain') {
    const chain = table.buckets[home]
    const pos = chain.indexOf(key)
    const comps = pos >= 0 ? pos + 1 : chain.length
    if (pos >= 0) return { kind, key, h, home, path: [home], at: home, outcome: kind === 'insert' ? 'update' : 'found', comps, collided: false }
    return { kind, key, h, home, path: [home], at: kind === 'insert' ? home : -1, outcome: kind === 'insert' ? 'new' : 'missing', comps, collided: chain.length > 0 }
  }
  const path: number[] = []
  let i = home
  let comps = 0
  for (let n = 0; n < cap; n++) {
    path.push(i)
    const s = table.slots[i]
    if (s === null) return { kind, key, h, home, path, at: kind === 'insert' ? i : -1, outcome: kind === 'insert' ? 'new' : 'missing', comps, collided: path.length > 1 }
    comps++
    if (s === key) return { kind, key, h, home, path, at: i, outcome: kind === 'insert' ? 'update' : 'found', comps, collided: false }
    i = (i + 1) % cap
  }
  return { kind, key, h, home, path, at: -1, outcome: 'missing', comps, collided: true }
}

interface Rehash {
  oldCap: number
  newCap: number
  moved: number
}

const pct = (v: number) => v.toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function Buckets({ table, op, fadeKeys, newKeys, label }: { table: Table; op?: Op | null; fadeKeys?: Set<string>; newKeys?: Set<string>; label: string }) {
  const reduced = useReducedMotion()
  const cap = table.mode === 'chain' ? table.buckets.length : table.slots.length
  const rows = Array.from({ length: cap }, (_, i) => (table.mode === 'chain' ? table.buckets[i] : table.slots[i] === null ? [] : [table.slots[i] as string]))
  return (
    <ol className={`htl-buckets ${cap > 8 ? 'is-many' : ''}`} aria-label={label}>
      {rows.map((items, i) => {
        const cls = [
          'htl-b',
          op && op.home === i ? 'is-home' : '',
          op && op.path.length > 1 && op.path.includes(i) && op.at !== i ? 'is-probed' : '',
          op && op.at === i ? 'is-target' : '',
        ].join(' ')
        return (
          <li key={i} className={cls}>
            <span className="htl-b__i">{i}</span>
            <span className="htl-b__items">
              {items.length === 0 && <span className="htl-b__empty">{table.mode === 'chain' ? '∅' : 'libre'}</span>}
              {items.map((k, n) => (
                <span key={k} className="htl-b__pair">
                  {n > 0 && (
                    <span className="htl-b__arrow" aria-hidden="true">
                      →
                    </span>
                  )}
                  <motion.span
                    className={`htl-key ${op && op.key === k && op.at === i ? (op.outcome === 'found' || op.outcome === 'update' ? 'is-hit' : 'is-new') : ''} ${fadeKeys?.has(k) ? 'is-gone' : ''}`}
                    initial={newKeys?.has(k) ? { opacity: 0 } : false}
                    animate={{ opacity: fadeKeys?.has(k) ? 0.35 : 1 }}
                    transition={{ duration: reduced ? 0.15 : 0.3, ease: [0.16, 1, 0.3, 1] }}
                  >
                    {k}
                  </motion.span>
                </span>
              ))}
            </span>
          </li>
        )
      })}
    </ol>
  )
}

export function HashTableLab() {
  const [mode, setMode] = useState<Mode>('chain')
  const [hk, setHk] = useState<HashKind>('good')
  const [cap, setCap] = useState(START_CAP)
  const [keys, setKeys] = useState<string[]>(['ana', 'luis', 'pedido-17'])
  const [last, setLast] = useState<Op | null>(null)
  const [rehash, setRehash] = useState<Rehash | null>(null)
  const [text, setText] = useState('')
  const [msg, setMsg] = useState('')

  const table = useMemo(() => build(keys, cap, mode, hk), [keys, cap, mode, hk])

  useEffect(() => {
    if (!rehash) return
    const done = rehash.moved >= keys.length
    const t = setTimeout(
      () => {
        if (done) {
          setCap(rehash.newCap)
          setRehash(null)
          setLast(null)
          setMsg(`Rehash terminado: ${keys.length} llaves en ${rehash.newCap} buckets, factor de carga ${pct(keys.length / rehash.newCap)}. Fíjate en que varias llaves cambiaron de bucket.`)
        } else setRehash({ ...rehash, moved: rehash.moved + 1 })
      },
      done ? 700 : 380,
    )
    return () => clearTimeout(t)
  }, [rehash, keys.length])

  const busy = rehash !== null
  const load = keys.length / cap

  const run = (kind: Op['kind'], raw: string) => {
    const key = raw.trim().slice(0, 14)
    if (!key || busy) return
    if (kind === 'insert' && !keys.includes(key) && keys.length >= MAX_KEYS) {
      setMsg(`Llegaste a ${MAX_KEYS} llaves, el máximo de este laboratorio. Reinicia para seguir.`)
      return
    }
    const op = probe(table, key, cap, hk, kind)
    setLast(op)
    setMsg('')
    if (kind === 'insert' && op.outcome === 'new') {
      const next = [...keys, key]
      setKeys(next)
      if (next.length / cap > THRESHOLD) setRehash({ oldCap: cap, newCap: cap * 2, moved: 0 })
    }
    setText('')
  }

  const randomKey = () => {
    const k = POOL.find((p) => !keys.includes(p))
    if (k) run('insert', k)
  }
  const reset = () => {
    setKeys([])
    setCap(START_CAP)
    setLast(null)
    setRehash(null)
    setMsg('')
  }

  // stats
  let collisions = 0
  let worst = 0
  if (table.mode === 'chain') {
    for (const b of table.buckets) {
      collisions += Math.max(0, b.length - 1)
      worst = Math.max(worst, b.length)
    }
  } else {
    table.slots.forEach((k, i) => {
      if (k === null) return
      const home = bucketOf(k, hk, cap)
      const dist = (i - home + cap) % cap
      if (dist > 0) collisions++
      worst = Math.max(worst, dist + 1)
    })
  }

  let note: ReactNode
  if (rehash) {
    const movedKey = keys[rehash.moved - 1]
    note = (
      <>
        <b>Rehash.</b> Factor de carga {keys.length}/{rehash.oldCap} = {pct(keys.length / rehash.oldCap)}, mayor que {pct(THRESHOLD)}: se reserva un arreglo de {rehash.newCap} buckets y cada llave se reubica con la máscara <code>& {rehash.newCap - 1}</code>: queda en el mismo índice o en índice + {rehash.oldCap}, según un bit más del hash. Llevamos {Math.min(rehash.moved, keys.length)} de {keys.length}
        {movedKey ? (
          <>
            {' '}
            (<code>{movedKey}</code>: bucket {bucketOf(movedKey, hk, rehash.oldCap)} → {bucketOf(movedKey, hk, rehash.newCap)}).
          </>
        ) : (
          '.'
        )}{' '}
        Este paso es O(n), pero ocurre tan pocas veces que el costo amortizado por inserción sigue siendo O(1).
      </>
    )
  } else if (last) {
    const calc =
      hk === 'bad' ? (
        <>
          <code>hash("{last.key}") = len = {last.h}</code>, <code>{last.h} & {cap - 1} = {last.home}</code>
        </>
      ) : (
        <>
          <code>"{last.key}".hashCode() = {last.h}</code>, <code>(h ^ (h &gt;&gt;&gt; 16)) & {cap - 1} = {last.home}</code>
        </>
      )
    const probes = mode === 'probe' && last.path.length > 1 ? ` Sondeo lineal: ${last.path.join(' → ')}.` : ''
    const what = {
      new: last.collided
        ? mode === 'chain'
          ? ` El bucket ${last.home} ya tenía llaves: colisión. Recorremos la cadena (${last.comps} ${last.comps === 1 ? 'comparación' : 'comparaciones'}) para confirmar que no está y la agregamos al final.`
          : ` El bucket ${last.home} estaba ocupado: colisión.${probes} Queda en ${last.at}.`
        : ` Bucket libre: entra directo.`,
      update: ` La llave ya existía: se reemplaza el valor, no se agrega otra entrada.${probes}`,
      found: ` Encontrada tras ${last.comps} ${last.comps === 1 ? 'comparación' : 'comparaciones'}.${probes}`,
      missing: ` No está: ${mode === 'chain' ? `recorrimos la cadena entera (${last.comps} ${last.comps === 1 ? 'comparación' : 'comparaciones'})` : `el sondeo llegó a un hueco libre en ${last.path[last.path.length - 1]}`}.${mode === 'probe' && last.path.length > 1 ? ` Camino: ${last.path.join(' → ')}.` : ''}`,
    }[last.outcome]
    note = (
      <>
        {calc}.{what}
      </>
    )
  } else {
    note = 'Escribe una llave y pulsa Insertar (o usa una al azar). Mira en qué bucket cae y qué pasa cuando dos llaves quieren el mismo.'
  }

  const oldTable = rehash ? build(keys, rehash.oldCap, mode, hk) : null
  const newTable = rehash ? build(keys.slice(0, rehash.moved), rehash.newCap, mode, hk) : null
  const movedSet = rehash ? new Set(keys.slice(0, rehash.moved)) : undefined
  const justMoved = rehash && rehash.moved > 0 ? new Set([keys[rehash.moved - 1]]) : undefined

  return (
    <WidgetFrame
      caption="Una tabla hash por dentro, con las mismas cuentas que HashMap de Java: hashCode(), mezcla de bits altos y máscara con capacidad − 1. Con la función mala (el largo de la llave) todo choca y la búsqueda se vuelve lineal; al pasar el factor de carga 0,75 la tabla se duplica y redistribuye."
      controls={
        <>
          <Segmented
            label="Colisiones"
            value={mode}
            onChange={(v) => {
              setMode(v)
              setLast(null)
            }}
            options={[
              { value: 'chain', label: 'Encadenamiento' },
              { value: 'probe', label: 'Sondeo lineal' },
            ]}
          />
          <Segmented
            label="Función hash"
            value={hk}
            onChange={(v) => {
              setHk(v)
              setLast(null)
            }}
            options={[
              { value: 'good', label: 'String.hashCode()' },
              { value: 'bad', label: 'Mala: len(key)' },
            ]}
          />
          <form
            className="htl-form"
            onSubmit={(e) => {
              e.preventDefault()
              run('insert', text)
            }}
          >
            <label className="htl-form__lbl">
              <span className="seg__label">Llave</span>
              <input value={text} onChange={(e) => setText(e.target.value)} placeholder="pedido-7" maxLength={14} disabled={busy} />
            </label>
            <button type="submit" className="btn btn--line" disabled={busy || !text.trim()}>
              <Plus size={15} /> Insertar
            </button>
            <button type="button" className="btn" disabled={busy || !text.trim()} onClick={() => run('search', text)}>
              <Search size={15} /> Buscar
            </button>
            <button type="button" className="btn btn--ghost" disabled={busy || keys.length >= MAX_KEYS} onClick={randomKey}>
              <Shuffle size={15} /> Al azar
            </button>
            <button type="button" className="icon-btn" onClick={reset} aria-label="Vaciar la tabla" title="Vaciar la tabla">
              <RotateCcw size={17} />
            </button>
          </form>
        </>
      }
      readout={
        <>
          <div className="htl-stats">
            <Stat label="llaves" value={keys.length} />
            <Stat label="capacidad" value={rehash ? `${rehash.oldCap} → ${rehash.newCap}` : cap} />
            <Stat label="factor de carga" value={pct(load)} tone={load > THRESHOLD ? 'bad' : load > 0.6 ? 'warn' : undefined} hint={`umbral ${pct(THRESHOLD)}`} />
            <Stat label="colisiones" value={collisions} />
            <Stat label={mode === 'chain' ? 'cadena más larga' : 'sondeo más largo'} value={worst} tone={worst >= 4 ? 'warn' : undefined} />
          </div>
          <p className="htl-note" aria-live="polite">
            {msg || note}
          </p>
        </>
      }
    >
      {rehash && oldTable && newTable ? (
        <div className="htl-rehash">
          <div>
            <div className="htl-title">Antes: {rehash.oldCap} buckets</div>
            <Buckets table={oldTable} fadeKeys={movedSet} label={`Tabla vieja de ${rehash.oldCap} buckets`} />
          </div>
          <div>
            <div className="htl-title">Después: {rehash.newCap} buckets</div>
            <Buckets table={newTable} newKeys={justMoved} label={`Tabla nueva de ${rehash.newCap} buckets`} />
          </div>
        </div>
      ) : (
        <>
          <div className="htl-title">
            {cap} buckets · <code>bucket = (h ^ (h &gt;&gt;&gt; 16)) & {cap - 1}</code>
          </div>
          <Buckets table={table} op={last} newKeys={last?.outcome === 'new' ? new Set([last.key]) : undefined} label={`Tabla hash de ${cap} buckets`} />
        </>
      )}
    </WidgetFrame>
  )
}
