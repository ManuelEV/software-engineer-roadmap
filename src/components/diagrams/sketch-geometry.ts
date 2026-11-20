/**
 * Hand-drawn geometry for <Sketch>: every shape becomes a slightly wobbly path,
 * the way a pen stroke drifts. Deterministic (seeded), so a diagram looks the
 * same on every render and every device.
 */
export type Pt = [number, number]

/** mulberry32: tiny seeded PRNG returning [0, 1). */
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

const f = (n: number) => Math.round(n * 10) / 10
const dist = (a: Pt, b: Pt) => Math.hypot(b[0] - a[0], b[1] - a[1])

export function polyLength(pts: Pt[]) {
  let s = 0
  for (let i = 1; i < pts.length; i++) s += dist(pts[i - 1], pts[i])
  return s
}

/** Catmull-Rom through the points, as cubic Béziers. */
export function smooth(pts: Pt[]): string {
  if (pts.length === 0) return ''
  if (pts.length < 3) return `M${pts.map((p) => `${f(p[0])} ${f(p[1])}`).join(' L')}`
  let d = `M${f(pts[0][0])} ${f(pts[0][1])}`
  for (let i = 0; i < pts.length - 1; i++) {
    const p0 = pts[i - 1] ?? pts[i]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const p3 = pts[i + 2] ?? p2
    const c1: Pt = [p1[0] + (p2[0] - p0[0]) / 6, p1[1] + (p2[1] - p0[1]) / 6]
    const c2: Pt = [p2[0] - (p3[0] - p1[0]) / 6, p2[1] - (p3[1] - p1[1]) / 6]
    d += ` C${f(c1[0])} ${f(c1[1])} ${f(c2[0])} ${f(c2[1])} ${f(p2[0])} ${f(p2[1])}`
  }
  return d
}

/** Points along a→b with a little perpendicular drift and a small overshoot. */
export function wobblePoints(a: Pt, b: Pt, r: () => number, amp = 1.3, overshoot = true): Pt[] {
  const len = dist(a, b)
  if (len < 1) return [a, b]
  const ux = (b[0] - a[0]) / len
  const uy = (b[1] - a[1]) / len
  const nx = -uy
  const ny = ux
  const segs = Math.max(2, Math.round(len / 55))
  const pre = overshoot ? -r() * 2.5 : 0
  const post = overshoot ? r() * 3 : 0
  const pts: Pt[] = []
  for (let i = 0; i <= segs; i++) {
    const t = i / segs
    const along = pre + t * (len - pre + post)
    // drift is smallest at the ends, like a confident stroke
    const w = Math.sin(Math.PI * t) * amp * (r() * 2 - 1) + (r() - 0.5) * 0.5
    pts.push([a[0] + ux * along + nx * w, a[1] + uy * along + ny * w])
  }
  return pts
}

export function wobblyLine(a: Pt, b: Pt, r: () => number, amp?: number) {
  const pts = wobblePoints(a, b, r, amp)
  return { d: smooth(pts), len: polyLength(pts), end: pts[pts.length - 1], prev: pts[pts.length - 2] }
}

/** A polyline drawn as one stroke, each leg slightly drifting. */
export function wobblyPolyline(points: Pt[], r: () => number, amp?: number) {
  const all: Pt[] = []
  for (let i = 1; i < points.length; i++) {
    const leg = wobblePoints(points[i - 1], points[i], r, amp, false)
    all.push(...(i === 1 ? leg : leg.slice(1)))
  }
  return { d: smooth(all), len: polyLength(all), end: all[all.length - 1], prev: all[all.length - 2] }
}

/** Rectangle drawn in one go, corner to corner, overshooting where it closes. */
export function wobblyRect(x: number, y: number, w: number, h: number, r: () => number, tight = false) {
  const j = () => (r() - 0.5) * (tight ? 1 : 2.4)
  const c: Pt[] = [
    [x + j(), y + j()],
    [x + w + j(), y + j()],
    [x + w + j(), y + h + j()],
    [x + j(), y + h + j()],
  ]
  let d = ''
  let len = 0
  for (let i = 0; i < 4; i++) {
    const a = c[i]
    const b = i === 3 ? ([c[0][0] + (tight ? r() * 1.5 : r() * 4 + 2), c[0][1] + (r() - 0.5) * (tight ? 0.8 : 2)] as Pt) : c[i + 1]
    const pts = wobblePoints(a, b, r, tight ? 0.6 : 1.1, false)
    const seg = smooth(pts)
    d += i === 0 ? seg : ` L${seg.slice(1)}`
    len += polyLength(pts)
  }
  return { d, len }
}

/** Ellipse that doesn't quite close, like a circle around a word. */
export function wobblyEllipse(cx: number, cy: number, rx: number, ry: number, r: () => number) {
  const start = -Math.PI * (0.6 + r() * 0.3)
  const sweep = Math.PI * 2 + 0.22 + r() * 0.2
  const n = Math.max(14, Math.round((rx + ry) / 5))
  const pts: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const t = start + (sweep * i) / n
    const k = 1 + (r() - 0.5) * 0.05 + (i / n) * 0.04
    pts.push([cx + Math.cos(t) * rx * k, cy + Math.sin(t) * ry * k])
  }
  return { d: smooth(pts), len: polyLength(pts) }
}

/** Points of a quadratic curve a→b bent by `bend` (perpendicular offset of the midpoint). */
export function bentPoints(a: Pt, b: Pt, bend: number): Pt[] {
  const mx = (a[0] + b[0]) / 2
  const my = (a[1] + b[1]) / 2
  const len = dist(a, b) || 1
  const cx = mx + (-(b[1] - a[1]) / len) * bend
  const cy = my + ((b[0] - a[0]) / len) * bend
  const n = Math.max(6, Math.round(len / 25))
  const pts: Pt[] = []
  for (let i = 0; i <= n; i++) {
    const t = i / n
    const u = 1 - t
    pts.push([u * u * a[0] + 2 * u * t * cx + t * t * b[0], u * u * a[1] + 2 * u * t * cy + t * t * b[1]])
  }
  return pts
}

/** Two short strokes making an arrow head at `tip`, pointing away from `from`. */
export function arrowHead(from: Pt, tip: Pt, r: () => number, size = 13) {
  const ang = Math.atan2(tip[1] - from[1], tip[0] - from[0])
  const spread = 0.46 + (r() - 0.5) * 0.12
  const p1: Pt = [tip[0] - size * Math.cos(ang - spread), tip[1] - size * Math.sin(ang - spread)]
  const p2: Pt = [tip[0] - size * Math.cos(ang + spread), tip[1] - size * Math.sin(ang + spread)]
  return { d: `M${f(p1[0])} ${f(p1[1])} L${f(tip[0])} ${f(tip[1])} L${f(p2[0])} ${f(p2[1])}`, len: size * 2 }
}

/** A tick mark, as written in a margin. */
export function checkMark(x: number, y: number, s: number, r: () => number) {
  const pts: Pt[] = [
    [x - s * 0.5, y + (r() - 0.5) * 2],
    [x - s * 0.12, y + s * 0.42],
    [x + s * 0.55, y - s * 0.5 + (r() - 0.5) * 3],
  ]
  return { d: smooth([pts[0], pts[1]]) + ` L${f(pts[2][0])} ${f(pts[2][1])}`, len: polyLength(pts) }
}

/** An X: two strokes. */
export function crossMark(x: number, y: number, s: number, r: () => number) {
  const h = s / 2
  const a = wobblyLine([x - h, y - h], [x + h, y + h], r, 0.8)
  const b = wobblyLine([x + h, y - h], [x - h, y + h], r, 0.8)
  return { d: `${a.d} ${b.d}`, len: a.len + b.len }
}

/** A loose underline with a tiny wave. */
export function underline(x: number, y: number, w: number, r: () => number) {
  const pts: Pt[] = []
  const n = Math.max(4, Math.round(w / 30))
  for (let i = 0; i <= n; i++) pts.push([x + (w * i) / n + (r() - 0.5) * 2, y + Math.sin(i * 1.7) * 1.4 + (r() - 0.5) * 1.6])
  return { d: smooth(pts), len: polyLength(pts) }
}

/** A curly brace from (x, y1) to (x, y2) opening to the right (or left with dir = -1). */
export function brace(x: number, y1: number, y2: number, dir: 1 | -1, r: () => number) {
  const h = y2 - y1
  const m = y1 + h / 2
  const d0 = 9 * dir
  const pts: Pt[] = [
    [x + d0, y1],
    [x + d0 * 0.15, y1 + h * 0.08],
    [x, y1 + h * 0.4],
    [x - d0 * 0.9, m + (r() - 0.5)],
    [x, y1 + h * 0.6],
    [x + d0 * 0.15, y1 + h * 0.92],
    [x + d0, y2],
  ]
  return { d: smooth(pts), len: polyLength(pts) }
}
