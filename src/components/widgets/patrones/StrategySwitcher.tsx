import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Truck, Zap, Store, Globe } from 'lucide-react'
import { WidgetFrame, Slider, Stat } from '../kit'
import { CodeBlock } from '../../mdx/CodeBlock'
import './StrategySwitcher.css'

type Key = 'standard' | 'express' | 'pickup' | 'international'

interface Strat {
  key: Key
  cls: string
  label: string
  Icon: typeof Truck
  eta: string
  cost: (kg: number, km: number) => number | null
  code: string
}

const strategies: Strat[] = [
  {
    key: 'standard',
    cls: 'StandardShipping',
    label: 'Estándar',
    Icon: Truck,
    eta: '3–5 días',
    cost: (kg, km) => 4.99 + 0.5 * kg + 0.002 * km,
    code: `class StandardShipping implements ShippingStrategy {
  cost(o: Order): number {
    return 4.99 + 0.5 * o.weightKg + 0.002 * o.distanceKm
  }
}`,
  },
  {
    key: 'express',
    cls: 'ExpressShipping',
    label: 'Express',
    Icon: Zap,
    eta: '24 h',
    cost: (kg, km) => 9.99 + 1.2 * kg + 0.006 * km,
    code: `class ExpressShipping implements ShippingStrategy {
  cost(o: Order): number {
    return 9.99 + 1.2 * o.weightKg + 0.006 * o.distanceKm
  }
}`,
  },
  {
    key: 'pickup',
    cls: 'StorePickup',
    label: 'Retiro en tienda',
    Icon: Store,
    eta: 'hoy',
    cost: (kg) => (kg > 20 ? null : 0),
    code: `class StorePickup implements ShippingStrategy {
  cost(o: Order): number {
    if (o.weightKg > 20) throw new NotAvailable('máx. 20 kg')
    return 0
  }
}`,
  },
  {
    key: 'international',
    cls: 'InternationalShipping',
    label: 'Internacional',
    Icon: Globe,
    eta: '7–14 días',
    cost: (kg, km) => 24.99 + 2.5 * kg + 0.01 * km,
    code: `class InternationalShipping implements ShippingStrategy {
  cost(o: Order): number {
    return 24.99 + 2.5 * o.weightKg + 0.01 * o.distanceKm
  }
}`,
  },
]

export function StrategySwitcher() {
  const [key, setKey] = useState<Key>('standard')
  const [kg, setKg] = useState(3)
  const [km, setKm] = useState(400)
  const reduced = useReducedMotion()
  const s = strategies.find((x) => x.key === key)!
  const cost = s.cost(kg, km)

  return (
    <WidgetFrame
      caption="El checkout (contexto) no cambia: solo cambia el objeto estrategia que le inyectas. Elige una estrategia y mueve el peso y la distancia."
      controls={
        <>
          <Slider label="Peso del pedido" value={kg} min={0.5} max={30} step={0.5} onChange={setKg} format={(v) => `${v} kg`} />
          <Slider label="Distancia" value={km} min={5} max={3000} step={5} onChange={setKm} format={(v) => `${v} km`} />
        </>
      }
      readout={
        <div className="ss-readout">
          <Stat label="Costo de envío" value={cost === null ? 'n/d' : `$${cost.toFixed(2)}`} tone={cost === null ? 'bad' : undefined} hint={cost === null ? 'Retiro solo hasta 20 kg' : undefined} />
          <Stat label="Entrega" value={s.eta} />
          <p className="ss-readout__text">
            <code>checkout.shippingCost()</code> delega en <code>{s.cls}.cost()</code>. Agregar una quinta opción es crear
            una clase nueva, sin tocar <code>Checkout</code>.
          </p>
        </div>
      }
    >
      <div className="ss-board">
        <div className="ss-context" aria-hidden="true">
          <span className="ss-context__name">Checkout</span>
          <span className="ss-context__field">strategy: ShippingStrategy</span>
          <span className="ss-context__arrow">→ {s.cls}</span>
        </div>
        <div className="ss-options" role="radiogroup" aria-label="Estrategia de envío">
          {strategies.map((x) => {
            const on = x.key === key
            const c = x.cost(kg, km)
            return (
              <button
                key={x.key}
                type="button"
                role="radio"
                aria-checked={on}
                className={`ss-opt ${on ? 'is-on' : ''} ${c === null ? 'is-na' : ''}`}
                onClick={() => setKey(x.key)}
              >
                <x.Icon size={18} aria-hidden="true" />
                <span className="ss-opt__label">{x.label}</span>
                <span className="ss-opt__cls">{x.cls}</span>
                <span className="ss-opt__cost">{c === null ? 'no disponible' : `$${c.toFixed(2)}`}</span>
              </button>
            )
          })}
        </div>
      </div>
      <motion.div
        key={key}
        className="ss-code"
        initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
      >
        <CodeBlock code={s.code} lang="ts" bare />
      </motion.div>
    </WidgetFrame>
  )
}
