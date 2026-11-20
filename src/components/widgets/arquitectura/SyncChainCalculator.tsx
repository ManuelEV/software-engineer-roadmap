import { Fragment, useState } from 'react'
import { motion } from 'motion/react'
import { ListOrdered } from 'lucide-react'
import { Segmented, Slider, Stat, WidgetFrame } from '../kit'
import { useTransition } from './shared'
import './SyncChainCalculator.css'

type Mode = 'sync' | 'async'

const MINUTES_PER_MONTH = 30 * 24 * 60

function fmtPct(p: number) {
  return `${(p * 100).toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 3 })} %`
}
function fmtDowntime(min: number) {
  if (min < 60) return `${Math.round(min)} min`
  const h = min / 60
  return `${h.toLocaleString('es', { maximumFractionDigits: 1 })} h`
}

export function SyncChainCalculator() {
  const [n, setN] = useState(5)
  const [avail, setAvail] = useState(99.9)
  const [lat, setLat] = useState(30)
  const [mode, setMode] = useState<Mode>('sync')
  const t = useTransition(0.25)

  const a = avail / 100
  // async: the request only depends on the first service and the broker (assumed equally available)
  const queued = mode === 'async' && n > 1
  const composite = mode === 'sync' ? a ** n : queued ? a * a : a
  // async: first hop plus ~5 ms to enqueue (assumption)
  const latency = mode === 'sync' ? n * lat : queued ? lat + 5 : lat
  const downtime = (1 - composite) * MINUTES_PER_MONTH
  const single = (1 - a) * MINUTES_PER_MONTH

  return (
    <WidgetFrame
      caption="Cada servicio en una cadena de llamadas síncronas multiplica la probabilidad de falla y suma su latencia. Con una cola en medio, la petición del usuario solo depende del primer servicio y del broker; el resto trabaja después. Supuestos: fallas independientes, latencias secuenciales, broker con la misma disponibilidad que un servicio."
      controls={
        <>
          <Segmented<Mode>
            label="Comunicación"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'sync', label: 'Cadena síncrona' },
              { value: 'async', label: 'Con cola' },
            ]}
          />
          <Slider label="Servicios en la cadena" value={n} min={1} max={10} onChange={setN} />
          <Slider label="Disponibilidad de cada uno" value={avail} min={99} max={99.99} step={0.01} onChange={setAvail} format={(v) => `${v.toFixed(2)} %`} />
          <Slider label="Latencia por salto" value={lat} min={5} max={120} step={5} onChange={setLat} format={(v) => `${v} ms`} />
        </>
      }
      readout={
        <div className="sc-stats">
          <Stat label="Disponibilidad para el usuario" value={fmtPct(composite)} tone={composite >= a - 1e-9 ? 'ok' : composite > 0.99 ? 'warn' : 'bad'} />
          <Stat label="Caída esperada al mes" value={fmtDowntime(downtime)} hint={`un servicio solo: ${fmtDowntime(single)}`} tone={downtime > single * 2 ? 'bad' : 'ok'} />
          <Stat label="Latencia percibida" value={`${latency} ms`} hint={queued ? 'primer salto + encolar; el resto, después' : `${mode === 'sync' ? n : 1} salto(s) en serie`} />
        </div>
      }
    >
      <div className="sc-chain" role="img" aria-label={`${n} servicios, ${mode === 'sync' ? 'llamándose en cadena de forma síncrona' : 'desacoplados por una cola después del primero'}`}>
        <div className="sc-node sc-node--user">Usuario</div>
        {Array.from({ length: n }, (_, i) => {
          const decoupled = mode === 'async' && i > 0
          return (
            <Fragment key={i}>
              <motion.span className={`sc-link ${decoupled ? 'is-async' : ''}`} initial={false} animate={{ opacity: 1 }} transition={t} />
              {mode === 'async' && i === 1 && (
                <span className="sc-queue" title="Cola">
                  <ListOrdered size={16} aria-hidden="true" />
                </span>
              )}
              <motion.div className={`sc-node ${decoupled ? 'is-async' : ''}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={t}>
                S{i + 1}
              </motion.div>
            </Fragment>
          )
        })}
      </div>
    </WidgetFrame>
  )
}
