import { useState } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowRight, ChevronDown } from 'lucide-react'
import { Segmented, Stat, WidgetFrame } from '../kit'
import './InterviewLoop.css'

/**
 * Draws a representative interview process for a company type and seniority as
 * a notebook timeline. Each stage expands to show what it measures, how long it
 * takes, what passes and what fails it, and which topic of the unit to study.
 */

type Company = 'bigtech' | 'startup' | 'local' | 'agencia'
type Seniority = 'junior' | 'semi' | 'senior'
type Cat = 'codigo' | 'diseno' | 'conceptual' | 'conductual' | 'tramite'
type StageId =
  | 'recruiter'
  | 'oa'
  | 'screen'
  | 'coding'
  | 'sd'
  | 'lld'
  | 'conceptual'
  | 'takehome'
  | 'review'
  | 'behavioral'
  | 'hm'
  | 'psico'
  | 'client'
  | 'offer'

interface StageDef {
  name: string
  cat: Cat
  /** typical length in minutes [min, max] */
  minutes: [number, number]
  /** done alone (no interviewer in the room) */
  solo?: boolean
  evaluates: string
  pass: string[]
  fail: string[]
  study: { to: string; label: string }[]
}

const CAT_LABEL: Record<Cat, string> = {
  codigo: 'Código',
  diseno: 'Diseño',
  conceptual: 'Conceptual',
  conductual: 'Conductual',
  tramite: 'Filtro y cierre',
}

const STAGES: Record<StageId, StageDef> = {
  recruiter: {
    name: 'Charla con recruiter',
    cat: 'tramite',
    minutes: [20, 30],
    evaluates:
      'Que tu perfil calce con el puesto: experiencia, motivación, disponibilidad, rango de sueldo y, si el puesto lo pide, tu inglés. También es donde te explican el proceso.',
    pass: [
      'Cuentas en dos minutos qué hiciste y por qué te interesa este puesto.',
      'Tienes un rango de sueldo investigado, o sabes cómo postergar el número.',
      'Preguntas qué formato tiene cada ronda y en qué idioma es.',
    ],
    fail: [
      'No sabes a qué se dedica la empresa.',
      'Pides un número muy fuera de rango sin haberlo investigado.',
      'Respuestas largas y desordenadas sobre tu experiencia.',
    ],
    study: [
      { to: '/casos/hablame-de-ti', label: '"Háblame de ti"' },
      { to: '/casos/oferta-y-negociacion', label: 'Expectativas y oferta' },
    ],
  },
  oa: {
    name: 'Prueba online',
    cat: 'codigo',
    minutes: [60, 90],
    solo: true,
    evaluates:
      'Resolver de 1 a 4 problemas en una plataforma como HackerRank o CodeSignal, sin entrevistador. Se corrige con tests automáticos, muchos de ellos ocultos.',
    pass: [
      'Lees todos los problemas primero y empiezas por el que dominas.',
      'Pruebas casos borde antes de enviar: vacío, un elemento, valores máximos.',
      'Miras las restricciones para saber qué complejidad necesitas.',
    ],
    fail: [
      'Pasas los tests visibles y fallas los ocultos por un caso borde.',
      'Timeout: una solución O(n²) con n de 10⁵.',
      'Te quedas trabado en un problema y no envías los demás.',
    ],
    study: [
      { to: '/casos/metodo-live-coding', label: 'El método para live coding' },
      { to: '/casos/arrays-y-hashing', label: 'Arreglos y hashing' },
    ],
  },
  screen: {
    name: 'Screen técnico',
    cat: 'codigo',
    minutes: [45, 60],
    evaluates:
      'Uno o dos problemas de dificultad media en un editor compartido, con un ingeniero. Decide si vale la pena invertir un día entero de entrevistas en ti.',
    pass: [
      'Aclaras el problema y propones una fuerza bruta antes de optimizar.',
      'Llegas a una solución que funciona y explicas su complejidad.',
      'Hablas mientras programas; el entrevistador nunca se pierde.',
    ],
    fail: [
      'Programas 20 minutos en silencio.',
      'Te lanzas a codificar sin acordar el enfoque y terminas sin nada que funcione.',
      'No pruebas tu código y el entrevistador encuentra el bug por ti.',
    ],
    study: [
      { to: '/casos/metodo-live-coding', label: 'El método para live coding' },
      { to: '/casos/two-pointers-y-sliding-window', label: 'Two pointers y sliding window' },
    ],
  },
  coding: {
    name: 'Live coding',
    cat: 'codigo',
    minutes: [45, 60],
    evaluates:
      'Algoritmos y estructuras de datos con más profundidad que el screen: un problema con variantes, repreguntas sobre complejidad y casos borde, o dos problemas encadenados.',
    pass: [
      'Reconoces el patrón y justificas por qué aplica.',
      'Código limpio, con nombres claros y sin bugs que no hayas encontrado tú.',
      'Respondes las variantes ("¿y si no cabe en memoria?") sin empezar de cero.',
    ],
    fail: [
      'Necesitas que te den la idea clave y aun así no la terminas.',
      'Pierdes la mitad del tiempo en un bug que no sabes depurar en voz alta.',
      'No sabes decir la complejidad de lo que escribiste.',
    ],
    study: [
      { to: '/casos/arrays-y-hashing', label: 'Arreglos y hashing' },
      { to: '/casos/grafos', label: 'Grafos' },
      { to: '/casos/programacion-dinamica', label: 'Programación dinámica' },
    ],
  },
  sd: {
    name: 'System design',
    cat: 'diseno',
    minutes: [45, 60],
    evaluates:
      'Diseñar un sistema a escala a partir de un enunciado abierto: requisitos, estimaciones, API, modelo de datos, arquitectura y trade-offs. Tú llevas la conversación.',
    pass: [
      'Acotas requisitos y haces números antes de dibujar.',
      'Cada caja tiene un porqué y un costo; comparas alternativas.',
      'Detectas tú los cuellos de botella y propones cómo mitigarlos.',
    ],
    fail: [
      'Dibujas una arquitectura de memoria sin preguntar nada.',
      'Nombras tecnologías ("pongo Kafka") sin decir qué problema resuelven.',
      'Te quedas en lo superficial y el entrevistador tiene que guiarte.',
    ],
    study: [
      { to: '/system-design/metodo-entrevista', label: 'El método de system design' },
      { to: '/casos/acortador-urls', label: 'Acortador de URLs' },
      { to: '/casos/twitter', label: 'Twitter: el timeline' },
    ],
  },
  lld: {
    name: 'Low-level design',
    cat: 'diseno',
    minutes: [45, 60],
    evaluates:
      'Modelar clases, interfaces y relaciones para un problema acotado (estacionamiento, biblioteca, ascensor) y a veces implementar una parte.',
    pass: [
      'Partes de los casos de uso, no de un diagrama de clases.',
      'Usas interfaces donde el comportamiento varía y lo justificas.',
      'Mantienes el diseño simple y extensible a lo que te piden después.',
    ],
    fail: [
      'Metes patrones de diseño porque sí.',
      'Clases que solo tienen getters y un "Manager" que hace todo.',
    ],
    study: [
      { to: '/casos/diseno-orientado-a-objetos', label: 'Diseño orientado a objetos' },
      { to: '/casos/poo-y-solid', label: 'POO y SOLID' },
    ],
  },
  conceptual: {
    name: 'Preguntas técnicas',
    cat: 'conceptual',
    minutes: [30, 60],
    evaluates:
      'Fundamentos y tu stack, en conversación: estructuras de datos, POO, SQL, HTTP, concurrencia, testing. Muy común en empresas locales y en procesos para perfiles junior.',
    pass: [
      'Explicas con un ejemplo de tu trabajo, no con una definición de memoria.',
      'Dices "no lo sé, pero lo razonaría así" cuando corresponde.',
    ],
    fail: [
      'Respuestas de glosario que se caen con la primera repregunta.',
      'Inventas una respuesta con seguridad.',
    ],
    study: [
      { to: '/casos/estructuras-de-datos', label: 'Estructuras de datos' },
      { to: '/casos/backend-y-bases-de-datos', label: 'Backend y bases de datos' },
      { to: '/casos/poo-y-solid', label: 'POO y SOLID' },
    ],
  },
  takehome: {
    name: 'Take-home',
    cat: 'codigo',
    minutes: [180, 480],
    solo: true,
    evaluates:
      'Un proyecto pequeño en tu casa (una API, una pantalla, un script de datos). Mide cómo trabajas de verdad: estructura, tests, README y decisiones.',
    pass: [
      'Cumples el alcance pedido y explicas en el README qué dejaste fuera y por qué.',
      'Tests de lo importante y un comando para correr todo.',
    ],
    fail: [
      'Sobreingeniería: diez capas para un CRUD.',
      'No se puede ejecutar siguiendo tus instrucciones.',
    ],
    study: [{ to: '/casos/otros-formatos', label: 'Take-home y otros formatos' }],
  },
  review: {
    name: 'Revisión del take-home',
    cat: 'codigo',
    minutes: [45, 60],
    evaluates: 'Defender tu entrega: por qué la estructuraste así, qué cambiarías con más tiempo y, a veces, agregar una funcionalidad en vivo.',
    pass: ['Reconoces los puntos débiles de tu entrega antes de que te los señalen.', 'Extiendes el código en vivo sin romperlo.'],
    fail: ['No recuerdas por qué tomaste una decisión.', 'Te pones a la defensiva ante una crítica.'],
    study: [{ to: '/casos/otros-formatos', label: 'Take-home y otros formatos' }],
  },
  behavioral: {
    name: 'Conductual',
    cat: 'conductual',
    minutes: [45, 60],
    evaluates:
      'Cómo trabajas con otros: conflictos, errores, prioridades, ownership y alcance de tu impacto, con preguntas del tipo "cuéntame de una vez que…".',
    pass: [
      'Historias concretas, con tu papel claro y un resultado medible.',
      'Hablas de errores propios y de lo que cambiaste después.',
      'En senior: decisiones que afectaron a otros equipos.',
    ],
    fail: [
      'Respuestas hipotéticas ("yo lo que haría es…").',
      'Todo en plural: nunca queda claro qué hiciste tú.',
      'Culpas al equipo o a tu jefe anterior.',
    ],
    study: [
      { to: '/casos/entrevista-conductual', label: 'La entrevista conductual' },
      { to: '/casos/hablame-de-ti', label: '"Háblame de ti"' },
    ],
  },
  hm: {
    name: 'Hiring manager',
    cat: 'conductual',
    minutes: [30, 60],
    evaluates:
      'Tu futuro jefe (en startups, a menudo el CTO o un fundador) evalúa si encajas con el equipo y el trabajo real: proyectos pasados, cómo decides y qué buscas.',
    pass: ['Conectas tu experiencia con los problemas concretos del equipo.', 'Haces preguntas sobre el trabajo, no solo sobre beneficios.'],
    fail: ['No sabes explicar el impacto de tus proyectos.', 'No tienes ninguna pregunta para hacer.'],
    study: [
      { to: '/casos/hablame-de-ti', label: '"Háblame de ti"' },
      { to: '/casos/entrevista-conductual', label: 'La entrevista conductual' },
    ],
  },
  psico: {
    name: 'Evaluación psicolaboral',
    cat: 'conductual',
    minutes: [60, 120],
    evaluates:
      'Tests psicométricos y una entrevista con un psicólogo. Aparece en empresas grandes y tradicionales de la región; rara vez en startups o empresas de EE. UU.',
    pass: ['Respondes con honestidad y coherencia.', 'Llegas descansado: algunos tests son largos.'],
    fail: ['Intentar adivinar "la respuesta correcta" y contradecirte.'],
    study: [{ to: '/casos/hablame-de-ti', label: '"Háblame de ti"' }],
  },
  client: {
    name: 'Entrevista con el cliente',
    cat: 'codigo',
    minutes: [45, 60],
    evaluates:
      'En agencias y consultoras: después de pasar sus filtros, te entrevista la empresa que te va a "rentar". Puede ser técnica o una charla con su equipo, a menudo en inglés.',
    pass: ['Investigaste el producto del cliente.', 'Te comunicas con fluidez en el idioma del equipo, aunque no sea perfecto.'],
    fail: ['Presentarte como "lo que el cliente necesite" sin un perfil claro.'],
    study: [
      { to: '/casos/hablame-de-ti', label: 'Entrevistas en inglés' },
      { to: '/casos/metodo-live-coding', label: 'El método para live coding' },
    ],
  },
  offer: {
    name: 'Referencias y oferta',
    cat: 'tramite',
    minutes: [15, 30],
    evaluates:
      'Verifican referencias de exjefes o colegas y te presentan la oferta. En big tech antes suele haber una revisión del paquete de feedback (un comité o el hiring manager) y, en algunas, un "team match".',
    pass: ['Avisas a tus referencias con tiempo y les cuentas el puesto.', 'Pides la oferta por escrito y negocias con datos.'],
    fail: ['Aceptar en el momento sin entender la compensación total.'],
    study: [{ to: '/casos/oferta-y-negociacion', label: 'Oferta y negociación' }],
  },
}

interface Entry {
  id: StageId
  note?: string
  /** part of the final loop / "onsite" */
  loop?: boolean
}

const L = (id: StageId, note?: string): Entry => ({ id, note, loop: true })

const LOOPS: Record<Company, Record<Seniority, Entry[]>> = {
  bigtech: {
    junior: [
      { id: 'recruiter' },
      { id: 'oa' },
      { id: 'screen' },
      L('coding'),
      L('coding'),
      L('coding', 'algunas empresas hacen solo dos'),
      L('behavioral'),
      { id: 'offer', note: 'comité o revisión de feedback antes' },
    ],
    semi: [
      { id: 'recruiter' },
      { id: 'oa', note: 'no siempre' },
      { id: 'screen' },
      L('coding'),
      L('coding', 'en algunas empresas, con asistente de IA'),
      L('sd'),
      L('behavioral'),
      { id: 'offer', note: 'comité o revisión de feedback antes' },
    ],
    senior: [
      { id: 'recruiter' },
      { id: 'screen' },
      L('coding'),
      L('coding', 'en algunas empresas, con asistente de IA'),
      L('sd'),
      L('sd', 'frecuente en senior y staff; a veces de producto'),
      L('behavioral', 'pesa más: alcance, liderazgo, conflicto'),
      { id: 'offer', note: 'el nivel se decide aquí' },
    ],
  },
  startup: {
    junior: [{ id: 'recruiter', note: 'a veces con un fundador' }, { id: 'takehome' }, L('review'), L('hm'), { id: 'offer' }],
    semi: [
      { id: 'recruiter' },
      { id: 'screen', note: 'problema práctico, no siempre algoritmos' },
      L('sd', 'versión ligera: diseñar una funcionalidad'),
      L('hm'),
      { id: 'offer' },
    ],
    senior: [
      { id: 'hm', note: 'primero: charla con el CTO' },
      { id: 'screen', note: 'a menudo pair programming' },
      L('sd', 'sobre su sistema real'),
      L('behavioral', 'con el equipo'),
      { id: 'offer' },
    ],
  },
  local: {
    junior: [
      { id: 'recruiter', note: 'Recursos Humanos' },
      { id: 'oa', note: 'o un take-home corto' },
      L('conceptual', 'con un ejercicio en vivo'),
      L('hm', 'el líder técnico'),
      { id: 'psico', note: 'según la empresa' },
      { id: 'offer' },
    ],
    semi: [
      { id: 'recruiter', note: 'Recursos Humanos' },
      { id: 'takehome', note: 'o prueba online' },
      L('conceptual', 'sobre tu stack y tu take-home'),
      L('hm'),
      { id: 'psico', note: 'según la empresa' },
      { id: 'offer' },
    ],
    senior: [
      { id: 'recruiter', note: 'Recursos Humanos' },
      L('conceptual', 'arquitectura y tu stack'),
      L('sd', 'a menudo sobre un sistema de la empresa'),
      L('hm', 'gerente o jefe de área'),
      { id: 'psico', note: 'según la empresa' },
      { id: 'offer' },
    ],
  },
  agencia: {
    junior: [
      { id: 'recruiter', note: 'incluye tu nivel de inglés' },
      { id: 'oa' },
      { id: 'conceptual', note: 'en inglés' },
      L('client'),
      { id: 'offer', note: 'a menudo como contractor' },
    ],
    semi: [
      { id: 'recruiter', note: 'incluye tu nivel de inglés' },
      { id: 'oa' },
      { id: 'screen', note: 'con un ingeniero de la agencia' },
      L('client'),
      { id: 'offer', note: 'a menudo como contractor' },
    ],
    senior: [
      { id: 'recruiter', note: 'incluye tu nivel de inglés' },
      { id: 'screen', note: 'con un ingeniero de la agencia' },
      { id: 'sd', note: 'o de la arquitectura de un proyecto tuyo' },
      L('client', 'a veces dos rondas'),
      { id: 'offer', note: 'a menudo como contractor' },
    ],
  },
}

const COMPANY_LABEL: Record<Company, string> = {
  bigtech: 'Big tech',
  startup: 'Startup',
  local: 'Empresa local',
  agencia: 'Agencia remota',
}

const mid = ([a, b]: [number, number]) => (a + b) / 2
const fmtMin = ([a, b]: [number, number]) => (b >= 120 ? `${a / 60}–${b / 60} h` : `${a}–${b} min`)
const fmtHours = (m: number) => (m < 60 ? `${Math.round(m)} min` : `~${(Math.round((m / 60) * 2) / 2).toLocaleString('es')} h`)

export function InterviewLoop() {
  const reduced = useReducedMotion()
  const [company, setCompany] = useState<Company>('bigtech')
  const [level, setLevel] = useState<Seniority>('semi')
  const [open, setOpen] = useState<number | null>(2)

  const loop = LOOPS[company][level]
  const sel = open !== null && open < loop.length ? open : null

  // live minutes per category, from the stage table
  const live = loop.filter((e) => !STAGES[e.id].solo)
  const liveMin = live.reduce((s, e) => s + mid(STAGES[e.id].minutes), 0)
  const soloMin = loop.filter((e) => STAGES[e.id].solo).reduce((s, e) => s + mid(STAGES[e.id].minutes), 0)
  const cats = (Object.keys(CAT_LABEL) as Cat[])
    .map((c) => ({ c, m: live.filter((e) => STAGES[e.id].cat === c).reduce((s, e) => s + mid(STAGES[e.id].minutes), 0) }))
    .filter((x) => x.m > 0)
  const firstLoop = loop.findIndex((e) => e.loop)
  const lastLoop = loop.length - 1 - [...loop].reverse().findIndex((e) => e.loop)

  const change = (fn: () => void) => {
    fn()
    setOpen(null)
  }

  return (
    <WidgetFrame
      caption="Un proceso representativo según el tipo de empresa y el nivel. No es la receta de ninguna empresa en particular: cada una mezcla estas etapas a su manera. Toca una etapa para ver qué mide y qué estudiar."
      controls={
        <>
          <Segmented
            label="Empresa"
            value={company}
            onChange={(v) => change(() => setCompany(v))}
            options={(Object.keys(COMPANY_LABEL) as Company[]).map((c) => ({ value: c, label: COMPANY_LABEL[c] }))}
          />
          <Segmented
            label="Nivel"
            value={level}
            onChange={(v) => change(() => setLevel(v))}
            options={[
              { value: 'junior', label: 'Junior' },
              { value: 'semi', label: 'Semi senior' },
              { value: 'senior', label: 'Senior' },
            ]}
          />
        </>
      }
      readout={
        <div className="il-sum">
          <div className="il-sum__stats">
            <Stat label="etapas" value={loop.length} />
            <Stat label="frente a entrevistadores" value={fmtHours(liveMin)} />
            {soloMin > 0 && <Stat label="trabajo a solas" value={fmtHours(soloMin)} />}
          </div>
          <div className="il-mix">
            <div className="il-mix__label">Reparto del tiempo en vivo</div>
            <div className="il-mix__bar" role="img" aria-label={cats.map((x) => `${CAT_LABEL[x.c]} ${Math.round((x.m / liveMin) * 100)} %`).join(', ')}>
              {cats.map((x) => (
                <span key={x.c} className={`il-mix__seg il-cat--${x.c}`} style={{ flexGrow: x.m }} />
              ))}
            </div>
            <ul className="il-mix__legend">
              {cats.map((x) => (
                <li key={x.c}>
                  <span className={`il-dot il-cat--${x.c}`} aria-hidden="true" />
                  {CAT_LABEL[x.c]} <b>{Math.round((x.m / liveMin) * 100)} %</b>
                </li>
              ))}
            </ul>
          </div>
        </div>
      }
    >
      <ol className="il-tl" aria-label={`Etapas para ${COMPANY_LABEL[company]}, nivel ${level}`}>
        {loop.map((e, k) => {
          const st = STAGES[e.id]
          const isOpen = sel === k
          const inLoop = !!e.loop
          return (
            <li
              key={`${company}-${level}-${k}`}
              className={`il-step ${inLoop ? 'is-loop' : ''} ${k === firstLoop ? 'is-loop-first' : ''} ${k === lastLoop ? 'is-loop-last' : ''} ${isOpen ? 'is-open' : ''}`}
            >
              {k === firstLoop && (
                <div className="il-loop-tag">
                  <span className="hand">loop final</span> virtual, en uno o dos días
                </div>
              )}
              <button type="button" className="il-step__head" onClick={() => setOpen(isOpen ? null : k)} aria-expanded={isOpen}>
                <span className={`il-step__n il-cat--${st.cat}`}>{k + 1}</span>
                <span className="il-step__main">
                  <span className="il-step__name">{st.name}</span>
                  <span className="il-step__meta">
                    <span>{fmtMin(st.minutes)}</span>
                    <span className="il-step__cat">{CAT_LABEL[st.cat]}</span>
                    {st.solo && <span className="il-step__solo">a solas</span>}
                  </span>
                  {e.note && <span className="il-step__note">{e.note}</span>}
                </span>
                <ChevronDown size={18} className="il-step__chev" aria-hidden="true" />
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    className="il-detail"
                    initial={{ opacity: 0, height: reduced ? 'auto' : 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0, height: reduced ? 'auto' : 0 }}
                    transition={{ duration: 0.26, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div className="il-detail__inner">
                      <p className="il-detail__what">
                        <b>Qué evalúa.</b> {st.evaluates}
                      </p>
                      <div className="il-detail__sig">
                        <div className="il-sig il-sig--ok">
                          <h4>Señales fuertes</h4>
                          <ul>
                            {st.pass.map((s) => (
                              <li key={s}>{s}</li>
                            ))}
                          </ul>
                        </div>
                        <div className="il-sig il-sig--bad">
                          <h4>Señales débiles</h4>
                          <ul>
                            {st.fail.map((s) => (
                              <li key={s}>{s}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      <div className="il-study">
                        <span className="il-study__label">Para estudiar</span>
                        {st.study.map((s) => (
                          <Link key={s.to + s.label} to={s.to} className="il-study__link">
                            {s.label} <ArrowRight size={14} aria-hidden="true" />
                          </Link>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          )
        })}
      </ol>
    </WidgetFrame>
  )
}
