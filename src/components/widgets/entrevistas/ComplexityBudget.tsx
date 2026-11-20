import { type ReactNode, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { Segmented, Slider, WidgetFrame } from '../kit'
import './ComplexityBudget.css'

/**
 * How many simple operations each complexity class needs for a given n, and
 * whether that fits in about one second. Everything is computed in log10 so
 * 2ⁿ and n! never overflow.
 */

const LOG10_E = Math.log10(Math.E)

/** log10(n!) exactly for small n, Stirling's approximation beyond that. */
function log10Factorial(n: number): number {
  if (n < 2) return 0
  if (n <= 200) {
    let s = 0
    for (let k = 2; k <= n; k++) s += Math.log10(k)
    return s
  }
  return n * Math.log10(n) - n * LOG10_E + 0.5 * Math.log10(2 * Math.PI * n)
}

interface Klass {
  id: string
  label: string
  /** label as drawn (real superscripts, not Unicode ones the code font may lack) */
  show: ReactNode
  /** log10 of the number of operations for n */
  log: (n: number) => number
}

const log2 = (n: number) => Math.max(1, Math.log2(n))

const CLASSES: Klass[] = [
  { id: '1', label: 'O(1)', show: 'O(1)', log: () => 0 },
  { id: 'logn', label: 'O(log n)', show: 'O(log n)', log: (n) => Math.log10(log2(n)) },
  { id: 'n', label: 'O(n)', show: 'O(n)', log: (n) => Math.log10(n) },
  { id: 'nlogn', label: 'O(n log n)', show: 'O(n log n)', log: (n) => Math.log10(n * log2(n)) },
  { id: 'n2', label: 'O(n²)', show: <>O(n<sup>2</sup>)</>, log: (n) => 2 * Math.log10(n) },
  { id: '2n', label: 'O(2ⁿ)', show: <>O(2<sup>n</sup>)</>, log: (n) => n * Math.log10(2) },
  { id: 'nf', label: 'O(n!)', show: 'O(n!)', log: (n) => log10Factorial(n) },
]

/** bars are drawn on a log axis from 10⁰ to 10^AXIS */
const AXIS = 20

const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹'
const sup = (k: number) =>
  String(k)
    .split('')
    .map((d) => (d === '-' ? '⁻' : SUP[Number(d)]))
    .join('')

/** 10^x written for humans: "3.200", "4,5 · 10⁹", "10³⁰⁰" */
function fmtOps(lg: number): string {
  if (lg < 6) return Math.round(10 ** lg).toLocaleString('es')
  const e = Math.floor(lg)
  if (e >= 10_000) return `> 10${sup(10_000)}`
  if (e > 99) return `10${sup(e)}`
  const m = 10 ** (lg - e)
  if (m < 1.05) return `10${sup(e)}`
  return `${m.toLocaleString('es', { maximumFractionDigits: 1 })} · 10${sup(e)}`
}

/** seconds (given as log10) as a readable duration */
function fmtTime(lgSec: number): string {
  const s = 10 ** lgSec
  if (lgSec < -6) return 'menos de 1 µs'
  if (s < 1e-3) return `${Math.round(s * 1e6)} µs`
  if (s < 1) return `${Math.round(s * 1e3)} ms`
  if (s < 60) return `${s.toLocaleString('es', { maximumFractionDigits: 1 })} s`
  if (s < 3600) return `${Math.round(s / 60)} min`
  if (s < 86400) return `${Math.round(s / 3600)} h`
  const years = lgSec - Math.log10(31_557_600)
  if (years < 0) return `${Math.round(s / 86400)} días`
  if (years < 4) return `${Math.round(10 ** years).toLocaleString('es')} años`
  // the universe is about 1,38 · 10¹⁰ years old
  if (years > 10.14) return '> edad del universo'
  return `10${sup(Math.floor(years))} años`
}

const PRESETS = [
  { label: '10', exp: 1 },
  { label: '20', exp: Math.log10(20) },
  { label: '500', exp: Math.log10(500) },
  { label: '10⁵', exp: 5 },
  { label: '10⁶', exp: 6 },
  { label: '10⁹', exp: 9 },
]

function fmtN(n: number): string {
  if (n < 1e6) return n.toLocaleString('es')
  const e = Math.floor(Math.log10(n) + 1e-9)
  const m = n / 10 ** e
  return m === 1 ? `10${sup(e)}` : `${m.toLocaleString('es', { maximumFractionDigits: 1 })} · 10${sup(e)}`
}

/** round n to 2 significant digits so the slider lands on readable values */
function niceN(exp: number): number {
  const raw = 10 ** exp
  if (raw < 100) return Math.max(1, Math.round(raw))
  const p = 10 ** (Math.floor(Math.log10(raw)) - 1)
  return Math.round(raw / p) * p
}

export function ComplexityBudget() {
  const reduced = useReducedMotion()
  const [exp, setExp] = useState(5)
  const [speed, setSpeed] = useState<'8' | '7'>('8')
  const n = niceN(exp)
  const budget = Number(speed) // log10 ops per second

  const rows = CLASSES.map((c) => {
    const lg = c.log(n)
    // "justo": up to ~3× the budget, where constants decide
    const verdict = lg <= budget ? 'ok' : lg <= budget + 0.5 ? 'warn' : 'bad'
    return { ...c, lg, verdict }
  })
  const best = [...rows].reverse().find((r) => r.verdict === 'ok')

  return (
    <WidgetFrame
      caption={
        <>
          Mueve n y mira qué complejidades caben en alrededor de un segundo. Es una regla aproximada: supone unas 10⁸ operaciones simples por segundo (o 10⁷ si eliges el supuesto para Python), y las constantes reales pueden mover el resultado un orden de magnitud.
        </>
      }
      controls={
        <>
          <Slider label="Tamaño de la entrada" value={exp} min={0} max={9} step={0.05} onChange={setExp} format={() => `n = ${fmtN(n)}`} />
          <div className="cxb-presets" role="group" aria-label="Valores típicos de n">
            <span className="seg__label">Típicos</span>
            <div className="cxb-presets__row">
              {PRESETS.map((p) => (
                <button key={p.label} type="button" className={`cxb-chip ${Math.abs(p.exp - exp) < 0.01 ? 'is-on' : ''}`} onClick={() => setExp(p.exp)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>
          <Segmented
            label="Supuesto de velocidad"
            value={speed}
            onChange={setSpeed}
            options={[
              { value: '8', label: '10⁸ ops/s' },
              { value: '7', label: '10⁷ ops/s (Python)' },
            ]}
          />
        </>
      }
      readout={
        <p>
          Con <b>n = {fmtN(n)}</b>,{' '}
          {best ? (
            <>
              lo más lento que cabe cómodo es <b className="cxb-ok">{best.label}</b>.
            </>
          ) : (
            <>ninguna clase cabe.</>
          )}{' '}
          {exp >= 4.5 && exp <= 5.5 && 'Es el tamaño típico de LeetCode y de las pruebas online: el enunciado te está pidiendo O(n log n) o mejor.'}
          {exp <= Math.log10(20) + 0.01 && 'Con n tan chico, hasta probar todos los subconjuntos es viable: es la pista de un backtracking.'}
          {exp >= 8.5 && 'Ni siquiera recorrer la entrada entera es gratis: hace falta O(log n), O(1) o una fórmula.'}
        </p>
      }
    >
      <div className={`cxb ${reduced ? 'is-reduced' : ''}`} style={{ ['--cxb-budget' as string]: `${(budget / AXIS) * 100}%` }}>
        <div className="cxb-axis" aria-hidden="true">
          <span />
          <div className="cxb-axis__scale">
            {[0, 5, 10, 15, 20].map((t) => (
              <span key={t} style={{ left: `${(t / AXIS) * 100}%` }}>
                10{sup(t)}
              </span>
            ))}
          </div>
          <span />
        </div>
        <ul className="cxb-rows">
          {rows.map((r) => {
            const over = r.lg > AXIS
            const w = Math.max(1.2, Math.min(100, (r.lg / AXIS) * 100))
            return (
              <li key={r.id} className={`cxb-row is-${r.verdict}`}>
                <span className="cxb-row__label">{r.show}</span>
                <div className="cxb-row__track" role="img" aria-label={`${r.label}: ${fmtOps(r.lg)} operaciones, ${r.verdict === 'ok' ? 'cabe' : r.verdict === 'warn' ? 'justo' : 'no cabe'}`}>
                  <span className="cxb-row__bar" style={{ width: `${w}%` }} />
                  {over && <span className="cxb-row__over">fuera de escala</span>}
                  <span className="cxb-row__budget" />
                </div>
                <span className="cxb-row__info">
                  <span className="cxb-row__ops">{fmtOps(r.lg)} ops</span>
                  <span className="cxb-row__time">{fmtTime(r.lg - budget)}</span>
                  <span className="cxb-row__verdict">{r.verdict === 'ok' ? 'cabe' : r.verdict === 'warn' ? 'justo' : 'no cabe'}</span>
                </span>
              </li>
            )
          })}
        </ul>
        <div className="cxb-legend" aria-hidden="true">
          <span className="cxb-legend__line" /> 1 segundo con el supuesto elegido (10{sup(budget)} operaciones)
        </div>
      </div>
    </WidgetFrame>
  )
}
