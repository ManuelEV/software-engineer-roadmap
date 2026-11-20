import { type ReactNode, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ChevronLeft, ChevronRight } from 'lucide-react'
import { WidgetFrame } from '../kit'
import { useMediaQuery } from '../../../lib/hooks'
import './LldBuilder.css'

/**
 * LldBuilder: the low-level design method as a walk-through. The class diagram
 * of a parking lot grows stage by stage (requirements → entities → relations →
 * patterns → extension → concurrency) next to what you would say out loud.
 */

type Kind = 'class' | 'interface' | 'abstract'
type RelKind = 'composes' | 'uses' | 'depends' | 'implements' | 'inherits'

interface Box {
  id: string
  name: string
  kind?: Kind
  /** stage where it appears */
  at: number
  /** member line shown under the name, by stage (the last one whose `from` ≤ stage wins) */
  subs: { from: number; text: string }[]
  /** wide layout (4 columns) and narrow layout (2 columns), in grid cells */
  w: [number, number]
  n: [number, number]
  /** stage where it gets a lock badge */
  lockAt?: number
}

interface Rel {
  from: string
  to: string
  kind: RelKind
  at: number
  label?: string
}

const BOXES: Box[] = [
  { id: 'ticket', name: 'Ticket', at: 1, subs: [{ from: 1, text: 'placa · entrada' }], w: [0, 0], n: [0, 0] },
  { id: 'est', name: 'Estacionamiento', at: 1, subs: [{ from: 1, text: 'entrar() · salir()' }], w: [1, 0], n: [0, 1] },
  { id: 'nivel', name: 'Nivel', at: 1, subs: [{ from: 1, text: 'lugares[]' }], w: [1, 1], n: [0, 2] },
  { id: 'lugar', name: 'Lugar', at: 1, kind: 'abstract', subs: [{ from: 1, text: 'tamaño · libre' }, { from: 5, text: 'ocupar() atómico' }], w: [1, 2], n: [0, 3], lockAt: 5 },
  { id: 'veh', name: 'Vehiculo', at: 1, subs: [{ from: 1, text: 'placa · tipo' }], w: [2, 2], n: [0, 4] },
  { id: 'tarifa', name: 'EstrategiaTarifa', kind: 'interface', at: 3, subs: [{ from: 3, text: 'calcular(ticket)' }], w: [2, 0], n: [1, 1] },
  { id: 'hora', name: 'TarifaPorHora', at: 3, subs: [{ from: 3, text: 'precio por hora' }], w: [3, 0], n: [1, 0] },
  { id: 'asig', name: 'AsignadorLugar', kind: 'interface', at: 3, subs: [{ from: 3, text: 'buscar(vehiculo)' }, { from: 5, text: 'reintenta si falla' }], w: [0, 1], n: [1, 2] },
  { id: 'cerca', name: 'MasCercano', at: 3, subs: [{ from: 3, text: 'primer nivel libre' }], w: [0, 2], n: [1, 3] },
  { id: 'carga', name: 'LugarConCarga', at: 4, subs: [{ from: 4, text: 'kWh entregados' }], w: [2, 1], n: [1, 4] },
]

const RELS: Rel[] = [
  { from: 'est', to: 'ticket', kind: 'uses', at: 2, label: 'emite' },
  { from: 'est', to: 'nivel', kind: 'composes', at: 2, label: '1..*' },
  { from: 'nivel', to: 'lugar', kind: 'composes', at: 2, label: '1..*' },
  { from: 'lugar', to: 'veh', kind: 'uses', at: 2, label: 'ocupa' },
  { from: 'est', to: 'tarifa', kind: 'depends', at: 3 },
  { from: 'hora', to: 'tarifa', kind: 'implements', at: 3 },
  { from: 'est', to: 'asig', kind: 'depends', at: 3 },
  { from: 'cerca', to: 'asig', kind: 'implements', at: 3 },
  { from: 'asig', to: 'nivel', kind: 'depends', at: 3, label: 'recorre' },
  { from: 'carga', to: 'lugar', kind: 'inherits', at: 4 },
]

interface Stage {
  short: string
  title: string
  say: ReactNode
  why: ReactNode
}

const STAGES: Stage[] = [
  {
    short: 'Requisitos',
    title: '1. Requisitos y casos de uso',
    say: '"Antes de dibujar: ¿cuántos niveles?, ¿qué tipos de vehículo y de lugar?, ¿cómo se cobra?, ¿hay varias entradas a la vez? Voy a asumir motos, autos y camionetas, tarifa por hora y dos barreras de entrada."',
    why: 'Cinco minutos de preguntas fijan el alcance. Lo que queda fuera (reservas por app, abonos mensuales) también se dice en voz alta.',
  },
  {
    short: 'Entidades',
    title: '2. Entidades (sustantivos) y comportamientos (verbos)',
    say: '"De los requisitos salen los sustantivos: estacionamiento, nivel, lugar, vehículo, ticket. Los verbos son entrar, salir, ocupar, liberar y cobrar. Estacionamiento es la fachada: expone entrar() y salir()."',
    why: 'No todo sustantivo merece una clase: "barrera" o "pantalla" pueden ser detalles. Lugar es abstracto porque hay tamaños distintos.',
  },
  {
    short: 'Relaciones',
    title: '3. Relaciones',
    say: '"El estacionamiento se compone de niveles y cada nivel de lugares: si borro el nivel, sus lugares no existen solos (composición). El lugar solo apunta al vehículo que lo ocupa: el vehículo vive por su cuenta (asociación)."',
    why: 'La multiplicidad (1..*) y la diferencia entre composición y asociación son lo que el entrevistador mira en el diagrama.',
  },
  {
    short: 'Patrones',
    title: '4. Interfaces y patrones donde ayudan',
    say: '"La tarifa va a cambiar (por hora, nocturna, plana de fin de semana), así que la saco a una interfaz EstrategiaTarifa: Strategy. Lo mismo con la regla para elegir lugar: hoy el más cercano, mañana uno por tipo."',
    why: 'Cada patrón responde a un eje de cambio que nombraste. Si no puedes decir qué varía, el patrón sobra.',
  },
  {
    short: 'Extensión',
    title: '5. Extensión: "¿y si ahora hay motos eléctricas?"',
    say: '"Agrego LugarConCarga, que hereda de Lugar y registra la energía, y una tarifa nueva que suma el kWh. No toco Estacionamiento, Nivel ni el asignador."',
    why: 'Así se ve Open/Closed en la práctica: el cambio entra como una clase nueva y lo existente no se modifica.',
  },
  {
    short: 'Concurrencia',
    title: '6. Concurrencia: "dos autos por el mismo lugar"',
    say: '"Dos barreras pueden elegir el mismo lugar libre. ocupar() tiene que ser atómico: un compare-and-set sobre el estado del lugar, o un lock por nivel. Si falla, el asignador prueba el siguiente."',
    why: 'Nombrar la carrera, la sección crítica y la granularidad del lock (por lugar, por nivel o global) es la señal de nivel senior.',
  },
]

const REQS: { text: ReactNode }[] = [
  { text: <>El <N>estacionamiento</N> tiene varios <N>niveles</N>; cada nivel tiene <N>lugares</N> de tres tamaños.</> },
  { text: <>Un <N>vehículo</N> (moto, auto o camioneta) <V>entra</V> y recibe un <N>ticket</N>.</> },
  { text: <>El sistema <V>asigna</V> un lugar libre del tamaño adecuado (una moto cabe en uno de auto, no al revés).</> },
  { text: <>Al <V>salir</V>, se <V>cobra</V> según el tiempo y se <V>libera</V> el lugar.</> },
  { text: <>Varias barreras de entrada funcionan a la vez.</> },
]

function N({ children }: { children: ReactNode }) {
  return <span className="lld-noun">{children}</span>
}
function V({ children }: { children: ReactNode }) {
  return <span className="lld-verb">{children}</span>
}

const BW = 168
const BH = 62
const PAD = 26

type Pt = { x: number; y: number }

function clip(from: Pt, c: Pt, w: number, h: number): Pt {
  const dx = from.x - c.x
  const dy = from.y - c.y
  if (dx === 0 && dy === 0) return c
  const t = Math.min(dx === 0 ? Infinity : (w / 2 + 3) / Math.abs(dx), dy === 0 ? Infinity : (h / 2 + 3) / Math.abs(dy))
  return { x: c.x + dx * t, y: c.y + dy * t }
}

function edgeShapes(a: Pt, b: Pt, kind: RelKind) {
  const p0 = clip(b, a, BW, BH)
  const p1 = clip(a, b, BW, BH)
  const len = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1
  const d = { x: (p1.x - p0.x) / len, y: (p1.y - p0.y) / len }
  const n = { x: -d.y, y: d.x }
  let start = p0
  let end = p1
  let head = ''
  let tail = ''
  if (kind === 'inherits' || kind === 'implements') {
    const base = { x: p1.x - d.x * 14, y: p1.y - d.y * 14 }
    head = `M${p1.x},${p1.y} L${base.x + n.x * 8},${base.y + n.y * 8} L${base.x - n.x * 8},${base.y - n.y * 8} Z`
    end = base
  } else {
    const back = { x: p1.x - d.x * 11, y: p1.y - d.y * 11 }
    head = `M${back.x + n.x * 6},${back.y + n.y * 6} L${p1.x},${p1.y} L${back.x - n.x * 6},${back.y - n.y * 6}`
  }
  if (kind === 'composes') {
    const m = { x: p0.x + d.x * 12, y: p0.y + d.y * 12 }
    const far = { x: p0.x + d.x * 24, y: p0.y + d.y * 24 }
    tail = `M${p0.x},${p0.y} L${m.x + n.x * 6},${m.y + n.y * 6} L${far.x},${far.y} L${m.x - n.x * 6},${m.y - n.y * 6} Z`
    start = far
  }
  const mid = { x: (p0.x + p1.x) / 2 + n.x * 13, y: (p0.y + p1.y) / 2 + n.y * 13 + 4 }
  // a label on a short, mostly horizontal edge would sit on top of the boxes
  const horizontal = Math.abs(d.x) > Math.abs(d.y)
  return { start, end, head, tail, mid, len, horizontal }
}

export function LldBuilder() {
  const reduced = useReducedMotion()
  const narrow = useMediaQuery('(max-width: 559px)')
  const [stage, setStage] = useState(0)
  const s = STAGES[stage]

  const layout = useMemo(() => {
    const colW = narrow ? 190 : 240
    const rowH = narrow ? 92 : 104
    const pos = new Map<string, Pt>()
    BOXES.forEach((b) => {
      const [gx, gy] = narrow ? b.n : b.w
      pos.set(b.id, { x: gx * colW, y: gy * rowH })
    })
    const xs = [...pos.values()].map((p) => p.x)
    const ys = [...pos.values()].map((p) => p.y)
    const minX = Math.min(...xs) - BW / 2 - PAD
    const minY = Math.min(...ys) - BH / 2 - PAD
    const w = Math.max(...xs) - Math.min(...xs) + BW + PAD * 2
    const h = Math.max(...ys) - Math.min(...ys) + BH + PAD * 2
    return { pos, vb: `${minX} ${minY} ${w} ${h}` }
  }, [narrow])

  const fade = { duration: reduced ? 0.15 : 0.32, ease: [0.16, 1, 0.3, 1] as const }

  return (
    <WidgetFrame
      caption="El método de low-level design aplicado a un estacionamiento. Avanza por las etapas: el diagrama crece con cada decisión y abajo está lo que dirías en voz alta."
      controls={
        <div className="lld-stages" role="group" aria-label="Etapas del método">
          {STAGES.map((st, k) => (
            <button
              key={st.short}
              type="button"
              className={`lld-stage ${k === stage ? 'is-on' : ''} ${k < stage ? 'is-past' : ''}`}
              aria-pressed={k === stage}
              onClick={() => setStage(k)}
            >
              <span className="lld-stage__n">{k + 1}</span>
              {st.short}
            </button>
          ))}
        </div>
      }
      readout={
        <div className="lld-readout" aria-live="polite">
          <p className="lld-readout__title">{s.title}</p>
          <p className="lld-readout__say">
            <span className="hand">lo que dices:</span> {s.say}
          </p>
          <p className="lld-readout__why">
            <b>Por qué:</b> {s.why}
          </p>
        </div>
      }
    >
      <div className="lld-stage-area">
        <AnimatePresence mode="wait" initial={false}>
          {stage === 0 ? (
            <motion.div key="reqs" className="lld-reqs" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={fade}>
              <p className="lld-reqs__head">Requisitos acordados con el entrevistador</p>
              <ol>
                {REQS.map((r, k) => (
                  <li key={k}>{r.text}</li>
                ))}
              </ol>
              <p className="lld-reqs__out">
                <b>Fuera de alcance:</b> reservas por app, abonos mensuales, pagos con tarjeta (el cobro es un número).
              </p>
              <p className="lld-reqs__legend">
                <span className="lld-noun">sustantivo</span> → candidata a clase · <span className="lld-verb">verbo</span> → candidato a método
              </p>
            </motion.div>
          ) : (
            <motion.svg
              key="diagram"
              className="lld-svg"
              viewBox={layout.vb}
              role="img"
              aria-label={`Diagrama de clases del estacionamiento, etapa ${stage + 1}: ${s.short}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={fade}
            >
              {RELS.map((r) => {
                if (r.at > stage) return null
                const a = layout.pos.get(r.from)!
                const b = layout.pos.get(r.to)!
                const e = edgeShapes(a, b, r.kind)
                const fresh = r.at === stage
                const dashed = r.kind === 'implements' || r.kind === 'depends'
                return (
                  <motion.g
                    key={`${r.from}-${r.to}`}
                    className={`lld-edge ${fresh ? 'is-new' : ''}`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={fade}
                  >
                    <line x1={e.start.x} y1={e.start.y} x2={e.end.x} y2={e.end.y} className={`lld-l ${dashed ? 'lld-dash' : ''}`} />
                    <path d={e.head} className={`lld-l ${r.kind === 'implements' || r.kind === 'inherits' ? 'lld-hollow' : ''}`} />
                    {e.tail && <path d={e.tail} className="lld-l lld-filled" />}
                    {r.label && (!e.horizontal || e.len > r.label.length * 7.5 + 10) && (
                      <text x={e.mid.x} y={e.mid.y} textAnchor="middle" className="lld-edge__label">
                        {r.label}
                      </text>
                    )}
                  </motion.g>
                )
              })}
              {BOXES.map((b) => {
                if (b.at > stage) return null
                const p = layout.pos.get(b.id)!
                const fresh = b.at === stage || b.lockAt === stage || (stage === 5 && b.id === 'asig')
                const sub = [...b.subs].reverse().find((x) => x.from <= stage)?.text ?? ''
                const stereo = b.kind === 'interface' ? '«interface»' : b.kind === 'abstract' ? '«abstract»' : null
                const locked = b.lockAt !== undefined && stage >= b.lockAt
                return (
                  <motion.g
                    key={b.id}
                    className={`lld-box kind-${b.kind ?? 'class'} ${fresh ? 'is-new' : ''}`}
                    transform={`translate(${p.x - BW / 2}, ${p.y - BH / 2})`}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={fade}
                  >
                    <rect width={BW} height={BH} rx={7} className="lld-rect" />
                    {stereo && (
                      <text x={BW / 2} y={15} textAnchor="middle" className="lld-stereo">
                        {stereo}
                      </text>
                    )}
                    <text x={BW / 2} y={stereo ? 33 : 25} textAnchor="middle" className="lld-name">
                      {b.name}
                    </text>
                    <text x={BW / 2} y={stereo ? 52 : 47} textAnchor="middle" className="lld-sub">
                      {sub}
                    </text>
                    {locked && (
                      <g className="lld-lock" transform={`translate(${BW - 12}, -10)`} aria-hidden="true">
                        <circle r={13} cx={0} cy={0} className="lld-lock__bg" />
                        <rect x={-6} y={-2} width={12} height={9} rx={2} className="lld-lock__body" />
                        <path d="M-3.5,-2 v-3 a3.5,3.5 0 0 1 7,0 v3" className="lld-lock__arc" />
                      </g>
                    )}
                  </motion.g>
                )
              })}
            </motion.svg>
          )}
        </AnimatePresence>
      </div>
      <div className="lld-nav">
        <button type="button" className="btn" onClick={() => setStage((k) => Math.max(0, k - 1))} disabled={stage === 0}>
          <ChevronLeft size={16} /> Anterior
        </button>
        <span className="lld-nav__count">
          Etapa {stage + 1} <span>/ {STAGES.length}</span>
        </span>
        <button type="button" className="btn btn--line" onClick={() => setStage((k) => Math.min(STAGES.length - 1, k + 1))} disabled={stage === STAGES.length - 1}>
          Siguiente <ChevronRight size={16} />
        </button>
      </div>
    </WidgetFrame>
  )
}
