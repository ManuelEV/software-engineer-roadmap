import { type LazyExoticComponent, Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { MDXProvider } from '@mdx-js/react'
import type { MDXContent } from 'mdx/types'
import { motion, useReducedMotion, useScroll, useSpring } from 'motion/react'
import { ArrowLeft, ArrowRight, Clock } from 'lucide-react'
import { getTopic, neighbors, topicPath } from '../content/units'
import type { Topic } from '../content/types'
import { mdxComponents } from '../components/mdx'
import { UnitIndex, type Heading } from '../components/layout/UnitIndex'
import { TypeText } from '../components/layout/TypeText'
import { useActiveHeading } from '../lib/hooks'
import { NotFound } from './NotFound'
import './topic.css'

const NO_HEADINGS: Heading[] = []
const cache = new Map<string, LazyExoticComponent<MDXContent>>()
function lazyFor(topic: Topic) {
  let C = cache.get(topic.id)
  if (!C) {
    C = lazy(topic.load)
    cache.set(topic.id, C)
  }
  return C
}

function Body({ topic, onReady }: { topic: Topic; onReady: () => void }) {
  const Content = lazyFor(topic)
  useEffect(() => {
    onReady()
  }, [onReady])
  return <Content components={mdxComponents} />
}

function ReadingProgress() {
  const { scrollYProgress } = useScroll()
  const reduced = useReducedMotion()
  const scaleX = useSpring(scrollYProgress, { stiffness: 200, damping: 40, restDelta: 0.001 })
  return <motion.div className="readbar" style={{ scaleX: reduced ? scrollYProgress : scaleX }} aria-hidden="true" />
}

function Skeleton() {
  return (
    <div className="topic__skeleton" aria-label="Cargando el tema" role="status">
      <span />
      <span />
      <span />
      <span className="short" />
    </div>
  )
}

export function TopicPage() {
  const { unit, slug } = useParams()
  const topic = getTopic(unit, slug)
  const articleRef = useRef<HTMLDivElement>(null)
  // Headings are keyed by topic so a stale list never shows on the next page.
  // (The child's onReady effect runs before this component's effects, so they
  // must not be reset from an effect here.)
  const [found, setFound] = useState<{ topicId: string; list: Heading[] }>({ topicId: '', list: [] })
  const topicId = topic?.id ?? ''
  const headings = found.topicId === topicId ? found.list : NO_HEADINGS
  const headingIds = useMemo(() => headings.map((h) => h.id), [headings])
  const active = useActiveHeading(headingIds)

  useEffect(() => {
    if (!topic) return
    document.title = `${topic.num} ${topic.title} · Apuntes`
  }, [topic])

  const onReady = useCallback(() => {
    const el = articleRef.current
    if (!el) return
    const list = Array.from(el.querySelectorAll<HTMLHeadingElement>('h2[id]')).map((h) => ({
      id: h.id,
      text: h.textContent ?? '',
    }))
    setFound({ topicId, list })
    // honour deep links once the content exists
    if (window.location.hash) {
      const target = document.getElementById(decodeURIComponent(window.location.hash.slice(1)))
      target?.scrollIntoView()
    }
  }, [topicId])

  if (!topic) return <NotFound />

  const { prev, next, nextUnit } = neighbors(topic)
  const u = topic.unit

  return (
    <div className="topic" data-line={u.id}>
      <ReadingProgress />
      <aside className="topic__rail" aria-label={`Índice de la unidad ${u.number}`}>
        <div className="topic__rail-inner">
          <Link to={`/${u.id}`} className="topic__rail-head">
            <span className="unit-tab">{u.number}</span>
            <span>{u.title}</span>
          </Link>
          <UnitIndex unit={u} current={topic.slug} headings={headings} activeHeading={active} />
        </div>
      </aside>

      <article className="topic__main">
        <header className="topic__head">
          <nav className="crumbs" aria-label="Ubicación en los apuntes">
            <Link to={`/${u.id}`} className="crumbs__unit">
              <span className="unit-tab">{u.number}</span>
              <span className="crumbs__unit-name">{u.short}</span>
            </Link>
            <span className="crumbs__cells" aria-hidden="true">
              {u.topics.map((t, i) => (
                <span key={t.slug} className={i === topic.index ? 'is-current' : ''} />
              ))}
            </span>
            <span className="crumbs__pos">
              Tema {topic.index + 1} de {u.topics.length}
            </span>
          </nav>
          <h1 className="topic__title">
            <span className="topic__num">{topic.num}</span> <TypeText text={topic.title} speed={34} />
          </h1>
          <p className="topic__lead">{topic.summary}</p>
          <div className="topic__meta">
            <span>
              <Clock size={15} aria-hidden="true" /> {topic.minutes} min de lectura
            </span>
            {topic.group && <span>{topic.group}</span>}
          </div>
        </header>

        {headings.length > 2 && (
          <details className="topic__toc">
            <summary>En esta página</summary>
            <ol>
              {headings.map((h) => (
                <li key={h.id}>
                  <a href={`#${h.id}`}>{h.text}</a>
                </li>
              ))}
            </ol>
          </details>
        )}

        <div className="prose" ref={articleRef}>
          <MDXProvider components={mdxComponents}>
            <Suspense fallback={<Skeleton />}>
              <Body key={topic.id} topic={topic} onReady={onReady} />
            </Suspense>
          </MDXProvider>
        </div>

        <footer className="topic__end">
          <nav className="topic__nav" aria-label="Temas vecinos">
            {prev ? (
              <Link to={topicPath(prev)} className="topic__nav-link is-prev">
                <span className="topic__nav-dir">
                  <ArrowLeft size={15} /> Tema anterior
                </span>
                <span className="topic__nav-title">
                  <span className="topic__nav-num">{prev.num}</span> {prev.title}
                </span>
              </Link>
            ) : (
              <span />
            )}
            {next ? (
              <Link to={topicPath(next)} className="topic__nav-link is-next">
                <span className="topic__nav-dir">
                  Siguiente tema <ArrowRight size={15} />
                </span>
                <span className="topic__nav-title">
                  <span className="topic__nav-num">{next.num}</span> {next.title}
                </span>
                <span className="topic__nav-sum">{next.summary}</span>
              </Link>
            ) : nextUnit ? (
              <Link to={topicPath(nextUnit)} className="topic__nav-link is-next" data-line={nextUnit.unit.id}>
                <span className="topic__nav-dir">
                  Fin de la unidad {u.number} · sigue con la unidad <span className="unit-tab">{nextUnit.unit.number}</span>
                </span>
                <span className="topic__nav-title">
                  <span className="topic__nav-num">{nextUnit.num}</span> {nextUnit.title}
                </span>
                <span className="topic__nav-sum">{nextUnit.unit.title}</span>
              </Link>
            ) : (
              <Link to="/" className="topic__nav-link is-next">
                <span className="topic__nav-dir">Fin de los apuntes</span>
                <span className="topic__nav-title">Volver al índice</span>
              </Link>
            )}
          </nav>
        </footer>
      </article>
    </div>
  )
}
