import { Fragment } from 'react'
import { Link } from 'react-router'
import type { UnitDef } from '../../content/types'

export interface Heading {
  id: string
  text: string
}

/**
 * A unit's table of contents, written like the index of a notebook:
 * numbered topics, the current one highlighted.
 * Used by the desktop rail, the mobile sheet and the unit page (`rich`).
 */
export function UnitIndex({
  unit,
  current,
  compact,
  rich,
  headings,
  activeHeading,
}: {
  unit: UnitDef
  current?: string
  compact?: boolean
  rich?: boolean
  headings?: Heading[]
  activeHeading?: string | null
}) {
  let lastGroup: string | undefined

  return (
    <ol className={`uidx ${compact ? 'uidx--compact' : ''} ${rich ? 'uidx--rich' : ''}`} data-line={unit.id}>
      {unit.topics.map((t, i) => {
        const isCurrent = t.slug === current
        const showGroup = t.group && t.group !== lastGroup
        lastGroup = t.group
        return (
          <Fragment key={t.slug}>
            {showGroup && (
              <li className="uidx__group" aria-hidden={compact ? 'true' : undefined}>
                {t.group}
              </li>
            )}
            <li className={`uidx__item ${isCurrent ? 'is-current' : ''}`}>
              <Link to={`/${unit.id}/${t.slug}`} className="uidx__link" aria-current={isCurrent ? 'page' : undefined}>
                <span className="uidx__num">
                  {unit.number}.{i + 1}
                </span>
                <span className="uidx__text">
                  <span className="uidx__title">{t.title}</span>
                  {rich && <span className="uidx__summary">{t.summary}</span>}
                </span>
                {rich && <span className="uidx__min">{t.minutes} min</span>}
              </Link>
              {isCurrent && headings && headings.length > 0 && (
                <ol className="uidx__subs" aria-label="En esta página">
                  {headings.map((h) => (
                    <li key={h.id} className={activeHeading === h.id ? 'is-active' : ''}>
                      <a href={`#${h.id}`}>{h.text}</a>
                    </li>
                  ))}
                </ol>
              )}
            </li>
          </Fragment>
        )
      })}
    </ol>
  )
}
