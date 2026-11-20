import { Link } from 'react-router'
import { ChevronDown } from 'lucide-react'
import { units } from '../../content/units'
import { useMediaQuery } from '../../lib/hooks'
import './notebook-index.css'

/**
 * The first page of the notebook: every unit and topic, numbered, with a dotted
 * leader to its reading time. On narrow screens each unit folds to its heading.
 */
export function NotebookIndex() {
  const wide = useMediaQuery('(min-width: 880px)')

  return (
    <div className="nbi">
      {units.map((u) => {
        const minutes = u.topics.reduce((s, t) => s + t.minutes, 0)
        return (
          <details key={`${u.id}-${wide}`} className="nbi__unit" data-line={u.id} open={wide}>
            <summary className="nbi__head">
              <span className="unit-tab nbi__tab">{u.number}</span>
              <span className="nbi__head-text">
                <span className="nbi__unit-title">{u.title}</span>
                <span className="nbi__unit-meta">
                  {u.topics.length} temas · ≈ {Math.round(minutes / 6) / 10} h
                </span>
              </span>
              <ChevronDown size={18} className="nbi__chev" aria-hidden="true" />
            </summary>
            <ol className="nbi__list">
              {u.topics.map((t, i) => {
                return (
                  <li key={t.slug} className="nbi__row">
                    <Link to={`/${u.id}/${t.slug}`} className="nbi__link" title={t.summary}>
                      <span className="nbi__num">
                        {u.number}.{i + 1}
                      </span>
                      <span className="nbi__title">{t.title}</span>
                      <span className="nbi__leader" aria-hidden="true" />
                      <span className="nbi__min">{t.minutes}′</span>
                    </Link>
                  </li>
                )
              })}
            </ol>
            <Link to={`/${u.id}`} className="nbi__more">
              Ver la unidad {u.number} completa
            </Link>
          </details>
        )
      })}
    </div>
  )
}
