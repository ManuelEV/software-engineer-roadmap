import { type ReactNode, useEffect, useId, useMemo, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react'
import { kindIcons, type NodeKind } from './icons'
import { useMediaQuery } from '../../lib/hooks'
import './flow.css'

export interface FlowNode {
  id: string
  label: string
  /** column (can be fractional) */
  x: number
  /** row (can be fractional) */
  y: number
  /** optional positions used on narrow screens (< 560px) */
  mx?: number
  my?: number
  kind?: NodeKind
  /** small second line under the label */
  sub?: string
  /** shown in the info panel when the node is clicked */
  desc?: string
  /** width multiplier (1 = default) */
  w?: number
  /** visual emphasis */
  tone?: 'line' | 'muted' | 'warn' | 'ok'
}

export interface FlowEdge {
  from: string
  to: string
  /** defaults to `${from}-${to}` */
  id?: string
  label?: string
  route?: 'auto' | 'straight' | 'hv' | 'vh'
  dashed?: boolean
  bidir?: boolean
}

export interface FlowStep {
  title: string
  body?: ReactNode
  /** node ids to highlight */
  active?: string[]
  /** edge ids that carry an animated packet in this step */
  flow?: string[]
}

export interface FlowGroup {
  label: string
  /** inclusive grid bounds */
  x1: number
  y1: number
  x2: number
  y2: number
}

export interface FlowDiagramProps {
  nodes: FlowNode[]
  edges?: FlowEdge[]
  steps?: FlowStep[]
  groups?: FlowGroup[]
  caption?: ReactNode
  /** label shown on the figure, e.g. "Figura" */
  title?: string
  autoplay?: boolean
  /** extend into the margin column on wide screens (default true) */
  wide?: boolean
}

const COL = 172
const ROW = 104
const NODE_W = 144
const NODE_H = 52
const PAD = 28

type Pt = { x: number; y: number }

function nodeBox(n: FlowNode, narrow: boolean) {
  const gx = narrow && n.mx !== undefined ? n.mx : n.x
  const gy = narrow && n.my !== undefined ? n.my : n.y
  // Grow the box to fit its text (Barlow Semi Condensed ≈ 0.5em per glyph)
  const textW = Math.max(n.label.length * 8.1, (n.sub?.length ?? 0) * 6.6)
  const w = Math.max(NODE_W * (n.w ?? 1), Math.ceil(textW + 56))
  const h = n.sub ? NODE_H + 14 : NODE_H
  const cx = PAD + NODE_W / 2 + gx * COL
  const cy = PAD + NODE_H / 2 + 8 + gy * ROW
  return { cx, cy, w, h }
}

function clipToBox(from: Pt, center: Pt, w: number, h: number, pad = 6): Pt {
  const dx = from.x - center.x
  const dy = from.y - center.y
  if (dx === 0 && dy === 0) return center
  const hw = w / 2 + pad
  const hh = h / 2 + pad
  const t = Math.min(dx === 0 ? Infinity : hw / Math.abs(dx), dy === 0 ? Infinity : hh / Math.abs(dy))
  return { x: center.x + dx * Math.min(t, 1), y: center.y + dy * Math.min(t, 1) }
}

/** Transit-map routing: horizontal/vertical runs joined by 45° diagonals. */
function routePoints(a: Pt, b: Pt, mode: FlowEdge['route']): Pt[] {
  const dx = b.x - a.x
  const dy = b.y - a.y
  const adx = Math.abs(dx)
  const ady = Math.abs(dy)
  if (mode === 'straight' || adx < 2 || ady < 2) return [a, b]
  if (mode === 'hv') return [a, { x: b.x, y: a.y }, b]
  if (mode === 'vh') return [a, { x: a.x, y: b.y }, b]
  if (adx >= ady) {
    const run = adx - ady
    return [a, { x: a.x + Math.sign(dx) * run, y: a.y }, b]
  }
  const run = ady - adx
  return [a, { x: a.x, y: a.y + Math.sign(dy) * run }, b]
}

/** Drop consecutive (near-)duplicate points so no segment has zero length. */
function dedupe(pts: Pt[]): Pt[] {
  const out: Pt[] = [pts[0]]
  for (let i = 1; i < pts.length; i++) {
    const p = pts[i]
    const q = out[out.length - 1]
    if (Math.hypot(p.x - q.x, p.y - q.y) > 0.5) out.push(p)
    else if (i === pts.length - 1) out[out.length - 1] = p
  }
  return out.length >= 2 ? out : [pts[0], pts[pts.length - 1]]
}

function roundedPath(input: Pt[], r = 16): string {
  const pts = dedupe(input)
  if (pts.length < 3) return `M${pts[0].x},${pts[0].y} L${pts[pts.length - 1].x},${pts[pts.length - 1].y}`
  let d = `M${pts[0].x},${pts[0].y}`
  for (let i = 1; i < pts.length - 1; i++) {
    const p0 = pts[i - 1]
    const p1 = pts[i]
    const p2 = pts[i + 1]
    const l1 = Math.hypot(p1.x - p0.x, p1.y - p0.y)
    const l2 = Math.hypot(p2.x - p1.x, p2.y - p1.y)
    const rr = Math.min(r, l1 / 2, l2 / 2)
    const a = { x: p1.x - ((p1.x - p0.x) / l1) * rr, y: p1.y - ((p1.y - p0.y) / l1) * rr }
    const b = { x: p1.x + ((p2.x - p1.x) / l2) * rr, y: p1.y + ((p2.y - p1.y) / l2) * rr }
    d += ` L${a.x},${a.y} Q${p1.x},${p1.y} ${b.x},${b.y}`
  }
  const last = pts[pts.length - 1]
  return d + ` L${last.x},${last.y}`
}

function polyMid(pts: Pt[]): Pt {
  const segs = pts.slice(1).map((p, i) => Math.hypot(p.x - pts[i].x, p.y - pts[i].y))
  const total = segs.reduce((s, v) => s + v, 0)
  let half = total / 2
  for (let i = 0; i < segs.length; i++) {
    if (half <= segs[i]) {
      const t = half / segs[i]
      return { x: pts[i].x + (pts[i + 1].x - pts[i].x) * t, y: pts[i].y + (pts[i + 1].y - pts[i].y) * t }
    }
    half -= segs[i]
  }
  return pts[0]
}

function polyLen(pts: Pt[]) {
  return pts.slice(1).reduce((s, p, i) => s + Math.hypot(p.x - pts[i].x, p.y - pts[i].y), 0)
}

export function FlowDiagram({
  nodes,
  edges = [],
  steps,
  groups,
  caption,
  title = 'Figura',
  autoplay = false,
  wide = true,
}: FlowDiagramProps) {
  const uid = useId().replace(/:/g, '')
  const narrow = useMediaQuery('(max-width: 559px)')
  const reduced = useReducedMotion()
  const [step, setStep] = useState(0)
  const [playing, setPlaying] = useState(autoplay)
  const [selected, setSelected] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const [overflowing, setOverflowing] = useState(false)

  const hasSteps = !!steps?.length
  const current = hasSteps ? steps![step] : undefined

  const layout = useMemo(() => {
    const boxes = new Map(nodes.map((n) => [n.id, nodeBox(n, narrow)]))
    let maxX = 0
    let maxY = 0
    boxes.forEach((b) => {
      maxX = Math.max(maxX, b.cx + b.w / 2)
      maxY = Math.max(maxY, b.cy + b.h / 2)
    })
    const paths = edges.map((e) => {
      const a = boxes.get(e.from)
      const b = boxes.get(e.to)
      if (!a || !b) return null
      const raw = routePoints({ x: a.cx, y: a.cy }, { x: b.cx, y: b.cy }, e.route ?? 'auto')
      const pts = [...raw]
      pts[0] = clipToBox(raw[1], { x: a.cx, y: a.cy }, a.w, a.h, e.bidir ? 8 : 4)
      pts[pts.length - 1] = clipToBox(raw[raw.length - 2], { x: b.cx, y: b.cy }, b.w, b.h, 8)
      return {
        edge: e,
        id: e.id ?? `${e.from}-${e.to}`,
        d: roundedPath(pts),
        mid: polyMid(pts),
        len: polyLen(pts),
      }
    })
    const groupRects = (groups ?? []).map((g) => {
      const x1 = PAD + g.x1 * COL - 14
      const y1 = PAD + g.y1 * ROW - 6
      const x2 = PAD + NODE_W + g.x2 * COL + 14
      const y2 = PAD + NODE_H + 16 + g.y2 * ROW + 14
      return { ...g, rx: x1, ry: y1, rw: x2 - x1, rh: y2 - y1 }
    })
    groupRects.forEach((g) => {
      maxX = Math.max(maxX, g.rx + g.rw)
      maxY = Math.max(maxY, g.ry + g.rh)
    })
    return { boxes, paths: paths.filter(Boolean) as NonNullable<(typeof paths)[number]>[], groupRects, w: maxX + PAD, h: maxY + PAD }
  }, [nodes, edges, groups, narrow])

  // Autoplay through steps
  useEffect(() => {
    if (!playing || !hasSteps) return
    const t = window.setTimeout(() => {
      setStep((s) => (s + 1) % steps!.length)
    }, 3400)
    return () => window.clearTimeout(t)
  }, [playing, step, hasSteps, steps])

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const check = () => setOverflowing(el.scrollWidth > el.clientWidth + 4)
    check()
    const ro = new ResizeObserver(check)
    ro.observe(el)
    return () => ro.disconnect()
  }, [layout.w])

  const activeNodes = new Set(current?.active ?? (selected ? [selected] : []))
  const flowEdges = new Set(current?.flow ?? [])
  const dimOthers = activeNodes.size > 0 || flowEdges.size > 0
  const minWidth = Math.round(layout.w * 0.72)
  const selectedNode = selected ? nodes.find((n) => n.id === selected) : undefined

  const go = (i: number) => {
    if (!steps) return
    setStep((i + steps.length) % steps.length)
  }

  return (
    <figure className={`figure flow ${wide ? 'wide' : ''}`} aria-label={typeof caption === 'string' ? caption : undefined}>
      <div className="flow__frame">
        <div className="flow__scroll" ref={scrollRef}>
          <svg
            className="flow__svg"
            viewBox={`0 0 ${layout.w} ${layout.h}`}
            style={{ minWidth: Math.min(minWidth, 900) }}
            role="img"
            aria-label={current ? current.title : typeof caption === 'string' ? caption : 'Diagrama'}
          >
            <defs>
              {(['off', 'on'] as const).map((k) => (
                <marker
                  key={k}
                  id={`arrow-${k}-${uid}`}
                  viewBox="0 0 10 10"
                  refX="7"
                  refY="5"
                  markerWidth="4.5"
                  markerHeight="4.5"
                  orient="auto-start-reverse"
                >
                  <path d="M1,1 L8,5 L1,9" className={`flow__arrow flow__arrow--${k}`} />
                </marker>
              ))}
            </defs>

            {layout.groupRects.map((g) => (
              <g key={g.label} className="flow__group">
                <rect x={g.rx} y={g.ry} width={g.rw} height={g.rh} rx={14} />
                <text x={g.rx + 14} y={g.ry + 18}>
                  {g.label}
                </text>
              </g>
            ))}

            {layout.paths.map((p) => {
              const on = flowEdges.has(p.id)
              const dim = dimOthers && !on
              return (
                <g key={p.id} className={`flow__edge ${on ? 'is-on' : ''} ${dim ? 'is-dim' : ''} ${p.edge.dashed ? 'is-dashed' : ''}`}>
                  <path d={p.d} className="flow__edge-casing" />
                  <path
                    d={p.d}
                    className="flow__edge-line"
                    markerEnd={`url(#arrow-${on ? 'on' : 'off'}-${uid})`}
                    markerStart={p.edge.bidir ? `url(#arrow-${on ? 'on' : 'off'}-${uid})` : undefined}
                  />
                  {p.edge.label && (
                    <text x={p.mid.x} y={p.mid.y - 8} className="flow__edge-label" textAnchor="middle">
                      {p.edge.label}
                    </text>
                  )}
                  {on && !reduced && (
                    <circle r={6.5} className="flow__packet" key={`${p.id}-${step}`}>
                      <animateMotion dur={`${Math.max(0.9, p.len / 230)}s`} repeatCount="indefinite" path={p.d} rotate="auto" />
                    </circle>
                  )}
                </g>
              )
            })}

            {nodes.map((n) => {
              const b = layout.boxes.get(n.id)!
              const Icon = kindIcons[n.kind ?? 'service']
              const on = activeNodes.has(n.id)
              const dim = dimOthers && !on
              return (
                <g
                  key={n.id}
                  className={`flow__node tone-${n.tone ?? 'default'} ${on ? 'is-on' : ''} ${dim ? 'is-dim' : ''} ${n.desc ? 'is-clickable' : ''}`}
                  transform={`translate(${b.cx - b.w / 2}, ${b.cy - b.h / 2})`}
                  onClick={n.desc ? () => setSelected((s) => (s === n.id ? null : n.id)) : undefined}
                  onKeyDown={
                    n.desc
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault()
                            setSelected((s) => (s === n.id ? null : n.id))
                          }
                        }
                      : undefined
                  }
                  tabIndex={n.desc ? 0 : undefined}
                  role={n.desc ? 'button' : undefined}
                  aria-label={n.desc ? `${n.label}: ver detalle` : undefined}
                >
                  <rect className="flow__node-box" width={b.w} height={b.h} rx={10} />
                  <g transform={`translate(12, ${b.h / 2 - 10})`} className="flow__node-icon">
                    <Icon width={20} height={20} strokeWidth={1.75} />
                  </g>
                  <text x={40} y={n.sub ? b.h / 2 - 3 : b.h / 2 + 5} className="flow__node-label">
                    {n.label}
                  </text>
                  {n.sub && (
                    <text x={40} y={b.h / 2 + 15} className="flow__node-sub">
                      {n.sub}
                    </text>
                  )}
                </g>
              )
            })}
          </svg>
        </div>
        {overflowing && <div className="flow__hint" aria-hidden="true">desliza para ver todo →</div>}

        {hasSteps ? (
          <div className="flow__panel">
            <div className="flow__controls">
              <button type="button" className="icon-btn" onClick={() => go(step - 1)} aria-label="Paso anterior">
                <ChevronLeft size={20} />
              </button>
              <ol className="flow__stations" aria-label="Pasos">
                {steps!.map((s, i) => (
                  <li key={i}>
                    <button
                      type="button"
                      className={`flow__station ${i === step ? 'is-current' : ''} ${i < step ? 'is-past' : ''}`}
                      onClick={() => {
                        setStep(i)
                        setPlaying(false)
                      }}
                      aria-label={`Paso ${i + 1}: ${s.title}`}
                      aria-current={i === step ? 'step' : undefined}
                    />
                  </li>
                ))}
              </ol>
              <button type="button" className="icon-btn" onClick={() => go(step + 1)} aria-label="Paso siguiente">
                <ChevronRight size={20} />
              </button>
              <button
                type="button"
                className="btn btn--ghost flow__play"
                onClick={() => {
                  if (!playing && step === steps!.length - 1) setStep(0)
                  setPlaying((p) => !p)
                }}
                aria-pressed={playing}
              >
                {playing ? <Pause size={16} /> : step === steps!.length - 1 ? <RotateCcw size={16} /> : <Play size={16} />}
                {playing ? 'Pausa' : 'Reproducir'}
              </button>
            </div>
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={step}
                className="flow__step"
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, transition: { duration: 0.1 } }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
                aria-live="polite"
              >
                <div className="flow__step-head">
                  <span className="flow__step-num">
                    {step + 1}/{steps!.length}
                  </span>
                  <strong>{current!.title}</strong>
                </div>
                {current!.body && <div className="flow__step-body">{current!.body}</div>}
              </motion.div>
            </AnimatePresence>
          </div>
        ) : nodes.some((n) => n.desc) ? (
          <div className="flow__panel flow__panel--info" aria-live="polite">
            {selectedNode ? (
              <div className="flow__step">
                <div className="flow__step-head">
                  <strong>{selectedNode.label}</strong>
                </div>
                <div className="flow__step-body">{selectedNode.desc}</div>
              </div>
            ) : (
              <p className="flow__idle">Toca un componente para ver qué hace.</p>
            )}
          </div>
        ) : null}
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
