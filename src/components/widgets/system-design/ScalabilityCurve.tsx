import { useState } from 'react'
import { Slider, Stat, WidgetFrame } from '../kit'
import { fmt } from './shared'
import './ScalabilityCurve.css'

const NMAX = 64
const W = 560
const H = 300
const L = 46
const R = 16
const T = 16
const B = 40

/** Universal Scalability Law (Gunther): relative capacity with N nodes. */
const usl = (n: number, a: number, b: number) => n / (1 + a * (n - 1) + b * n * (n - 1))

const PRESETS = [
  { id: 'ideal', label: 'Stateless puro', a: 0.01, b: 0 },
  { id: 'lock', label: 'BD compartida', a: 0.08, b: 0 },
  { id: 'chatty', label: 'Coordinación entre nodos', a: 0.03, b: 0.0015 },
]

export function ScalabilityCurve() {
  const [a, setA] = useState(0.03)
  const [b, setB] = useState(0.0015)
  const [n, setN] = useState(16)

  const peakN = b > 0 ? Math.sqrt((1 - a) / b) : Infinity
  const ys = Array.from({ length: NMAX }, (_, i) => usl(i + 1, a, b))
  const amdahl = Array.from({ length: NMAX }, (_, i) => usl(i + 1, a, 0))
  const yMax = Math.max(8, Math.max(...ys, ...amdahl) * 1.15)
  const x = (v: number) => L + ((v - 1) / (NMAX - 1)) * (W - L - R)
  const y = (v: number) => H - B - (Math.min(v, yMax) / yMax) * (H - T - B)
  const path = (arr: number[]) => arr.map((v, i) => `${i ? 'L' : 'M'}${x(i + 1).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const idealEnd = Math.min(NMAX, yMax)
  const cur = usl(n, a, b)
  const yTicks = [0, 0.25, 0.5, 0.75, 1].map((f) => Math.round(f * yMax))

  return (
    <WidgetFrame
      caption={
        <>
          Ley de escalabilidad universal (Neil Gunther): con <i>N</i> nodos, la capacidad relativa es N / (1 + α(N−1) + βN(N−1)).
          α es la contención (esperar un recurso compartido) y β la coherencia (nodos que tienen que ponerse de acuerdo entre
          sí). Con β = 0 obtienes la ley de Amdahl.
        </>
      }
      controls={
        <>
          <div className="usl__presets" role="group" aria-label="Escenarios">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className={`btn ${a === p.a && b === p.b ? 'btn--line' : ''}`}
                aria-pressed={a === p.a && b === p.b}
                onClick={() => {
                  setA(p.a)
                  setB(p.b)
                }}
              >
                {p.label}
              </button>
            ))}
          </div>
          <Slider label="α contención" value={a} min={0} max={0.2} step={0.005} onChange={setA} format={(v) => fmt(v, 3)} />
          <Slider label="β coherencia" value={b} min={0} max={0.01} step={0.0005} onChange={setB} format={(v) => fmt(v, 4)} />
          <Slider label="Nodos" value={n} min={1} max={NMAX} onChange={setN} />
        </>
      }
      readout={
        <div className="usl__stats">
          <Stat label={`Capacidad con ${n} nodos`} value={`${fmt(cur, 1)}×`} hint={`ideal: ${n}× · eficiencia ${fmt((cur / n) * 100, 0)} %`} />
          <Stat
            label="Pico de capacidad"
            value={Number.isFinite(peakN) ? `N ≈ ${fmt(peakN, 0)}` : 'sin pico'}
            hint={Number.isFinite(peakN) ? `máximo ${fmt(usl(Math.round(peakN), a, b), 1)}×; agregar nodos después empeora` : a > 0 ? `techo asintótico ${fmt(1 / a, 0)}×` : 'escala lineal'}
            tone={Number.isFinite(peakN) && peakN < NMAX ? 'warn' : undefined}
          />
        </div>
      }
    >
      <svg className="usl__svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Curva de capacidad: con ${n} nodos se obtiene ${fmt(cur, 1)} veces la capacidad de uno`}>
        {yTicks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} className="usl__grid" />
            <text x={L - 8} y={y(t) + 4} textAnchor="end" className="usl__tick">
              {t}×
            </text>
          </g>
        ))}
        {[1, 16, 32, 48, 64].map((t) => (
          <text key={t} x={x(t)} y={H - B + 20} textAnchor="middle" className="usl__tick">
            {t}
          </text>
        ))}
        <text x={(L + W - R) / 2} y={H - 4} textAnchor="middle" className="usl__axis">
          nodos (N)
        </text>
        <line x1={x(1)} y1={y(1)} x2={x(idealEnd)} y2={y(idealEnd)} className="usl__ideal" />
        <text x={x(idealEnd) - 4} y={y(idealEnd) + 16} textAnchor="end" className="usl__lbl usl__lbl--ideal">
          lineal ideal
        </text>
        {b > 0 && <path d={path(amdahl)} className="usl__amdahl" />}
        <path d={path(ys)} className="usl__curve" />
        {Number.isFinite(peakN) && peakN <= NMAX && (
          <g>
            <line x1={x(peakN)} x2={x(peakN)} y1={T} y2={H - B} className="usl__peak" />
            <text x={x(peakN) + 6} y={T + 14} className="usl__lbl">
              pico
            </text>
          </g>
        )}
        <line x1={x(n)} x2={x(n)} y1={y(cur)} y2={H - B} className="usl__cursor" />
        <circle cx={x(n)} cy={y(cur)} r={7} className="usl__dot" />
        {b > 0 && (
          <text x={x(NMAX) - 4} y={y(amdahl[NMAX - 1]) - 8} textAnchor="end" className="usl__lbl usl__lbl--muted">
            Amdahl (β = 0)
          </text>
        )}
      </svg>
    </WidgetFrame>
  )
}
