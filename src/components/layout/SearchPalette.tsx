import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { CornerDownLeft, Search } from 'lucide-react'
import { allTopics, topicPath } from '../../content/units'
import type { Topic } from '../../content/types'

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')

const index = allTopics.map((t) => ({
  topic: t,
  title: norm(t.title),
  hay: norm([t.title, t.summary, t.group ?? '', t.unit.title, ...(t.keywords ?? [])].join(' ')),
}))

function searchTopics(q: string): Topic[] {
  const words = norm(q).split(/\s+/).filter(Boolean)
  if (!words.length) return []
  return index
    .filter((e) => words.every((w) => e.hay.includes(w)))
    .map((e) => ({ e, score: words.reduce((s, w) => s + (e.title.includes(w) ? 3 : 1) + (e.title.startsWith(w) ? 2 : 0), 0) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 12)
    .map((r) => r.e.topic)
}

export function SearchPalette({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [q, setQ] = useState('')
  const [sel, setSel] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLUListElement>(null)
  const navigate = useNavigate()
  const reduced = useReducedMotion()
  const results = useMemo(() => (q ? searchTopics(q) : allTopics.filter((t) => t.index === 0)), [q])

  useEffect(() => {
    if (open) {
      setQ('')
      setSel(0)
      const t = window.setTimeout(() => inputRef.current?.focus(), 20)
      document.body.style.overflow = 'hidden'
      return () => {
        window.clearTimeout(t)
        document.body.style.overflow = ''
      }
    }
  }, [open])

  useEffect(() => setSel(0), [q])

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  const go = (t: Topic | undefined) => {
    if (!t) return
    onClose()
    navigate(topicPath(t))
  }

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="palette"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0, transition: { duration: 0.12 } }}
          transition={{ duration: 0.18 }}
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) onClose()
          }}
        >
          <motion.div
            className="palette__box"
            role="dialog"
            aria-modal="true"
            aria-label="Buscar temas"
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: -12, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: -8, scale: 0.98 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') onClose()
              else if (e.key === 'ArrowDown') {
                e.preventDefault()
                setSel((s) => Math.min(s + 1, results.length - 1))
              } else if (e.key === 'ArrowUp') {
                e.preventDefault()
                setSel((s) => Math.max(s - 1, 0))
              } else if (e.key === 'Enter') {
                e.preventDefault()
                go(results[sel])
              } else if (e.key === 'Tab') {
                e.preventDefault()
                inputRef.current?.focus()
              }
            }}
          >
            <div className="palette__field">
              <Search size={18} aria-hidden="true" />
              <input
                ref={inputRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Busca un tema: sharding, saga, strategy, CLAUDE.md…"
                aria-label="Buscar"
                aria-controls="palette-results"
                aria-activedescendant={results[sel] ? `pr-${results[sel].id}` : undefined}
                role="combobox"
                aria-expanded="true"
                autoComplete="off"
                spellCheck={false}
              />
              <kbd>Esc</kbd>
            </div>
            <div className="palette__label">{q ? `${results.length} resultado${results.length === 1 ? '' : 's'}` : 'Primer tema de cada unidad'}</div>
            <ul className="palette__list" id="palette-results" role="listbox" ref={listRef}>
              {results.map((t, i) => (
                <li
                  key={t.id}
                  id={`pr-${t.id}`}
                  role="option"
                  aria-selected={i === sel}
                  className="palette__item"
                  data-line={t.unit.id}
                  onMouseMove={() => setSel(i)}
                  onClick={() => go(t)}
                >
                  <span className="palette__num">{t.num}</span>
                  <span className="palette__text">
                    <span className="palette__title">{t.title}</span>
                    <span className="palette__summary">{t.summary}</span>
                  </span>
                  {i === sel && <CornerDownLeft size={16} className="palette__enter" aria-hidden="true" />}
                </li>
              ))}
              {q && results.length === 0 && (
                <li className="palette__empty">
                  Nada coincide con “{q}”. Prueba con otra palabra o en inglés (por ejemplo <em>cache</em>).
                </li>
              )}
            </ul>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}
