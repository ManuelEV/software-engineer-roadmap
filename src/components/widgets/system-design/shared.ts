/**
 * Shared helpers for the system-design widgets (formatting, RNG, ticker).
 * Keep this file framework-light; each widget owns its own CSS.
 */
import { useEffect, useRef } from 'react'

/** Motion easing shared by the widgets. */
export const EASE = [0.16, 1, 0.3, 1] as const

const nf = (digits: number) => new Intl.NumberFormat('es', { maximumFractionDigits: digits })

/** Plain number with Spanish separators: 12 345,6 */
export function fmt(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '∞'
  return nf(digits).format(n)
}

/** Compact count with SI-like suffixes (K, M, B = 10^9 "mil millones", T). */
export function fmtCount(n: number, digits = 1): string {
  if (!Number.isFinite(n)) return '∞'
  const a = Math.abs(n)
  if (a >= 1e12) return `${fmt(n / 1e12, digits)} T`
  if (a >= 1e9) return `${fmt(n / 1e9, digits)} B`
  if (a >= 1e6) return `${fmt(n / 1e6, digits)} M`
  if (a >= 1e3) return `${fmt(n / 1e3, digits)} K`
  return fmt(n, digits)
}

/** Bytes in decimal units (KB = 10^3), as is customary in estimates. */
export function fmtBytes(bytes: number, digits = 1): string {
  if (!Number.isFinite(bytes)) return '∞'
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB', 'EB']
  let v = bytes
  let i = 0
  while (Math.abs(v) >= 1000 && i < units.length - 1) {
    v /= 1000
    i++
  }
  return `${fmt(v, digits)} ${units[i]}`
}

/** Bits per second in decimal units. */
export function fmtBps(bitsPerSec: number, digits = 1): string {
  const units = ['bps', 'Kbps', 'Mbps', 'Gbps', 'Tbps']
  let v = bitsPerSec
  let i = 0
  while (Math.abs(v) >= 1000 && i < units.length - 1) {
    v /= 1000
    i++
  }
  return `${fmt(v, digits)} ${units[i]}`
}

/** Duration given in nanoseconds → human string (ns, µs, ms, s, min, h, días, años). */
export function fmtDuration(ns: number, digits = 1): string {
  const s = ns / 1e9
  if (ns < 1e3) return `${fmt(ns, digits)} ns`
  if (ns < 1e6) return `${fmt(ns / 1e3, digits)} µs`
  if (ns < 1e9) return `${fmt(ns / 1e6, digits)} ms`
  if (s < 60) return `${fmt(s, digits)} s`
  if (s < 3600) return `${fmt(s / 60, digits)} min`
  if (s < 86400) return `${fmt(s / 3600, digits)} h`
  if (s < 86400 * 365) return `${fmt(s / 86400, digits)} días`
  return `${fmt(s / (86400 * 365), digits)} años`
}

/** Deterministic PRNG (mulberry32) so simulations are reproducible. */
export function rng(seed: number) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

/** Small, stable string hash (FNV-1a 32-bit) for hashing keys onto rings/partitions. */
export function hash32(s: string): number {
  let h = 0x811c9dc5
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 0x01000193)
  }
  // final avalanche (murmur3 fmix) so similar keys spread well
  h ^= h >>> 16
  h = Math.imul(h, 0x85ebca6b)
  h ^= h >>> 13
  h = Math.imul(h, 0xc2b2ae35)
  h ^= h >>> 16
  return h >>> 0
}

/**
 * Calls `fn` every `ms` while `running` is true and the tab is visible.
 * The latest `fn` is always used (no stale closures).
 */
export function useTicker(fn: () => void, ms: number, running: boolean) {
  const ref = useRef(fn)
  useEffect(() => {
    ref.current = fn
  })
  useEffect(() => {
    if (!running) return
    const id = window.setInterval(() => {
      if (typeof document !== 'undefined' && document.hidden) return
      ref.current()
    }, ms)
    return () => window.clearInterval(id)
  }, [ms, running])
}
