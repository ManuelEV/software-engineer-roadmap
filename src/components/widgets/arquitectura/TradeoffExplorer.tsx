import { useMemo, useState } from 'react'
import { motion } from 'motion/react'
import { Check, RotateCcw } from 'lucide-react'
import { WidgetFrame } from '../kit'
import { useTransition } from './shared'
import './TradeoffExplorer.css'

type Attr = 'perf' | 'scale' | 'avail' | 'consist' | 'simple' | 'cost'

const ATTRS: { id: Attr; label: string }[] = [
  { id: 'perf', label: 'Latencia baja' },
  { id: 'scale', label: 'Escalabilidad' },
  { id: 'avail', label: 'Disponibilidad' },
  { id: 'consist', label: 'Consistencia' },
  { id: 'simple', label: 'Simplicidad' },
  { id: 'cost', label: 'Costo bajo' },
]

interface Decision {
  id: string
  label: string
  effect: Partial<Record<Attr, number>>
  gain: string
  pay: string
}

const DECISIONS: Decision[] = [
  {
    id: 'cache',
    label: 'Cache delante de la base',
    effect: { perf: 2, scale: 1, consist: -1, simple: -1 },
    gain: 'lecturas rápidas y menos carga en la base',
    pay: 'datos potencialmente viejos y la invalidación como nuevo problema',
  },
  {
    id: 'replicas',
    label: 'Réplicas de lectura',
    effect: { scale: 2, avail: 1, consist: -1, cost: -1 },
    gain: 'más capacidad de lectura y tolerancia a la caída de un nodo',
    pay: 'replication lag: puedes leer algo que acabas de escribir y no verlo',
  },
  {
    id: 'async',
    label: 'Cola asíncrona',
    effect: { perf: 1, scale: 1, avail: 1, consist: -1, simple: -1 },
    gain: 'respondes rápido y absorbes picos aunque el consumidor esté caído',
    pay: 'consistencia eventual, reintentos, duplicados y más piezas que operar',
  },
  {
    id: 'micro',
    label: 'Partir en microservicios',
    effect: { perf: -1, scale: 1, consist: -2, simple: -2, cost: -1 },
    gain: 'escalar y desplegar partes por separado',
    pay: 'red entre cada llamada, transacciones distribuidas y operación mucho más cara',
  },
  {
    id: 'sync-multi',
    label: 'Replicación síncrona multi-región',
    effect: { perf: -2, avail: 2, consist: 1, simple: -1, cost: -2 },
    gain: 'sobrevivir a la caída de una región sin perder escrituras',
    pay: 'cada escritura espera un viaje entre regiones y la factura se multiplica',
  },
  {
    id: 'acid',
    label: 'Una base relacional ACID',
    effect: { consist: 2, simple: 2, scale: -1, avail: -1 },
    gain: 'transacciones reales y un solo lugar donde mirar',
    pay: 'un techo de escalado vertical y un punto único de falla si no lo replicas',
  },
]

const MAX = 4

export function TradeoffExplorer() {
  const [on, setOn] = useState<string[]>(['cache'])
  const t = useTransition(0.35)

  const totals = useMemo(() => {
    const acc: Record<Attr, number> = { perf: 0, scale: 0, avail: 0, consist: 0, simple: 0, cost: 0 }
    for (const d of DECISIONS) if (on.includes(d.id)) for (const [k, v] of Object.entries(d.effect)) acc[k as Attr] += v
    return acc
  }, [on])

  const toggle = (id: string) => setOn((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]))
  const active = DECISIONS.filter((d) => on.includes(d.id))

  return (
    <WidgetFrame
      caption="Activa decisiones y mira cómo se mueven los atributos de calidad. No existe la combinación que sube todo: cada mejora se paga en otra columna. Los valores son ordinales e ilustrativos, no mediciones."
      controls={
        <div className="tx-controls">
          <span className="tx-controls__label">Decisiones</span>
          <div className="tx-chips">
            {DECISIONS.map((d) => {
              const isOn = on.includes(d.id)
              return (
                <button
                  key={d.id}
                  type="button"
                  className={`tx-chip ${isOn ? 'is-on' : ''}`}
                  aria-pressed={isOn}
                  onClick={() => toggle(d.id)}
                >
                  {isOn && <Check size={14} strokeWidth={3} aria-hidden="true" />}
                  {d.label}
                </button>
              )
            })}
            <button type="button" className="icon-btn" aria-label="Quitar todas las decisiones" onClick={() => setOn([])}>
              <RotateCcw size={18} />
            </button>
          </div>
        </div>
      }
      readout={
        active.length === 0 ? (
          <p>Sin decisiones activas: el sistema es un punto de partida neutro. Elige una para ver su precio.</p>
        ) : (
          <ul className="tx-list">
            {active.map((d) => (
              <li key={d.id}>
                <b>{d.label}:</b> ganas {d.gain}; pagas con {d.pay}.
              </li>
            ))}
          </ul>
        )
      }
    >
      <div className="tx-bars" role="list" aria-label="Efecto neto por atributo">
        {ATTRS.map((a) => {
          const v = Math.max(-MAX, Math.min(MAX, totals[a.id]))
          const pct = (Math.abs(v) / MAX) * 50
          const tone = v > 0 ? 'is-up' : v < 0 ? 'is-down' : ''
          return (
            <div key={a.id} className="tx-row" role="listitem" aria-label={`${a.label}: ${v > 0 ? '+' : ''}${v}`}>
              <span className="tx-row__label">{a.label}</span>
              <div className="tx-track">
                <span className="tx-track__zero" aria-hidden="true" />
                <motion.span
                  className={`tx-track__bar ${tone}`}
                  initial={false}
                  animate={{ width: `${pct}%`, left: v >= 0 ? '50%' : `${50 - pct}%` }}
                  transition={t}
                />
              </div>
              <span className={`tx-row__val ${tone}`}>
                {v > 0 ? '+' : ''}
                {v}
              </span>
            </div>
          )
        })}
      </div>
    </WidgetFrame>
  )
}
