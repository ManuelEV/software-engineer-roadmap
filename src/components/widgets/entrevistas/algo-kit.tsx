/**
 * Algorithm-animation kit for the interview unit. Every live-coding widget is a
 * list of precomputed "frames" (one per step of the algorithm) played with
 * useStepPlayer (./useStepPlayer) + <StepControls>, drawn with <ArrayView>/<VarPanel>, and paired
 * with <CodeTrace> so the reader sees which line produced the current frame.
 *
 *   const frames = useMemo(() => buildFrames(input), [input])
 *   const player = useStepPlayer(frames.length, { resetKey: input.join(',') })
 *   const f = frames[player.i]
 *   <WidgetFrame controls={…inputs…} readout={<StepNote>{f.note}</StepNote>}>
 *     <ArrayView values={…} states={f.states} pointers={f.pointers} />
 *     <CodeTrace lines={CODE} active={f.line} />
 *     <StepControls player={player} />
 *   </WidgetFrame>
 */
import type { ReactNode } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ChevronLeft, ChevronRight, Pause, Play, RotateCcw } from 'lucide-react'
import type { StepPlayer } from './useStepPlayer'
import { pickLang, useCodeLang } from '../../../lib/codeLang'
import './algo-kit.css'

/** Reset / previous / play-pause / next, with a step counter and a scrubber. */
export function StepControls({ player, label = 'Paso' }: { player: StepPlayer; label?: string }) {
  const { i, total, playing, atStart, atEnd, next, prev, reset, toggle, go } = player
  return (
    <div className="ak-ctrl" role="group" aria-label="Controles de la animación">
      <button type="button" className="icon-btn ak-ctrl__btn" onClick={reset} disabled={atStart && !playing} aria-label="Volver al inicio" title="Volver al inicio">
        <RotateCcw size={17} />
      </button>
      <button type="button" className="icon-btn ak-ctrl__btn" onClick={prev} disabled={atStart} aria-label="Paso anterior" title="Paso anterior">
        <ChevronLeft size={20} />
      </button>
      <button type="button" className="btn btn--line ak-ctrl__play" onClick={toggle} aria-label={playing ? 'Pausar' : 'Reproducir'}>
        {playing ? <Pause size={16} /> : <Play size={16} />}
        {playing ? 'Pausar' : atEnd && total > 1 ? 'Repetir' : 'Reproducir'}
      </button>
      <button type="button" className="icon-btn ak-ctrl__btn" onClick={next} disabled={atEnd} aria-label="Paso siguiente" title="Paso siguiente">
        <ChevronRight size={20} />
      </button>
      <input
        type="range"
        className="ak-ctrl__scrub"
        min={0}
        max={Math.max(0, total - 1)}
        value={i}
        onChange={(e) => go(Number(e.target.value))}
        aria-label={`${label} ${i + 1} de ${total}`}
        style={{ ['--pct' as string]: `${total > 1 ? (i / (total - 1)) * 100 : 100}%` }}
      />
      <span className="ak-ctrl__count" aria-live="polite">
        {label} {i + 1}
        <span className="ak-ctrl__of"> / {total}</span>
      </span>
    </div>
  )
}

/** The sentence that explains the current frame (put it in WidgetFrame's readout). */
export function StepNote({ children, tone }: { children: ReactNode; tone?: 'ok' | 'warn' | 'bad' }) {
  return <p className={`ak-note ${tone ? `ak-note--${tone}` : ''}`}>{children}</p>
}

/* ───────────── Arrays with pointers ───────────── */

export type CellState = 'idle' | 'active' | 'compare' | 'window' | 'done' | 'found' | 'muted' | 'bad'

export interface Pointer {
  /** index the pointer sits under; -1 or ≥ length draws it just outside */
  at: number
  label: string
  tone?: 'line' | 'ink' | 'ok' | 'bad'
}

/**
 * A row of cells (an array, a string, a stack…) with optional index labels and
 * named pointers underneath that slide between cells.
 */
export function ArrayView({
  values,
  states,
  pointers = [],
  indices = true,
  label,
  caption,
  maxCell = 52,
}: {
  values: ReactNode[]
  /** per-index state; missing = idle */
  states?: Partial<Record<number, CellState>> | CellState[]
  pointers?: Pointer[]
  indices?: boolean
  /** accessible description of what the row is */
  label: string
  /** small label printed above the row, e.g. "nums" */
  caption?: ReactNode
  /** max cell width in px */
  maxCell?: number
}) {
  const reduced = useReducedMotion()
  const n = values.length
  const stateOf = (k: number): CellState => (Array.isArray(states) ? states[k] : states?.[k]) ?? 'idle'
  // pointers sharing an index stack downwards
  const lanes = new Map<number, number>()
  const placed = pointers.map((p) => {
    const lane = lanes.get(p.at) ?? 0
    lanes.set(p.at, lane + 1)
    return { ...p, lane }
  })
  const laneCount = Math.max(0, ...placed.map((p) => p.lane + 1))
  const col = (at: number) => Math.max(1, Math.min(n, at + 1))

  return (
    <div className="ak-arr" role="img" aria-label={label} style={{ ['--ak-n' as string]: Math.max(n, 1), ['--ak-max' as string]: `${maxCell}px` }}>
      {caption && <div className="ak-arr__caption">{caption}</div>}
      <div className="ak-arr__row">
        {values.map((v, k) => (
          <div key={k} className={`ak-cell is-${stateOf(k)}`}>
            <span className="ak-cell__v">{v}</span>
            {indices && <span className="ak-cell__i">{k}</span>}
          </div>
        ))}
      </div>
      {laneCount > 0 && (
        <div className="ak-arr__ptrs" style={{ gridTemplateRows: `repeat(${laneCount}, auto)` }}>
          {placed.map((p) => (
            <motion.div
              key={p.label}
              layout={!reduced}
              transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
              className={`ak-ptr ak-ptr--${p.tone ?? 'line'} ${p.at < 0 ? 'is-before' : p.at >= n ? 'is-after' : ''}`}
              style={{ gridColumn: col(p.at), gridRow: p.lane + 1 }}
            >
              <span className="ak-ptr__tip" aria-hidden="true" />
              {p.label}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ───────────── Variables & code ───────────── */

/** Current values of the algorithm's variables, as small labelled chips. */
export function VarPanel({ vars, label = 'Variables' }: { vars: { name: string; value: ReactNode; changed?: boolean }[]; label?: string }) {
  return (
    <dl className="ak-vars" aria-label={label}>
      {vars.map((v) => (
        <div key={v.name} className={`ak-var ${v.changed ? 'is-changed' : ''}`}>
          <dt>{v.name}</dt>
          <dd>{v.value}</dd>
        </div>
      ))}
    </dl>
  )
}

/** Another language for the same code, with its lines lined up to the base. */
export interface CodeVariant {
  /** tab label, e.g. "Java" (the reader's choice is shared with <CodeTabs>) */
  label: string
  lines: string[]
  /**
   * For each line index of the base `lines`, the line(s) of this variant that
   * do the same thing (null when there is no equivalent). Frames keep using
   * base line numbers; the highlight is translated through this map.
   */
  map: (number | number[] | null)[]
}

/**
 * The solution's code with the line(s) that produced the current frame
 * highlighted. `active` is 0-based and always refers to the base `lines`
 * (usually Python); pass `variants` to offer the same code in other languages
 * (e.g. Java) behind tabs.
 */
export function CodeTrace({
  lines,
  active,
  title = 'Python',
  variants = [],
}: {
  lines: string[]
  active?: number | number[]
  title?: string
  variants?: CodeVariant[]
}) {
  const [pref, setPref] = useCodeLang()
  const all = [{ label: title, lines, map: null as CodeVariant['map'] | null }, ...variants]
  const sel = all[variants.length ? pickLang(all.map((v) => v.label), pref) : 0]
  const base = Array.isArray(active) ? active : active === undefined ? [] : [active]
  const on = new Set(
    sel.map ? base.flatMap((k) => (k >= 0 && k < sel.map!.length ? [sel.map![k]].flat().filter((x): x is number => x !== null) : [])) : base,
  )

  return (
    <div className="ak-code">
      {variants.length > 0 ? (
        <div className="ak-code__tabs" role="tablist" aria-label="Lenguaje del código">
          {/* Java leads, as in <CodeTabs>; the base code keeps driving the frames */}
          {[...all].sort((a, b) => Number(b.label === 'Java') - Number(a.label === 'Java')).map((v) => (
            <button
              key={v.label}
              type="button"
              role="tab"
              aria-selected={v === sel}
              className={`ak-code__tab ${v === sel ? 'is-on' : ''}`}
              onClick={() => setPref(v.label)}
            >
              {v.label}
            </button>
          ))}
        </div>
      ) : (
        title && <div className="ak-code__title">{title}</div>
      )}
      <pre aria-label={`Código en ${sel.label}`}>
        {sel.lines.map((l, k) => (
          <div key={k} className={`ak-code__line ${on.has(k) ? 'is-on' : ''}`} aria-current={on.has(k) ? 'step' : undefined}>
            <span className="ak-code__n" aria-hidden="true">
              {k + 1}
            </span>
            <code>{l || ' '}</code>
          </div>
        ))}
      </pre>
    </div>
  )
}

/** Two-column stage on wide screens (visual left, code right), stacked on mobile. */
export function AlgoLayout({ visual, code }: { visual: ReactNode; code: ReactNode }) {
  return (
    <div className="ak-layout">
      <div className="ak-layout__visual">{visual}</div>
      <div className="ak-layout__code">{code}</div>
    </div>
  )
}
