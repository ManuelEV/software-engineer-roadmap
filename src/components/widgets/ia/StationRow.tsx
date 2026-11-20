/**
 * StationRow: a horizontal transit line whose stations are buttons.
 * Shared by several widgets of unit 5 (ia). Keyboard: arrows move, Home/End jump.
 */
import { type KeyboardEvent, useRef } from 'react'
import './StationRow.css'

export type StationTone = 'idle' | 'ok' | 'warn' | 'bad' | 'done'

export interface StationItem {
  id: string
  label: string
  /** optional tone overriding the default (active/visited) colouring */
  tone?: StationTone
}

export function StationRow({
  items,
  value,
  onChange,
  label,
  progress = true,
  compactLabels = true,
}: {
  items: StationItem[]
  /** index of the active station (-1 = none) */
  value: number
  onChange?: (i: number) => void
  /** accessible name of the group */
  label: string
  /** colour the line up to the active station */
  progress?: boolean
  /** on very narrow screens show only the active label */
  compactLabels?: boolean
}) {
  const refs = useRef<(HTMLButtonElement | null)[]>([])
  const n = items.length
  const pct = n > 1 && value >= 0 ? (value / (n - 1)) * 100 : 0

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, i: number) => {
    if (!onChange) return
    let next = i
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = Math.min(n - 1, i + 1)
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = Math.max(0, i - 1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = n - 1
    else return
    e.preventDefault()
    onChange(next)
    refs.current[next]?.focus()
  }

  return (
    <div
      className={`sr ${compactLabels ? 'sr--compact' : ''}`}
      role="radiogroup"
      aria-label={label}
      style={{ ['--sr-n' as string]: n, ['--sr-pct' as string]: `${progress ? pct : 0}%` }}
    >
      <div className="sr__track" aria-hidden="true">
        <div className="sr__rail" />
        <div className="sr__fill" />
      </div>
      {items.map((it, i) => {
        const active = i === value
        const visited = progress && value >= 0 && i < value
        const tone = it.tone ?? (active ? 'active' : visited ? 'visited' : 'idle')
        return (
          <button
            key={it.id}
            ref={(el) => {
              refs.current[i] = el
            }}
            type="button"
            role="radio"
            aria-checked={active}
            tabIndex={active || (value < 0 && i === 0) ? 0 : -1}
            className={`sr__stop sr__stop--${tone} ${active ? 'is-active' : ''}`}
            onClick={() => onChange?.(i)}
            onKeyDown={(e) => onKey(e, i)}
            disabled={!onChange}
          >
            <span className="sr__dot" aria-hidden="true" />
            <span className="sr__label">{it.label}</span>
          </button>
        )
      })}
    </div>
  )
}
