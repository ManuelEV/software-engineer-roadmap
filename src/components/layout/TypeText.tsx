import { useEffect, useMemo, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { schedule } from '../../lib/typing'

/**
 * Text that writes itself in, one character at a time. The part still to be
 * written stays in the layout (invisible), so nothing reflows while it types;
 * screen readers get the full text from the start.
 */
export function TypeText({
  text,
  speed = 40,
  delay = 0,
  caret = true,
  linger = true,
  className,
}: {
  text: string
  /** average ms per character */
  speed?: number
  /** ms before the first character */
  delay?: number
  /** show a writing caret while typing */
  caret?: boolean
  /** keep the caret blinking a moment after the last character */
  linger?: boolean
  className?: string
}) {
  const reduced = useReducedMotion()
  const times = useMemo(() => schedule(text, speed), [text, speed])
  // keyed by text so a new text never flashes in full before restarting
  const [state, setState] = useState({ text, n: 0 })
  const n = reduced ? text.length : state.text === text ? state.n : 0

  useEffect(() => {
    if (reduced) return
    let raf = 0
    let start: number | null = null
    let i = 0
    const tick = (now: number) => {
      start ??= now
      const elapsed = now - start - delay
      while (i < times.length && times[i] <= elapsed) i++
      setState((s) => (s.text === text && s.n === i ? s : { text, n: i }))
      if (i < times.length) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [text, times, delay, reduced])

  const done = n >= text.length
  const showCaret = caret && !reduced && n > 0 && (!done || linger)

  return (
    <span className={`tw ${done ? 'is-done' : ''} ${className ?? ''}`}>
      <span className="visually-hidden">{text}</span>
      <span aria-hidden="true">
        {text.slice(0, n)}
        {showCaret && <span className="tw__caret" />}
        <span className="tw__rest">{text.slice(n)}</span>
      </span>
    </span>
  )
}
