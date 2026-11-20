import { useState } from 'react'
import { Segmented, Slider, Stat, WidgetFrame } from '../kit'
import './QuorumCalculator.css'

type Preset = 'dynamo' | 'fastw' | 'fastr' | 'eventual' | 'custom'

const PRESETS: Record<Exclude<Preset, 'custom'>, { n: number; r: number; w: number }> = {
  dynamo: { n: 3, r: 2, w: 2 },
  fastw: { n: 3, r: 3, w: 1 },
  fastr: { n: 3, r: 1, w: 3 },
  eventual: { n: 3, r: 1, w: 1 },
}

/**
 * Leaderless quorums: choose N, R, W and knock nodes down to see whether
 * reads and writes still succeed and whether read and write sets overlap.
 */
export function QuorumCalculator() {
  const [n, setN] = useState(3)
  const [r, setR] = useState(2)
  const [w, setW] = useState(2)
  const [preset, setPreset] = useState<Preset>('dynamo')
  const [down, setDown] = useState<Set<number>>(new Set())

  const applyPreset = (p: Preset) => {
    setPreset(p)
    if (p === 'custom') return
    const v = PRESETS[p]
    setN(v.n)
    setR(v.r)
    setW(v.w)
    setDown(new Set())
  }
  const setNClamped = (v: number) => {
    setN(v)
    setR((x) => Math.min(x, v))
    setW((x) => Math.min(x, v))
    setDown((d) => new Set([...d].filter((i) => i < v)))
    setPreset('custom')
  }
  const toggle = (i: number) =>
    setDown((d) => {
      const next = new Set(d)
      if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })

  const alive = Array.from({ length: n }, (_, i) => i).filter((i) => !down.has(i))
  const writeOk = alive.length >= w
  const readOk = alive.length >= r
  // write goes to the first W alive replicas, read to the last R alive replicas
  const writeSet = new Set(alive.slice(0, w))
  const readSet = new Set(alive.slice(Math.max(0, alive.length - r)))
  const overlap = [...readSet].filter((i) => writeSet.has(i)).length
  const strict = r + w > n

  const W_ = 360
  const gap = W_ / (n + 1)
  const cx = (i: number) => gap * (i + 1)

  return (
    <WidgetFrame
      caption="Cada escritura va a W réplicas y cada lectura consulta R. Si R + W > N, cualquier conjunto de lectura se cruza con cualquier conjunto de escritura. Toca un nodo para tumbarlo."
      controls={
        <>
          <Segmented
            label="Configuración"
            value={preset}
            onChange={applyPreset}
            options={[
              { value: 'dynamo', label: 'N3 R2 W2' },
              { value: 'fastw', label: 'W1 R3' },
              { value: 'fastr', label: 'R1 W3' },
              { value: 'eventual', label: 'R1 W1' },
              { value: 'custom', label: 'Libre' },
            ]}
          />
          <Slider label="N (réplicas)" value={n} min={2} max={7} onChange={setNClamped} />
          <Slider
            label="W (confirmaciones de escritura)"
            value={w}
            min={1}
            max={n}
            onChange={(v) => {
              setW(v)
              setPreset('custom')
            }}
          />
          <Slider
            label="R (respuestas de lectura)"
            value={r}
            min={1}
            max={n}
            onChange={(v) => {
              setR(v)
              setPreset('custom')
            }}
          />
        </>
      }
      readout={
        <div className="qc-readout">
          <div className="qc-stats">
            <Stat
              label={strict ? 'R + W > N: los conjuntos se cruzan' : 'R + W ≤ N: puede no haber cruce'}
              value={`${r} + ${w} ${strict ? '>' : '≤'} ${n}`}
              tone={strict ? 'ok' : 'warn'}
            />
            <Stat label="fallas toleradas al escribir" value={Math.max(0, n - w)} />
            <Stat label="fallas toleradas al leer" value={Math.max(0, n - r)} />
          </div>
          <p>
            {!writeOk && <b className="qc-bad">Escrituras rechazadas: quedan {alive.length} nodos y W = {w}. </b>}
            {!readOk && <b className="qc-bad">Lecturas rechazadas: quedan {alive.length} nodos y R = {r}. </b>}
            {writeOk && readOk && strict && (
              <>
                La lectura consulta {r} nodos y al menos {Math.max(1, overlap)} tiene la última escritura confirmada; gana la versión más nueva.
              </>
            )}
            {writeOk && readOk && !strict && (
              <>
                {overlap === 0
                  ? 'En este reparto la lectura no toca ningún nodo que recibió la escritura: lees un valor viejo.'
                  : 'Aquí hubo cruce por suerte, pero nada lo garantiza: otra combinación de nodos daría un valor viejo.'}{' '}
                Es consistencia eventual: la réplica se pondrá al día con read repair o anti-entropía.
              </>
            )}
          </p>
          <p className="qc-note">
            Ojo: con <i>sloppy quorum</i> (escribir en nodos fuera de los N "dueños" durante una falla) la garantía de cruce se pierde, y ni siquiera
            un quórum estricto te da linealizabilidad por sí solo.
          </p>
        </div>
      }
    >
      <svg viewBox="0 0 360 170" className="qc-svg" role="group" aria-label="Réplicas">
        <line x1={cx(0)} y1={86} x2={cx(n - 1)} y2={86} className="qc-rail" />
        {Array.from({ length: n }, (_, i) => {
          const isDown = down.has(i)
          const inW = writeSet.has(i) && writeOk
          const inR = readSet.has(i) && readOk
          return (
            <g
              key={i}
              role="button"
              tabIndex={0}
              aria-pressed={isDown}
              aria-label={`Réplica ${i + 1}: ${isDown ? 'caída' : 'activa'}${inW ? ', recibe la escritura' : ''}${inR ? ', responde la lectura' : ''}. Pulsa para ${isDown ? 'levantarla' : 'tumbarla'}.`}
              className="qc-node-g"
              onClick={() => toggle(i)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  toggle(i)
                }
              }}
            >
              <rect x={cx(i) - 22} y={40} width={44} height={92} fill="transparent" />
              {inW && <rect x={cx(i) - 20} y={52} width={40} height={10} rx={5} className="qc-wbar" />}
              <circle cx={cx(i)} cy={86} r={18} className={`qc-node ${isDown ? 'is-down' : ''} ${inW && inR ? 'is-both' : ''}`} />
              <text x={cx(i)} y={91} textAnchor="middle" className="qc-num">
                {isDown ? '×' : i + 1}
              </text>
              {inR && <rect x={cx(i) - 20} y={110} width={40} height={10} rx={5} className="qc-rbar" />}
            </g>
          )
        })}
        <text x={8} y={30} className="qc-leg">
          <tspan className="qc-leg-w">▬</tspan> escritura (W)
        </text>
        <text x={8} y={160} className="qc-leg">
          <tspan className="qc-leg-r">▬</tspan> lectura (R)
        </text>
      </svg>
    </WidgetFrame>
  )
}
