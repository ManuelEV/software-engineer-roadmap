import { useState } from 'react'
import { Slider, Stat, WidgetFrame } from '../kit'
import { fmt, fmtBps, fmtBytes, fmtCount } from './shared'
import './BackOfEnvelope.css'

type Inputs = {
  /** log10 of daily active users */
  dauExp: number
  /** log10 of writes per user per day */
  writesExp: number
  /** log10 of reads per write */
  ratioExp: number
  /** log10 of bytes per write */
  sizeExp: number
  years: number
  peak: number
  replicas: number
  /** log10 of requests/s one server handles */
  capExp: number
}

const PRESETS: { id: string; label: string; v: Inputs; note: string }[] = [
  {
    id: 'tweets',
    label: 'Tuits (ejemplo de Alex Xu)',
    note: '150 M DAU, 2 tuits/día, 10 % con 1 MB de media → ~100 KB promedio. Reproduce los ~3.500 QPS, ~30 TB/día y ~55 PB en 5 años del libro.',
    v: { dauExp: Math.log10(150e6), writesExp: Math.log10(2), ratioExp: Math.log10(50), sizeExp: 5, years: 5, peak: 2, replicas: 1, capExp: 3 },
  },
  {
    id: 'short',
    label: 'Acortador de URLs',
    note: '100 M URLs nuevas al día, 10 lecturas por escritura, ~100 B por registro, 10 años (supuestos del capítulo de Alex Xu).',
    v: { dauExp: 8, writesExp: 0, ratioExp: 1, sizeExp: 2, years: 10, peak: 2, replicas: 1, capExp: 3.5 },
  },
  {
    id: 'chat',
    label: 'Chat 1 a 1',
    note: 'Supuesto: 50 M DAU que envían 40 mensajes de ~1 KB al día; cada mensaje se lee ~1 vez; 3 réplicas.',
    v: { dauExp: Math.log10(50e6), writesExp: Math.log10(40), ratioExp: 0, sizeExp: 3, years: 3, peak: 3, replicas: 3, capExp: 3.5 },
  },
]

const DAY = 86_400

export function BackOfEnvelope() {
  const [v, setV] = useState<Inputs>(PRESETS[0].v)
  const [preset, setPreset] = useState<string | null>(PRESETS[0].id)
  const set = (k: keyof Inputs) => (n: number) => {
    setPreset(null)
    setV((o) => ({ ...o, [k]: n }))
  }

  const dau = 10 ** v.dauExp
  const writes = 10 ** v.writesExp
  const ratio = 10 ** v.ratioExp
  const size = 10 ** v.sizeExp
  const cap = 10 ** v.capExp

  const writesDay = dau * writes
  const wQps = writesDay / DAY
  const rQps = wQps * ratio
  const peakQps = (wQps + rQps) * v.peak
  const perDay = writesDay * size
  const total = perDay * 365 * v.years * v.replicas
  const ingress = wQps * size * 8
  const egress = rQps * size * 8
  const servers = Math.max(1, Math.ceil(peakQps / cap))
  const activePreset = PRESETS.find((p) => p.id === preset)

  return (
    <WidgetFrame
      caption={
        <>
          Mueve los supuestos y mira cómo cambian los resultados. Las fórmulas de abajo muestran cada cálculo con tus números:
          eso es lo que se dice en voz alta en la entrevista.
        </>
      }
      controls={
        <div className="boe__presets" role="group" aria-label="Ejemplos precargados">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className={`btn ${preset === p.id ? 'btn--line' : ''}`}
              aria-pressed={preset === p.id}
              onClick={() => {
                setPreset(p.id)
                setV(p.v)
              }}
            >
              {p.label}
            </button>
          ))}
        </div>
      }
      readout={
        <div className="boe__math">
          {activePreset && <p className="boe__note">{activePreset.note}</p>}
          <p>
            <b>QPS de escritura</b> = {fmtCount(dau)} usuarios × {fmt(writes, 2)} escrituras/día ÷ 86.400 s ≈{' '}
            <b>{fmtCount(wQps)}/s</b>
            <span className="boe__hint"> (atajo: 1 día ≈ 10⁵ s, así que 1 M/día ≈ 12/s)</span>
          </p>
          <p>
            <b>QPS de lectura</b> = {fmtCount(wQps)} × {fmt(ratio, 0)} lecturas por escritura ≈ <b>{fmtCount(rQps)}/s</b>
          </p>
          <p>
            <b>Pico</b> = ({fmtCount(wQps)} + {fmtCount(rQps)}) × {fmt(v.peak)} ≈ <b>{fmtCount(peakQps)}/s</b>
          </p>
          <p>
            <b>Almacenamiento</b> = {fmtCount(writesDay)} escrituras/día × {fmtBytes(size)} = {fmtBytes(perDay)}/día; × 365 ×{' '}
            {v.years} años × {v.replicas} {v.replicas === 1 ? 'copia' : 'réplicas'} ≈ <b>{fmtBytes(total)}</b>
          </p>
          <p>
            <b>Ancho de banda</b>: entrada = {fmtCount(wQps)}/s × {fmtBytes(size)} × 8 ≈ <b>{fmtBps(ingress)}</b>; salida (si cada
            lectura devuelve un objeto completo) ≈ <b>{fmtBps(egress)}</b>
          </p>
          <p>
            <b>Servidores</b> = {fmtCount(peakQps)}/s ÷ {fmtCount(cap)}/s por servidor ≈ <b>{servers}</b>, más margen para perder uno
            (N+1) y para desplegar sin bajar capacidad.
          </p>
        </div>
      }
    >
      <div className="boe">
        <div className="boe__inputs">
          <Slider label="Usuarios activos diarios (DAU)" value={v.dauExp} min={4} max={9.3} step={0.05} onChange={set('dauExp')} format={(e) => fmtCount(10 ** e)} />
          <Slider label="Escrituras por usuario al día" value={v.writesExp} min={-2} max={2.5} step={0.05} onChange={set('writesExp')} format={(e) => fmt(10 ** e, 2)} />
          <Slider label="Lecturas por cada escritura" value={v.ratioExp} min={0} max={3} step={0.05} onChange={set('ratioExp')} format={(e) => `${fmt(10 ** e, 0)} : 1`} />
          <Slider label="Tamaño de cada escritura" value={v.sizeExp} min={1} max={7.5} step={0.05} onChange={set('sizeExp')} format={(e) => fmtBytes(10 ** e)} />
          <Slider label="Retención" value={v.years} min={1} max={10} onChange={set('years')} format={(n) => `${n} ${n === 1 ? 'año' : 'años'}`} />
          <Slider label="Factor de pico" value={v.peak} min={1} max={10} step={0.5} onChange={set('peak')} format={(n) => `${fmt(n)}×`} />
          <Slider label="Copias de cada dato" value={v.replicas} min={1} max={5} onChange={set('replicas')} format={(n) => `${n}×`} />
          <Slider label="Peticiones/s por servidor" value={v.capExp} min={2} max={5} step={0.05} onChange={set('capExp')} format={(e) => fmtCount(10 ** e, 1)} />
        </div>
        <div className="boe__out" aria-live="polite">
          <Stat label="Escrituras/s (promedio)" value={fmtCount(wQps)} />
          <Stat label="Lecturas/s (promedio)" value={fmtCount(rQps)} />
          <Stat label="Peticiones/s en pico" value={fmtCount(peakQps)} tone={peakQps > 1e6 ? 'warn' : undefined} />
          <Stat label="Datos nuevos por día" value={fmtBytes(perDay)} />
          <Stat label={`Total en ${v.years} ${v.years === 1 ? 'año' : 'años'}`} value={fmtBytes(total)} tone={total > 1e15 ? 'warn' : undefined} hint={total > 1e15 ? 'escala de petabytes: blob storage y tiering' : undefined} />
          <Stat label="Salida de red" value={fmtBps(egress)} />
          <Stat label="Servidores de app (pico)" value={servers} />
        </div>
      </div>
    </WidgetFrame>
  )
}
