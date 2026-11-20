import { type CSSProperties, useEffect } from 'react'
import { Link } from 'react-router'
import { ArrowRight, ListChecks } from 'lucide-react'
import { allTopics, topicPath, units } from '../content/units'
import { studyPlans } from '../content/plans'
import { NotebookIndex } from '../components/home/NotebookIndex'
import { TypeText } from '../components/layout/TypeText'
import { typeDuration } from '../lib/typing'
import './home.css'

// The cover title writes itself in, then the highlighter sweeps under it and
// a pencil note appears beside the first button.
const TITLE_A = 'Apuntes de '
const TITLE_B = 'ingeniería de software'
const TITLE_SPEED = 55
const TITLE_B_AT = typeDuration(TITLE_A, TITLE_SPEED) + 90
const TITLE_END = TITLE_B_AT + typeDuration(TITLE_B, TITLE_SPEED)

export function Home() {
  const totalMinutes = allTopics.reduce((s, t) => s + t.minutes, 0)

  useEffect(() => {
    document.title = 'Apuntes de ingeniería de software'
  }, [])

  const first = allTopics[0]

  return (
    <div className="home">
      <section className="home__hero paper-grid">
        <div className="home__hero-inner">
          <h1 className="home__title">
            <TypeText text={TITLE_A} speed={TITLE_SPEED} linger={false} />
            <span className="home__mark" data-line="system-design" style={{ '--sweep-delay': `${TITLE_END}ms` } as CSSProperties}>
              <TypeText text={TITLE_B} speed={TITLE_SPEED} delay={TITLE_B_AT} />
            </span>
          </h1>
          <p className="home__lead">
            Arquitectura, system design, patrones de diseño, desarrollo con IA y entrevistas técnicas, explicados como en clase: con diagramas que
            puedes tocar, algoritmos animados paso a paso y preguntas de repaso al final de cada tema.
          </p>
          <div className="home__actions">
            <Link to={topicPath(first)} className="btn btn--line home__cta" data-line={first.unit.id}>
              Empezar por el tema {first.num}
              <ArrowRight size={16} />
            </Link>
            <a href="#planes" className="btn">
              <ListChecks size={16} /> Planes de estudio
            </a>
            <span className="home__note hand" aria-hidden="true">
              <TypeText text="← empieza por aquí" speed={65} delay={TITLE_END + 700} caret={false} />
            </span>
          </div>
          <p className="home__facts">
            {units.length} unidades · {allTopics.length} temas · ≈ {Math.round(totalMinutes / 60)} horas de lectura
          </p>
        </div>
      </section>

      <section className="home__index" aria-labelledby="indice">
        <h2 id="indice" className="home__h2">
          Índice
        </h2>
        <NotebookIndex />
      </section>

      <section className="home__how" aria-labelledby="como-estudiar">
        <h2 id="como-estudiar" className="home__h2">
          Cómo estudiar con estos apuntes
        </h2>
        <div className="how">
          <div>
            <h3>Sigue el orden de cada unidad</h3>
            <p>
              Cada tema se apoya en el anterior y está numerado como en un cuaderno: el 2.4 viene después del 2.3. Si tienes un objetivo concreto,
              los planes de estudio mezclan temas de varias unidades.
            </p>
          </div>
          <div>
            <h3>Toca los diagramas</h3>
            <p>
              Los diagramas se recorren paso a paso, los componentes se pueden tocar y los simuladores tienen controles. Cambia un parámetro y mira
              qué se rompe: así se entienden los trade-offs.
            </p>
          </div>
          <div>
            <h3>Consulta lo que necesites</h3>
            <p>
              No hay nada que completar: entra y sal de los temas en el orden que te sirva. Las preguntas de repaso al final de cada tema te dicen si
              lo puedes explicar sin mirar. Busca cualquier tema con <kbd>Ctrl</kbd> <kbd>K</kbd>.
            </p>
          </div>
        </div>
      </section>

      <section className="home__plans" id="planes" aria-labelledby="planes-title">
        <h2 id="planes-title" className="home__h2">
          Planes de estudio
        </h2>
        <p className="home__plans-lead">Selecciones de temas de varias unidades, en el orden que sirve a un objetivo concreto.</p>
        <div className="plans">
          {studyPlans.map((plan) => {
            const minutes = plan.topics.reduce((s, t) => s + t.minutes, 0)
            return (
              <details key={plan.id} className="plan">
                <summary>
                  <span className="plan__title">{plan.title}</span>
                  <span className="plan__meta">
                    {plan.topics.length} temas · ≈ {Math.round(minutes / 6) / 10} h
                  </span>
                  <span className="plan__desc">{plan.description}</span>
                  <span className="plan__cells" aria-hidden="true">
                    {plan.topics.map((t, i) => (
                      <span key={t.id + i} data-line={t.unit.id} />
                    ))}
                  </span>
                </summary>
                <ol className="plan__topics">
                  {plan.topics.map((t) => (
                    <li key={t.id} data-line={t.unit.id}>
                      <Link to={topicPath(t)}>
                        <span className="plan__num">{t.num}</span>
                        <span className="plan__name">{t.title}</span>
                      </Link>
                    </li>
                  ))}
                </ol>
              </details>
            )
          })}
        </div>
      </section>
    </div>
  )
}
