import { useEffect } from 'react'
import { Link, useParams } from 'react-router'
import { ArrowRight } from 'lucide-react'
import { isUnitId, unitById, units } from '../content/units'
import { UnitIndex } from '../components/layout/UnitIndex'
import { TypeText } from '../components/layout/TypeText'
import { NotFound } from './NotFound'
import './unit.css'

export function UnitPage() {
  const { unit } = useParams()
  const def = isUnitId(unit) ? unitById[unit] : undefined

  useEffect(() => {
    if (def) document.title = `${def.number}. ${def.title} · Apuntes`
  }, [def])

  if (!def) return <NotFound />

  const total = def.topics.length
  const minutes = def.topics.reduce((s, t) => s + t.minutes, 0)
  const first = def.topics[0]
  const nextUnit = units[units.findIndex((u) => u.id === def.id) + 1]

  return (
    <div className="unitpage" data-line={def.id}>
      <header className="unitpage__head paper-grid">
        <div className="unitpage__tab" aria-hidden="true">
          <span className="unitpage__tab-label">Unidad</span>
          <span className="unitpage__tab-num">{def.number}</span>
        </div>
        <div className="unitpage__titles">
          <h1>
            <span className="visually-hidden">Unidad {def.number}: </span>
            <TypeText text={def.title} speed={45} />
          </h1>
          <p className="unitpage__desc">{def.description}</p>
          <div className="unitpage__meta">
            <span>{total} temas</span>
            <span>≈ {Math.round(minutes / 6) / 10} h de lectura</span>
          </div>
          <Link to={`/${def.id}/${first.slug}`} className="btn btn--line unitpage__cta">
            Empezar por el tema {def.number}.1
            <ArrowRight size={16} />
          </Link>
        </div>
      </header>

      <section className="unitpage__contents" aria-labelledby="contenido-unidad">
        <h2 id="contenido-unidad" className="unitpage__h2">
          Contenido
        </h2>
        <UnitIndex unit={def} rich />
      </section>

      {nextUnit && (
        <Link to={`/${nextUnit.id}`} className="unitpage__next" data-line={nextUnit.id}>
          <span className="unit-tab">{nextUnit.number}</span>
          <span className="unitpage__next-text">
            <span className="unitpage__next-dir">Siguiente unidad</span>
            <strong>{nextUnit.title}</strong>
          </span>
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      )}
    </div>
  )
}
