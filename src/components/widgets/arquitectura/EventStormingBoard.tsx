import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Segmented, WidgetFrame } from '../kit'
import { useReduced, useTransition } from './shared'
import './EventStormingBoard.css'

type Kind = 'event' | 'command' | 'actor' | 'system' | 'policy' | 'read' | 'aggregate' | 'hotspot'
type Phase = '1' | '2' | '3' | '4' | '5' | '6'

const KIND: Record<Kind, { label: string; minPhase: number }> = {
  event: { label: 'Evento de dominio', minPhase: 1 },
  hotspot: { label: 'Hotspot', minPhase: 3 },
  command: { label: 'Comando', minPhase: 4 },
  actor: { label: 'Actor', minPhase: 4 },
  system: { label: 'Sistema externo', minPhase: 4 },
  policy: { label: 'Política', minPhase: 5 },
  read: { label: 'Modelo de lectura', minPhase: 5 },
  aggregate: { label: 'Agregado', minPhase: 6 },
}

interface Sticky {
  id: string
  kind: Kind
  text: string
  pivotal?: boolean
}

interface Column {
  id: string
  context: string
  stickies: Sticky[]
}

const COLUMNS: Column[] = [
  {
    id: 'c1',
    context: 'Ventas',
    stickies: [
      { id: 'r1', kind: 'read', text: 'Resumen del carrito' },
      { id: 'a1', kind: 'actor', text: 'Cliente' },
      { id: 'k1', kind: 'command', text: 'Confirmar pedido' },
      { id: 'g1', kind: 'aggregate', text: 'Pedido' },
      { id: 'e1', kind: 'event', text: 'Pedido realizado', pivotal: true },
      { id: 'h1', kind: 'hotspot', text: '¿"Creado" o "realizado"? Ventas y Logística usan palabras distintas' },
    ],
  },
  {
    id: 'c2',
    context: 'Pagos',
    stickies: [
      { id: 'p2', kind: 'policy', text: 'Cuando se realiza un pedido, cobrar' },
      { id: 'k2', kind: 'command', text: 'Autorizar pago' },
      { id: 's2', kind: 'system', text: 'Pasarela de pagos' },
      { id: 'e2', kind: 'event', text: 'Pago autorizado' },
      { id: 'h2', kind: 'hotspot', text: '¿Qué pasa si el pago se rechaza?' },
    ],
  },
  {
    id: 'c3',
    context: 'Inventario',
    stickies: [
      { id: 'p3', kind: 'policy', text: 'Cuando se autoriza el pago, reservar stock' },
      { id: 'k3', kind: 'command', text: 'Reservar stock' },
      { id: 'g3', kind: 'aggregate', text: 'Existencias' },
      { id: 'e3', kind: 'event', text: 'Stock reservado' },
      { id: 'h3', kind: 'hotspot', text: '¿Reservamos antes o después de cobrar?' },
    ],
  },
  {
    id: 'c4',
    context: 'Logística',
    stickies: [
      { id: 'r4', kind: 'read', text: 'Pedidos por despachar' },
      { id: 'a4', kind: 'actor', text: 'Bodeguero' },
      { id: 'k4', kind: 'command', text: 'Despachar pedido' },
      { id: 'g4', kind: 'aggregate', text: 'Envío' },
      { id: 'e4', kind: 'event', text: 'Pedido despachado', pivotal: true },
    ],
  },
  {
    id: 'c5',
    context: 'Logística',
    stickies: [
      { id: 's5', kind: 'system', text: 'Transportista' },
      { id: 'e5', kind: 'event', text: 'Pedido entregado' },
      { id: 'p5', kind: 'policy', text: 'Cuando se entrega, pedir reseña' },
    ],
  },
]

/** Phase 1: events written in parallel by different people, unordered, with a duplicate. */
const CHAOS: { id: string; text: string; rot: number }[] = [
  { id: 'x4', text: 'Pedido despachado', rot: -3 },
  { id: 'x2', text: 'Pago autorizado', rot: 2 },
  { id: 'x1b', text: 'Pedido creado', rot: -1.5 },
  { id: 'x5', text: 'Pedido entregado', rot: 3 },
  { id: 'x1', text: 'Pedido realizado', rot: -2.5 },
  { id: 'x3', text: 'Stock reservado', rot: 1.5 },
]

const PHASES: { value: Phase; label: string; title: string; body: string }[] = [
  { value: '1', label: '1 Caos', title: 'Exploración caótica', body: 'Cada persona escribe en naranja los eventos de dominio que conoce, en pasado, sin discutir y sin orden. Aparecen duplicados y sinónimos: es buena señal, significa que hay más de un punto de vista.' },
  { value: '2', label: '2 Línea de tiempo', title: 'Imponer la línea de tiempo', body: 'El grupo ordena los eventos de izquierda a derecha, elimina duplicados y marca los eventos pivote (los que cambian de fase el negocio). Aquí surgen las discusiones más valiosas.' },
  { value: '3', label: '3 Hotspots', title: 'Hotspots', body: 'Los conflictos, dudas y dolores se marcan con un sticker de hotspot en lugar de resolverse en el momento. "Creado" vs "realizado" es un problema de lenguaje ubicuo; "¿qué pasa si el pago se rechaza?" es un camino que falta.' },
  { value: '4', label: '4 Comandos', title: 'Comandos, actores y sistemas', body: 'Para cada evento: ¿qué decisión lo provocó (comando, azul), quién la tomó (actor, amarillo pequeño) o qué sistema externo participa (rosa)?' },
  { value: '5', label: '5 Políticas', title: 'Políticas y modelos de lectura', body: 'Las políticas (lila) son reglas reactivas: "cuando pasa X, hacemos Y". Los modelos de lectura (verde) son la información que un actor necesita para decidir. Las políticas automáticas son candidatas a sagas o handlers de eventos.' },
  { value: '6', label: '6 Contextos', title: 'Agregados y bounded contexts', body: 'Los comandos y eventos se agrupan alrededor de lo que hace cumplir las reglas (agregados, amarillo pálido; el glosario actual los llama "constraints"). Los cambios de lenguaje y de responsable revelan fronteras de bounded contexts candidatas.' },
]

const ORDER: Kind[] = ['read', 'actor', 'system', 'policy', 'command', 'aggregate', 'event', 'hotspot']

export function EventStormingBoard() {
  const [phase, setPhase] = useState<Phase>('1')
  const t = useTransition(0.3)
  const reduced = useReduced()
  const n = Number(phase)
  const info = PHASES[n - 1]

  // group contiguous columns that share a context (for phase 6)
  const groups: { context: string; cols: Column[] }[] = []
  for (const c of COLUMNS) {
    const last = groups[groups.length - 1]
    if (last && last.context === c.context) last.cols.push(c)
    else groups.push({ context: c.context, cols: [c] })
  }

  return (
    <WidgetFrame
      caption="Un Event Storming de nivel proceso para el flujo de un pedido, fase por fase. Los colores siguen la notación de Alberto Brandolini; usa la barra horizontal del tablero si no ves todas las columnas."
      controls={
        <Segmented<Phase> label="Fase" value={phase} onChange={setPhase} options={PHASES.map((p) => ({ value: p.value, label: p.label }))} />
      }
      readout={
        <div className="es-readout">
          <p aria-live="polite">
            <b>{info.title}.</b> {info.body}
          </p>
          <ul className="es-legend" aria-label="Leyenda">
            {(Object.keys(KIND) as Kind[])
              .filter((k) => KIND[k].minPhase <= Math.max(n, 1))
              .map((k) => (
                <li key={k}>
                  <span className={`es-swatch es-k-${k}`} aria-hidden="true" />
                  {KIND[k].label}
                </li>
              ))}
          </ul>
        </div>
      }
    >
      <div className="es-scroll" tabIndex={0} aria-label="Tablero de Event Storming">
        <AnimatePresence mode="wait" initial={false}>
          {n === 1 ? (
            <motion.div key="chaos" className="es-chaos" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={t}>
              {CHAOS.map((s) => (
                <div key={s.id} className="es-sticky es-k-event" style={{ rotate: reduced ? '0deg' : `${s.rot}deg` }}>
                  {s.text}
                </div>
              ))}
            </motion.div>
          ) : (
            <motion.div key="board" className="es-board" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={t}>
              <div className="es-timeline" aria-hidden="true">
                <span>tiempo</span>
              </div>
              <div className="es-groups">
                {groups.map((g, gi) => (
                  <div key={gi} className={`es-group ${n >= 6 ? 'is-ctx' : ''}`} style={{ ['--es-span' as string]: g.cols.length }}>
                    {n >= 6 && <span className="es-group__label">{g.context}</span>}
                    <div className="es-cols">
                      {g.cols.map((c) => (
                        <div key={c.id} className="es-col">
                          <AnimatePresence initial={false}>
                            {[...c.stickies]
                              .sort((a, b) => ORDER.indexOf(a.kind) - ORDER.indexOf(b.kind))
                              .filter((s) => KIND[s.kind].minPhase <= n)
                              .map((s) => (
                                <motion.div
                                  key={s.id}
                                  className={`es-sticky es-k-${s.kind} ${s.pivotal ? 'is-pivotal' : ''}`}
                                  initial={{ opacity: 0 }}
                                  animate={{ opacity: 1 }}
                                  exit={{ opacity: 0 }}
                                  transition={t}
                                  title={KIND[s.kind].label}
                                >
                                  <span className="visually-hidden">{KIND[s.kind].label}: </span>
                                  {s.text}
                                  {s.pivotal && <span className="es-pivot">pivote</span>}
                                </motion.div>
                              ))}
                          </AnimatePresence>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </WidgetFrame>
  )
}
