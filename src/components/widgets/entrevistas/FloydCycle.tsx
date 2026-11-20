import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { WidgetFrame } from '../kit'
import { AlgoLayout, CodeTrace, StepControls, StepNote, VarPanel } from './algo-kit'
import { useStepPlayer } from './useStepPlayer'
import './FloydCycle.css'

/**
 * Floyd's tortoise and hare on a "rho"-shaped list: a tail of μ nodes leading
 * into a cycle of λ nodes. Phase 1 moves slow by 1 and fast by 2 until they
 * meet (or fast falls off the end); phase 2 restarts slow from the head and
 * moves both by 1 until they meet at the cycle's entry. Frames come from
 * running the algorithm on the chosen list.
 */

const CODE = [
  'def detect_cycle(head):',
  '    slow = fast = head',
  '    while fast and fast.next:',
  '        slow = slow.next',
  '        fast = fast.next.next',
  '        if slow is fast:',
  '            break',
  '    if not fast or not fast.next:',
  '        return None  # sin ciclo',
  '    slow = head',
  '    while slow is not fast:',
  '        slow = slow.next',
  '        fast = fast.next',
  '    return slow',
]

const NONE = -1

const JAVA = [
  'ListNode detectCycle(ListNode head) {',
  '    ListNode slow = head, fast = head;',
  '    while (fast != null && fast.next != null) {',
  '        slow = slow.next;',
  '        fast = fast.next.next;',
  '        if (slow == fast)',
  '            break;',
  '    }',
  '    if (fast == null || fast.next == null)',
  '        return null;  // sin ciclo',
  '    slow = head;',
  '    while (slow != fast) {',
  '        slow = slow.next;',
  '        fast = fast.next;',
  '    }',
  '    return slow;',
  '}',
]
const JAVA_MAP = [0, 1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 15]

interface Frame {
  line: number | number[]
  slow: number
  fast: number
  steps: number
  phase: 1 | 2
  meet?: number
  entry?: number
  noCycle?: boolean
  note: string
  tone?: 'ok' | 'bad'
}

function buildFrames(n: number, pos: number): Frame[] {
  const nx = (k: number) => (k === NONE ? NONE : k + 1 < n ? k + 1 : pos >= 0 ? pos : NONE)
  const lambda = pos >= 0 ? n - pos : 0
  const ci = (k: number) => k - pos
  const frames: Frame[] = []
  let slow = 0
  let fast = 0
  let steps = 0
  frames.push({ line: 1, slow, fast, steps, phase: 1, note: 'slow y fast empiezan en la cabeza. slow avanza de a 1 nodo; fast, de a 2.' })
  let met = false
  while (fast !== NONE && nx(fast) !== NONE) {
    slow = nx(slow)
    fast = nx(nx(fast))
    steps++
    if (slow === fast) {
      met = true
      frames.push({
        line: [3, 4, 5, 6],
        slow,
        fast,
        steps,
        phase: 1,
        meet: slow,
        tone: 'ok',
        note: `Paso ${steps}: slow y fast están en el mismo nodo (${slow}). Si fast alcanza a slow, tiene que haber un ciclo: en una lista sin ciclo fast llegaría al final primero.`,
      })
      break
    }
    const inCycle = pos >= 0 && slow >= pos && fast >= pos
    const gap = inCycle ? (ci(slow) - ci(fast) + lambda) % lambda : undefined
    frames.push({
      line: [2, 3, 4],
      slow,
      fast,
      steps,
      phase: 1,
      note: inCycle
        ? `Paso ${steps}: los dos ya están en el ciclo. fast está ${gap} ${gap === 1 ? 'paso' : 'pasos'} detrás de slow. Cada paso, slow avanza 1 y fast 2: la distancia baja exactamente en 1, así que fast no puede saltarse a slow.`
        : `Paso ${steps}: slow en ${slow}, fast en ${fast === NONE ? 'None' : fast}. fast va el doble de rápido; si hay ciclo, entra primero y se queda dando vueltas.`,
    })
  }
  if (!met) {
    frames.push({
      line: [7, 8],
      slow,
      fast,
      steps,
      phase: 1,
      noCycle: true,
      tone: 'bad',
      note: `fast ${fast === NONE ? 'llegó a None' : 'quedó en el último nodo (fast.next es None)'}: la lista termina, no hay ciclo. Recorrimos unos n/2 pasos: O(n) tiempo, O(1) memoria.`,
    })
    return frames
  }
  const meet = slow
  slow = 0
  const m = ci(meet)
  frames.push({
    line: 9,
    slow,
    fast,
    steps,
    phase: 2,
    meet,
    note: `Fase 2. slow caminó k = ${steps} pasos y fast 2k = ${2 * steps}. Están en el mismo nodo, así que la diferencia (k = ${steps}) es un múltiplo del largo del ciclo (λ = ${lambda}). Con cola μ = ${pos} y encuentro a m = ${m} pasos de la entrada, μ + m = ${pos + m} también es múltiplo de λ: desde el encuentro, avanzar μ pasos cae justo en la entrada. Volvemos slow a la cabeza.`,
  })
  while (slow !== fast) {
    slow = nx(slow)
    fast = nx(fast)
    frames.push({
      line: [10, 11, 12],
      slow,
      fast,
      steps,
      phase: 2,
      meet,
      note: slow === fast ? `Se encuentran en el nodo ${slow}.` : `Ambos avanzan de a 1: slow en ${slow}, fast en ${fast}. Los dos están a la misma distancia de la entrada.`,
    })
  }
  frames.push({
    line: 13,
    slow,
    fast,
    steps,
    phase: 2,
    meet,
    entry: slow,
    tone: 'ok',
    note:
      pos === 0
        ? `La entrada es la cabeza (nodo 0): μ = 0, así que slow y fast ya estaban juntos y la fase 2 no dio pasos.`
        : `El inicio del ciclo es el nodo ${slow}, a μ = ${pos} pasos de la cabeza. Todo sin memoria extra: O(n) tiempo, O(1) memoria.`,
  })
  return frames
}

const PRESETS: { label: string; n: number; pos: number }[] = [
  { label: 'Cola de 3, ciclo de 5', n: 8, pos: 3 },
  { label: 'Cola de 4, ciclo de 3', n: 7, pos: 4 },
  { label: 'Ciclo completo (pos = 0)', n: 6, pos: 0 },
  { label: 'Sin ciclo', n: 6, pos: -1 },
]

const NR = 18
const GAP = 58
const PAD = 12

interface Layout {
  W: number
  H: number
  pts: { x: number; y: number; out: [number, number]; tail: boolean }[]
  none?: { x: number; y: number }
}

function layout(n: number, pos: number): Layout {
  if (pos < 0) {
    const y = 64
    const pts = Array.from({ length: n }, (_, k) => ({ x: PAD + 30 + k * GAP, y, out: [0, -1] as [number, number], tail: true }))
    return { W: PAD + 30 + n * GAP + 34, H: y + 66, pts, none: { x: PAD + 30 + n * GAP, y } }
  }
  const lambda = n - pos
  const R = Math.max(50, GAP / 2 / Math.sin(Math.PI / lambda))
  const cx = PAD + 30 + pos * GAP + R
  const cy = PAD + 48 + R
  const pts = Array.from({ length: n }, (_, k) => {
    if (k < pos) return { x: cx - R - (pos - k) * GAP, y: cy, out: [0, -1] as [number, number], tail: true }
    const th = Math.PI + (2 * Math.PI * (k - pos)) / lambda
    return { x: cx + R * Math.cos(th), y: cy + R * Math.sin(th), out: [Math.cos(th), Math.sin(th)] as [number, number], tail: k === pos && pos > 0 }
  })
  return { W: cx + R + 64, H: cy + R + 50, pts }
}

export function FloydCycle() {
  const reduced = useReducedMotion()
  const [preset, setPreset] = useState(0)
  const { n, pos } = PRESETS[preset]
  const frames = useMemo(() => buildFrames(n, pos), [n, pos])
  const L = useMemo(() => layout(n, pos), [n, pos])
  const player = useStepPlayer(frames.length, { resetKey: String(preset) })
  const f = frames[player.i]
  const prev = frames[player.i - 1]
  const trans = { duration: reduced ? 0 : 0.32, ease: [0.16, 1, 0.3, 1] as const }

  const nx = (k: number) => (k + 1 < n ? k + 1 : pos >= 0 ? pos : NONE)
  const edges = Array.from({ length: n }, (_, k) => [k, nx(k)] as const)

  // tag positions: on the tail slow goes above and fast below; on the cycle both go outwards
  const tagAt = (k: number, who: 'slow' | 'fast', together: boolean) => {
    if (k === NONE) return { x: L.none!.x, y: L.none!.y + (who === 'slow' ? -34 : 34) }
    const p = L.pts[k]
    if (p.tail) return { x: p.x, y: p.y + (who === 'slow' ? -34 : 34) }
    const d = who === 'slow' || !together ? 36 : 58
    return { x: p.x + p.out[0] * d, y: p.y + p.out[1] * d }
  }
  const together = f.slow === f.fast
  const tags = [
    { who: 'slow' as const, ...tagAt(f.slow, 'slow', together) },
    { who: 'fast' as const, ...tagAt(f.fast, 'fast', together) },
  ]

  const lambda = pos >= 0 ? n - pos : 0

  return (
    <WidgetFrame
      caption="Algoritmo de Floyd (tortuga y liebre). Fase 1: slow avanza 1 y fast 2 hasta encontrarse. Fase 2: slow vuelve a la cabeza y ambos avanzan de a 1; se encuentran en el inicio del ciclo."
      controls={
        <label className="fc-pick">
          <span className="seg__label">Lista</span>
          <select value={preset} onChange={(e) => setPreset(Number(e.target.value))}>
            {PRESETS.map((p, k) => (
              <option key={p.label} value={k}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      }
      readout={<StepNote tone={f.tone}>{f.note}</StepNote>}
    >
      <AlgoLayout
        visual={
          <>
            <svg className="fc-svg" viewBox={`0 0 ${L.W} ${L.H}`} role="img" aria-label={`Lista de ${n} nodos${pos >= 0 ? `; el último apunta al nodo ${pos}` : ', sin ciclo'}. slow en ${f.slow}, fast en ${f.fast === NONE ? 'None' : f.fast}.`}>
              {edges.map(([a, b]) => {
                const pa = L.pts[a]
                const pb = b === NONE ? L.none! : L.pts[b]
                const dx = pb.x - pa.x
                const dy = pb.y - pa.y
                const len = Math.hypot(dx, dy) || 1
                const ux = dx / len
                const uy = dy / len
                const endPad = b === NONE ? 16 : NR + 2
                const x1 = pa.x + ux * (NR + 2)
                const y1 = pa.y + uy * (NR + 2)
                const x2 = pb.x - ux * endPad
                const y2 = pb.y - uy * endPad
                const ang = (Math.atan2(uy, ux) * 180) / Math.PI
                const back = b !== NONE && b <= a
                return (
                  <g key={a} className={`fc-edge ${back ? 'is-back' : ''}`}>
                    <line x1={x1} y1={y1} x2={x2 - ux * 7} y2={y2 - uy * 7} />
                    <path d="M0 0 l-9 -5 v10 z" transform={`translate(${x2} ${y2}) rotate(${ang})`} />
                  </g>
                )
              })}
              {L.none && (
                <g className="fc-none">
                  <rect x={L.none.x - 16} y={L.none.y - 13} width={44} height={26} rx={5} />
                  <text x={L.none.x + 6} y={L.none.y + 5} textAnchor="middle">
                    None
                  </text>
                </g>
              )}
              {L.pts.map((p, k) => {
                const cls = [
                  'fc-node',
                  k === f.entry ? 'is-entry' : '',
                  k === f.meet && f.entry === undefined ? 'is-meet' : '',
                  k === f.slow ? 'is-slow' : '',
                  k === f.fast ? 'is-fast' : '',
                  pos >= 0 && k >= pos ? 'is-cycle' : '',
                ].join(' ')
                return (
                  <g key={k} className={cls}>
                    <circle cx={p.x} cy={p.y} r={NR} />
                    <text x={p.x} y={p.y + 5} textAnchor="middle">
                      {k}
                    </text>
                  </g>
                )
              })}
              {tags.map((t) => (
                <motion.g key={t.who} initial={false} animate={{ x: t.x, y: t.y }} transition={trans} className={`fc-tag fc-tag--${t.who}`}>
                  <rect x={-21} y={-11} width={42} height={22} rx={11} />
                  <text y={5} textAnchor="middle">
                    {t.who}
                  </text>
                </motion.g>
              ))}
            </svg>
            <VarPanel
              vars={[
                { name: 'fase', value: f.phase },
                { name: 'slow', value: f.slow, changed: !!prev && prev.slow !== f.slow },
                { name: 'fast', value: f.fast === NONE ? 'None' : f.fast, changed: !!prev && prev.fast !== f.fast },
                { name: 'pasos (fase 1)', value: f.steps },
                ...(pos >= 0 ? [{ name: 'μ cola', value: pos }, { name: 'λ ciclo', value: lambda }] : []),
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
