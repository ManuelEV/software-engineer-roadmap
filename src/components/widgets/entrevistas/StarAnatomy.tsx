import { type CSSProperties, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Minus, Plus } from 'lucide-react'
import { Segmented, Stat, WidgetFrame } from '../kit'
import './StarAnatomy.css'

/**
 * Behavioural answers taken apart sentence by sentence: each sentence is
 * tagged S/T/A/R (or "relleno") and carries a note on why it adds or costs
 * points. The proportion bar and the speaking time are computed from the text.
 */

type Tag = 'S' | 'T' | 'A' | 'R' | 'x'

interface Sentence {
  tag: Tag
  text: string
  /** does it add points? */
  good: boolean
  /** an action told in the first person ("yo hice", not "hicimos") */
  yo?: boolean
  note: string
}

interface Example {
  id: string
  label: string
  q: string
  weak: Sentence[]
  strong: Sentence[]
  weakVerdict: string
  strongVerdict: string
}

const TAG_NAME: Record<Tag, string> = { S: 'Situación', T: 'Tarea', A: 'Acción', R: 'Resultado', x: 'Relleno' }
const TAGS: Tag[] = ['S', 'T', 'A', 'R', 'x']

/** speaking-rate assumption: a calm conversational pace */
const WPM = 140

const EXAMPLES: Example[] = [
  {
    id: 'conflicto',
    label: 'Desacuerdo',
    q: 'Cuéntame de una vez que no estuviste de acuerdo con una decisión técnica de un compañero.',
    weak: [
      { tag: 'x', good: false, text: 'En general me llevo bien con todos, así que no tengo muchos conflictos.', note: 'Evita la pregunta. "No tengo conflictos" suena a poca experiencia o a que esquivas los temas incómodos. Todos los equipos tienen desacuerdos técnicos.' },
      { tag: 'x', good: false, text: 'Cuando hay desacuerdos, lo que hago es escuchar a la otra persona y buscar un consenso.', note: 'Respuesta hipotética: describe lo que harías "en general", no lo que hiciste una vez. El entrevistador no puede verificar ni evaluar una intención.' },
      { tag: 'S', good: false, text: 'Una vez, en mi trabajo anterior, hubo una discusión sobre qué base de datos usar.', note: 'Al fin aparece una situación, pero sin contexto: ¿qué sistema?, ¿quién discutía?, ¿qué estaba en juego? Sin eso, nada de lo que sigue tiene peso.' },
      { tag: 'A', good: false, text: 'Lo conversamos en el equipo y al final elegimos Postgres.', note: '"Lo conversamos" y "elegimos": todo en plural. El entrevistador no sabe qué hiciste tú, que es lo único que está evaluando.' },
      { tag: 'R', good: false, text: 'Salió bien y el proyecto se entregó.', note: 'Un resultado sin medida ni relación con tus acciones. ¿Habría salido igual sin ti?' },
    ],
    weakVerdict: 'Casi la mitad es relleno, no hay una sola acción en primera persona y el resultado no dice nada. Un entrevistador anotaría "no da ejemplos concretos".',
    strong: [
      { tag: 'S', good: true, text: 'En una fintech de unas 40 personas íbamos a pasar la conciliación de pagos de un proceso nocturno a uno por eventos.', note: 'Contexto en una frase: tamaño de la empresa, el sistema y el cambio. Suficiente para entender lo demás, sin perder tiempo.' },
      { tag: 'T', good: true, text: 'Yo era responsable del servicio, y un compañero senior propuso usar Kafka desde el primer día.', note: 'Deja claro tu rol y el origen del desacuerdo, sin pintar al otro como villano.' },
      { tag: 'A', good: true, yo: true, text: 'Yo creía que, para unos 20.000 pagos diarios, una cola en Postgres bastaba y nos ahorraba operar un clúster.', note: 'Tu posición, con el dato que la sostiene. Muestra juicio técnico, no solo preferencia.' },
      { tag: 'A', good: true, yo: true, text: 'En vez de discutirlo en el canal, le pedí media hora y armé una tabla con las dos opciones: costo de operación, experiencia del equipo y qué pasaba si el volumen crecía diez veces.', note: 'La acción clave: sacas la discusión de lo personal y la llevas a criterios. Es exactamente la conducta que buscan en "manejo de conflicto".' },
      { tag: 'A', good: true, yo: true, text: 'Ahí me di cuenta de que él tenía razón en algo: necesitábamos reprocesar eventos viejos.', note: 'Reconocer que el otro tenía parte de razón suma mucho: muestra que escuchas y que no buscabas ganar.' },
      { tag: 'A', good: true, yo: true, text: 'Propuse empezar con Postgres guardando los eventos en una tabla de solo inserción, y acordar de antemano la métrica que nos haría migrar a Kafka.', note: 'Una solución que integra las dos posturas y un criterio objetivo para revisar la decisión. Esto es juicio de nivel senior.' },
      { tag: 'R', good: true, text: 'Lo aceptó, salimos en tres semanas en lugar de seis, y un año después seguíamos sin necesitar el clúster.', note: 'Resultado concreto, con números que el candidato conoce de primera mano, y conectado a la decisión.' },
      { tag: 'R', good: true, text: 'Aprendí a acordar el criterio antes que la solución.', note: 'Cierre con aprendizaje (la "L" de CARL): una frase, no un sermón.' },
    ],
    strongVerdict: 'La acción ocupa la mayor parte, está en primera persona y el resultado es medible. Dura poco más de un minuto: deja espacio para las repreguntas.',
  },
  {
    id: 'error',
    label: 'Error en prod',
    q: 'Cuéntame de un error tuyo que llegó a producción.',
    weak: [
      { tag: 'x', good: false, text: 'La verdad, trato de ser muy cuidadoso, así que no me pasa seguido.', note: 'Se defiende antes de empezar. La pregunta da por hecho que te equivocaste; negarlo resta credibilidad.' },
      { tag: 'S', good: false, text: 'Una vez se cayó el login porque QA no detectó un problema en una migración.', note: 'Culpa a otro equipo en la primera frase. Pidieron un error tuyo: si el error es de QA, no respondiste la pregunta.' },
      { tag: 'A', good: false, text: 'Lo arreglamos rápido entre todos.', note: '"Entre todos" esconde tu papel. ¿Diagnosticaste?, ¿revertiste?, ¿comunicaste?' },
      { tag: 'R', good: false, text: 'Después de eso no volvió a pasar.', note: 'No dice qué cambió para que no volviera a pasar, ni qué aprendiste tú. Es la parte que más importa en esta pregunta.' },
    ],
    weakVerdict: 'Defensiva, culpa a otros y no muestra aprendizaje. Para esta pregunta es casi la peor combinación posible.',
    strong: [
      { tag: 'S', good: true, text: 'Hace un año creé un índice en la tabla de pedidos sin la opción CONCURRENTLY, y durante unos cuatro minutos nadie pudo crear pedidos.', note: 'Asume el error desde la primera frase, con el detalle técnico justo y el impacto real.' },
      { tag: 'T', good: true, text: 'La migración era mía y yo estaba de turno, así que me tocaba contenerlo y explicar qué pasó.', note: 'Ownership explícito: no hay que adivinar de quién era la responsabilidad.' },
      { tag: 'A', good: true, yo: true, text: 'Cancelé la migración, lo que liberó el bloqueo, y confirmé en el dashboard que los pedidos volvían a entrar.', note: 'Primero mitigar, después investigar. Y verificar con datos que la mitigación funcionó.' },
      { tag: 'A', good: true, yo: true, text: 'Esa noche volví a crear el índice con CREATE INDEX CONCURRENTLY, en un horario de poco tráfico.', note: 'Cierra el problema original sin repetir el riesgo.' },
      { tag: 'A', good: true, yo: true, text: 'Escribí el postmortem sin culpables y agregué un chequeo en CI que rechaza índices sin CONCURRENTLY en tablas grandes.', note: 'Convierte el error en una mejora del sistema, no solo en una promesa de "tener más cuidado".' },
      { tag: 'R', good: true, text: 'En los meses siguientes, ese chequeo frenó dos migraciones parecidas de otros equipos.', note: 'El resultado va más allá de ti: el cambio protegió a otros. Eso es impacto.' },
      { tag: 'R', good: true, text: 'Desde entonces pruebo cada migración contra una copia con datos del tamaño de producción.', note: 'Aprendizaje concreto y verificable, convertido en hábito.' },
    ],
    strongVerdict: 'Ownership desde la primera frase, mitigación antes que análisis y un cambio que previene la repetición. Es lo que esta pregunta busca.',
  },
  {
    id: 'liderazgo',
    label: 'Liderazgo',
    q: 'Cuéntame de una vez que lideraste un cambio sin ser el jefe de nadie.',
    weak: [
      { tag: 'x', good: false, text: 'Siempre me ha gustado liderar y ayudar al equipo.', note: 'Una afirmación sobre ti mismo. En una entrevista conductual, los adjetivos no cuentan: cuentan los hechos.' },
      { tag: 'S', good: false, text: 'En un proyecto, el equipo tenía problemas con los tests.', note: 'Demasiado vago: ¿qué problemas?, ¿cuánto costaban? Sin el dolor concreto no se entiende por qué valía la pena el cambio.' },
      { tag: 'A', good: false, yo: true, text: 'Así que les dije que había que escribir más tests y empezaron a hacerlo.', note: 'Decirle al equipo qué hacer no es liderar sin autoridad, y que todos obedezcan sin más tampoco es creíble. Falta el cómo convenciste.' },
      { tag: 'R', good: false, text: 'La calidad mejoró bastante.', note: '"Bastante" no es un resultado. ¿Qué indicador cambió?' },
    ],
    weakVerdict: 'Afirma liderazgo en vez de mostrarlo. No hay datos, ni resistencia, ni una forma de influir que se pueda repetir.',
    strong: [
      { tag: 'S', good: true, text: 'En mi equipo, los tests end-to-end tardaban 40 minutos y fallaban de forma intermitente; la gente ya los reintentaba sin mirar.', note: 'Un problema concreto y reconocible, con el costo implícito (tiempo y confianza perdidos).' },
      { tag: 'T', good: true, text: 'No era mi tarea y no tenía autoridad sobre el pipeline, pero me estaba costando dos o tres reintentos por pull request.', note: 'Deja claro que no te tocaba: eso es lo que hace interesante la historia de influencia.' },
      { tag: 'A', good: true, yo: true, text: 'Primero junté datos: durante dos semanas anoté qué tests fallaban, y la mayoría de los fallos venía de seis tests con esperas fijas.', note: 'Empieza por la evidencia, no por la opinión. Con datos es más difícil decirte que no.' },
      { tag: 'A', good: true, yo: true, text: 'Llevé esa lista a la retro y propuse un experimento acotado: arreglar esos seis en un sprint, junto con alguien de QA.', note: 'Un experimento pequeño y con fecha es fácil de aceptar. Sumar a QA reparte la propiedad del cambio.' },
      { tag: 'A', good: true, yo: true, text: 'Los reescribí para esperar condiciones en lugar de tiempos fijos y dejé una guía corta para los tests nuevos.', note: 'Hiciste el trabajo tú y dejaste algo que escala más allá de ti.' },
      { tag: 'R', good: true, text: 'Los fallos intermitentes pasaron de uno cada cuatro builds a uno cada veinte, y el equipo adoptó la guía.', note: 'Un indicador antes y después, más la adopción por parte de otros: la prueba de que influiste.' },
    ],
    strongVerdict: 'Datos, un experimento pequeño, trabajo propio y adopción del equipo. Así se ve el liderazgo sin autoridad en una historia.',
  },
  {
    id: 'deadline',
    label: 'Deadline',
    q: 'Cuéntame de una vez que te diste cuenta de que no ibas a llegar a una fecha comprometida.',
    weak: [
      { tag: 'x', good: false, text: 'Soy muy bueno trabajando bajo presión.', note: 'Otra afirmación sin evidencia, y además una señal de alerta: puede sonar a que normalizas el caos.' },
      { tag: 'A', good: false, yo: true, text: 'Me quedé trabajando hasta tarde varios días y lo saqué.', note: 'El heroísmo no es gestión del riesgo. El entrevistador se pregunta: ¿avisó a alguien?, ¿qué pasa la próxima vez?' },
      { tag: 'R', good: false, text: 'El cliente quedó contento.', note: 'Resultado vago y sin relación con una decisión.' },
      { tag: 'x', good: false, text: 'Fue un tiempo estresante, pero así es la industria.', note: 'Cierra con resignación en vez de aprendizaje.' },
    ],
    weakVerdict: 'Muestra esfuerzo, no criterio. No hay comunicación, ni opciones, ni aprendizaje.',
    strong: [
      { tag: 'S', good: true, text: 'Teníamos tres semanas para lanzar la facturación electrónica de un cliente nuevo, y a mitad de camino supimos que el proveedor exigía una certificación que tardaba diez días.', note: 'Plazo, alcance y el obstáculo externo: el conflicto real de la historia.' },
      { tag: 'T', good: true, text: 'Yo lideraba la integración y vi que, con ese bloqueo, no llegábamos con todo el alcance.', note: 'Tu rol y el momento en que detectas el riesgo.' },
      { tag: 'A', good: true, yo: true, text: 'Ese mismo día le escribí a mi manager y al PM con el problema, el impacto y dos opciones.', note: 'Avisar temprano y llegar con opciones, no solo con el problema. Es la conducta más valorada aquí.' },
      { tag: 'A', good: true, text: 'Una era mover la fecha una semana; la otra, lanzar a tiempo emitiendo facturas en lote durante esos días y automatizar después.', note: 'Opciones concretas con su costo: le facilitas la decisión a quien tiene que tomarla.' },
      { tag: 'A', good: true, yo: true, text: 'Eligieron la segunda; armé el proceso en lote con un script y una planilla de control, y dejé la integración lista detrás de un feature flag.', note: 'Ejecutas lo decidido y reduces el riesgo del paso siguiente.' },
      { tag: 'R', good: true, text: 'Lanzamos en la fecha, el cliente no notó la diferencia y activamos la integración cuatro días después de recibir la certificación.', note: 'Resultado verificable, conectado con la opción que propusiste.' },
      { tag: 'R', good: true, text: 'Desde entonces, en la primera semana de cada proyecto listo las dependencias externas.', note: 'Aprendizaje convertido en práctica.' },
    ],
    strongVerdict: 'Detecta el riesgo, avisa temprano, propone opciones y ejecuta. Nada de heroísmo: criterio.',
  },
]

const words = (s: string) => s.trim().split(/\s+/).length

export function StarAnatomy() {
  const reduced = useReducedMotion()
  const [exId, setExId] = useState(EXAMPLES[0].id)
  const [side, setSide] = useState<'weak' | 'strong'>('weak')
  const [pick, setPick] = useState<{ key: string; i: number }>({ key: '', i: -1 })

  const ex = EXAMPLES.find((e) => e.id === exId) ?? EXAMPLES[0]
  const list = side === 'weak' ? ex.weak : ex.strong
  const key = `${exId}-${side}`
  const sel = pick.key === key ? pick.i : -1
  const cur = sel >= 0 ? list[sel] : null

  const total = list.reduce((n, s) => n + words(s.text), 0)
  const byTag = TAGS.map((t) => ({ t, n: list.filter((s) => s.tag === t).reduce((n, s) => n + words(s.text), 0) })).filter((x) => x.n > 0)
  const secs = Math.round((total / WPM) * 60)
  const actionShare = Math.round(((byTag.find((x) => x.t === 'A')?.n ?? 0) / total) * 100)
  const yoCount = list.filter((s) => s.tag === 'A' && s.yo).length

  const fade = { duration: 0.22, ease: [0.16, 1, 0.3, 1] as const }

  return (
    <WidgetFrame
      caption="Toca cada frase para ver por qué suma o resta. Las historias son ficticias, pero realistas: las cifras son parte del ejemplo, no estadísticas. La duración supone un ritmo de unas 140 palabras por minuto."
      controls={
        <>
          <Segmented label="Pregunta" value={exId} onChange={setExId} options={EXAMPLES.map((e) => ({ value: e.id, label: e.label }))} />
          <Segmented
            label="Respuesta"
            value={side}
            onChange={setSide}
            options={[
              { value: 'weak', label: 'Débil' },
              { value: 'strong', label: 'Fuerte' },
            ]}
          />
        </>
      }
      readout={
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={`${key}-${sel}`} className="sa-vars" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}>
            {cur ? (
              <p className="sa-note">
                <span className={`sa-note__mark ${cur.good ? 'is-good' : 'is-bad'}`}>
                  {cur.good ? <Plus size={14} aria-hidden /> : <Minus size={14} aria-hidden />}
                  {cur.good ? 'Suma' : 'Resta'}
                </span>
                <span className="sa-chip" style={{ '--sa-tag': `var(--sa-${cur.tag})` } as CSSProperties}>
                  {TAG_NAME[cur.tag]}
                </span>{' '}
                {cur.note}
              </p>
            ) : (
              <p className="sa-note">
                <span className={`sa-note__mark ${side === 'strong' ? 'is-good' : 'is-bad'}`}>{side === 'strong' ? 'Fuerte' : 'Débil'}</span>
                {side === 'strong' ? ex.strongVerdict : ex.weakVerdict}
              </p>
            )}
          </motion.div>
        </AnimatePresence>
      }
    >
      <div className="sa">
        <p className="sa-q">
          <span className="hand">el entrevistador:</span> {ex.q}
        </p>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={key}
            className={`sa-answer ${side === 'strong' ? 'is-strong' : 'is-weak'}`}
            initial={{ opacity: 0, y: reduced ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={fade}
          >
            <span className="hand sa-answer__who">{side === 'strong' ? 'respuesta fuerte:' : 'respuesta débil:'}</span>
            <ol className="sa-text">
              {list.map((s, i) => (
                <li key={i}>
                  <button
                    type="button"
                    className={`sa-s ${sel === i ? 'is-on' : ''} ${s.tag === 'x' ? 'is-filler' : ''}`}
                    style={{ '--sa-tag': `var(--sa-${s.tag})` } as CSSProperties}
                    aria-pressed={sel === i}
                    aria-label={`${TAG_NAME[s.tag]}: ${s.text}`}
                    onClick={() => setPick({ key, i: sel === i ? -1 : i })}
                  >
                    <span className="sa-s__tag" aria-hidden>
                      {s.tag === 'x' ? '—' : s.tag}
                    </span>
                    <span>{s.text}</span>
                  </button>
                </li>
              ))}
            </ol>
          </motion.div>
        </AnimatePresence>

        <div className="sa-meta">
          <div className="sa-bar" role="img" aria-label={`Proporción de palabras: ${byTag.map((x) => `${TAG_NAME[x.t]} ${Math.round((x.n / total) * 100)} %`).join(', ')}`}>
            {byTag.map((x) => (
              <motion.span
                key={x.t}
                className="sa-bar__seg"
                style={{ '--sa-tag': `var(--sa-${x.t})` } as CSSProperties}
                initial={false}
                animate={{ flexGrow: x.n }}
                transition={{ duration: reduced ? 0 : 0.35, ease: [0.16, 1, 0.3, 1] }}
              >
                <span>{x.t === 'x' ? '—' : x.t}</span>
              </motion.span>
            ))}
          </div>
          <ul className="sa-legend" aria-hidden>
            {TAGS.map((t) => (
              <li key={t} style={{ '--sa-tag': `var(--sa-${t})` } as CSSProperties}>
                <i />
                {TAG_NAME[t]}
              </li>
            ))}
          </ul>
          <div className="sa-stats">
            <Stat label="palabras" value={total} />
            <Stat label="dicha en voz alta" value={secs < 60 ? `${secs} s` : `${Math.floor(secs / 60)} min ${secs % 60} s`} />
            <Stat label="es acción" value={`${actionShare} %`} tone={actionShare >= 45 ? 'ok' : 'bad'} />
            <Stat label="acciones en primera persona" value={yoCount} tone={yoCount >= 2 ? 'ok' : 'bad'} />
          </div>
        </div>
      </div>
    </WidgetFrame>
  )
}
