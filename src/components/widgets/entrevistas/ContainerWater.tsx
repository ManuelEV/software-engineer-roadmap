import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { WidgetFrame } from '../kit'
import { AlgoLayout, CodeTrace, StepControls, StepNote, VarPanel } from './algo-kit'
import { useStepPlayer } from './useStepPlayer'
import './ContainerWater.css'

/**
 * Container With Most Water: two pointers that start at the ends and always
 * move the shorter side inwards. The note explains why that side can be
 * discarded.
 */

const CODE = [
  'def max_area(height):',
  '    l, r = 0, len(height) - 1',
  '    best = 0',
  '    while l < r:',
  '        area = min(height[l], height[r]) * (r - l)',
  '        best = max(best, area)',
  '        if height[l] < height[r]:',
  '            l += 1',
  '        else:',
  '            r -= 1',
  '    return best',
]

/** Same solution in Java; JAVA_MAP[k] = the Java line(s) for Python line k. */
const JAVA = [
  'int maxArea(int[] height) {',
  '    int l = 0, r = height.length - 1;',
  '    int best = 0;',
  '    while (l < r) {',
  '        int area = Math.min(height[l], height[r]) * (r - l);',
  '        best = Math.max(best, area);',
  '        if (height[l] < height[r]) {',
  '            l++;',
  '        } else {',
  '            r--;',
  '        }',
  '    }',
  '    return best;',
  '}',
]
const JAVA_MAP = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 12]

interface Frame {
  line: number | number[]
  l: number
  r: number
  area?: number
  best: number
  bestPair: [number, number] | null
  discarded: number[]
  note: string
  tone?: 'ok' | 'bad'
  /** this frame computed an area (draw the water) */
  measuring: boolean
}

function buildFrames(h: number[]): Frame[] {
  const frames: Frame[] = []
  let l = 0
  let r = h.length - 1
  let best = 0
  let bestPair: [number, number] | null = null
  const discarded: number[] = []

  frames.push({
    line: [1, 2],
    l,
    r,
    best,
    bestPair,
    discarded: [],
    measuring: false,
    note: `l en el borde izquierdo y r en el derecho: empezamos con el contenedor más ancho posible (ancho ${r - l}). Cada paso achica el ancho en 1, así que solo nos conviene buscar paredes más altas.`,
  })

  while (l < r) {
    const lo = Math.min(h[l], h[r])
    const area = lo * (r - l)
    const improved = area > best
    if (improved) {
      best = area
      bestPair = [l, r]
    }
    frames.push({
      line: [4, 5],
      l,
      r,
      area,
      best,
      bestPair,
      discarded: [...discarded],
      measuring: true,
      tone: improved ? 'ok' : undefined,
      note: `Área = min(${h[l]}, ${h[r]}) × (${r} − ${l}) = ${lo} × ${r - l} = ${area}. ${improved ? `Es el nuevo mejor: best = ${best}.` : `No supera a best = ${best}.`}`,
    })

    let note: string
    let line: number[]
    if (h[l] < h[r]) {
      note = `height[l] = ${h[l]} es el lado bajo y limita la altura. Si dejáramos l fijo y moviéramos r hacia adentro, el ancho bajaría y la altura seguiría siendo como mucho ${h[l]}: ninguno de esos contenedores supera ${area}. La pared ${l} ya dio lo mejor que podía, así que la descartamos: l += 1.`
      discarded.push(l)
      l++
      line = [6, 7]
    } else if (h[l] > h[r]) {
      note = `height[r] = ${h[r]} es el lado bajo. Cualquier contenedor con r fijo y un l más adentro es más angosto y no más alto que ${h[r]}: no puede ganarle a ${area}. Descartamos la pared ${r}: r −= 1.`
      discarded.push(r)
      r--
      line = [8, 9]
    } else {
      note = `Empate: ambas paredes miden ${h[l]}. Con cualquiera de las dos fija, todo contenedor de adentro es más angosto y no más alto que ${h[l]}, así que ninguna puede mejorar. Da igual cuál movemos; el código mueve r.`
      discarded.push(r)
      r--
      line = [8, 9]
    }
    frames.push({ line, l, r, best, bestPair, discarded: [...discarded], measuring: false, note })
  }

  frames.push({
    line: 10,
    l,
    r,
    best,
    bestPair,
    discarded: [...discarded],
    measuring: false,
    tone: 'ok',
    note: `Los punteros se cruzaron: revisamos ${frames.filter((f) => f.measuring).length} contenedores en vez de los n(n − 1)/2 = ${(h.length * (h.length - 1)) / 2} de la fuerza bruta. Respuesta: ${best}. O(n) tiempo, O(1) memoria.`,
  })
  return frames
}

const PRESETS: { label: string; h: number[] }[] = [
  { label: '[1, 8, 6, 2, 5, 4, 8, 3, 7]', h: [1, 8, 6, 2, 5, 4, 8, 3, 7] },
  { label: '[4, 3, 2, 1, 4]', h: [4, 3, 2, 1, 4] },
  { label: '[2, 3, 10, 5, 7, 8, 9]', h: [2, 3, 10, 5, 7, 8, 9] },
  { label: '[1, 1] (mínimo)', h: [1, 1] },
]

function parseHeights(text: string): number[] | null {
  const parts = text.split(/[\s,]+/).filter(Boolean)
  if (parts.length < 2 || parts.length > 12) return null
  if (!parts.every((p) => /^\d{1,2}$/.test(p) && Number(p) <= 20)) return null
  return parts.map(Number)
}

const SLOT = 44
const PAD = 22
const TOP = 34
const PLOT = 150
const BASE = TOP + PLOT
const BAR = 16
const EASE = [0.16, 1, 0.3, 1] as const

export function ContainerWater() {
  const reduced = useReducedMotion()
  const [preset, setPreset] = useState(0)
  const [h, setH] = useState(PRESETS[0].h)
  const [text, setText] = useState(PRESETS[0].h.join(', '))
  const frames = useMemo(() => buildFrames(h), [h])
  const player = useStepPlayer(frames.length, { resetKey: h.join(',') })
  const f = frames[player.i]
  const prev = frames[player.i - 1]
  const ok = parseHeights(text) !== null

  const n = h.length
  const W = PAD * 2 + n * SLOT
  const H = BASE + 58
  const maxH = Math.max(1, ...h)
  const y = (v: number) => BASE - (v / maxH) * PLOT
  const cx = (j: number) => PAD + j * SLOT + SLOT / 2
  const t = reduced ? { duration: 0 } : { duration: 0.3, ease: EASE }
  const done = player.i === frames.length - 1
  const water = f.measuring ? Math.min(h[f.l], h[f.r]) : 0

  const pick = (p: number) => {
    setPreset(p)
    setH(PRESETS[p].h)
    setText(PRESETS[p].h.join(', '))
  }

  return (
    <WidgetFrame
      caption="Container With Most Water: dos punteros en los extremos. En cada paso medimos el área y movemos el lado más bajo, porque ese lado ya no puede formar un contenedor mejor."
      controls={
        <>
          <label className="cw-field">
            <span className="seg__label">Ejemplo</span>
            <select value={preset} onChange={(e) => pick(Number(e.target.value))}>
              {PRESETS.map((p, j) => (
                <option key={p.label} value={j}>
                  {p.label}
                </option>
              ))}
            </select>
          </label>
          <label className="cw-field cw-field--grow">
            <span className="seg__label">Alturas (2 a 12 valores, de 0 a 20)</span>
            <input
              type="text"
              value={text}
              aria-invalid={!ok}
              onChange={(e) => {
                setText(e.target.value)
                const p = parseHeights(e.target.value)
                if (p) setH(p)
              }}
            />
          </label>
        </>
      }
      readout={<StepNote tone={f.tone}>{f.note}</StepNote>}
    >
      <AlgoLayout
        visual={
          <>
            <svg className="cw-svg" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Alturas ${h.join(', ')}; l en ${f.l}, r en ${f.r}, mejor área ${f.best}`}>
              {f.bestPair && (
                <rect
                  className="cw-best"
                  x={cx(f.bestPair[0])}
                  y={y(Math.min(h[f.bestPair[0]], h[f.bestPair[1]]))}
                  width={cx(f.bestPair[1]) - cx(f.bestPair[0])}
                  height={BASE - y(Math.min(h[f.bestPair[0]], h[f.bestPair[1]]))}
                />
              )}
              <motion.rect
                className="cw-water"
                initial={false}
                animate={{
                  x: cx(f.l),
                  y: y(water),
                  width: Math.max(0, cx(f.r) - cx(f.l)),
                  height: BASE - y(water),
                  opacity: f.measuring ? 1 : 0,
                }}
                transition={t}
              />
              <line className="cw-base" x1={PAD / 2} x2={W - PAD / 2} y1={BASE} y2={BASE} />
              {h.map((v, j) => {
                const isPtr = !done && (j === f.l || j === f.r)
                const gone = f.discarded.includes(j)
                return (
                  <g key={j} className={`cw-bar ${isPtr ? 'is-ptr' : ''} ${gone ? 'is-gone' : ''}`}>
                    <rect x={cx(j) - BAR / 2} y={y(v)} width={BAR} height={BASE - y(v)} rx={2} />
                    <text className="cw-h" x={cx(j)} y={y(v) - 7} textAnchor="middle">
                      {v}
                    </text>
                    <text className="cw-i" x={cx(j)} y={BASE + 18} textAnchor="middle">
                      {j}
                    </text>
                  </g>
                )
              })}
              {!done &&
                (['l', 'r'] as const).map((p) => (
                  <motion.g key={p} initial={false} animate={{ x: cx(p === 'l' ? f.l : f.r) }} transition={t}>
                    <path className="cw-ptr-tip" d={`M -6 ${BASE + 32} L 6 ${BASE + 32} L 0 ${BASE + 25} Z`} />
                    <text className="cw-ptr" x={0} y={BASE + 50} textAnchor="middle">
                      {p}
                    </text>
                  </motion.g>
                ))}
            </svg>
            <div className="cw-legend" aria-hidden="true">
              <span>
                <i className="cw-key cw-key--water" /> área actual
              </span>
              <span>
                <i className="cw-key cw-key--best" /> mejor hasta ahora
              </span>
              <span>
                <i className="cw-key cw-key--gone" /> pared descartada
              </span>
            </div>
            <VarPanel
              vars={[
                { name: 'l', value: f.l, changed: !!prev && prev.l !== f.l },
                { name: 'r', value: f.r, changed: !!prev && prev.r !== f.r },
                { name: 'area', value: f.area ?? '—', changed: !!prev && f.measuring },
                { name: 'best', value: f.best, changed: !!prev && prev.best !== f.best },
              ]}
            />
          </>
        }
        code={<CodeTrace title="Python" lines={CODE} active={f.line} variants={[{ label: 'Java', lines: JAVA, map: JAVA_MAP }]} />}
      />
      <StepControls player={player} />
    </WidgetFrame>
  )
}
