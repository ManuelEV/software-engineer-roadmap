import { type ReactNode, useState } from 'react'
import { AlertTriangle, Check, RotateCcw, X } from 'lucide-react'
import { WidgetFrame } from '../kit'
import './StoryMatrix.css'

/**
 * Example story bank: stories × competencies. Each cell says whether a story
 * answers that kind of question well (2), passably (1) or not at all (0).
 * Coverage and gaps are computed from the grid; cells can be toggled to
 * experiment. Nothing is saved.
 */

interface Comp {
  id: string
  label: string
  q: string
}
interface Story {
  title: string
  gist: string
}

const COMPS: Comp[] = [
  { id: 'conflicto', label: 'Conflicto', q: 'Un desacuerdo con un compañero o con tu manager.' },
  { id: 'error', label: 'Error', q: 'Un error tuyo o un fracaso.' },
  { id: 'liderazgo', label: 'Liderazgo', q: 'Liderar o influir sin autoridad formal.' },
  { id: 'prioridades', label: 'Prioridades', q: 'Un plazo imposible o prioridades en conflicto.' },
  { id: 'feedback', label: 'Feedback', q: 'Dar o recibir feedback difícil.' },
  { id: 'aprender', label: 'Aprender', q: 'Aprender algo rápido.' },
  { id: 'ambiguedad', label: 'Ambigüedad', q: 'Avanzar sin requisitos claros.' },
  { id: 'orgullo', label: 'Orgullo', q: 'El proyecto del que estás más orgulloso.' },
]

const STORIES: Story[] = [
  { title: 'Cola en Postgres en vez de Kafka', gist: 'Desacuerdo técnico con un senior; criterio acordado antes que la solución; salimos en la mitad del tiempo.' },
  { title: 'El índice que bloqueó pedidos', gist: 'Error propio en producción; mitigación, postmortem sin culpables y un chequeo en CI.' },
  { title: 'Tests intermitentes', gist: 'Sin autoridad sobre el pipeline; datos, un experimento de un sprint y una guía que adoptó el equipo.' },
  { title: 'Facturación y la certificación tardía', gist: 'Plazo en riesgo por una dependencia externa; aviso temprano con dos opciones.' },
  { title: 'Onboarding de una persona junior', gist: 'Plan de 30 días y revisiones de código acompañadas; una conversación incómoda sobre los plazos.' },
  { title: 'Go en dos semanas', gist: 'Heredé un servicio en Go sin saber el lenguaje; plan de aprendizaje y el primer cambio en producción.' },
  { title: 'La función que nadie usó', gist: 'Requisitos vagos, construí de más; métricas de uso y lo que cambié en cómo valido ideas.' },
]

const INITIAL: number[][] = [
  [2, 0, 1, 0, 0, 0, 1, 2],
  [0, 2, 1, 0, 0, 1, 0, 0],
  [1, 0, 2, 0, 0, 0, 0, 1],
  [0, 0, 1, 2, 0, 0, 1, 1],
  [0, 0, 1, 0, 1, 0, 0, 0],
  [0, 0, 0, 1, 0, 2, 1, 0],
  [0, 1, 0, 0, 0, 1, 2, 0],
]

const LEVEL = ['no sirve', 'sirve', 'fuerte'] as const

type Focus = { kind: 'col' | 'row'; i: number } | null
type Status = 'ok' | 'weak' | 'gap'

function colStatus(grid: number[][], c: number): Status {
  const strong = grid.filter((r) => r[c] === 2).length
  const some = grid.filter((r) => r[c] === 1).length
  return strong > 0 ? 'ok' : some > 0 ? 'weak' : 'gap'
}

export function StoryMatrix() {
  const [grid, setGrid] = useState<number[][]>(INITIAL)
  const [focus, setFocus] = useState<Focus>(null)

  const cycle = (r: number, c: number) => {
    setGrid((g) => g.map((row, ri) => (ri === r ? row.map((v, ci) => (ci === c ? (v + 1) % 3 : v)) : row)))
    setFocus({ kind: 'col', i: c })
  }
  const statuses = COMPS.map((_, c) => colStatus(grid, c))
  const gaps = COMPS.filter((_, c) => statuses[c] === 'gap')
  const weak = COMPS.filter((_, c) => statuses[c] === 'weak')
  // a story that is the only strong answer for 2+ competencies: you'll be tempted to repeat it
  const loneCarrier = STORIES.map((_, r) => COMPS.filter((_, c) => grid[r][c] === 2 && grid.filter((row) => row[c] === 2).length === 1).length)
  const overloaded = STORIES.findIndex((_, r) => loneCarrier[r] >= 3)
  const unused = STORIES.filter((_, r) => grid[r].every((v) => v === 0))

  let note: ReactNode
  if (focus?.kind === 'col') {
    const c = focus.i
    const strong = STORIES.filter((_, r) => grid[r][c] === 2)
    const ok = STORIES.filter((_, r) => grid[r][c] === 1)
    note = (
      <>
        <b>{COMPS[c].label}</b>: «{COMPS[c].q}» {strong.length > 0 && <>Usa primero: {strong.map((s) => `«${s.title}»`).join(', ')}. </>}
        {ok.length > 0 && <>De respaldo: {ok.map((s) => `«${s.title}»`).join(', ')}. </>}
        {statuses[c] === 'gap' && <>No tienes ninguna historia para esto. Es un hueco: busca una antes de la entrevista.</>}
        {statuses[c] === 'weak' && <>Solo tienes historias que «sirven»: si te repreguntan, se van a quedar cortas. Busca una mejor o profundiza la que tienes.</>}
      </>
    )
  } else if (focus?.kind === 'row') {
    const r = focus.i
    const covers = COMPS.filter((_, c) => grid[r][c] > 0)
    note = (
      <>
        <b>{STORIES[r].title}</b>: {STORIES[r].gist}{' '}
        {covers.length > 0 ? <>Responde a: {covers.map((c) => c.label.toLowerCase()).join(', ')}.</> : <>Con esta matriz no responde a nada: reemplázala por otra.</>}
      </>
    )
  } else {
    note = (
      <>
        {gaps.length === 0 && weak.length === 0 ? (
          <>Todas las competencias tienen al menos una historia fuerte. </>
        ) : (
          <>
            {gaps.length > 0 && <>Huecos: {gaps.map((c) => c.label.toLowerCase()).join(', ')}. </>}
            {weak.length > 0 && <>Cobertura débil: {weak.map((c) => c.label.toLowerCase()).join(', ')}. </>}
          </>
        )}
        {overloaded >= 0 && <>«{STORIES[overloaded].title}» es la única historia fuerte en tres o más columnas: en un loop de varias rondas la vas a querer contar dos veces. </>}
        {unused.length > 0 && <>{unused.map((s) => `«${s.title}»`).join(', ')} no cubre nada. </>}
        Toca una columna o una historia para ver el detalle, o una celda para cambiarla.
      </>
    )
  }

  return (
    <WidgetFrame
      caption="Un banco de historias de ejemplo. Cada celda dice si la historia responde bien (círculo lleno), a medias (anillo) o no responde (punto) a ese tipo de pregunta. Toca las celdas para probar tu propio reparto: no se guarda nada."
      controls={
        <button
          type="button"
          className="btn btn--ghost"
          onClick={() => {
            setGrid(INITIAL)
            setFocus(null)
          }}
        >
          <RotateCcw size={15} /> Restablecer ejemplo
        </button>
      }
      readout={<p className="sm-note">{note}</p>}
    >
      <div className="sm-scroll">
        <table className="sm">
          <thead>
            <tr>
              <th scope="col" className="sm-corner">
                <span className="hand">historias × preguntas</span>
              </th>
              {COMPS.map((c, ci) => (
                <th key={c.id} scope="col">
                  <button
                    type="button"
                    className={`sm-colhead ${focus?.kind === 'col' && focus.i === ci ? 'is-on' : ''}`}
                    aria-pressed={focus?.kind === 'col' && focus.i === ci}
                    onClick={() => setFocus(focus?.kind === 'col' && focus.i === ci ? null : { kind: 'col', i: ci })}
                  >
                    {c.label}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {STORIES.map((s, ri) => (
              <tr key={s.title} className={focus?.kind === 'row' && focus.i === ri ? 'is-row' : ''}>
                <th scope="row">
                  <button
                    type="button"
                    className={`sm-rowhead ${focus?.kind === 'row' && focus.i === ri ? 'is-on' : ''}`}
                    aria-pressed={focus?.kind === 'row' && focus.i === ri}
                    onClick={() => setFocus(focus?.kind === 'row' && focus.i === ri ? null : { kind: 'row', i: ri })}
                  >
                    {s.title}
                  </button>
                </th>
                {COMPS.map((c, ci) => {
                  const v = grid[ri][ci]
                  const lit = focus?.kind === 'col' && focus.i === ci
                  return (
                    <td key={c.id} className={lit ? 'is-col' : ''}>
                      <button type="button" className={`sm-cell sm-cell--${v}`} aria-label={`${s.title}, ${c.label}: ${LEVEL[v]}. Cambiar.`} onClick={() => cycle(ri, ci)}>
                        <i aria-hidden />
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row" className="sm-foot-label">
                Cobertura
              </th>
              {COMPS.map((c, ci) => {
                const st = statuses[ci]
                return (
                  <td key={c.id} className={`sm-status sm-status--${st}`}>
                    {st === 'ok' ? <Check size={16} aria-hidden /> : st === 'weak' ? <AlertTriangle size={16} aria-hidden /> : <X size={16} aria-hidden />}
                    <span>{st === 'ok' ? 'bien' : st === 'weak' ? 'débil' : 'hueco'}</span>
                  </td>
                )
              })}
            </tr>
          </tfoot>
        </table>
      </div>
    </WidgetFrame>
  )
}
