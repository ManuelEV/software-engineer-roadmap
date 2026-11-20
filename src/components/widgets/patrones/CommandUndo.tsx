import { useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { CaseUpper, Delete, Plus, Redo2, RotateCcw, Undo2 } from 'lucide-react'
import { WidgetFrame } from '../kit'
import './CommandUndo.css'

interface Command {
  id: number
  label: string
  execute: (doc: string) => string
  undo: (doc: string) => string
}

let seq = 0

function insertText(text: string): Command {
  return {
    id: seq++,
    label: `InsertText("${text.trim()}")`,
    execute: (d) => d + text,
    undo: (d) => d.slice(0, d.length - text.length),
  }
}

function deleteLastWord(doc: string): Command | null {
  const m = doc.match(/(\S+\s*)$/)
  if (!m) return null
  const removed = m[1]
  return {
    id: seq++,
    label: `DeleteWord("${removed.trim()}")`,
    execute: (d) => d.slice(0, d.length - removed.length),
    undo: (d) => d + removed,
  }
}

function upperCase(doc: string): Command {
  const previous = doc // uppercase no es invertible: el comando guarda lo que necesita para deshacer
  return {
    id: seq++,
    label: 'UpperCase()',
    execute: (d) => d.toUpperCase(),
    undo: () => previous,
  }
}

const words = ['Envío ', 'gratis ', 'desde ', '$50 ']
const ease = [0.16, 1, 0.3, 1] as const

export function CommandUndo() {
  const reduced = useReducedMotion()
  const [doc, setDoc] = useState('')
  const [undoStack, setUndo] = useState<Command[]>([])
  const [redoStack, setRedo] = useState<Command[]>([])
  const [note, setNote] = useState('Ejecuta acciones: cada una es un objeto Command que se apila.')
  const wordIdx = useRef(0)

  const run = (cmd: Command | null) => {
    if (!cmd) {
      setNote('No hay palabra que borrar: el comando ni se crea.')
      return
    }
    setDoc((d) => cmd.execute(d))
    setUndo((s) => [...s, cmd])
    if (redoStack.length) setNote(`Nuevo comando después de deshacer: se descartan ${redoStack.length} comando(s) de la pila de rehacer.`)
    else setNote(`${cmd.label}.execute()`)
    setRedo([])
  }

  const undo = () => {
    const cmd = undoStack[undoStack.length - 1]
    if (!cmd) return
    setDoc((d) => cmd.undo(d))
    setUndo((s) => s.slice(0, -1))
    setRedo((s) => [...s, cmd])
    setNote(`${cmd.label}.undo() → pasa a la pila de rehacer`)
  }

  const redo = () => {
    const cmd = redoStack[redoStack.length - 1]
    if (!cmd) return
    setDoc((d) => cmd.execute(d))
    setRedo((s) => s.slice(0, -1))
    setUndo((s) => [...s, cmd])
    setNote(`${cmd.label}.execute() otra vez → vuelve a la pila de deshacer`)
  }

  const reset = () => {
    setDoc('')
    setUndo([])
    setRedo([])
    wordIdx.current = 0
    setNote('Ejecuta acciones: cada una es un objeto Command que se apila.')
  }

  const stack = (items: Command[], title: string, kind: 'undo' | 'redo') => (
    <div className={`cu-stack cu-stack--${kind}`}>
      <div className="cu-stack__title">
        {title} <span className="cu-stack__n">{items.length}</span>
      </div>
      <ol className="cu-stack__list" aria-label={title}>
        <AnimatePresence initial={false}>
          {[...items].reverse().map((c, i) => (
            <motion.li
              key={c.id}
              layout={!reduced}
              className={`cu-chip ${i === 0 ? 'is-top' : ''}`}
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={reduced ? { opacity: 0 } : { opacity: 0, x: kind === 'undo' ? 20 : -20 }}
              transition={{ duration: 0.25, ease }}
            >
              {c.label}
            </motion.li>
          ))}
        </AnimatePresence>
        {items.length === 0 && <li className="cu-empty">vacía</li>}
      </ol>
    </div>
  )

  return (
    <WidgetFrame
      caption="El editor no sabe qué hace cada acción: solo llama execute() y apila el comando. Deshacer saca el tope y llama undo(). Prueba deshacer dos veces y luego ejecutar algo nuevo."
      controls={
        <div className="cu-controls">
          <button
            type="button"
            className="btn"
            onClick={() => {
              run(insertText(words[wordIdx.current % words.length]))
              wordIdx.current++
            }}
          >
            <Plus size={16} aria-hidden="true" /> Escribir «{words[wordIdx.current % words.length].trim()}»
          </button>
          <button type="button" className="btn" onClick={() => run(deleteLastWord(doc))}>
            <Delete size={16} aria-hidden="true" /> Borrar palabra
          </button>
          <button type="button" className="btn" onClick={() => run(upperCase(doc))}>
            <CaseUpper size={16} aria-hidden="true" /> Mayúsculas
          </button>
          <span className="cu-sep" aria-hidden="true" />
          <button type="button" className="btn btn--line" onClick={undo} disabled={!undoStack.length}>
            <Undo2 size={16} aria-hidden="true" /> Deshacer
          </button>
          <button type="button" className="btn btn--line" onClick={redo} disabled={!redoStack.length}>
            <Redo2 size={16} aria-hidden="true" /> Rehacer
          </button>
          <button type="button" className="icon-btn" onClick={reset} aria-label="Reiniciar">
            <RotateCcw size={18} />
          </button>
        </div>
      }
      readout={<p aria-live="polite">{note}</p>}
    >
      <div className="cu-doc" aria-label="Documento">
        <span className="cu-doc__text">{doc || <span className="cu-doc__ph">Documento vacío</span>}</span>
        <span className="cu-caret" aria-hidden="true" />
      </div>
      <div className="cu-stacks">
        {stack(undoStack, 'Pila deshacer', 'undo')}
        {stack(redoStack, 'Pila rehacer', 'redo')}
      </div>
    </WidgetFrame>
  )
}
