import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowRight, Check, RotateCcw, TriangleAlert, X } from 'lucide-react'
import { WidgetFrame } from '../kit'
import './IncidentTriage.css'

/**
 * IncidentTriage: a branching production incident. At each step you see the
 * evidence and choose the next diagnostic move; good moves advance, the others
 * explain why they hurt and let you choose again. Nothing is saved.
 */

type Verdict = 'ok' | 'warn' | 'bad'

interface Choice {
  label: string
  verdict: Verdict
  feedback: string
}

interface Step {
  id: string
  time: string
  title: string
  context: string
  evidence: { label: string; value: string; tone?: Verdict }[]
  choices: Choice[]
}

const STEPS: Step[] = [
  {
    id: 'alerta',
    time: '14:10',
    title: 'Suena la alerta',
    context: 'El p99 de POST /checkout pasó de 350 ms a más de 4 s. Soporte reporta pagos que no terminan. Eres la persona de guardia.',
    evidence: [
      { label: 'p99 /checkout', value: '4,2 s', tone: 'bad' },
      { label: 'errores 5xx', value: '3,1 % (antes 0,2 %)', tone: 'warn' },
      { label: 'tráfico', value: 'igual que el viernes pasado', tone: 'ok' },
    ],
    choices: [
      {
        label: 'Reviso qué cambió en la última hora: despliegues, feature flags, configuración, tráfico.',
        verdict: 'ok',
        feedback: 'Buen primer paso. Una gran parte de los incidentes los dispara un cambio, y mirar el historial de despliegues cuesta un minuto. Te da una hipótesis antes de tocar nada.',
      },
      {
        label: 'Reinicio todos los pods de checkout.',
        verdict: 'bad',
        feedback: 'Puede aliviar un rato si el problema es memoria o conexiones colgadas, pero borras la evidencia y no sabrás qué arreglaste. Si la causa sigue ahí, vuelve en minutos.',
      },
      {
        label: 'Abro el repositorio y busco el bug en el código de checkout.',
        verdict: 'warn',
        feedback: 'Sin una hipótesis estás leyendo a ciegas. Primero acota con datos: desde cuándo, qué cambió, qué componente está saturado.',
      },
      {
        label: 'Escalo checkout al triple de réplicas.',
        verdict: 'warn',
        feedback: 'Si el cuello de botella está aguas abajo (la base, un proveedor), más réplicas generan más carga sobre él. Antes de escalar, mira dónde está la saturación.',
      },
    ],
  },
  {
    id: 'cambio',
    time: '14:13',
    title: 'Aparece un sospechoso',
    context: 'Encontraste un despliegue de checkout a las 14:02, tres minutos antes del pico. Miras las señales de los componentes.',
    evidence: [
      { label: 'deploy', value: 'checkout v2.41 a las 14:02', tone: 'warn' },
      { label: 'CPU base de pedidos', value: '96 %', tone: 'bad' },
      { label: 'pool de conexiones', value: '50 / 50 en uso', tone: 'bad' },
      { label: 'CPU de checkout', value: '35 %', tone: 'ok' },
    ],
    choices: [
      {
        label: 'Hago rollback a v2.40 y miro si las métricas vuelven a la normalidad.',
        verdict: 'ok',
        feedback: 'Mitigar primero. Hay una correlación fuerte con el deploy y el rollback es barato y reversible. La causa la investigas con el sistema estable y los usuarios pagando.',
      },
      {
        label: 'Subo el pool de conexiones de 50 a 200.',
        verdict: 'bad',
        feedback: 'La base ya está al 96 % de CPU. Más conexiones significa más consultas concurrentes contra un recurso saturado: lo empeora.',
      },
      {
        label: 'No toco nada hasta entender qué consulta está lenta.',
        verdict: 'warn',
        feedback: 'Entender importa, pero los usuarios siguen sin poder pagar. Si tienes una mitigación barata y reversible, va antes que el diagnóstico completo.',
      },
    ],
  },
  {
    id: 'rollback',
    time: '14:24',
    title: 'Mitigado',
    context: 'El rollback terminó. Las métricas volvieron a su nivel normal. Avisaste en el canal del incidente.',
    evidence: [
      { label: 'p99 /checkout', value: '380 ms', tone: 'ok' },
      { label: 'errores 5xx', value: '0,2 %', tone: 'ok' },
      { label: 'CPU base de pedidos', value: '41 %', tone: 'ok' },
    ],
    choices: [
      {
        label: 'Busco en las trazas una petición lenta de las 14:05 a las 14:20 y miro en qué se fue el tiempo.',
        verdict: 'ok',
        feedback: 'Las trazas de ese intervalo ya tienen la respuesta: muestran cada llamada de la petición con su duración. No necesitas reproducir el problema.',
      },
      {
        label: 'Cierro el incidente: ya está resuelto.',
        verdict: 'bad',
        feedback: 'Está mitigado, no resuelto. Si no sabes la causa, el próximo despliegue (que incluirá el mismo cambio) lo trae de vuelta.',
      },
      {
        label: 'Agrego logs en todas partes y vuelvo a desplegar v2.41 para observar.',
        verdict: 'bad',
        feedback: 'Reintroduces el incidente a propósito en producción. Primero usa la telemetría que ya tienes; si no alcanza, reproduce en staging o con un canary pequeño.',
      },
    ],
  },
  {
    id: 'traza',
    time: '14:40',
    title: 'La traza',
    context: 'Una petición lenta de las 14:07 tardó 4,1 s. Casi todo el tiempo está en llamadas a la base.',
    evidence: [
      { label: 'spans de base de datos', value: '212 consultas iguales', tone: 'bad' },
      { label: 'consulta', value: 'SELECT … FROM cupones WHERE item_id = $1', tone: 'warn' },
      { label: 'duración de cada una', value: '~18 ms', tone: 'ok' },
    ],
    choices: [
      {
        label: 'Es un N+1: v2.41 consulta los cupones ítem por ítem. Lo cambio por una sola consulta con IN y agrego un test que cuente consultas.',
        verdict: 'ok',
        feedback: 'Exacto. Cada consulta es rápida; el problema es que son 212 por petición. Una consulta por lote lo arregla, y el test evita que vuelva.',
      },
      {
        label: 'La base es lenta: hay que pasar a una instancia más grande.',
        verdict: 'bad',
        feedback: '18 ms por consulta es normal. Escalar la base esconde el bug, cuesta caro y deja de alcanzar en cuanto el carrito tenga más ítems.',
      },
      {
        label: 'Pongo los cupones en caché en Redis.',
        verdict: 'warn',
        feedback: 'Puede bajar la latencia, pero tapa el síntoma: el código sigue haciendo 212 viajes, ahora a Redis. Primero arregla el patrón de acceso.',
      },
    ],
  },
  {
    id: 'cierre',
    time: 'lunes',
    title: 'Cerrar el ciclo',
    context: 'El arreglo está desplegado con un canary y las métricas están sanas. Queda cerrar el incidente.',
    evidence: [
      { label: 'impacto', value: '22 min con pagos degradados', tone: 'warn' },
      { label: 'causa', value: 'N+1 introducido en v2.41', tone: 'ok' },
    ],
    choices: [
      {
        label: 'Escribo un postmortem sin culpables: cronología, impacto, causa, qué funcionó y acciones con responsable.',
        verdict: 'ok',
        feedback: 'Eso es. Acciones concretas: test que cuente consultas en checkout, alerta por pool de conexiones saturado, y despliegues con canary para que un cambio así afecte a pocos usuarios.',
      },
      {
        label: 'Averiguo quién hizo el deploy para que tenga más cuidado.',
        verdict: 'bad',
        feedback: 'Buscar culpables hace que la próxima vez la gente oculte información. La pregunta útil es qué permitió que un N+1 pasara la revisión, los tests y el despliegue sin que nadie lo notara.',
      },
      {
        label: 'Escribo "resuelto" en el canal y sigo con lo mío.',
        verdict: 'warn',
        feedback: 'Sin acciones de seguimiento, el mismo tipo de bug vuelve. Un postmortem cuesta una hora; el próximo incidente cuesta mucho más.',
      },
    ],
  },
]

const ICON = { ok: Check, warn: TriangleAlert, bad: X }
const VERDICT_LABEL = { ok: 'Buen paso', warn: 'Discutible', bad: 'Mal paso' }

export function IncidentTriage() {
  const reduced = useReducedMotion()
  const [at, setAt] = useState(0)
  const [picked, setPicked] = useState<number | null>(null)
  const [missteps, setMissteps] = useState(0)
  const done = at >= STEPS.length
  const step = STEPS[Math.min(at, STEPS.length - 1)]
  const choice = picked !== null ? step.choices[picked] : null

  const pick = (k: number) => {
    if (choice?.verdict === 'ok') return
    setPicked(k)
    if (step.choices[k].verdict !== 'ok') setMissteps((m) => m + 1)
  }
  const advance = () => {
    setAt((a) => a + 1)
    setPicked(null)
  }
  const restart = () => {
    setAt(0)
    setPicked(null)
    setMissteps(0)
  }
  const fade = { duration: 0.3, ease: [0.16, 1, 0.3, 1] as const }

  return (
    <WidgetFrame
      caption="Un incidente en producción, paso a paso. En cada momento ves la evidencia y eliges qué hacer. Los pasos malos no te sacan del juego: te explican por qué y vuelves a elegir."
      controls={
        <div className="itr-top">
          <ol className="itr-progress" aria-label="Progreso del incidente">
            {STEPS.map((s, k) => (
              <li key={s.id} className={k < at ? 'is-done' : k === at ? 'is-on' : ''} aria-current={k === at ? 'step' : undefined}>
                <span className="itr-progress__dot" aria-hidden="true" />
                <span className="itr-progress__label">{s.title}</span>
              </li>
            ))}
          </ol>
          <button type="button" className="btn btn--ghost" onClick={restart} disabled={at === 0 && picked === null}>
            <RotateCcw size={15} /> Reiniciar
          </button>
        </div>
      }
      readout={
        <p aria-live="polite">
          {done
            ? `Incidente cerrado ${missteps === 0 ? 'sin pasos en falso' : `con ${missteps} ${missteps === 1 ? 'paso en falso' : 'pasos en falso'} en el camino`}. El orden que acabas de seguir es el que conviene contar en la entrevista: alcance, qué cambió, mitigar, diagnosticar con datos, arreglar y aprender.`
            : 'Orden general: entender el impacto, buscar qué cambió, mitigar si hay algo barato y reversible, y recién después diagnosticar la causa con logs, métricas y trazas.'}
        </p>
      }
    >
      <AnimatePresence mode="wait" initial={false}>
        {done ? (
          <motion.div key="fin" className="itr-end" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}>
            <p className="itr-end__title">Línea de tiempo del postmortem</p>
            <ol className="itr-timeline">
              <li><b>14:02</b> Se despliega checkout v2.41.</li>
              <li><b>14:05</b> Empieza la degradación: p99 sobre 4 s, 5xx al 3 %.</li>
              <li><b>14:10</b> Alerta. Se revisan los cambios recientes.</li>
              <li><b>14:13</b> Base al 96 % y pool agotado; se decide rollback.</li>
              <li><b>14:24</b> Mitigado. Métricas normales.</li>
              <li><b>14:40</b> Las trazas muestran un N+1 de cupones.</li>
              <li><b>Acciones</b> Test de cantidad de consultas, alerta de pool, canary obligatorio en checkout.</li>
            </ol>
            <button type="button" className="btn btn--line" onClick={restart}>
              <RotateCcw size={15} /> Empezar de nuevo
            </button>
          </motion.div>
        ) : (
          <motion.div key={step.id} className="itr" initial={{ opacity: 0, y: reduced ? 0 : 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={fade}>
            <div className="itr-head">
              <span className="itr-time">{step.time}</span>
              <p className="itr-title">{step.title}</p>
            </div>
            <p className="itr-context">{step.context}</p>
            <dl className="itr-evidence" aria-label="Evidencia">
              {step.evidence.map((e) => (
                <div key={e.label} className={`itr-ev is-${e.tone ?? 'none'}`}>
                  <dt>{e.label}</dt>
                  <dd>{e.value}</dd>
                </div>
              ))}
            </dl>
            <p className="itr-ask">¿Qué haces ahora?</p>
            <div className="itr-choices" role="group" aria-label="Opciones">
              {step.choices.map((c, k) => {
                const isPicked = picked === k
                const Icon = ICON[c.verdict]
                return (
                  <button
                    key={c.label}
                    type="button"
                    className={`itr-choice ${isPicked ? `is-picked is-${c.verdict}` : ''}`}
                    onClick={() => pick(k)}
                    aria-pressed={isPicked}
                    disabled={choice?.verdict === 'ok' && !isPicked}
                  >
                    <span className="itr-choice__mark" aria-hidden="true">
                      {isPicked ? <Icon size={15} /> : String.fromCharCode(65 + k)}
                    </span>
                    <span>{c.label}</span>
                  </button>
                )
              })}
            </div>
            <AnimatePresence initial={false}>
              {choice && (
                <motion.div
                  key={picked}
                  className={`itr-feedback is-${choice.verdict}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={fade}
                  aria-live="polite"
                >
                  <p>
                    <b>{VERDICT_LABEL[choice.verdict]}.</b> {choice.feedback}
                  </p>
                  {choice.verdict === 'ok' ? (
                    <button type="button" className="btn btn--line" onClick={advance}>
                      {at === STEPS.length - 1 ? 'Ver el resumen' : 'Siguiente momento'} <ArrowRight size={15} />
                    </button>
                  ) : (
                    <p className="itr-feedback__retry">Elige otra opción.</p>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        )}
      </AnimatePresence>
    </WidgetFrame>
  )
}
