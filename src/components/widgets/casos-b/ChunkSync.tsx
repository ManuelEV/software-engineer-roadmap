import { useId, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Check, CloudUpload, RotateCcw } from 'lucide-react'
import { Segmented, Stat, WidgetFrame } from '../kit'
import './ChunkSync.css'

type Mode = 'fixed' | 'cdc'

const EASE = [0.16, 1, 0.3, 1] as const

/** Versión que el servidor ya tiene guardada (v1). */
const BASE =
  'Contrato de arriendo. El arrendatario pagará la renta el día cinco de cada mes. Los gastos comunes corren por su cuenta. Cualquier reparación mayor debe avisarse por escrito con treinta días de anticipación. El contrato se renueva solo cada año salvo aviso.'

const MAX_LEN = 420

/* Parámetros del chunking (en caracteres, a escala de juguete: en la vida real son KB/MB). */
const FIXED_SIZE = 32
const WINDOW = 5
const MIN_CHUNK = 10
const MAX_CHUNK = 56
const DIVISOR = 18

/** FNV-1a de 32 bits: hash determinista y barato, suficiente para la demo. */
function fnv1a(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193) >>> 0
  }
  return h >>> 0
}

const shortHash = (s: string) => fnv1a(s).toString(16).padStart(8, '0').slice(0, 4)

function fixedChunks(text: string): string[] {
  const out: string[] = []
  for (let i = 0; i < text.length; i += FIXED_SIZE) out.push(text.slice(i, i + FIXED_SIZE))
  return out
}

/**
 * Content-defined chunking: se mira una ventana de WINDOW caracteres que se
 * desliza; si su hash cae en un valor "mágico" (hash % DIVISOR === 0) se corta.
 * Como el corte depende solo del contenido local, una inserción mueve los
 * cortes cercanos pero los demás vuelven a caer en el mismo lugar.
 */
function cdcChunks(text: string): string[] {
  const out: string[] = []
  let start = 0
  for (let i = 0; i < text.length; i++) {
    const len = i - start + 1
    if (len < MIN_CHUNK) continue
    const win = text.slice(Math.max(0, i - WINDOW + 1), i + 1)
    if (len >= MAX_CHUNK || fnv1a(win) % DIVISOR === 0) {
      out.push(text.slice(start, i + 1))
      start = i + 1
    }
  }
  if (start < text.length) out.push(text.slice(start))
  return out
}

const chunker = (mode: Mode) => (mode === 'fixed' ? fixedChunks : cdcChunks)

interface Chunk {
  text: string
  hash: string
  isNew: boolean
  /** clave estable: hash + número de aparición, para animar solo lo que cambia */
  key: string
}

const show = (s: string) => s.replace(/ /g, '·')

export function ChunkSync() {
  const reduced = useReducedMotion()
  const textId = useId()
  const [mode, setMode] = useState<Mode>('fixed')
  const [text, setText] = useState(BASE)

  const { server, local, upBytes, totalBytes, newCount } = useMemo(() => {
    const split = chunker(mode)
    const serverChunks = split(BASE).map((t) => ({ text: t, hash: shortHash(t) }))
    const known = new Set(serverChunks.map((c) => c.hash))
    const seen = new Set<string>()
    const occurrences = new Map<string, number>()
    const localChunks: Chunk[] = split(text).map((t) => {
      const hash = shortHash(t)
      const n = (occurrences.get(hash) ?? 0) + 1
      occurrences.set(hash, n)
      // Un bloque se sube si el servidor no lo tiene y no lo subimos ya en este mismo commit.
      const isNew = !known.has(hash) && !seen.has(hash)
      seen.add(hash)
      return { text: t, hash, isNew, key: `${hash}-${n}` }
    })
    const up = localChunks.filter((c) => c.isNew)
    return {
      server: serverChunks,
      local: localChunks,
      upBytes: up.reduce((s, c) => s + c.text.length, 0),
      totalBytes: text.length,
      newCount: up.length,
    }
  }, [mode, text])

  const saved = totalBytes === 0 ? 0 : Math.round((1 - upBytes / totalBytes) * 100)

  const edit = (kind: 'start' | 'middle' | 'end') => {
    setText((t) => {
      let next = t
      if (kind === 'start') next = 'ANEXO 2: ' + t
      if (kind === 'middle') {
        const at = Math.floor(t.length / 2)
        next = t.slice(0, at) + ' (y el agua)' + t.slice(at)
      }
      if (kind === 'end') next = t + ' Firmado.'
      return next.slice(0, MAX_LEN)
    })
  }

  const chunkMotion = reduced
    ? { initial: { opacity: 0 }, animate: { opacity: 1 }, exit: { opacity: 0 } }
    : { initial: { opacity: 0, scale: 0.94 }, animate: { opacity: 1, scale: 1 }, exit: { opacity: 0, scale: 0.94 } }

  const explanation =
    text === BASE
      ? 'Sin cambios: todos los bloques ya están en el servidor. Edita el texto o usa los botones.'
      : mode === 'fixed'
        ? newCount > local.length / 2
          ? 'Con bloques de tamaño fijo, insertar texto desplaza todos los cortes que vienen después: casi todos los hashes cambian y hay que volver a subir casi todo.'
          : 'Con bloques fijos, un cambio que no altera la longitud (o que va al final) solo ensucia los bloques que toca.'
        : 'Con chunking por contenido, los cortes dependen del texto que los rodea: después de la edición vuelven a caer en el mismo lugar y solo cambian uno o dos bloques.'

  return (
    <WidgetFrame
      caption={
        <>
          El servidor ya tiene la v1 del archivo. Edita tu copia y mira qué bloques hay que subir: los que el
          servidor reconoce por su hash no viajan. Compara bloques fijos con chunking definido por contenido
          (a escala de juguete: caracteres en vez de megabytes).
        </>
      }
      controls={
        <>
          <Segmented
            label="Chunking"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'fixed', label: 'Tamaño fijo' },
              { value: 'cdc', label: 'Por contenido' },
            ]}
          />
          <div className="cs-actions" role="group" aria-label="Ediciones rápidas">
            <button type="button" className="btn" onClick={() => edit('start')}>
              Insertar al inicio
            </button>
            <button type="button" className="btn" onClick={() => edit('middle')}>
              Insertar al medio
            </button>
            <button type="button" className="btn" onClick={() => edit('end')}>
              Agregar al final
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => setText(BASE)}>
              <RotateCcw size={16} aria-hidden="true" />
              Restaurar
            </button>
          </div>
        </>
      }
      readout={
        <>
          <div className="cs-stats">
            <Stat label="Bloques en tu copia" value={local.length} />
            <Stat label="Bloques a subir" value={newCount} tone={newCount === 0 ? 'ok' : newCount > local.length / 2 ? 'bad' : 'warn'} />
            <Stat label="Caracteres a subir" value={`${upBytes}/${totalBytes}`} />
            <Stat label="Ahorro por dedup" value={`${saved}%`} tone={saved >= 70 ? 'ok' : saved >= 30 ? 'warn' : 'bad'} />
          </div>
          <p aria-live="polite">{explanation}</p>
        </>
      }
    >
      <div className="cs-stage">
        <label className="cs-label" htmlFor={textId}>
          Tu copia del archivo (editable)
        </label>
        <textarea
          id={textId}
          className="cs-text"
          value={text}
          maxLength={MAX_LEN}
          rows={4}
          spellCheck={false}
          onChange={(e) => setText(e.target.value)}
        />

        <div className="cs-row">
          <div className="cs-row__head">
            <span className="cs-row__title">Servidor (v1)</span>
            <span className="cs-row__meta">{server.length} bloques guardados</span>
          </div>
          <ol className="cs-chunks" aria-label="Bloques que el servidor ya tiene">
            {server.map((c, i) => (
              <li key={`${mode}-s-${i}-${c.hash}`} className="cs-chunk cs-chunk--server">
                <span className="cs-chunk__hash">{c.hash}</span>
                <span className="cs-chunk__text">{show(c.text)}</span>
              </li>
            ))}
          </ol>
        </div>

        <div className="cs-row">
          <div className="cs-row__head">
            <span className="cs-row__title">Tu copia (v2)</span>
            <span className="cs-legend">
              <span className="cs-legend__item">
                <Check size={14} aria-hidden="true" className="cs-ok" /> ya existe
              </span>
              <span className="cs-legend__item">
                <CloudUpload size={14} aria-hidden="true" className="cs-up" /> hay que subirlo
              </span>
            </span>
          </div>
          <ol className="cs-chunks" aria-label="Bloques de tu copia">
            <AnimatePresence initial={false} mode="popLayout">
              {local.map((c, i) => (
                <motion.li
                  key={`${mode}-${c.key}`}
                  layout={!reduced}
                  {...chunkMotion}
                  transition={{ duration: 0.25, ease: EASE }}
                  className={`cs-chunk ${c.isNew ? 'is-new' : 'is-known'}`}
                  aria-label={`Bloque ${i + 1}, hash ${c.hash}, ${c.isNew ? 'hay que subirlo' : 'ya existe en el servidor'}`}
                >
                  <span className="cs-chunk__hash">
                    {c.isNew ? (
                      <CloudUpload size={13} aria-hidden="true" />
                    ) : (
                      <Check size={13} aria-hidden="true" />
                    )}
                    {c.hash}
                  </span>
                  <span className="cs-chunk__text">{show(c.text)}</span>
                </motion.li>
              ))}
            </AnimatePresence>
          </ol>
        </div>
      </div>
    </WidgetFrame>
  )
}
