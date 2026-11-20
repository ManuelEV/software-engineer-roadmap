import { type ReactNode, useId, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { motion, useInView, useReducedMotion } from 'motion/react'
import { RotateCcw } from 'lucide-react'
import {
  type Pt,
  arrowHead,
  bentPoints,
  brace,
  checkMark,
  crossMark,
  polyLength,
  rng,
  smooth,
  underline,
  wobblePoints,
  wobblyEllipse,
  wobblyPolyline,
  wobblyRect,
} from './sketch-geometry'
import './sketch.css'

/**
 * A diagram drawn by hand, in front of the reader: strokes are traced like a
 * pen, labels are written left to right in the handwritten font, one item
 * after another, when the drawing scrolls into view. Coordinates are in the
 * SVG's own units (viewBox `0 0 width height`).
 */

export type SketchTone = 'ink' | 'pencil' | 'line' | 'ok' | 'bad' | 'warn' | 'muted'
type Font = 'hand' | 'sign' | 'code' | 'serif'

interface Common {
  tone?: SketchTone
  /** extra pause (ms) before this item starts */
  delay?: number
  /** start together with the previous item instead of after it */
  with?: boolean
}

export type SketchItem =
  | (Common & { type: 'text'; x: number; y: number; /** one string, or an array of lines */ text: string | string[]; size?: number; anchor?: 'start' | 'middle' | 'end'; font?: Font; weight?: number; rotate?: number })
  | (Common & { type: 'box'; x: number; y: number; w: number; h: number; label?: string; sub?: string; fill?: boolean; size?: number; font?: Font })
  | (Common & { type: 'circle'; x: number; y: number; r?: number; rx?: number; ry?: number; label?: string; fill?: boolean; size?: number; font?: Font })
  | (Common & { type: 'arrow'; from: Pt; to: Pt; bend?: number; label?: string; labelAt?: Pt; dashed?: boolean; head?: 'end' | 'both' | 'none' })
  | (Common & { type: 'line'; points: Pt[]; dashed?: boolean; arrow?: boolean })
  | (Common & { type: 'underline'; x: number; y: number; w: number })
  | (Common & { type: 'highlight'; x: number; y: number; w: number; h: number })
  | (Common & {
      type: 'cells'
      x: number
      y: number
      values: (string | number)[]
      size?: number
      /** print indices above the cells */
      index?: boolean
      /** per-cell tone (filled) — null for plain */
      states?: (SketchTone | null)[]
      /** label written to the left, e.g. "nums" */
      label?: string
      font?: Font
    })
  | (Common & { type: 'check' | 'cross'; x: number; y: number; size?: number })
  | (Common & { type: 'brace'; x: number; y1: number; y2: number; dir?: 1 | -1; label?: string })
  | (Common & { type: 'path'; d: string; len?: number; fill?: boolean })
  | { type: 'pause'; ms: number }

type Prim =
  | { k: 'stroke'; d: string; len: number; color: string; width: number; dashed?: boolean; fill?: string; start: number; dur: number }
  | { k: 'text'; x: number; y: number; text: string; size: number; anchor: 'start' | 'middle' | 'end'; font: Font; weight: number; color: string; rotate?: number; start: number; dur: number }
  | { k: 'hl'; x: number; y: number; w: number; h: number; color: string; start: number; dur: number }

const COLOR: Record<SketchTone, string> = {
  ink: 'var(--ink)',
  pencil: 'var(--pencil)',
  line: 'var(--line-ink)',
  ok: 'var(--ok)',
  bad: 'var(--bad)',
  warn: 'var(--warn)',
  muted: 'var(--ink-3)',
}
const FILL: Record<SketchTone, string> = {
  ink: 'var(--paper-3)',
  pencil: 'var(--paper-3)',
  line: 'var(--line-tint-2)',
  ok: 'color-mix(in oklab, var(--ok) 22%, transparent)',
  bad: 'color-mix(in oklab, var(--bad) 20%, transparent)',
  warn: 'color-mix(in oklab, var(--warn) 22%, transparent)',
  muted: 'var(--paper-2)',
}
const HL: Partial<Record<SketchTone, string>> = {
  ok: 'color-mix(in oklab, var(--ok) 32%, transparent)',
  bad: 'color-mix(in oklab, var(--bad) 30%, transparent)',
  warn: 'color-mix(in oklab, var(--warn) 34%, transparent)',
}
const FONT: Record<Font, string> = {
  hand: 'var(--font-hand)',
  sign: 'var(--font-sign)',
  code: 'var(--font-code)',
  serif: 'var(--font-display)',
}

const strokeDur = (len: number) => Math.min(520, Math.max(120, len * 0.95))
const textDur = (t: string, font: Font) => Math.max(110, t.length * (font === 'hand' ? 18 : 14))
const GAP = 30

/** Turns the items into timed primitives (strokes, words, highlighter swipes). */
function build(items: SketchItem[], seed: number, speed: number): { prims: Prim[]; total: number } {
  const prims: Prim[] = []
  let cursor = 200
  let lastStart = cursor

  items.forEach((it, idx) => {
    if (it.type === 'pause') {
      cursor += it.ms
      return
    }
    const r = rng(seed * 7919 + idx * 104729)
    const color = COLOR[it.tone ?? 'ink']
    let t = it.with ? lastStart : cursor + (it.delay ?? 0)
    const itemStart = t
    let end = t
    const stroke = (d: string, len: number, opts: { width?: number; dashed?: boolean; fill?: string; c?: string; parallel?: boolean } = {}) => {
      const dur = strokeDur(len) / speed
      prims.push({ k: 'stroke', d, len, color: opts.c ?? color, width: opts.width ?? 2.2, dashed: opts.dashed, fill: opts.fill, start: t, dur })
      end = Math.max(end, t + dur)
      if (!opts.parallel) t += dur
    }
    const write = (x: number, y: number, text: string, o: { size?: number; anchor?: 'start' | 'middle' | 'end'; font?: Font; weight?: number; c?: string; rotate?: number } = {}) => {
      const font = o.font ?? 'hand'
      const dur = textDur(text, font) / speed
      prims.push({ k: 'text', x, y, text, size: o.size ?? 20, anchor: o.anchor ?? 'start', font, weight: o.weight ?? (font === 'hand' ? 400 : 600), color: o.c ?? color, rotate: o.rotate, start: t, dur })
      end = Math.max(end, t + dur)
      t += dur
    }

    switch (it.type) {
      case 'text': {
        ;(Array.isArray(it.text) ? it.text : it.text.split('\n')).forEach((line, k) => {
          write(it.x, it.y + k * (it.size ?? 20) * 1.25, line, { size: it.size, anchor: it.anchor, font: it.font, weight: it.weight, rotate: it.rotate })
        })
        break
      }
      case 'box': {
        const g = wobblyRect(it.x, it.y, it.w, it.h, r)
        stroke(g.d, g.len, { fill: it.fill ? FILL[it.tone ?? 'ink'] : undefined })
        const size = it.size ?? 20
        const cy = it.y + it.h / 2 + size * 0.34 - (it.sub ? size * 0.45 : 0)
        if (it.label) write(it.x + it.w / 2, cy, it.label, { size, anchor: 'middle', font: it.font, c: COLOR.ink })
        if (it.sub) write(it.x + it.w / 2, cy + size * 0.95, it.sub, { size: size * 0.72, anchor: 'middle', font: it.font, c: COLOR.muted })
        break
      }
      case 'circle': {
        const rx = it.rx ?? it.r ?? 24
        const ry = it.ry ?? it.r ?? 24
        const g = wobblyEllipse(it.x, it.y, rx, ry, r)
        stroke(g.d, g.len, { fill: it.fill ? FILL[it.tone ?? 'ink'] : undefined })
        const size = it.size ?? 20
        if (it.label) write(it.x, it.y + size * 0.34, it.label, { size, anchor: 'middle', font: it.font, c: COLOR.ink })
        break
      }
      case 'arrow': {
        const pts = it.bend ? bentPoints(it.from, it.to, it.bend) : wobblePoints(it.from, it.to, r, 1.1, false)
        const jittered = it.bend ? pts.map((p, k) => (k === 0 || k === pts.length - 1 ? p : ([p[0] + (r() - 0.5) * 1.6, p[1] + (r() - 0.5) * 1.6] as Pt))) : pts
        stroke(smooth(jittered), polyLength(jittered), { dashed: it.dashed })
        const head = it.head ?? 'end'
        if (head !== 'none') {
          const h = arrowHead(jittered[jittered.length - 2], jittered[jittered.length - 1], r)
          stroke(h.d, h.len, { width: 2.2 })
        }
        if (head === 'both') {
          const h = arrowHead(jittered[1], jittered[0], r)
          stroke(h.d, h.len, { width: 2.2 })
        }
        if (it.label) {
          const mid = jittered[Math.floor(jittered.length / 2)]
          const at = it.labelAt ?? ([mid[0], mid[1] - 10] as Pt)
          write(at[0], at[1], it.label, { size: 18, anchor: 'middle', c: COLOR[it.tone ?? 'pencil'] })
        }
        break
      }
      case 'line': {
        const g = wobblyPolyline(it.points, r)
        stroke(g.d, g.len, { dashed: it.dashed })
        if (it.arrow && g.prev) {
          const h = arrowHead(g.prev, g.end, r)
          stroke(h.d, h.len)
        }
        break
      }
      case 'underline': {
        const g = underline(it.x, it.y, it.w, r)
        stroke(g.d, g.len, { width: 2.4, c: COLOR[it.tone ?? 'line'] })
        break
      }
      case 'highlight': {
        const dur = 280 / speed
        prims.push({ k: 'hl', x: it.x, y: it.y, w: it.w, h: it.h, color: HL[it.tone ?? 'line'] ?? 'var(--hl)', start: t, dur })
        end = Math.max(end, t + dur)
        break
      }
      case 'cells': {
        const s = it.size ?? 40
        if (it.label) write(it.x - 10, it.y + s / 2 + 7, it.label, { size: 18, anchor: 'end', font: 'code', c: COLOR.muted })
        // each cell: its box, and its value written while the box closes
        it.values.forEach((v, k) => {
          const g = wobblyRect(it.x + k * s, it.y, s, s, r, true)
          const st = it.states?.[k]
          const dur = Math.min(150, strokeDur(g.len)) / speed
          prims.push({ k: 'stroke', d: g.d, len: g.len, color, width: 2, fill: st ? FILL[st] : undefined, start: t, dur })
          const text = String(v)
          const font = it.font ?? 'code'
          const tdur = Math.max(90, text.length * 40) / speed
          prims.push({ k: 'text', x: it.x + k * s + s / 2, y: it.y + s / 2 + (font === 'hand' ? 7 : 6), text, size: s * 0.45, anchor: 'middle', font, weight: 600, color: st ? COLOR[st] : COLOR.ink, start: t + dur * 0.6, dur: tdur })
          if (it.index) prims.push({ k: 'text', x: it.x + k * s + s / 2, y: it.y - 7, text: String(k), size: 12, anchor: 'middle', font: 'sign', weight: 600, color: COLOR.muted, start: t + dur * 0.6, dur: 110 / speed })
          end = Math.max(end, t + dur * 0.6 + tdur)
          t += dur * 0.7
        })
        break
      }
      case 'check':
      case 'cross': {
        const s = it.size ?? 22
        const g = it.type === 'check' ? checkMark(it.x, it.y, s, r) : crossMark(it.x, it.y, s, r)
        stroke(g.d, g.len, { width: 2.6, c: COLOR[it.tone ?? (it.type === 'check' ? 'ok' : 'bad')] })
        break
      }
      case 'brace': {
        const dir = it.dir ?? 1
        const g = brace(it.x, it.y1, it.y2, dir, r)
        stroke(g.d, g.len)
        if (it.label) write(it.x - dir * 14, (it.y1 + it.y2) / 2 + 6, it.label, { size: 18, anchor: dir === 1 ? 'end' : 'start', c: COLOR[it.tone ?? 'pencil'] })
        break
      }
      case 'path': {
        stroke(it.d, it.len ?? 300, { fill: it.fill ? FILL[it.tone ?? 'ink'] : undefined })
        break
      }
    }
    lastStart = itemStart
    cursor = Math.max(cursor, end) + GAP / speed
  })
  return { prims, total: cursor }
}

/* ───────────── Pieces ───────────── */

const EASE: [number, number, number, number] = [0.45, 0, 0.3, 1]

function Stroke({ p, on, still, id }: { p: Extract<Prim, { k: 'stroke' }>; on: boolean; still: boolean; id: string }) {
  const draw = {
    initial: still ? false : ({ pathLength: 0, opacity: 0 } as const),
    animate: on ? { pathLength: 1, opacity: 1 } : { pathLength: 0, opacity: 0 },
    transition: { pathLength: { delay: p.start / 1000, duration: p.dur / 1000, ease: EASE }, opacity: { delay: p.start / 1000, duration: 0.01 } },
  }
  return (
    <g>
      {p.fill && (
        <motion.path
          d={p.d}
          fill={p.fill}
          stroke="none"
          initial={still ? false : { opacity: 0 }}
          animate={{ opacity: on ? 1 : 0 }}
          transition={{ delay: (p.start + p.dur * 0.7) / 1000, duration: 0.3 }}
        />
      )}
      {p.dashed ? (
        <>
          <mask id={id} maskUnits="userSpaceOnUse">
            <motion.path d={p.d} fill="none" stroke="#fff" strokeWidth={p.width + 6} strokeLinecap="round" {...draw} />
          </mask>
          <path d={p.d} fill="none" stroke={p.color} strokeWidth={p.width} strokeLinecap="round" strokeDasharray="7 7" mask={`url(#${id})`} />
        </>
      ) : (
        <motion.path d={p.d} fill="none" stroke={p.color} strokeWidth={p.width} strokeLinecap="round" strokeLinejoin="round" {...draw} />
      )}
    </g>
  )
}

function Words({ p, on, still, id }: { p: Extract<Prim, { k: 'text' }>; on: boolean; still: boolean; id: string }) {
  const ref = useRef<SVGTextElement>(null)
  // a generous guess until the real box is measured (fonts may still be loading)
  const guess = p.text.length * p.size * (p.font === 'code' ? 0.62 : 0.56) + p.size * 0.5
  const [w, setW] = useState(guess)
  useLayoutEffect(() => {
    const measure = () => {
      try {
        const b = ref.current?.getBBox()
        if (b && b.width > 0) setW(b.width)
      } catch {
        /* not rendered yet */
      }
    }
    measure()
    document.fonts?.ready.then(measure).catch(() => {})
  }, [p.text, p.size, p.font])

  const x0 = p.anchor === 'middle' ? p.x - w / 2 : p.anchor === 'end' ? p.x - w : p.x
  const pad = p.size * 0.35
  return (
    <g transform={p.rotate ? `rotate(${p.rotate} ${p.x} ${p.y})` : undefined}>
      <clipPath id={id}>
        <motion.rect
          x={x0 - pad}
          y={p.y - p.size * 1.15}
          height={p.size * 1.6}
          initial={still ? false : { width: 0 }}
          animate={{ width: on ? w + pad * 2 : 0 }}
          transition={{ delay: p.start / 1000, duration: p.dur / 1000, ease: 'linear' }}
        />
      </clipPath>
      <text
        ref={ref}
        x={p.x}
        y={p.y}
        textAnchor={p.anchor}
        clipPath={`url(#${id})`}
        style={{ fontFamily: FONT[p.font], fontSize: p.size, fontWeight: p.weight, fill: p.color }}
      >
        {p.text}
      </text>
    </g>
  )
}

function Swipe({ p, on, still }: { p: Extract<Prim, { k: 'hl' }>; on: boolean; still: boolean }) {
  return (
    <motion.rect
      x={p.x}
      y={p.y}
      width={p.w}
      height={p.h}
      rx={3}
      fill={p.color}
      style={{ transformBox: 'fill-box', transformOrigin: 'left center' }}
      initial={still ? false : { scaleX: 0, opacity: 0 }}
      animate={on ? { scaleX: 1, opacity: 1 } : { scaleX: 0, opacity: 0 }}
      transition={{ delay: p.start / 1000, duration: p.dur / 1000, ease: [0.16, 1, 0.3, 1] }}
    />
  )
}

/* ───────────── Sketch ───────────── */

export function Sketch({
  items,
  width = 640,
  height = 280,
  caption,
  label,
  title = 'Dibujo',
  speed = 1,
  wide = false,
}: {
  items: SketchItem[]
  /** viewBox width (SVG units). Keep it ≤ 680 so text stays readable on phones */
  width?: number
  height?: number
  caption?: ReactNode
  /** accessible description; defaults to the caption when it is plain text */
  label?: string
  /** caption label, e.g. "Dibujo" */
  title?: string
  /** >1 draws faster */
  speed?: number
  wide?: boolean
}) {
  const reduced = useReducedMotion()
  const ref = useRef<HTMLDivElement>(null)
  const inView = useInView(ref, { once: true, amount: 0.35 })
  // bumping `run` remounts the drawing, so it is traced again from scratch
  const [run, setRun] = useState(0)
  const uid = useId().replace(/[^a-zA-Z0-9]/g, '')
  const seed = useMemo(() => [...uid].reduce((a, c) => a + c.charCodeAt(0), 0) + items.length, [uid, items.length])
  const { prims, total } = useMemo(() => build(items, seed, speed), [items, seed, speed])

  const still = !!reduced
  const on = still || inView
  const hls = prims.filter((p): p is Extract<Prim, { k: 'hl' }> => p.k === 'hl')
  const rest = prims.filter((p) => p.k !== 'hl')

  return (
    <figure className={`figure sketch ${wide ? 'wide' : ''}`}>
      <div ref={ref} className="sketch__paper" data-duration={Math.round(total)}>
        <svg
          key={run}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label={label ?? (typeof caption === 'string' ? caption : 'Diagrama dibujado a mano')}
          style={{ maxWidth: width }}
        >
          <g>
            {hls.map((p, k) => (
              <Swipe key={`h${k}`} p={p} on={on} still={still} />
            ))}
          </g>
          {rest.map((p, k) =>
            p.k === 'stroke' ? (
              <Stroke key={k} p={p} on={on} still={still} id={`${uid}m${k}`} />
            ) : p.k === 'text' ? (
              <Words key={k} p={p} on={on} still={still} id={`${uid}c${k}`} />
            ) : null,
          )}
        </svg>
      </div>
      {(caption || !still) && (
        <figcaption className={`sketch__foot ${caption ? 'figure__caption' : ''}`}>
          <span className="sketch__caption">
            {caption && (
              <>
                <b>{title}</b>
                {caption}
              </>
            )}
          </span>
          {!still && (
            <button type="button" className="icon-btn sketch__replay" onClick={() => setRun((n) => n + 1)} aria-label="Volver a dibujar" title="Volver a dibujar">
              <RotateCcw size={16} />
            </button>
          )}
        </figcaption>
      )}
    </figure>
  )
}
