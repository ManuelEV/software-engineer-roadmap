import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Check, RotateCcw, X } from 'lucide-react'
import { Stat, WidgetFrame } from '../kit'
import { EASE } from './shared'
import './RequirementSorter.css'

type Kind = 'f' | 'nf' | 'out'

const KIND_LABEL: Record<Kind, string> = { f: 'Funcional', nf: 'No funcional', out: 'Fuera de alcance' }

const ITEMS: { id: number; text: string; kind: Kind; why: string }[] = [
  {
    id: 1,
    text: 'Un jugador puede enviar su puntaje al terminar una partida.',
    kind: 'f',
    why: 'Es algo que el usuario hace: «los usuarios pueden…». Se convierte en un endpoint (POST /scores).',
  },
  {
    id: 2,
    text: 'El top 10 global carga en menos de 200 ms (p99).',
    kind: 'nf',
    why: 'Describe una cualidad del sistema (latencia), cuantificada y con percentil. Así debe sonar un no funcional.',
  },
  {
    id: 3,
    text: 'Un jugador puede ver su posición exacta en el ranking.',
    kind: 'f',
    why: 'Funcional, y además es el que vuelve difícil el problema: el rango exacto de 50 M de jugadores no sale de un simple ORDER BY.',
  },
  {
    id: 4,
    text: 'Un puntaje nuevo puede tardar unos segundos en verse en el ranking.',
    kind: 'nf',
    why: 'Es una decisión de consistencia (eventual está bien). Escribirla te habilita a usar réplicas, caché y procesamiento asíncrono.',
  },
  {
    id: 5,
    text: 'Chat entre jugadores de la misma partida.',
    kind: 'out',
    why: 'Es otro producto. Dilo en voz alta: «Asumo que el chat queda fuera; me enfoco en puntajes y ranking». Acotar es una señal positiva.',
  },
  {
    id: 6,
    text: 'Soportar 50 M de jugadores activos al día, con picos al terminar un torneo.',
    kind: 'nf',
    why: 'Escala y forma del tráfico. El «pico al terminar un torneo» es oro: anticipa una ráfaga de escrituras simultáneas.',
  },
  {
    id: 7,
    text: 'Un puntaje confirmado al jugador nunca se pierde.',
    kind: 'nf',
    why: 'Durabilidad. Implica no responder «OK» hasta que el dato esté persistido (o encolado de forma durable).',
  },
  {
    id: 8,
    text: 'Detección de trampas con machine learning.',
    kind: 'out',
    why: 'Importante en la vida real, pero es otro sistema. Menciónalo como riesgo y déjalo fuera; como mucho, valida rangos de puntaje en la API.',
  },
]

export function RequirementSorter() {
  const reduced = useReducedMotion()
  const [answers, setAnswers] = useState<Record<number, Kind>>({})
  const answered = Object.keys(answers).length
  const correct = ITEMS.filter((i) => answers[i.id] === i.kind).length

  return (
    <WidgetFrame
      title="Ejercicio"
      caption={
        <>
          Enunciado: «Diseña el ranking global de un juego móvil». Clasifica cada frase. En la entrevista harías esto en voz
          alta en los primeros cinco minutos.
        </>
      }
      readout={
        <div className="rs__readout">
          <Stat label="Respondidas" value={`${answered}/${ITEMS.length}`} />
          <Stat label="Correctas" value={correct} tone={answered > 0 && correct === answered ? 'ok' : undefined} />
          <button type="button" className="btn btn--ghost" onClick={() => setAnswers({})} disabled={answered === 0}>
            <RotateCcw size={16} aria-hidden="true" /> Reiniciar
          </button>
        </div>
      }
    >
      <ol className="rs">
        {ITEMS.map((it) => {
          const a = answers[it.id]
          const ok = a === it.kind
          return (
            <li key={it.id} className={`rs__item ${a ? (ok ? 'is-ok' : 'is-bad') : ''}`}>
              <p className="rs__text">{it.text}</p>
              <div className="rs__opts" role="group" aria-label={`Clasificar: ${it.text}`}>
                {(Object.keys(KIND_LABEL) as Kind[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    className={`rs__opt ${a === k ? 'is-picked' : ''} ${a && k === it.kind ? 'is-answer' : ''}`}
                    aria-pressed={a === k}
                    onClick={() => setAnswers((o) => ({ ...o, [it.id]: k }))}
                  >
                    {a && k === it.kind && <Check size={14} aria-hidden="true" />}
                    {a === k && k !== it.kind && <X size={14} aria-hidden="true" />}
                    {KIND_LABEL[k]}
                  </button>
                ))}
              </div>
              <AnimatePresence initial={false}>
                {a && (
                  <motion.p
                    className="rs__why"
                    initial={{ opacity: 0, height: reduced ? 'auto' : 0 }}
                    animate={{ opacity: 1, height: 'auto' }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.25, ease: EASE }}
                  >
                    <b>{ok ? 'Correcto.' : `Es «${KIND_LABEL[it.kind]}».`}</b> {it.why}
                  </motion.p>
                )}
              </AnimatePresence>
            </li>
          )
        })}
      </ol>
    </WidgetFrame>
  )
}
