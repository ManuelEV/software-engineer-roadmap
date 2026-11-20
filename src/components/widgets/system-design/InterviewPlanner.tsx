import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { Segmented, WidgetFrame } from '../kit'
import { EASE, useTicker } from './shared'
import './InterviewPlanner.css'

type Level = 'mid' | 'senior' | 'staff'
type PhaseId = 'intro' | 'req' | 'ent' | 'api' | 'hld' | 'deep' | 'wrap'

type Phase = {
  id: PhaseId
  label: string
  short: string
  goal: string
  output: string
  mistake: string
}

const PHASES: Phase[] = [
  {
    id: 'intro',
    label: 'Presentación',
    short: 'Intro',
    goal: 'Saludo, tu experiencia en una frase y el enunciado del problema. No es tiempo tuyo de diseño.',
    output: 'Nada en la pizarra todavía.',
    mistake: 'Contar tu carrera completa: cada minuto aquí sale de las profundizaciones.',
  },
  {
    id: 'req',
    label: 'Requisitos',
    short: 'Req.',
    goal: 'Acotar el problema: 3 requisitos funcionales prioritarios, 3–5 no funcionales cuantificados y lo que queda fuera.',
    output: 'Dos listas cortas: «los usuarios pueden…» y «el sistema debe…» (con números: p99, DAU, disponibilidad).',
    mistake: 'Aceptar requisitos vagos («que escale») o listar 12 features sin priorizar.',
  },
  {
    id: 'ent',
    label: 'Entidades',
    short: 'Ent.',
    goal: 'Nombrar los sustantivos centrales del dominio. Es un primer borrador que vas a refinar.',
    output: 'Lista: Usuario, Puntaje, Partida… sin todos los campos todavía.',
    mistake: 'Diseñar el esquema completo de la base de datos antes de saber cómo se usa.',
  },
  {
    id: 'api',
    label: 'API',
    short: 'API',
    goal: 'El contrato con el cliente: un endpoint por requisito funcional. REST por defecto salvo que haya razón.',
    output: 'POST /scores, GET /leaderboard?limit=10 … con el usuario sacado del token, no del body.',
    mistake: 'Hacer estimaciones largas aquí que no cambian ninguna decisión.',
  },
  {
    id: 'hld',
    label: 'Diseño de alto nivel',
    short: 'Diseño',
    goal: 'Un diseño que funciona de punta a punta: recorre cada endpoint por las cajas y explica qué estado cambia.',
    output: 'Cliente → gateway → servicios → almacenamiento, con los campos relevantes de cada tabla.',
    mistake: 'Optimizar antes de tener algo que funcione, o quedarte sin tiempo sin haber cubierto todos los requisitos.',
  },
  {
    id: 'deep',
    label: 'Profundizaciones',
    short: 'Deep',
    goal: 'Endurecer el diseño contra los no funcionales: cuellos de botella, fallas, consistencia, escala del caso más caliente.',
    output: '2–3 problemas difíciles resueltos con trade-offs explícitos y números.',
    mistake: 'Recitar tecnologías («pongo Kafka») sin decir qué problema resuelven ni qué cuestan.',
  },
  {
    id: 'wrap',
    label: 'Cierre y preguntas',
    short: 'Cierre',
    goal: 'Resumir decisiones y riesgos abiertos; luego tus preguntas al entrevistador.',
    output: 'Qué harías con más tiempo, qué monitorearías.',
    mistake: 'Llegar al final sin aire y sin un resumen: la última impresión cuenta.',
  },
]

/** Minutes per phase by level (orientative split of a 45-minute round). */
const PLAN: Record<Level, Record<PhaseId, number>> = {
  mid: { intro: 3, req: 6, ent: 2, api: 5, hld: 17, deep: 9, wrap: 3 },
  senior: { intro: 3, req: 5, ent: 2, api: 4, hld: 14, deep: 14, wrap: 3 },
  staff: { intro: 2, req: 6, ent: 1, api: 3, hld: 11, deep: 19, wrap: 3 },
}

const LEAD: Record<Level, Partial<Record<PhaseId, string>>> = {
  mid: {
    req: 'Tú lideras. Se espera que hagas buenas preguntas.',
    hld: 'Tú lideras. Lo crítico es entregar un diseño que funcione completo.',
    deep: 'El entrevistador suele guiar: señala un problema y espera que razones una solución sólida.',
  },
  senior: {
    req: 'Tú lideras y vas rápido por lo obvio.',
    hld: 'Tú lideras; marcas dónde vas a volver («aquí habrá un hot key, lo vemos luego»).',
    deep: 'Tú propones dónde profundizar (≈2 áreas) con detalle de experiencia real.',
  },
  staff: {
    req: 'Tú lideras e identificas el núcleo difícil del problema desde el inicio.',
    hld: 'Lo más simple que cumple; cada complejidad extra se justifica.',
    deep: 'Lideras casi toda la conversación como un par: profundidad en varias áreas, decides en vez de listar opciones.',
  },
}

const TOTAL = 45
const W = 640
const X0 = 24
const X1 = W - 24
const Y = 46

export function InterviewPlanner() {
  const reduced = useReducedMotion()
  const [level, setLevel] = useState<Level>('senior')
  const [sel, setSel] = useState<PhaseId>('req')
  const [clock, setClock] = useState(0)
  const [playing, setPlaying] = useState(false)

  const plan = PLAN[level]
  let acc = 0
  const spans = PHASES.map((p) => {
    const start = acc
    acc += plan[p.id]
    return { ...p, start, end: acc, min: plan[p.id] }
  })
  const xOf = (m: number) => X0 + (m / TOTAL) * (X1 - X0)
  const current = spans.find((s) => clock >= s.start && clock < s.end) ?? spans[spans.length - 1]
  const selected = spans.find((s) => s.id === sel)!

  useTicker(
    () => {
      setClock((c) => {
        const n = Math.min(TOTAL, c + 0.25)
        if (n >= TOTAL) setPlaying(false)
        const ph = spans.find((s) => n >= s.start && n < s.end)
        if (ph && ph.id !== sel) setSel(ph.id)
        return n
      })
    },
    250,
    playing,
  )

  const mm = Math.floor(clock)
  const ss = Math.round((clock - mm) * 60)

  return (
    <WidgetFrame
      caption={
        <>
          Reparto orientativo de una ronda de 45 minutos según el nivel al que postulas. Toca una etapa para ver qué se
          espera en esa fase; con «Simular» el reloj corre a 1 minuto por segundo.
        </>
      }
      controls={
        <>
          <Segmented
            label="Nivel"
            value={level}
            onChange={setLevel}
            options={[
              { value: 'mid', label: 'Mid' },
              { value: 'senior', label: 'Senior' },
              { value: 'staff', label: 'Staff+' },
            ]}
          />
          <div className="ip__clock">
            <button
              type="button"
              className="btn"
              onClick={() => {
                if (clock >= TOTAL) setClock(0)
                setPlaying((p) => !p)
              }}
              aria-label={playing ? 'Pausar reloj' : 'Simular reloj'}
            >
              {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
              {playing ? 'Pausa' : 'Simular'}
            </button>
            <button
              type="button"
              className="icon-btn"
              onClick={() => {
                setPlaying(false)
                setClock(0)
              }}
              aria-label="Reiniciar reloj"
            >
              <RotateCcw size={18} aria-hidden="true" />
            </button>
            <span className="ip__time" aria-live="off">
              {String(mm).padStart(2, '0')}:{String(ss % 60).padStart(2, '0')} / 45:00
            </span>
          </div>
        </>
      }
      readout={
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={`${level}-${sel}`}
            className="ip__detail"
            initial={{ opacity: 0, y: reduced ? 0 : 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, ease: EASE }}
          >
            <p className="ip__dhead">
              <span className="line-badge">{selected.min} min</span> <b>{selected.label}</b>{' '}
              <span className="ip__range">
                (minuto {selected.start}–{selected.end})
              </span>
            </p>
            <p>
              <b>Objetivo.</b> {selected.goal}
            </p>
            <p>
              <b>En la pizarra.</b> {selected.output}
            </p>
            {LEAD[level][selected.id] && (
              <p>
                <b>Quién lidera.</b> {LEAD[level][selected.id]}
              </p>
            )}
            <p className="ip__mistake">
              <b>Error típico.</b> {selected.mistake}
            </p>
          </motion.div>
        </AnimatePresence>
      }
    >
      <svg className="ip__svg" viewBox={`0 0 ${W} 120`} role="group" aria-label="Línea de tiempo de la entrevista">
        <line x1={X0} y1={Y} x2={X1} y2={Y} className="ip__rail" />
        {spans.map((s) => {
          const on = s.id === sel
          return (
            <motion.line
              key={s.id}
              x1={xOf(s.start)}
              x2={xOf(s.end)}
              y1={Y}
              y2={Y}
              className={`ip__seg ${on ? 'is-on' : ''} ip__seg--${s.id}`}
              initial={false}
              animate={{ x1: xOf(s.start), x2: xOf(s.end) }}
              transition={{ duration: reduced ? 0 : 0.35, ease: EASE }}
            />
          )
        })}
        {clock > 0 && <line x1={X0} x2={xOf(clock)} y1={Y + 14} y2={Y + 14} className="ip__progress" />}
        {spans.map((s, i) => {
          const mid = (xOf(s.start) + xOf(s.end)) / 2
          const on = s.id === sel
          return (
            <g
              key={s.id}
              className={`ip__stop ${on ? 'is-on' : ''} ${current.id === s.id && clock > 0 ? 'is-now' : ''}`}
              role="button"
              tabIndex={0}
              aria-pressed={on}
              aria-label={`${s.label}: ${s.min} minutos`}
              onClick={() => setSel(s.id)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  setSel(s.id)
                }
              }}
            >
              <rect x={mid - 22} y={Y - 28} width={44} height={84} className="ip__hit" />
              <motion.circle
                cx={mid}
                cy={Y}
                r={on ? 9 : 7}
                initial={false}
                animate={{ cx: mid }}
                transition={{ duration: reduced ? 0 : 0.35, ease: EASE }}
                className="ip__dot"
              />
              <motion.text
                x={mid}
                y={i % 2 === 0 ? Y - 16 : Y + 34}
                initial={false}
                animate={{ x: mid }}
                transition={{ duration: reduced ? 0 : 0.35, ease: EASE }}
                textAnchor="middle"
                className="ip__lbl"
              >
                {s.short}
              </motion.text>
              <motion.text
                x={mid}
                y={i % 2 === 0 ? Y - 30 : Y + 50}
                initial={false}
                animate={{ x: mid }}
                transition={{ duration: reduced ? 0 : 0.35, ease: EASE }}
                textAnchor="middle"
                className="ip__min"
              >
                {s.min}′
              </motion.text>
            </g>
          )
        })}
        {[0, 15, 30, 45].map((m) => (
          <text key={m} x={xOf(m)} y={112} textAnchor="middle" className="ip__tick">
            {m} min
          </text>
        ))}
      </svg>
    </WidgetFrame>
  )
}
