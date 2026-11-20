import {
  Children,
  type ReactElement,
  type ReactNode,
  isValidElement,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import {
  Check,
  FlaskConical,
  Info,
  Lightbulb,
  MessagesSquare,
  Minus,
  Plus,
  TriangleAlert,
  Wrench,
  X,
} from 'lucide-react'
import { CodeBlock, extractCode } from './CodeBlock'
import { pickLang, useCodeLang } from '../../lib/codeLang'

/* ───────────── Callout ───────────── */

const calloutKinds = {
  idea: { label: 'Idea clave', Icon: Lightbulb },
  warn: { label: 'Cuidado', Icon: TriangleAlert },
  interview: { label: 'En la entrevista', Icon: MessagesSquare },
  example: { label: 'Ejemplo', Icon: FlaskConical },
  note: { label: 'Nota', Icon: Info },
  tip: { label: 'Consejo práctico', Icon: Wrench },
} as const

export function Callout({
  type = 'note',
  title,
  children,
}: {
  type?: keyof typeof calloutKinds
  title?: string
  children?: ReactNode
}) {
  const kind = calloutKinds[type] ?? calloutKinds.note
  const Icon = kind.Icon
  return (
    <aside className={`callout callout--${type}`}>
      <div className="callout__head">
        <Icon size={18} strokeWidth={2} aria-hidden="true" />
        <span className="callout__kind">{kind.label}</span>
        {title && <span className="callout__title">{title}</span>}
      </div>
      <div className="callout__body">{children}</div>
    </aside>
  )
}

/* ───────────── Sidenote (Tufte-style margin note) ───────────── */

export function Sidenote({ children }: { children?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return (
    <>
      <button
        type="button"
        className="sidenote-ref"
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        aria-label="Nota al margen"
      />
      <span id={id} className={`sidenote ${open ? 'is-open' : ''}`} role="note">
        <span className="sidenote__num" aria-hidden="true" />
        {children}
      </span>
    </>
  )
}

/* ───────────── Figure ───────────── */

export function Figure({
  caption,
  wide,
  title = 'Figura',
  children,
}: {
  caption?: ReactNode
  wide?: boolean
  title?: string
  children?: ReactNode
}) {
  return (
    <figure className={`figure ${wide ? 'wide' : ''}`}>
      {children}
      {caption && (
        <figcaption className="figure__caption">
          <b>{title}</b>
          {caption}
        </figcaption>
      )}
    </figure>
  )
}

/* ───────────── Quiz ───────────── */

export interface QuizOption {
  text: ReactNode
  correct?: boolean
  why?: ReactNode
}

export function Quiz({ question, options }: { question: ReactNode; options: QuizOption[] }) {
  const [picked, setPicked] = useState<number | null>(null)
  const reduced = useReducedMotion()
  const answered = picked !== null
  const correct = answered && options[picked]?.correct
  return (
    <section className={`quiz ${answered ? (correct ? 'is-right' : 'is-wrong') : ''}`} aria-label="Pregunta de repaso">
      <div className="quiz__head">
        <span className="quiz__tag">Pon a prueba</span>
        {answered && (
          <button type="button" className="quiz__reset" onClick={() => setPicked(null)}>
            Reintentar
          </button>
        )}
      </div>
      <div className="quiz__q">{question}</div>
      <ul className="quiz__options">
        {options.map((o, i) => {
          const state = !answered ? '' : o.correct ? 'is-correct' : i === picked ? 'is-picked' : 'is-faded'
          return (
            <li key={i}>
              <button
                type="button"
                className={`quiz__opt ${state}`}
                onClick={() => !answered && setPicked(i)}
                disabled={answered && i !== picked && !o.correct}
                aria-pressed={i === picked}
              >
                <span className="quiz__mark" aria-hidden="true">
                  {answered && o.correct ? <Check size={15} strokeWidth={3} /> : answered && i === picked ? <X size={15} strokeWidth={3} /> : String.fromCharCode(65 + i)}
                </span>
                <span>{o.text}</span>
              </button>
            </li>
          )
        })}
      </ul>
      <AnimatePresence initial={false}>
        {answered && (
          <motion.div
            className="quiz__why"
            initial={reduced ? { opacity: 0 } : { opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            aria-live="polite"
          >
            <div className="quiz__why-inner">
              <strong>{correct ? 'Correcto.' : 'No exactamente.'}</strong>{' '}
              {options[picked!]?.why}
              {!correct && options.find((o) => o.correct)?.why && options[picked!]?.why !== options.find((o) => o.correct)?.why && (
                <p className="quiz__right">
                  <b>La respuesta:</b> {options.find((o) => o.correct)?.why}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  )
}

/* ───────────── CodeTabs ───────────── */

export function CodeTabs({ children }: { children?: ReactNode }) {
  const blocks = Children.toArray(children)
    .filter(isValidElement)
    .map((el) => extractCode((el as ReactElement<{ children?: ReactNode }>).props.children))
  const labels = blocks.map((b) => b.meta?.match(/title="([^"]+)"/)?.[1] ?? b.lang)
  const [pref, setPref] = useCodeLang()
  const idx = pickLang(labels, pref)
  const id = useId()
  if (!blocks.length) return null
  const b = blocks[Math.min(idx, blocks.length - 1)]
  return (
    <div className="codetabs">
      <div className="codetabs__bar" role="tablist" aria-label="Variantes de código">
        {labels.map((l, i) => (
          <button
            key={l + i}
            type="button"
            role="tab"
            id={`${id}-t${i}`}
            aria-selected={i === idx}
            aria-controls={`${id}-p`}
            className="codetabs__tab"
            onClick={() => setPref(l)}
          >
            {l}
          </button>
        ))}
      </div>
      <div role="tabpanel" id={`${id}-p`} aria-labelledby={`${id}-t${idx}`}>
        <CodeBlock code={b.code} lang={b.lang} meta={b.meta?.replace(/title="[^"]+"/, '')} bare />
      </div>
    </div>
  )
}

/* ───────────── Steps ───────────── */

export function Steps({ children }: { children?: ReactNode }) {
  return <ol className="steps">{children}</ol>
}

export function Step({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <li className="steps__item">
      <div className="steps__title">{title}</div>
      <div className="steps__body">{children}</div>
    </li>
  )
}

/* ───────────── Details ───────────── */

export function Details({ summary, children }: { summary: string; children?: ReactNode }) {
  return (
    <details className="details">
      <summary>
        <span className="details__icon" aria-hidden="true">
          <Plus size={16} className="details__plus" />
          <Minus size={16} className="details__minus" />
        </span>
        {summary}
      </summary>
      <div className="details__body">{children}</div>
    </details>
  )
}

/* ───────────── Term (inline glossary) ───────────── */

export function Term({ def, children }: { def: ReactNode; children?: ReactNode }) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLSpanElement>(null)
  const tipRef = useRef<HTMLSpanElement>(null)
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null)
  const id = useId()

  useLayoutEffect(() => {
    if (!open || !ref.current || !tipRef.current) return
    const r = ref.current.getBoundingClientRect()
    const tw = tipRef.current.offsetWidth
    const left = Math.max(12, Math.min(window.innerWidth - tw - 12, r.left + r.width / 2 - tw / 2))
    setPos({ left, top: r.bottom + 8 })
  }, [open])

  useEffect(() => {
    if (!open) return
    const close = () => setOpen(false)
    window.addEventListener('scroll', close, { passive: true })
    window.addEventListener('resize', close)
    return () => {
      window.removeEventListener('scroll', close)
      window.removeEventListener('resize', close)
    }
  }, [open])

  return (
    <span className="term" ref={ref}>
      <button
        type="button"
        className="term__word"
        aria-describedby={open ? id : undefined}
        onClick={() => setOpen((o) => !o)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      >
        {children}
      </button>
      {open && (
        <span
          ref={tipRef}
          id={id}
          role="tooltip"
          className="term__tip"
          style={pos ? { left: pos.left, top: pos.top } : { visibility: 'hidden' }}
        >
          {def}
        </span>
      )}
    </span>
  )
}

/* ───────────── Compare ───────────── */

export function Compare({ children }: { children?: ReactNode }) {
  return <div className="compare wide">{children}</div>
}

export function Option({ title, verdict, children }: { title: string; verdict?: string; children?: ReactNode }) {
  return (
    <div className="compare__col">
      <div className="compare__title">{title}</div>
      <div className="compare__body">{children}</div>
      {verdict && <div className="compare__verdict">{verdict}</div>}
    </div>
  )
}

export function ProsCons({ pros, cons }: { pros: ReactNode[]; cons: ReactNode[] }) {
  return (
    <div className="proscons">
      <div className="proscons__col proscons__col--pro">
        <div className="proscons__title">
          <Plus size={16} strokeWidth={2.5} aria-hidden="true" /> A favor
        </div>
        <ul>
          {pros.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      </div>
      <div className="proscons__col proscons__col--con">
        <div className="proscons__title">
          <Minus size={16} strokeWidth={2.5} aria-hidden="true" /> En contra
        </div>
        <ul>
          {cons.map((p, i) => (
            <li key={i}>{p}</li>
          ))}
        </ul>
      </div>
    </div>
  )
}

/* ───────────── Takeaways ───────────── */

export function Takeaways({ children }: { children?: ReactNode }) {
  return (
    <section className="takeaways paper-grid" aria-labelledby="resumen">
      <h2 className="takeaways__title" id="resumen">
        Resumen
      </h2>
      <div className="takeaways__body">{children}</div>
    </section>
  )
}

/* ───────────── Table wrapper ───────────── */

export function Table(props: React.TableHTMLAttributes<HTMLTableElement>) {
  return (
    <div className="table-wrap">
      <table {...props} />
    </div>
  )
}
