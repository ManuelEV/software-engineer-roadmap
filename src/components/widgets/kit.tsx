/**
 * Widget kit: shared building blocks for interactive diagrams/simulators.
 * Every interactive widget should render inside <WidgetFrame> so all of them
 * share the same frame, caption and control styling.
 */
import { type ReactNode, useId } from 'react'
import './kit.css'

export function WidgetFrame({
  caption,
  title = 'Interactivo',
  controls,
  readout,
  children,
  wide = true,
  grid = true,
}: {
  /** figure caption under the frame */
  caption?: ReactNode
  /** caption label (defaults to "Interactivo") */
  title?: string
  /** row of controls rendered above the stage */
  controls?: ReactNode
  /** strip rendered below the stage (numbers, explanation, log) */
  readout?: ReactNode
  children: ReactNode
  /** extend into the margin column on wide screens */
  wide?: boolean
  /** dotted paper grid behind the stage */
  grid?: boolean
}) {
  return (
    <figure className={`figure widget ${wide ? 'wide' : ''}`}>
      <div className="widget__frame">
        {controls && <div className="widget__controls">{controls}</div>}
        <div className={`widget__stage ${grid ? 'has-grid' : ''}`}>{children}</div>
        {readout && <div className="widget__readout">{readout}</div>}
      </div>
      {caption && (
        <figcaption className="figure__caption">
          <b>{title}</b>
          {caption}
        </figcaption>
      )}
    </figure>
  )
}

/** Segmented control (radio group). */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string
  value: T
  options: { value: T; label: ReactNode }[]
  onChange: (v: T) => void
}) {
  const name = useId()
  return (
    <div className="seg" role="radiogroup" aria-label={label}>
      <span className="seg__label">{label}</span>
      <div className="seg__track">
        {options.map((o) => (
          <label key={o.value} className={`seg__opt ${o.value === value ? 'is-on' : ''}`}>
            <input
              type="radio"
              name={name}
              value={o.value}
              checked={o.value === value}
              onChange={() => onChange(o.value)}
              className="visually-hidden"
            />
            {o.label}
          </label>
        ))}
      </div>
    </div>
  )
}

/** Labelled range slider with a live value. */
export function Slider({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
  format = (v) => String(v),
}: {
  label: string
  value: number
  min: number
  max: number
  step?: number
  onChange: (v: number) => void
  format?: (v: number) => ReactNode
}) {
  const id = useId()
  const pct = ((value - min) / (max - min)) * 100
  return (
    <div className="slider">
      <div className="slider__top">
        <label htmlFor={id} className="slider__label">
          {label}
        </label>
        <output htmlFor={id} className="slider__value">
          {format(value)}
        </output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        style={{ ['--pct' as string]: `${pct}%` }}
      />
    </div>
  )
}

/** A big number with a small label, for readouts. */
export function Stat({ label, value, hint, tone }: { label: string; value: ReactNode; hint?: ReactNode; tone?: 'ok' | 'warn' | 'bad' }) {
  return (
    <div className={`stat ${tone ? `stat--${tone}` : ''}`}>
      <div className="stat__value">{value}</div>
      <div className="stat__label">{label}</div>
      {hint && <div className="stat__hint">{hint}</div>}
    </div>
  )
}

/** Monospace event log (most recent first). */
export function Log({ entries, empty = 'Sin eventos todavía.' }: { entries: { id: string | number; text: ReactNode; tone?: 'ok' | 'warn' | 'bad' }[]; empty?: string }) {
  return (
    <ol className="wlog" aria-live="polite">
      {entries.length === 0 && <li className="wlog__empty">{empty}</li>}
      {entries.map((e) => (
        <li key={e.id} className={e.tone ? `is-${e.tone}` : ''}>
          {e.text}
        </li>
      ))}
    </ol>
  )
}
