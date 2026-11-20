/**
 * Shared helpers for the arquitectura (unit 1) widgets.
 * Each widget owns its own CSS file; this file only holds motion helpers.
 */
import { useReducedMotion } from 'motion/react'

/** Motion easing shared by the widgets. */
export const EASE = [0.16, 1, 0.3, 1] as const

/** Transition respecting reduced-motion: instant when the user prefers it. */
export function useTransition(duration = 0.3) {
  const reduced = useReducedMotion()
  return { duration: reduced ? 0 : duration, ease: EASE }
}

/** True when the user prefers reduced motion (no displacements, only fades). */
export function useReduced() {
  return useReducedMotion() ?? false
}

export function sleep(ms: number) {
  return new Promise<void>((r) => setTimeout(r, ms))
}
