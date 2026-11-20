import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ChevronLeft, ChevronRight, CircleCheck, CircleX, RotateCcw } from 'lucide-react'
import { Segmented, WidgetFrame } from '../kit'
import './CollabEditing.css'

/* ───────── Modelo ───────── */

type Op = { kind: 'ins'; pos: number; text: string } | { kind: 'del'; pos: number; len: number }
type Site = 'A' | 'B'
type Tile = { c: string; tag: 'base' | Site; id?: string; deleted?: boolean }
type Mode = 'naive' | 'ot' | 'crdt'

interface Scenario {
  id: string
  label: string
  base: string
  a: Op
  b: Op
  intent: string
  note: string
}

const scenarios: Scenario[] = [
  {
    id: 'ins',
    label: 'Dos inserciones',
    base: 'casa',
    a: { kind: 'ins', pos: 4, text: 's' },
    b: { kind: 'ins', pos: 0, text: 'la ' },
    intent: 'la casas',
    note: 'Ana pluraliza al final; Beto agrega un artículo al inicio. La inserción de Beto corre todas las posiciones que Ana tenía en mente.',
  },
  {
    id: 'del-ins',
    label: 'Borrar e insertar',
    base: 'hola mundo',
    a: { kind: 'del', pos: 0, len: 5 },
    b: { kind: 'ins', pos: 5, text: 'nuevo ' },
    intent: 'nuevo mundo',
    note: 'Ana borra "hola "; Beto inserta "nuevo " justo delante de "mundo". Después del borrado de Ana, la posición 5 de Beto ya no existe donde él creía.',
  },
  {
    id: 'tie',
    label: 'Misma posición',
    base: 'sol',
    a: { kind: 'ins', pos: 3, text: 'a' },
    b: { kind: 'ins', pos: 3, text: 'o' },
    intent: 'cualquier orden, pero igual en ambos',
    note: 'Los dos escriben en el mismo lugar al mismo tiempo. No hay respuesta "correcta": lo único exigible es que ambas réplicas terminen iguales.',
  },
  {
    id: 'del-del',
    label: 'Borrados solapados',
    base: 'muy buenos días',
    a: { kind: 'del', pos: 0, len: 4 },
    b: { kind: 'del', pos: 0, len: 11 },
    intent: 'días',
    note: 'Ana borra "muy "; Beto borra "muy buenos ". Lo que se solapa no debe borrarse dos veces.',
  },
]

function applyTiles(tiles: Tile[], op: Op, tag: Site): Tile[] {
  const out = tiles.slice()
  if (op.kind === 'ins') {
    const p = Math.min(op.pos, out.length)
    out.splice(p, 0, ...[...op.text].map((c) => ({ c, tag })))
  } else {
    const p = Math.min(op.pos, out.length)
    out.splice(p, Math.max(0, Math.min(op.len, out.length - p)))
  }
  return out
}

/** Transforma `op` para aplicarlo después de `other`. `wins` desempata inserciones en la misma posición. */
function transform(op: Op, other: Op, wins: boolean): Op[] {
  if (op.kind === 'ins' && other.kind === 'ins') {
    if (op.pos < other.pos || (op.pos === other.pos && wins)) return [op]
    return [{ ...op, pos: op.pos + other.text.length }]
  }
  if (op.kind === 'ins' && other.kind === 'del') {
    if (op.pos <= other.pos) return [op]
    if (op.pos >= other.pos + other.len) return [{ ...op, pos: op.pos - other.len }]
    return [{ ...op, pos: other.pos }]
  }
  if (op.kind === 'del' && other.kind === 'ins') {
    const end = op.pos + op.len
    if (other.pos >= end) return [op]
    if (other.pos <= op.pos) return [{ ...op, pos: op.pos + other.text.length }]
    // La inserción cae dentro del rango: se parte el borrado en dos (derecha primero).
    const left = other.pos - op.pos
    return [
      { kind: 'del', pos: other.pos + other.text.length, len: op.len - left },
      { kind: 'del', pos: op.pos, len: left },
    ]
  }
  if (op.kind === 'del' && other.kind === 'del') {
    const s1 = op.pos
    const e1 = op.pos + op.len
    const s2 = other.pos
    const e2 = other.pos + other.len
    if (e1 <= s2) return [op]
    if (s1 >= e2) return [{ ...op, pos: s1 - other.len }]
    const overlap = Math.min(e1, e2) - Math.max(s1, s2)
    const len = op.len - overlap
    return len > 0 ? [{ kind: 'del', pos: Math.min(s1, s2), len }] : []
  }
  return [op]
}

/* CRDT tipo RGA: cada carácter tiene un ID único (contador, sitio) y nunca se borra físicamente. */
type CrdtOp =
  | { kind: 'ins'; origin: string | null; chars: { id: string; ctr: number; site: string; c: string }[] }
  | { kind: 'del'; ids: string[] }
type CChar = { id: string; ctr: number; site: string; c: string; deleted: boolean; tag: Tile['tag'] }

const greater = (x: { ctr: number; site: string }, y: { ctr: number; site: string }) =>
  x.ctr > y.ctr || (x.ctr === y.ctr && x.site > y.site)

function crdtBase(base: string): CChar[] {
  return [...base].map((c, i) => ({ id: String(i + 1), ctr: i + 1, site: '0', c, deleted: false, tag: 'base' }))
}

function localToCrdt(doc: CChar[], op: Op, site: Site): CrdtOp {
  const visible = doc.filter((d) => !d.deleted)
  if (op.kind === 'del') return { kind: 'del', ids: visible.slice(op.pos, op.pos + op.len).map((d) => d.id) }
  const origin = op.pos === 0 ? null : visible[op.pos - 1].id
  const max = Math.max(0, ...doc.map((d) => d.ctr))
  return {
    kind: 'ins',
    origin,
    chars: [...op.text].map((c, i) => ({ id: `${site}${max + i + 1}`, ctr: max + i + 1, site, c })),
  }
}

function integrate(doc: CChar[], op: CrdtOp, tag: Site): CChar[] {
  const out = doc.slice()
  if (op.kind === 'del') {
    const ids = new Set(op.ids)
    return out.map((d) => (ids.has(d.id) ? { ...d, deleted: true } : d))
  }
  let origin = op.origin
  for (const ch of op.chars) {
    let idx = origin === null ? 0 : out.findIndex((d) => d.id === origin) + 1
    // Regla RGA: saltar a los hermanos concurrentes con ID mayor.
    while (idx < out.length && greater(out[idx], ch)) idx++
    out.splice(idx, 0, { ...ch, deleted: false, tag })
    origin = ch.id
  }
  return out
}

const opText = (op: Op) => (op.kind === 'ins' ? `ins(${op.pos}, "${op.text}")` : `del(${op.pos}, ${op.len})`)
const opsText = (ops: Op[]) => (ops.length === 0 ? 'nada (ya estaba borrado)' : ops.map(opText).join(' + '))
const crdtText = (op: CrdtOp) =>
  op.kind === 'ins'
    ? `insertar "${op.chars.map((c) => c.c).join('')}" después de ${op.origin === null ? 'el inicio' : `#${op.origin}`}`
    : `borrar #${op.ids.join(' #')}`
const visibleText = (t: Tile[]) =>
  t
    .filter((x) => !x.deleted)
    .map((x) => x.c)
    .join('')

function run(s: Scenario, mode: Mode) {
  const baseTiles: Tile[] = [...s.base].map((c, i) => ({ c, tag: 'base', id: String(i + 1) }))
  if (mode === 'crdt') {
    const base = crdtBase(s.base)
    const aOp = localToCrdt(base, s.a, 'A')
    const bOp = localToCrdt(base, s.b, 'B')
    const aLocal = integrate(base, aOp, 'A')
    const bLocal = integrate(base, bOp, 'B')
    const aFinal = integrate(aLocal, bOp, 'B')
    const bFinal = integrate(bLocal, aOp, 'A')
    const toTiles = (d: CChar[]): Tile[] => d.map((x) => ({ c: x.c, tag: x.tag, id: x.id, deleted: x.deleted }))
    return {
      base: toTiles(base),
      aLocal: toTiles(aLocal),
      bLocal: toTiles(bLocal),
      aFinal: toTiles(aFinal),
      bFinal: toTiles(bFinal),
      aSent: crdtText(aOp),
      bSent: crdtText(bOp),
      aRecv: crdtText(bOp),
      bRecv: crdtText(aOp),
    }
  }
  const aLocal = applyTiles(baseTiles, s.a, 'A')
  const bLocal = applyTiles(baseTiles, s.b, 'B')
  // Desempate: Ana gana las inserciones en la misma posición.
  const bForA = mode === 'ot' ? transform(s.b, s.a, false) : [s.b]
  const aForB = mode === 'ot' ? transform(s.a, s.b, true) : [s.a]
  const aFinal = bForA.reduce((t, op) => applyTiles(t, op, 'B'), aLocal)
  const bFinal = aForB.reduce((t, op) => applyTiles(t, op, 'A'), bLocal)
  return {
    base: baseTiles,
    aLocal,
    bLocal,
    aFinal,
    bFinal,
    aSent: opText(s.a),
    bSent: opText(s.b),
    aRecv: opsText(bForA),
    bRecv: opsText(aForB),
  }
}

/* ───────── UI ───────── */

const stepTitles = ['Documento inicial', 'Cada uno edita su copia (a la vez)', 'Llega la operación del otro']

function Tiles({ tiles, mode, label }: { tiles: Tile[]; mode: Mode; label: string }) {
  const reduced = useReducedMotion()
  let idx = 0
  return (
    <div className="ce-tiles" role="img" aria-label={`${label}: "${visibleText(tiles)}"`}>
      {tiles.map((t, i) => {
        const shownIdx = t.deleted ? null : idx++
        const key = t.id ?? `${t.tag}-${i}-${t.c}`
        return (
          <motion.span
            key={mode === 'crdt' ? key : `${i}-${t.c}-${t.tag}`}
            className={`ce-tile ce-tile--${t.tag} ${t.deleted ? 'is-deleted' : ''}`}
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            aria-hidden="true"
          >
            <span className="ce-tile__c">{t.c === ' ' ? ' ' : t.c}</span>
            <span className="ce-tile__i">{mode === 'crdt' ? `#${t.id}` : shownIdx}</span>
          </motion.span>
        )
      })}
      {tiles.length === 0 && <span className="ce-empty">(vacío)</span>}
    </div>
  )
}

export function CollabEditing() {
  const [scenarioId, setScenarioId] = useState(scenarios[0].id)
  const [mode, setMode] = useState<Mode>('naive')
  const [step, setStep] = useState(0)
  const s = scenarios.find((x) => x.id === scenarioId) ?? scenarios[0]
  const r = run(s, mode)
  const aText = visibleText(r.aFinal)
  const bText = visibleText(r.bFinal)
  const converged = aText === bText
  const matchesIntent = s.id === 'tie' ? converged : converged && aText === s.intent

  const col = (site: Site) => {
    const name = site === 'A' ? 'Ana' : 'Beto'
    const local = site === 'A' ? r.aLocal : r.bLocal
    const fin = site === 'A' ? r.aFinal : r.bFinal
    const sent = site === 'A' ? r.aSent : r.bSent
    const recv = site === 'A' ? r.aRecv : r.bRecv
    return (
      <div className={`ce-col ce-col--${site}`}>
        <div className="ce-who">
          <span className={`ce-dot ce-dot--${site}`} aria-hidden="true" />
          {name}
        </div>
        <Tiles tiles={r.base} mode={mode} label={`Copia de ${name}, inicial`} />
        {step >= 1 && (
          <>
            <div className="ce-op">
              <span className="ce-op__k">escribe</span> <code>{sent}</code>
            </div>
            <Tiles tiles={local} mode={mode} label={`Copia de ${name} tras su edición`} />
          </>
        )}
        {step >= 2 && (
          <>
            <div className="ce-op ce-op--recv">
              <span className="ce-op__k">{mode === 'ot' ? 'recibe (transformada)' : mode === 'crdt' ? 'recibe (por IDs)' : 'recibe tal cual'}</span>{' '}
              <code>{recv}</code>
            </div>
            <Tiles tiles={fin} mode={mode} label={`Copia de ${name} final`} />
          </>
        )}
      </div>
    )
  }

  return (
    <WidgetFrame
      caption={
        <>
          Ana y Beto editan el mismo documento a la vez, sin ver la edición del otro. Elige un escenario y una estrategia y avanza paso a paso: con
          índices ingenuos las copias se corrompen o divergen; OT ajusta las posiciones; un CRDT ni siquiera usa posiciones.
        </>
      }
      controls={
        <>
          <Segmented
            label="Escenario"
            value={scenarioId}
            onChange={(v) => {
              setScenarioId(v)
              setStep(0)
            }}
            options={scenarios.map((x) => ({ value: x.id, label: x.label }))}
          />
          <Segmented<Mode>
            label="Estrategia"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'naive', label: 'Índices ingenuos' },
              { value: 'ot', label: 'OT' },
              { value: 'crdt', label: 'CRDT' },
            ]}
          />
        </>
      }
      readout={
        <>
          <p>
            <b>{s.label}.</b> {s.note}
          </p>
          <AnimatePresence mode="wait" initial={false}>
            {step === 2 && (
              <motion.p
                key={`${s.id}-${mode}`}
                className={`ce-verdict ${matchesIntent ? 'is-ok' : 'is-bad'}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
              >
                {matchesIntent ? <CircleCheck size={18} aria-hidden="true" /> : <CircleX size={18} aria-hidden="true" />}
                <span>
                  {converged ? `Convergen en "${aText}".` : `Divergen: Ana ve "${aText}" y Beto ve "${bText}".`}{' '}
                  {s.id !== 'tie' && converged && aText !== s.intent && `Iguales, pero ninguno quería eso (esperado: "${s.intent}").`}
                  {mode === 'crdt' && r.aFinal.some((t) => t.deleted) && ' Los caracteres tachados son tombstones: siguen en la estructura como referencia.'}
                </span>
              </motion.p>
            )}
          </AnimatePresence>
        </>
      }
    >
      <div className="ce-head">
        <span className="line-badge">{step + 1}/3</span>
        <span className="ce-step-title">{stepTitles[step]}</span>
        <div className="ce-nav">
          <button type="button" className="icon-btn" onClick={() => setStep(0)} aria-label="Reiniciar" disabled={step === 0}>
            <RotateCcw size={18} aria-hidden="true" />
          </button>
          <button type="button" className="icon-btn" onClick={() => setStep((x) => Math.max(0, x - 1))} aria-label="Paso anterior" disabled={step === 0}>
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <button type="button" className="btn btn--line" onClick={() => setStep((x) => Math.min(2, x + 1))} disabled={step === 2}>
            Siguiente <ChevronRight size={16} aria-hidden="true" />
          </button>
        </div>
      </div>
      <div className="ce-cols">
        {col('A')}
        {col('B')}
      </div>
      <p className="ce-legend">
        {mode === 'crdt'
          ? 'Debajo de cada letra: su ID único (#número = texto original, #A5 = creado por Ana con contador 5).'
          : 'Debajo de cada letra: su índice. Las operaciones viajan como posiciones numéricas.'}
      </p>
    </WidgetFrame>
  )
}
