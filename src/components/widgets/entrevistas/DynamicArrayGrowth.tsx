import { useMemo, useState } from 'react'
import { Plus, RotateCcw } from 'lucide-react'
import { Segmented, Stat, WidgetFrame } from '../kit'
import './DynamicArrayGrowth.css'

/**
 * append() on a dynamic array, one element at a time. When it is full it
 * reserves a bigger block and copies everything over; the chart shows the cost
 * of each append and the running average (the amortized cost).
 */

type Growth = 'x2' | 'x15' | 'add4'

const START = 4
const MAX = 64
const GROW: Record<Growth, (c: number) => number> = {
  x2: (c) => c * 2,
  x15: (c) => Math.max(c + 1, c + (c >> 1)), // ArrayList.grow: oldCapacity + (oldCapacity >> 1)
  add4: (c) => c + 4,
}
const LABEL: Record<Growth, string> = { x2: 'se duplica', x15: 'crece 1,5 veces, como ArrayList', add4: 'crece de a 4' }

interface Step {
  n: number
  capBefore: number
  cap: number
  copies: number
  cost: number
  total: number
  totalCopies: number
}

function simulate(g: Growth): Step[] {
  const out: Step[] = []
  let cap = START
  let total = 0
  let totalCopies = 0
  for (let n = 1; n <= MAX; n++) {
    const before = cap
    let copies = 0
    if (n - 1 === cap) {
      copies = n - 1
      cap = GROW[g](cap)
    }
    total += copies + 1
    totalCopies += copies
    out.push({ n, capBefore: before, cap, copies, cost: copies + 1, total, totalCopies })
  }
  return out
}

const fmt2 = (v: number) => v.toLocaleString('es', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

const W = 420
const H = 150
const PL = 30
const PR = 8
const PT = 22
const PB = 24

export function DynamicArrayGrowth() {
  const [g, setG] = useState<Growth>('x2')
  const [n, setN] = useState(0)
  const steps = useMemo(() => simulate(g), [g])
  const s = n > 0 ? steps[n - 1] : null
  const cap = s ? s.cap : START
  const ymax = Math.max(...steps.map((t) => t.cost))
  const bw = (W - PL - PR) / MAX
  const y = (v: number) => PT + (1 - v / ymax) * (H - PT - PB)
  const avg = steps.slice(0, n).map((t) => t.total / t.n)

  let note: string
  if (!s) note = `Arreglo vacío con capacidad ${START}. Agrega elementos y mira qué pasa cuando se llena.`
  else if (s.copies > 0)
    note = `append #${s.n}: estaba lleno (${s.capBefore} de ${s.capBefore}). Se reserva un bloque de ${s.cap}, se copian los ${s.copies} elementos y recién ahí se escribe el nuevo: costo ${s.cost}. Caro, pero deja ${s.cap - s.n} lugares libres.`
  else note = `append #${s.n}: hay lugar (${s.n} de ${s.cap}), solo se escribe: costo 1.`

  const resized = s && s.copies > 0

  return (
    <WidgetFrame
      caption="Un arreglo dinámico por dentro. Cada append cuesta 1, salvo cuando el arreglo está lleno y hay que copiarlo todo. Si la capacidad crece en proporción (×2), el promedio se queda acotado; si crece de a un número fijo, el promedio sube sin parar. ArrayList de Java usa ×1,5 (y empieza en 10; aquí todas empiezan en 4 para compararlas)."
      controls={
        <>
          <Segmented
            label="Al llenarse"
            value={g}
            onChange={(v) => {
              setG(v)
              setN(0)
            }}
            options={[
              { value: 'x2', label: '×2' },
              { value: 'x15', label: '×1,5 (ArrayList)' },
              { value: 'add4', label: '+4 fijo' },
            ]}
          />
          <div className="dag-btns">
            <button type="button" className="btn btn--line" onClick={() => setN((v) => Math.min(MAX, v + 1))} disabled={n >= MAX}>
              <Plus size={15} /> append
            </button>
            <button type="button" className="btn" onClick={() => setN((v) => Math.min(MAX, v + 8))} disabled={n >= MAX}>
              +8
            </button>
            <button type="button" className="btn" onClick={() => setN(MAX)} disabled={n >= MAX}>
              Hasta {MAX}
            </button>
            <button type="button" className="icon-btn" onClick={() => setN(0)} disabled={n === 0} aria-label="Vaciar el arreglo" title="Vaciar el arreglo">
              <RotateCcw size={17} />
            </button>
          </div>
        </>
      }
      readout={
        <>
          <div className="dag-stats">
            <Stat label="elementos" value={n} />
            <Stat label="capacidad" value={cap} hint={LABEL[g]} />
            <Stat label="copias acumuladas" value={s ? s.totalCopies : 0} />
            <Stat label="costo total" value={s ? s.total : 0} />
            <Stat label="costo amortizado" value={s ? fmt2(s.total / s.n) : '—'} hint="costo total ÷ n" tone={s && s.total / s.n > 3 ? 'warn' : s ? 'ok' : undefined} />
          </div>
          <p className="dag-note" aria-live="polite">
            {note}
          </p>
        </>
      }
    >
      <div className="dag-stage">
        <div>
          <div className="dag-title">
            memoria reservada: {cap} lugares{resized ? ` (antes ${s!.capBefore})` : ''}
          </div>
          <div className="dag-slots" role="img" aria-label={`${n} elementos en un arreglo de capacidad ${cap}`}>
            {Array.from({ length: cap }, (_, k) => {
              let cls = 'dag-slot'
              if (k < n) cls += ' is-full'
              if (resized && k < s!.copies) cls += ' is-copied'
              if (k === n - 1) cls += ' is-new'
              return <span key={k} className={cls} />
            })}
          </div>
          <div className="dag-legend" aria-hidden="true">
            <span>
              <i className="dag-slot is-full" /> ocupado
            </span>
            <span>
              <i className="dag-slot is-full is-copied" /> copiado en este append
            </span>
            <span>
              <i className="dag-slot" /> libre
            </span>
          </div>
        </div>
        <svg className="dag-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Costo de cada append y costo promedio acumulado">
          <line className="dag-axis" x1={PL} x2={W - PR} y1={y(0)} y2={y(0)} />
          <line className="dag-axis" x1={PL} x2={PL} y1={PT} y2={y(0)} />
          <text className="dag-tick" x={PL - 5} y={y(ymax) + 5} textAnchor="end">
            {ymax}
          </text>
          <text className="dag-tick" x={PL - 5} y={y(1) + 4} textAnchor="end">
            1
          </text>
          <text className="dag-tick" x={W - PR} y={H - 4} textAnchor="end">
            append #{MAX}
          </text>
          <text className="dag-tick" x={PL} y={H - 4}>
            #1
          </text>
          {steps.slice(0, n).map((t, k) => (
            <rect key={k} className={`dag-bar ${t.copies ? 'is-copy' : ''} ${k === n - 1 ? 'is-last' : ''}`} x={PL + k * bw + 0.5} width={Math.max(1, bw - 1)} y={y(t.cost)} height={y(0) - y(t.cost)} />
          ))}
          {avg.length > 1 && <polyline className="dag-avg" points={avg.map((v, k) => `${PL + k * bw + bw / 2},${y(v)}`).join(' ')} />}
          {avg.length > 0 && (
            <text className="dag-avg-lbl" x={PL + 8} y={PT + 4}>
              — promedio acumulado: {fmt2(avg[avg.length - 1])}
            </text>
          )}
        </svg>
      </div>
    </WidgetFrame>
  )
}
