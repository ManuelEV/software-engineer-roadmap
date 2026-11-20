/**
 * UmlDiagram — small, interactive UML-ish class diagram for pattern structures.
 *
 * Coordinates are grid cells (x = column, y = row; fractions allowed), measured
 * at the CENTER of each class box. One column ≈ 230 units, one row ≈ 150 units.
 * Optional mx/my give an alternative layout under 560 px.
 *
 * Relations go from → to:
 *  - inherits / implements: subclass → superclass (hollow triangle at `to`)
 *  - composes / aggregates: whole → part (diamond at `from`)
 *  - depends: client → dependency (dashed, open arrow at `to`)
 *  - uses: association (solid, open arrow at `to`)
 */
import { type ReactNode, useMemo, useState } from 'react'
import { WidgetFrame } from '../kit'
import { useMediaQuery } from '../../../lib/hooks'
import './UmlDiagram.css'

export interface UmlClass {
  id: string
  name: string
  kind?: 'class' | 'interface' | 'abstract' | 'note'
  fields?: string[]
  methods?: string[]
  x: number
  y: number
  mx?: number
  my?: number
  /** width multiplier (1 = 196 units) */
  w?: number
  desc?: ReactNode
  tone?: 'line' | 'muted'
}

export interface UmlRelation {
  from: string
  to: string
  kind: 'inherits' | 'implements' | 'composes' | 'aggregates' | 'depends' | 'uses'
  label?: string
}

const COL = 230
const ROW = 150
const BASE_W = 196
const LINE = 18
const PAD = 22

type Pt = { x: number; y: number }

function boxHeight(c: UmlClass) {
  const stereo = c.kind === 'interface' || c.kind === 'abstract'
  let h = 34 + (stereo ? 15 : 0)
  if (c.fields?.length) h += c.fields.length * LINE + 10
  if (c.methods?.length) h += c.methods.length * LINE + 10
  return h
}

function clip(from: Pt, c: Pt, w: number, h: number, pad = 2): Pt {
  const dx = from.x - c.x
  const dy = from.y - c.y
  if (dx === 0 && dy === 0) return c
  const hw = w / 2 + pad
  const hh = h / 2 + pad
  const t = Math.min(dx === 0 ? Infinity : hw / Math.abs(dx), dy === 0 ? Infinity : hh / Math.abs(dy))
  return { x: c.x + dx * Math.min(t, 1), y: c.y + dy * Math.min(t, 1) }
}

const relLabel: Record<UmlRelation['kind'], string> = {
  inherits: 'hereda de',
  implements: 'implementa',
  composes: 'se compone de',
  aggregates: 'agrega',
  depends: 'depende de',
  uses: 'usa',
}

export function UmlDiagram({
  classes,
  relations = [],
  caption,
  title = 'Estructura',
  wide = false,
}: {
  classes: UmlClass[]
  relations?: UmlRelation[]
  caption?: ReactNode
  title?: string
  wide?: boolean
}) {
  const narrow = useMediaQuery('(max-width: 559px)')
  const [hover, setHover] = useState<string | null>(null)
  const [selected, setSelected] = useState<string | null>(null)

  const layout = useMemo(() => {
    const boxes = new Map(
      classes.map((c) => {
        const gx = narrow && c.mx !== undefined ? c.mx : c.x
        const gy = narrow && c.my !== undefined ? c.my : c.y
        const w = BASE_W * (c.w ?? 1)
        const h = boxHeight(c)
        return [c.id, { cx: gx * COL, cy: gy * ROW, w, h }] as const
      }),
    )
    let minX = Infinity
    let minY = Infinity
    let maxX = -Infinity
    let maxY = -Infinity
    boxes.forEach((b) => {
      minX = Math.min(minX, b.cx - b.w / 2)
      minY = Math.min(minY, b.cy - b.h / 2)
      maxX = Math.max(maxX, b.cx + b.w / 2)
      maxY = Math.max(maxY, b.cy + b.h / 2)
    })
    // Parallel relations between the same pair of classes get a perpendicular offset
    const pairKey = (r: UmlRelation) => [r.from, r.to].sort().join('|')
    const pairTotals = new Map<string, number>()
    relations.forEach((r) => pairTotals.set(pairKey(r), (pairTotals.get(pairKey(r)) ?? 0) + 1))
    const pairSeen = new Map<string, number>()
    const edges = relations
      .map((r, i) => {
        const a = boxes.get(r.from)
        const b = boxes.get(r.to)
        if (!a || !b) return null
        const key = pairKey(r)
        const total = pairTotals.get(key) ?? 1
        const k = pairSeen.get(key) ?? 0
        pairSeen.set(key, k + 1)
        let ox = 0
        let oy = 0
        if (total > 1) {
          // normal computed on the sorted pair so both directions share orientation
          const [first] = [r.from, r.to].sort()
          const s = first === r.from ? a : b
          const t = first === r.from ? b : a
          const dl = Math.hypot(t.cx - s.cx, t.cy - s.cy) || 1
          const off = (k - (total - 1) / 2) * 16
          ox = (-(t.cy - s.cy) / dl) * off
          oy = ((t.cx - s.cx) / dl) * off
        }
        const ca = { x: a.cx + ox, y: a.cy + oy }
        const cb = { x: b.cx + ox, y: b.cy + oy }
        const p0 = clip(cb, ca, a.w, a.h)
        const p1 = clip(ca, cb, b.w, b.h)
        const len = Math.hypot(p1.x - p0.x, p1.y - p0.y) || 1
        const d = { x: (p1.x - p0.x) / len, y: (p1.y - p0.y) / len }
        const n = { x: -d.y, y: d.x }
        const S = 14
        let start = p0
        let end = p1
        let head = ''
        let headFilled = false
        let tail = ''
        let tailFilled = false
        if (r.kind === 'inherits' || r.kind === 'implements') {
          const base = { x: p1.x - d.x * S, y: p1.y - d.y * S }
          head = `M${p1.x},${p1.y} L${base.x + n.x * S * 0.6},${base.y + n.y * S * 0.6} L${base.x - n.x * S * 0.6},${base.y - n.y * S * 0.6} Z`
          end = base
        } else {
          const back = { x: p1.x - d.x * 11, y: p1.y - d.y * 11 }
          head = `M${back.x + n.x * 6.5},${back.y + n.y * 6.5} L${p1.x},${p1.y} L${back.x - n.x * 6.5},${back.y - n.y * 6.5}`
        }
        if (r.kind === 'composes' || r.kind === 'aggregates') {
          const m = { x: p0.x + d.x * S * 0.9, y: p0.y + d.y * S * 0.9 }
          const far = { x: p0.x + d.x * S * 1.8, y: p0.y + d.y * S * 1.8 }
          tail = `M${p0.x},${p0.y} L${m.x + n.x * S * 0.45},${m.y + n.y * S * 0.45} L${far.x},${far.y} L${m.x - n.x * S * 0.45},${m.y - n.y * S * 0.45} Z`
          tailFilled = r.kind === 'composes'
          start = far
        }
        const mid = { x: (p0.x + p1.x) / 2, y: (p0.y + p1.y) / 2 }
        return { r, key: `${r.from}-${r.to}-${i}`, start, end, head, headFilled, tail, tailFilled, mid, n }
      })
      .filter(Boolean) as {
      r: UmlRelation
      key: string
      start: Pt
      end: Pt
      head: string
      headFilled: boolean
      tail: string
      tailFilled: boolean
      mid: Pt
      n: Pt
    }[]
    return {
      boxes,
      edges,
      vb: { x: minX - PAD, y: minY - PAD, w: maxX - minX + PAD * 2, h: maxY - minY + PAD * 2 },
    }
  }, [classes, relations, narrow])

  const focus = hover ?? selected
  const neighbors = new Set<string>()
  if (focus) {
    neighbors.add(focus)
    relations.forEach((r) => {
      if (r.from === focus) neighbors.add(r.to)
      if (r.to === focus) neighbors.add(r.from)
    })
  }
  const sel = classes.find((c) => c.id === selected)
  const selRels = selected ? relations.filter((r) => r.from === selected || r.to === selected) : []
  const nameOf = (id: string) => classes.find((c) => c.id === id)?.name ?? id

  const toggle = (id: string) => setSelected((s) => (s === id ? null : id))

  return (
    <WidgetFrame
      caption={caption}
      title={title}
      wide={wide}
      readout={
        sel ? (
          <div className="uml-readout" aria-live="polite">
            <p>
              <b className="uml-readout__name">{sel.name}</b>
              {sel.desc ? <> — {sel.desc}</> : null}
            </p>
            {selRels.length > 0 && (
              <p className="uml-readout__rels">
                {selRels.map((r, i) => (
                  <span key={i}>
                    {nameOf(r.from)} <i>{relLabel[r.kind]}</i> {nameOf(r.to)}
                    {r.label ? ` (${r.label})` : ''}
                    {i < selRels.length - 1 ? ' · ' : ''}
                  </span>
                ))}
              </p>
            )}
          </div>
        ) : (
          <div className="uml-legend" aria-label="Leyenda">
            <span className="uml-legend__hint">Toca una clase para ver su rol.</span>
            <span className="uml-legend__item">
              <svg viewBox="0 0 40 14" width="40" height="14" aria-hidden="true">
                <line x1="2" y1="7" x2="26" y2="7" className="uml-l" />
                <path d="M38,7 L26,1 L26,13 Z" className="uml-l uml-hollow" />
              </svg>
              hereda
            </span>
            <span className="uml-legend__item">
              <svg viewBox="0 0 40 14" width="40" height="14" aria-hidden="true">
                <line x1="2" y1="7" x2="26" y2="7" className="uml-l uml-dash" />
                <path d="M38,7 L26,1 L26,13 Z" className="uml-l uml-hollow" />
              </svg>
              implementa
            </span>
            <span className="uml-legend__item">
              <svg viewBox="0 0 40 14" width="40" height="14" aria-hidden="true">
                <path d="M2,7 L9,2 L16,7 L9,12 Z" className="uml-l uml-filled" />
                <line x1="16" y1="7" x2="38" y2="7" className="uml-l" />
              </svg>
              compone
            </span>
            <span className="uml-legend__item">
              <svg viewBox="0 0 40 14" width="40" height="14" aria-hidden="true">
                <line x1="2" y1="7" x2="37" y2="7" className="uml-l uml-dash" />
                <path d="M30,2 L37,7 L30,12" className="uml-l" />
              </svg>
              depende
            </span>
          </div>
        )
      }
    >
      <div className="uml-scroll">
        <svg
          className="uml-svg"
          viewBox={`${layout.vb.x} ${layout.vb.y} ${layout.vb.w} ${layout.vb.h}`}
          style={{ minWidth: Math.min(Math.round(layout.vb.w * 0.8), 900) }}
          role="group"
          aria-label={typeof caption === 'string' ? caption : 'Diagrama de clases'}
        >
          {layout.edges.map((e) => {
            const on = !!focus && (e.r.from === focus || e.r.to === focus)
            const dim = !!focus && !on
            const dashed = e.r.kind === 'implements' || e.r.kind === 'depends'
            return (
              <g key={e.key} className={`uml-edge ${on ? 'is-on' : ''} ${dim ? 'is-dim' : ''}`}>
                <line
                  x1={e.start.x}
                  y1={e.start.y}
                  x2={e.end.x}
                  y2={e.end.y}
                  className={`uml-l ${dashed ? 'uml-dash' : ''}`}
                />
                <path d={e.head} className={`uml-l ${e.r.kind === 'inherits' || e.r.kind === 'implements' ? 'uml-hollow' : ''}`} />
                {e.tail && <path d={e.tail} className={`uml-l ${e.tailFilled ? 'uml-filled' : 'uml-hollow'}`} />}
                {e.r.label && (
                  <text
                    x={e.mid.x + e.n.x * 12}
                    y={e.mid.y + e.n.y * 12 + 4}
                    textAnchor="middle"
                    className="uml-edge__label"
                  >
                    {e.r.label}
                  </text>
                )}
              </g>
            )
          })}

          {classes.map((c) => {
            const b = layout.boxes.get(c.id)!
            const x = b.cx - b.w / 2
            const y = b.cy - b.h / 2
            const stereo = c.kind === 'interface' ? '«interface»' : c.kind === 'abstract' ? '«abstract»' : null
            const on = focus === c.id
            const near = !on && neighbors.has(c.id)
            const dim = !!focus && !neighbors.has(c.id)
            let cursor = 34 + (stereo ? 15 : 0)
            const sections: ReactNode[] = []
            ;[c.fields, c.methods].forEach((list, si) => {
              if (!list?.length) return
              sections.push(<line key={`sep${si}`} x1={0} x2={b.w} y1={cursor} y2={cursor} className="uml-sep" />)
              list.forEach((m, mi) => {
                sections.push(
                  <text key={`${si}-${mi}`} x={10} y={cursor + 18 + mi * LINE} className="uml-member">
                    {m}
                  </text>,
                )
              })
              cursor += list.length * LINE + 10
            })
            return (
              <g
                key={c.id}
                className={`uml-class kind-${c.kind ?? 'class'} tone-${c.tone ?? 'default'} ${on || selected === c.id ? 'is-on' : ''} ${near ? 'is-near' : ''} ${dim ? 'is-dim' : ''}`}
                transform={`translate(${x}, ${y})`}
                tabIndex={0}
                role="button"
                aria-pressed={selected === c.id}
                aria-label={`${stereo ? stereo.replace(/[«»]/g, '') + ' ' : ''}${c.name}${c.methods?.length ? ': ' + c.methods.join(', ') : ''}`}
                onMouseEnter={() => setHover(c.id)}
                onMouseLeave={() => setHover(null)}
                onFocus={() => setHover(c.id)}
                onBlur={() => setHover(null)}
                onClick={() => toggle(c.id)}
                onKeyDown={(ev) => {
                  if (ev.key === 'Enter' || ev.key === ' ') {
                    ev.preventDefault()
                    toggle(c.id)
                  }
                }}
              >
                <rect width={b.w} height={b.h} rx={c.kind === 'note' ? 2 : 8} className="uml-box" />
                {stereo && (
                  <text x={b.w / 2} y={19} textAnchor="middle" className="uml-stereo">
                    {stereo}
                  </text>
                )}
                <text x={b.w / 2} y={stereo ? 37 : 23} textAnchor="middle" className="uml-name">
                  {c.name}
                </text>
                {sections}
              </g>
            )
          })}
        </svg>
      </div>
    </WidgetFrame>
  )
}
