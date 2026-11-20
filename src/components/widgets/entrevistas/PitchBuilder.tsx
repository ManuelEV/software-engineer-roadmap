import { useId, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { AlertTriangle, CheckCircle2, XCircle } from 'lucide-react'
import { Segmented, Stat, WidgetFrame } from '../kit'
import './PitchBuilder.css'

/**
 * Build a "tell me about yourself" pitch from three blocks (present, past,
 * future). Word count, spoken duration and warnings are computed from the
 * text that ends up assembled. Nothing is saved.
 */

type Vacancy = 'pagos' | 'ecommerce'
type Flag = 'generic' | 'list' | 'chrono' | 'negative' | 'leaving'

interface Option {
  id: string
  label: string
  text: string
  flags?: Flag[]
  /** which vacancy this closing connects with */
  fit?: Vacancy
}

interface Block {
  id: 'presente' | 'pasado' | 'futuro'
  title: string
  hint: string
  options: Option[]
}

const VACANCIES: { value: Vacancy; label: string; long: string }[] = [
  { value: 'pagos', label: 'Fintech de pagos', long: 'backend en una fintech de pagos' },
  { value: 'ecommerce', label: 'E-commerce', long: 'backend en un e-commerce con picos de tráfico' },
]

const BLOCKS: Block[] = [
  {
    id: 'presente',
    title: 'Presente',
    hint: 'Quién eres hoy',
    options: [
      {
        id: 'p-logro',
        label: 'Rol, dominio y un logro',
        text: 'Soy desarrollador backend, con cuatro años de experiencia. Hoy trabajo en una empresa de logística, en el servicio que asigna pedidos a repartidores, con Node.js, TypeScript y Postgres. Lo que más disfruto es volver confiable algo que falla: el último trimestre llevé la asignación de unos dos segundos a 300 milisegundos, y dejamos de perder pedidos en las horas pico.',
      },
      {
        id: 'p-adjetivos',
        label: 'Adjetivos sobre tu personalidad',
        flags: ['generic'],
        text: 'Soy una persona muy proactiva, apasionada por la tecnología y con muchas ganas de aprender. Me considero un excelente compañero de equipo, me adapto rápido a cualquier entorno y siempre doy el cien por ciento en todo lo que hago.',
      },
      {
        id: 'p-stack',
        label: 'Todas las tecnologías del CV',
        flags: ['list'],
        text: 'Actualmente trabajo como desarrollador backend en una empresa de logística, donde uso Node.js, TypeScript, Express, NestJS, Postgres, MongoDB, Redis, RabbitMQ, Docker, Kubernetes, AWS, Terraform, Jest, GitHub Actions, Datadog y Sentry, entre otras herramientas. Antes también trabajé con Python, Django, React y Angular en distintos proyectos, y tengo conocimientos de Java, de metodologías ágiles como Scrum y Kanban, y de Git.',
      },
    ],
  },
  {
    id: 'pasado',
    title: 'Pasado',
    hint: 'Cómo llegaste aquí',
    options: [
      {
        id: 'q-hilo',
        label: 'El hilo que explica tu camino',
        text: 'Llegué al desarrollo desde soporte técnico: ahí aprendí a leer logs y a hablar con usuarios frustrados, y empecé a automatizar diagnósticos con scripts hasta que me pasaron al equipo de desarrollo. Antes del trabajo actual estuve dos años en una agencia haciendo APIs para clientes muy distintos, y ahí aprendí a entregar rápido aunque los requisitos cambiaran.',
      },
      {
        id: 'q-cronologia',
        label: 'La cronología completa',
        flags: ['chrono'],
        text: 'Bueno, empiezo por el principio. Estudié ingeniería de sistemas entre 2013 y 2018, en una universidad pública. En la universidad hice un proyecto de inventarios en Java, que fue mi primer contacto real con la programación, y una práctica de seis meses en un banco, donde daba soporte a una aplicación interna de créditos y aprendí algo de SQL. Cuando terminé la carrera trabajé un año en soporte técnico en una empresa de telecomunicaciones, atendiendo incidencias de clientes corporativos, y ahí empecé a hacer algunos scripts. Después entré a una agencia, donde estuve dos años haciendo APIs en Node para clientes de retail, salud y educación; en la agencia también hice algo de frontend con React, aprendí lo básico de AWS y estuve unos meses en un proyecto de una aplicación móvil que finalmente se canceló porque el cliente se quedó sin presupuesto. En 2022 me cambié a la empresa de logística donde estoy ahora. Primero estuve en el equipo de integraciones con transportistas, conectando sus APIs con la nuestra, y después pasé al equipo de asignación de pedidos, donde estoy desde hace un año y medio. Además, en mis tiempos libres hago algunos proyectos personales y cursos en línea, sobre todo de arquitectura de software y de bases de datos, porque me gusta mucho aprender cosas nuevas.',
      },
      {
        id: 'q-queja',
        label: 'Por qué te fuiste del anterior',
        flags: ['negative'],
        text: 'Antes estuve dos años en una agencia, pero la verdad era un desastre: los jefes no sabían nada de tecnología, todo era urgente y no se podía hacer nada bien, así que me fui apenas pude.',
      },
    ],
  },
  {
    id: 'futuro',
    title: 'Futuro',
    hint: 'Qué buscas y por qué aquí',
    options: [
      {
        id: 'f-pagos',
        label: 'Conectar con pagos',
        fit: 'pagos',
        text: 'Ahora busco un equipo donde la confiabilidad sea parte del producto, y por eso me interesa esta vacante: en pagos, un reintento mal hecho cobra dos veces, y los problemas que más disfruto, como la idempotencia y la consistencia, son el centro del trabajo.',
      },
      {
        id: 'f-ecommerce',
        label: 'Conectar con e-commerce',
        fit: 'ecommerce',
        text: 'Ahora quiero trabajar en sistemas con picos de tráfico grandes, y su plataforma, con eventos como el Black Friday, es justo ese reto: lo que hice con la asignación de pedidos es el mismo tipo de problema a otra escala.',
      },
      {
        id: 'f-generico',
        label: 'Nuevos desafíos',
        flags: ['generic'],
        text: 'Busco nuevos desafíos que me permitan seguir creciendo profesionalmente en una empresa grande y reconocida como esta.',
      },
      {
        id: 'f-startup',
        label: 'Tu propia startup',
        flags: ['leaving'],
        text: 'A futuro me gustaría emprender y tener mi propia startup, así que busco un lugar donde aprender lo más posible mientras tanto.',
      },
    ],
  },
]

const FLAG_MSG: Record<Flag, { tone: 'warn' | 'bad'; text: string }> = {
  generic: { tone: 'warn', text: 'Frases genéricas: cualquier candidato podría decirlas. Cámbialas por un hecho tuyo.' },
  list: { tone: 'warn', text: 'Recitar tecnologías es leer el CV en voz alta, y ya lo tienen. Nombra solo las que importan para esta vacante.' },
  chrono: { tone: 'warn', text: 'La cronología completa gasta la mayor parte del tiempo en lo menos relevante. Cuenta el hilo, no cada empleo.' },
  negative: { tone: 'bad', text: 'Hablar mal de un empleador anterior es la señal de alerta más fácil de evitar.' },
  leaving: { tone: 'bad', text: 'Contar que quieres irte a emprender le dice a quien te entrevista que la inversión en ti dura poco.' },
}

/** speaking-rate assumption, words per minute */
const WPM = 140
const MAX_S = 150

const words = (s: string) => s.trim().split(/\s+/).length

export function PitchBuilder() {
  const reduced = useReducedMotion()
  const uid = useId()
  const [vacancy, setVacancy] = useState<Vacancy>('pagos')
  const [pick, setPick] = useState<Record<Block['id'], string>>({ presente: 'p-stack', pasado: 'q-cronologia', futuro: 'f-generico' })

  const chosen = BLOCKS.map((b) => b.options.find((o) => o.id === pick[b.id]) ?? b.options[0])
  const total = chosen.reduce((n, o) => n + words(o.text), 0)
  const secs = Math.round((total / WPM) * 60)

  const warnings: { tone: 'ok' | 'warn' | 'bad'; text: string }[] = []
  if (secs > 120) warnings.push({ tone: 'bad', text: `Unos ${secs} segundos: pasa de dos minutos. El entrevistador deja de escuchar mucho antes. Recorta el bloque más largo.` })
  else if (secs < 45) warnings.push({ tone: 'warn', text: `Unos ${secs} segundos: muy corto. No alcanza para que sepan qué haces ni por qué estás aquí.` })
  const seen = new Set<Flag>()
  chosen.forEach((o) => o.flags?.forEach((f) => seen.add(f)))
  seen.forEach((f) => warnings.push(FLAG_MSG[f]))
  const fut = chosen[2]
  if (fut.fit && fut.fit !== vacancy) {
    const v = VACANCIES.find((x) => x.value === vacancy)!
    warnings.push({ tone: 'warn', text: `El cierre habla de otra empresa: la vacante es de ${v.long}. Adapta el bloque de futuro a cada proceso.` })
  }
  if (warnings.length === 0) warnings.push({ tone: 'ok', text: 'Concreto, con un logro medible, un hilo claro y un cierre que conecta con la vacante. Dura lo justo.' })

  const fade = { duration: 0.24, ease: [0.16, 1, 0.3, 1] as const }
  const pct = (s: number) => `${(Math.min(s, MAX_S) / MAX_S) * 100}%`
  const tone = secs > 120 ? 'bad' : secs < 45 ? 'warn' : 'ok'

  return (
    <WidgetFrame
      caption="Arma la respuesta a «háblame de ti» de un desarrollador backend ficticio eligiendo un bloque de cada columna. La duración supone unas 140 palabras por minuto, un ritmo tranquilo de conversación. No se guarda nada."
      controls={<Segmented label="Vacante" value={vacancy} onChange={setVacancy} options={VACANCIES.map((v) => ({ value: v.value, label: v.label }))} />}
      readout={
        <ul className="pb-warns" aria-live="polite">
          {warnings.map((w) => (
            <li key={w.text} className={`is-${w.tone}`}>
              {w.tone === 'ok' ? <CheckCircle2 size={16} aria-hidden /> : w.tone === 'warn' ? <AlertTriangle size={16} aria-hidden /> : <XCircle size={16} aria-hidden />}
              <span>{w.text}</span>
            </li>
          ))}
        </ul>
      }
    >
      <div className="pb">
        <div className="pb-blocks">
          {BLOCKS.map((b, bi) => (
            <fieldset key={b.id} className="pb-block">
              <legend>
                <span className="line-badge">{bi + 1}</span> {b.title} <span className="hand">{b.hint}</span>
              </legend>
              {b.options.map((o) => (
                <label key={o.id} className={`pb-opt ${pick[b.id] === o.id ? 'is-on' : ''}`}>
                  <input
                    type="radio"
                    className="visually-hidden"
                    name={`${uid}-${b.id}`}
                    value={o.id}
                    checked={pick[b.id] === o.id}
                    onChange={() => setPick((p) => ({ ...p, [b.id]: o.id }))}
                  />
                  {o.label}
                </label>
              ))}
            </fieldset>
          ))}
        </div>

        <div className="pb-out">
          <div className="pb-out__head">
            <span className="hand">tu respuesta, en voz alta:</span>
          </div>
          {chosen.map((o, i) => (
            <div key={BLOCKS[i].id} className="pb-out__block">
              <span className="pb-out__tag">{BLOCKS[i].title}</span>
              <AnimatePresence mode="wait" initial={false}>
                <motion.p key={o.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}>
                  {o.text}
                </motion.p>
              </AnimatePresence>
            </div>
          ))}
        </div>

        <div className="pb-time">
          <div className="pb-stats">
            <Stat label="palabras" value={total} />
            <Stat label="duración estimada" value={`≈ ${secs} s`} tone={tone} />
          </div>
          <div className="pb-meter" role="img" aria-label={`Duración estimada ${secs} segundos; la zona recomendada va de 60 a 120 segundos.`}>
            <div className="pb-meter__zone" style={{ left: pct(60), width: `calc(${pct(120)} - ${pct(60)})` }} />
            <motion.div
              className={`pb-meter__fill is-${tone}`}
              initial={false}
              animate={{ width: pct(secs) }}
              transition={{ duration: reduced ? 0 : 0.35, ease: [0.16, 1, 0.3, 1] }}
            />
            <div className="pb-meter__ticks" aria-hidden>
              {[0, 30, 60, 90, 120, 150].map((t) => (
                <span key={t} style={{ left: pct(t) }}>
                  {t} s
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </WidgetFrame>
  )
}
