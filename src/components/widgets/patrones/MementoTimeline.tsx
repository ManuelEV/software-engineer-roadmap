import { useId, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Camera, Lock } from 'lucide-react'
import { Stat, WidgetFrame } from '../kit'
import './MementoTimeline.css'

interface Draft {
  title: string
  body: string
}
/** The memento: the caretaker only ever sees id + label, never `state`. */
interface Memento {
  readonly id: number
  readonly label: string
  readonly state: Draft
}

const initial: Memento[] = [
  { id: 1, label: '10:02', state: { title: 'Bicicleta urbana', body: 'Rodado 28, poco uso.' } },
  { id: 2, label: '10:05', state: { title: 'Bicicleta urbana', body: 'Rodado 28, poco uso. Incluye candado.' } },
  { id: 3, label: '10:09', state: { title: 'Bicicleta urbana talla M', body: 'Rodado 28, poco uso. Incluye candado y luces.' } },
]

const ease = [0.16, 1, 0.3, 1] as const

export function MementoTimeline() {
  const reduced = useReducedMotion()
  const uid = useId()
  const [draft, setDraft] = useState<Draft>(initial[2].state)
  const [history, setHistory] = useState<Memento[]>(initial)
  const [cursor, setCursor] = useState(2)
  const [note, setNote] = useState('Edita el anuncio, guarda snapshots y viaja por la línea de tiempo.')
  const nextId = useRef(4)
  const minute = useRef(12)

  const atCursor = history[cursor]
  const dirty = !atCursor || atCursor.state.title !== draft.title || atCursor.state.body !== draft.body
  const bytes = history.reduce((s, m) => s + m.state.title.length + m.state.body.length, 0)

  const save = () => {
    const m: Memento = { id: nextId.current++, label: `10:${String(minute.current++).padStart(2, '0')}`, state: { ...draft } }
    const dropped = history.length - 1 - cursor
    setHistory((h) => [...h.slice(0, cursor + 1), m])
    setCursor(cursor + 1)
    setNote(
      dropped > 0
        ? `history.push(editor.save()) — estabas en el pasado: se descartan ${dropped} snapshot(s) posteriores (la historia se ramifica).`
        : 'history.push(editor.save()) — el editor empaqueta su estado; el historial lo guarda sin mirarlo.',
    )
  }

  const restore = (i: number) => {
    const m = history[i]
    if (!m) return
    setCursor(i)
    setDraft({ ...m.state })
    setNote(`editor.restore(history[${i}]) — solo el editor sabe leer el memento #${m.id}.`)
  }

  return (
    <WidgetFrame
      caption="El editor (originator) crea mementos con su estado. El historial (caretaker) los guarda y devuelve, pero los trata como cajas cerradas."
      controls={
        <>
          <button type="button" className="btn btn--line" onClick={save} disabled={!dirty}>
            <Camera size={16} aria-hidden="true" /> Guardar snapshot
          </button>
          <button type="button" className="btn" onClick={() => restore(cursor - (dirty ? 0 : 1))} disabled={cursor <= 0 && !dirty}>
            Deshacer
          </button>
          <button type="button" className="btn" onClick={() => restore(cursor + 1)} disabled={cursor >= history.length - 1}>
            Rehacer
          </button>
        </>
      }
      readout={
        <div className="mt-readout">
          <div className="mt-stats">
            <Stat label="Mementos" value={history.length} />
            <Stat label="Caracteres guardados" value={bytes} hint="cada snapshot copia todo el estado" />
          </div>
          <p aria-live="polite">{note}</p>
        </div>
      }
    >
      <div className="mt-grid">
        <div className="mt-editor">
          <div className="mt-editor__head">
            Editor <span className="mt-tag">originator</span>
            {dirty && <span className="mt-dirty">cambios sin guardar</span>}
          </div>
          <label className="mt-field" htmlFor={`${uid}-t`}>
            Título
          </label>
          <input
            id={`${uid}-t`}
            className="mt-input"
            value={draft.title}
            onChange={(e) => setDraft((d) => ({ ...d, title: e.target.value }))}
          />
          <label className="mt-field" htmlFor={`${uid}-b`}>
            Descripción
          </label>
          <textarea
            id={`${uid}-b`}
            className="mt-input mt-textarea"
            rows={3}
            value={draft.body}
            onChange={(e) => setDraft((d) => ({ ...d, body: e.target.value }))}
          />
        </div>

        <div className="mt-caretaker">
          <div className="mt-editor__head">
            Historial <span className="mt-tag">caretaker</span>
          </div>
          <ol className="mt-line" aria-label="Snapshots guardados">
            <AnimatePresence initial={false}>
              {history.map((m, i) => (
                <motion.li
                  key={m.id}
                  className={`mt-stop ${i === cursor ? 'is-on' : ''} ${i > cursor ? 'is-future' : ''}`}
                  initial={reduced ? { opacity: 0 } : { opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.25, ease }}
                >
                  <button
                    type="button"
                    className="mt-stop__btn"
                    onClick={() => restore(i)}
                    aria-label={`Restaurar memento ${m.id}, guardado a las ${m.label}`}
                    aria-current={i === cursor ? 'step' : undefined}
                  >
                    <span className="mt-stop__dot" aria-hidden="true" />
                    <span className="mt-stop__name">Memento #{m.id}</span>
                    <span className="mt-stop__meta">
                      <Lock size={12} aria-hidden="true" /> {m.label} · contenido opaco
                    </span>
                  </button>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        </div>
      </div>
    </WidgetFrame>
  )
}
