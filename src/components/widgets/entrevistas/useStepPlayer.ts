import { useCallback, useEffect, useState } from 'react'

/* Step player for the algorithm widgets (see algo-kit.tsx). */

export interface StepPlayer {
  /** current frame, 0-based (always < total) */
  i: number
  total: number
  playing: boolean
  atStart: boolean
  atEnd: boolean
  next: () => void
  prev: () => void
  reset: () => void
  toggle: () => void
  go: (i: number) => void
}

/**
 * Steps through `total` frames, by hand or on a timer.
 * Changing `resetKey` (e.g. the input) rewinds to the first frame and stops.
 */
export function useStepPlayer(total: number, { interval = 900, resetKey = '' }: { interval?: number; resetKey?: string } = {}): StepPlayer {
  const [state, setState] = useState({ key: resetKey, i: 0, playing: false })
  const cur = state.key === resetKey ? state : { key: resetKey, i: 0, playing: false }
  const last = Math.max(0, total - 1)
  const i = Math.min(cur.i, last)

  const go = useCallback((n: number) => setState({ key: resetKey, i: Math.max(0, Math.min(n, last)), playing: false }), [resetKey, last])
  const next = useCallback(() => setState((s) => ({ key: resetKey, i: Math.min((s.key === resetKey ? s.i : 0) + 1, last), playing: false })), [resetKey, last])
  const prev = useCallback(() => setState((s) => ({ key: resetKey, i: Math.max((s.key === resetKey ? s.i : 0) - 1, 0), playing: false })), [resetKey])
  const reset = useCallback(() => setState({ key: resetKey, i: 0, playing: false }), [resetKey])
  const toggle = useCallback(
    () =>
      setState((s) => {
        const si = s.key === resetKey ? s.i : 0
        const playing = s.key === resetKey ? s.playing : false
        // pressing play at the end starts over
        return { key: resetKey, i: !playing && si >= last ? 0 : si, playing: !playing }
      }),
    [resetKey, last],
  )

  useEffect(() => {
    if (!cur.playing) return
    const t = setTimeout(() => {
      setState((s) => {
        if (s.key !== resetKey) return s
        const n = s.i + 1
        return { key: resetKey, i: Math.min(n, last), playing: n < last }
      })
    }, interval)
    return () => clearTimeout(t)
  }, [cur.playing, cur.i, interval, last, resetKey])

  return { i, total, playing: cur.playing, atStart: i === 0, atEnd: i === last, next, prev, reset, toggle, go }
}
