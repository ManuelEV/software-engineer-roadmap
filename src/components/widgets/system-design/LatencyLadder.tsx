import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Segmented, WidgetFrame } from '../kit'
import { EASE, fmt, fmtDuration } from './shared'
import './LatencyLadder.css'

type Cat = 'cpu' | 'disk' | 'net'
type Row = { id: string; label: string; ns: number; cat: Cat; note?: string }

/** Jeff Dean / Peter Norvig, as collected by Jonas Bonér (≈2012). */
const CLASSIC: Row[] = [
  { id: 'l1', label: 'Referencia a caché L1', ns: 0.5, cat: 'cpu' },
  { id: 'branch', label: 'Predicción de salto fallida', ns: 5, cat: 'cpu' },
  { id: 'l2', label: 'Referencia a caché L2', ns: 7, cat: 'cpu' },
  { id: 'mutex', label: 'Lock/unlock de mutex', ns: 25, cat: 'cpu' },
  { id: 'mem', label: 'Referencia a memoria RAM', ns: 100, cat: 'cpu' },
  { id: 'zippy', label: 'Comprimir 1 KB (Zippy)', ns: 3_000, cat: 'cpu' },
  { id: 'net1k', label: 'Enviar 1 KB por red de 1 Gbps', ns: 10_000, cat: 'net' },
  { id: 'ssd4k', label: 'Leer 4 KB al azar de SSD', ns: 150_000, cat: 'disk' },
  { id: 'mem1m', label: 'Leer 1 MB secuencial de RAM', ns: 250_000, cat: 'cpu' },
  { id: 'dc', label: 'Ida y vuelta en el mismo datacenter', ns: 500_000, cat: 'net' },
  { id: 'ssd1m', label: 'Leer 1 MB secuencial de SSD', ns: 1_000_000, cat: 'disk' },
  { id: 'seek', label: 'Seek de disco duro (HDD)', ns: 10_000_000, cat: 'disk' },
  { id: 'hdd1m', label: 'Leer 1 MB secuencial de HDD', ns: 20_000_000, cat: 'disk' },
  { id: 'wan', label: 'Paquete California → Países Bajos → California', ns: 150_000_000, cat: 'net' },
]

/** sirupsen/napkin-math (cloud hardware, valores redondeados por su autor). */
const MODERN: Row[] = [
  { id: 'l1', label: 'Lectura de caché L1 (64 B)', ns: 2, cat: 'cpu' },
  { id: 'l2', label: 'Lectura de caché L2 (64 B)', ns: 5, cat: 'cpu' },
  { id: 'mutex', label: 'Lock + unlock de mutex (sin contención)', ns: 10, cat: 'cpu' },
  { id: 'l3', label: 'Lectura de caché L3 (64 B)', ns: 50, cat: 'cpu' },
  { id: 'syscall', label: 'Llamada al sistema (syscall)', ns: 100, cat: 'cpu' },
  { id: 'mem', label: 'Lectura aleatoria de RAM (64 B)', ns: 150, cat: 'cpu' },
  { id: 'json', label: 'Serializar 256 B (JSON/Protobuf)', ns: 200, cat: 'cpu' },
  { id: 'ctx', label: 'Cambio de contexto de CPU', ns: 1_000, cat: 'cpu' },
  { id: 'zstd', label: 'Comprimir 4 KB (lz4/zstd -1)', ns: 10_000, cat: 'cpu' },
  { id: 'redis', label: 'GET en Redis/Memcached (sin contar red)', ns: 25_000, cat: 'net' },
  { id: 'pk', label: 'Query por clave primaria en Postgres (sin red)', ns: 40_000, cat: 'disk' },
  { id: 'ssd', label: 'Lectura aleatoria de SSD (8 KB)', ns: 200_000, cat: 'disk' },
  { id: 'zone', label: 'Red, misma zona (32 KB)', ns: 250_000, cat: 'net' },
  { id: 'xzone', label: 'Red entre zonas de una región (64 KB)', ns: 1_000_000, cat: 'net' },
  { id: 'ebs', label: 'Lectura de disco de red (8 KB)', ns: 1_000_000, cat: 'disk' },
  { id: 'hdd', label: 'Lectura aleatoria de HDD (256 KB)', ns: 25_000_000, cat: 'disk' },
  { id: 'blob', label: 'Leer 128 KB de blob storage (S3/GCS)', ns: 50_000_000, cat: 'disk' },
  { id: 'cont', label: 'Red entre regiones, mismo continente', ns: 50_000_000, cat: 'net' },
  { id: 'atl', label: 'Red entre regiones, cruzando el Atlántico', ns: 100_000_000, cat: 'net' },
  { id: 'sg', label: 'Red EE. UU. ↔ Singapur', ns: 200_000_000, cat: 'net' },
]

const catLabel: Record<Cat, string> = { cpu: 'CPU / memoria', disk: 'Almacenamiento', net: 'Red' }

const MIN_LOG = -1 // 0.1 ns
const MAX_LOG = 9 // 1 s

function pct(ns: number) {
  const l = Math.log10(ns)
  return Math.max(2, ((l - MIN_LOG) / (MAX_LOG - MIN_LOG)) * 100)
}

function ratio(a: number, b: number) {
  const r = a / b
  if (r >= 1) return `${fmt(r, r < 10 ? 1 : 0)}× más lento`
  return `${fmt(1 / r, 1 / r < 10 ? 1 : 0)}× más rápido`
}

export function LatencyLadder() {
  const reduced = useReducedMotion()
  const [set, setSet] = useState<'classic' | 'modern'>('classic')
  const [scale, setScale] = useState<'real' | 'human'>('real')
  const rows = set === 'classic' ? CLASSIC : MODERN
  const [refId, setRefId] = useState<string>('mem')
  const ref = useMemo(() => rows.find((r) => r.id === refId) ?? rows.find((r) => r.id === 'mem')!, [rows, refId])

  const ticks = ['1 ns', '1 µs', '1 ms', '1 s']
  const tickPos = [0, 3, 6, 9].map((l) => ((l - MIN_LOG) / (MAX_LOG - MIN_LOG)) * 100)

  return (
    <WidgetFrame
      caption={
        <>
          Escala logarítmica: cada marca es 1.000 veces la anterior. Toca una fila para usarla como referencia y comparar.
          Con «Escala humana» cada nanosegundo se convierte en un segundo.
        </>
      }
      controls={
        <>
          <Segmented
            label="Números"
            value={set}
            onChange={setSet}
            options={[
              { value: 'classic', label: 'Clásicos (~2012)' },
              { value: 'modern', label: 'Nube actual' },
            ]}
          />
          <Segmented
            label="Mostrar"
            value={scale}
            onChange={setScale}
            options={[
              { value: 'real', label: 'Tiempo real' },
              { value: 'human', label: 'Escala humana' },
            ]}
          />
        </>
      }
      readout={
        <p>
          Referencia: <b>{ref.label}</b> ({fmtDuration(ref.ns)}
          {scale === 'human' ? ` → ${fmtDuration(ref.ns * 1e9)} a escala humana` : ''}). Fuente:{' '}
          {set === 'classic' ? 'Jeff Dean y Peter Norvig (gist de Jonas Bonér).' : 'sirupsen/napkin-math; «sin contar red» excluye el viaje de ida y vuelta.'}
        </p>
      }
    >
      <div className="ll">
        <div className="ll__legend" aria-hidden="true">
          {(Object.keys(catLabel) as Cat[]).map((c) => (
            <span key={c} className={`ll__key ll__key--${c}`}>
              <i />
              {catLabel[c]}
            </span>
          ))}
        </div>
        <div className="ll__axisrow" aria-hidden="true">
          <span />
          <div className="ll__axis">
            {ticks.map((t, i) => (
              <span key={t} style={{ left: `${tickPos[i]}%` }}>
                {t}
              </span>
            ))}
          </div>
          <span />
        </div>
        <ul className="ll__rows">
          {rows.map((r) => {
            const isRef = r.id === ref.id
            const value = scale === 'human' ? fmtDuration(r.ns * 1e9) : fmtDuration(r.ns)
            return (
              <li key={`${set}-${r.id}`}>
                <button
                  type="button"
                  className={`ll__row ${isRef ? 'is-ref' : ''}`}
                  onClick={() => setRefId(r.id)}
                  aria-pressed={isRef}
                  aria-label={`${r.label}: ${fmtDuration(r.ns)}. ${isRef ? 'Referencia actual' : ratio(r.ns, ref.ns) + ' que la referencia'}`}
                >
                  <span className="ll__label">{r.label}</span>
                  <span className="ll__track">
                    {tickPos.map((p) => (
                      <i key={p} className="ll__grid" style={{ left: `${p}%` }} />
                    ))}
                    <motion.span
                      className={`ll__bar ll__bar--${r.cat}`}
                      initial={reduced ? { opacity: 0 } : { width: 0 }}
                      animate={reduced ? { opacity: 1 } : { width: `${pct(r.ns)}%` }}
                      transition={{ duration: reduced ? 0.2 : 0.4, ease: EASE }}
                      style={reduced ? { width: `${pct(r.ns)}%` } : undefined}
                    />
                  </span>
                  <span className="ll__value">
                    <b>{value}</b>
                    <small>{isRef ? 'referencia' : ratio(r.ns, ref.ns)}</small>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      </div>
    </WidgetFrame>
  )
}
