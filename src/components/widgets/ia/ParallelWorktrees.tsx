import { useMemo, useState } from 'react'
import { Slider, Stat, WidgetFrame } from '../kit'
import './ParallelWorktrees.css'

type Seg = 'work' | 'wait' | 'review' | 'idle'

const HORIZON = 240 // minutes simulated
const BRANCHES = ['feat/reembolsos', 'fix/test-flaky', 'chore/deps', 'feat/export-csv', 'refactor/pagos', 'docs/api']

interface Run {
  lanes: Seg[][]
  human: Seg[]
  done: number
}

function simulate(n: number, work: number, review: number): Run {
  const lanes: Seg[][] = Array.from({ length: n }, () => [])
  const human: Seg[] = []
  // per agent: state + remaining minutes
  const st = Array.from({ length: n }, (_, k) => ({ s: 'work' as Seg, left: work + k * 2 }))
  const queue: number[] = []
  let reviewing = -1
  let reviewLeft = 0
  let done = 0
  for (let t = 0; t < HORIZON; t++) {
    // human picks next review
    if (reviewing < 0 && queue.length) {
      reviewing = queue.shift()!
      reviewLeft = review
      st[reviewing].s = 'review'
    }
    for (let k = 0; k < n; k++) lanes[k].push(st[k].s)
    human.push(reviewing >= 0 ? 'review' : 'idle')
    // advance agents
    for (let k = 0; k < n; k++) {
      if (st[k].s === 'work') {
        st[k].left -= 1
        if (st[k].left <= 0) {
          st[k].s = 'wait'
          queue.push(k)
        }
      }
    }
    if (reviewing >= 0) {
      reviewLeft -= 1
      if (reviewLeft <= 0) {
        st[reviewing] = { s: 'work', left: work }
        reviewing = -1
        done += 1
      }
    }
  }
  return { lanes, human, done }
}

/** Run-length encode a lane into segments for rendering. */
function rle(lane: Seg[]) {
  const out: { s: Seg; len: number }[] = []
  for (const s of lane) {
    const last = out[out.length - 1]
    if (last && last.s === s) last.len += 1
    else out.push({ s, len: 1 })
  }
  return out
}

const SEG_LABEL: Record<Seg, string> = { work: 'trabajando', wait: 'esperando review', review: 'en review', idle: 'libre' }

function Lane({ label, lane, human = false }: { label: string; lane: Seg[]; human?: boolean }) {
  return (
    <div className={`pw-lane ${human ? 'pw-lane--human' : ''}`}>
      <div className="pw-lane__label">{label}</div>
      <div className="pw-lane__bar" role="img" aria-label={`${label}: ${rle(lane).map((r) => `${r.len} min ${SEG_LABEL[r.s]}`).join(', ')}`}>
        {rle(lane).map((r, i) => (
          <span key={i} className={`pw-seg pw-seg--${r.s}`} style={{ width: `${(r.len / HORIZON) * 100}%` }} />
        ))}
      </div>
    </div>
  )
}

export function ParallelWorktrees() {
  const [n, setN] = useState(3)
  const [work, setWork] = useState(25)
  const [review, setReview] = useState(8)
  const run = useMemo(() => simulate(n, work, review), [n, work, review])

  const humanBusy = Math.round((run.human.filter((s) => s === 'review').length / HORIZON) * 100)
  const agentMinutes = n * HORIZON
  const waiting = run.lanes.flat().filter((s) => s === 'wait').length
  const waitPct = Math.round((waiting / agentMinutes) * 100)
  const capacity = Math.floor(HORIZON / review)

  return (
    <WidgetFrame
      caption="Modelo simple de agentes en paralelo, cada uno en su git worktree. Supuestos: tareas independientes y tú revisas de a una. Con pocos agentes te sobra tiempo; con muchos, tu revisión es el cuello de botella y los agentes hacen fila."
      controls={
        <>
          <Slider label="Agentes en paralelo" value={n} min={1} max={6} onChange={setN} />
          <Slider label="Trabajo autónomo por tarea" value={work} min={5} max={60} step={5} onChange={setWork} format={(v) => `${v} min`} />
          <Slider label="Tu revisión por tarea" value={review} min={2} max={20} onChange={setReview} format={(v) => `${v} min`} />
        </>
      }
      readout={
        <div className="pw-readout">
          <Stat label="tareas integradas en 4 h" value={run.done} hint={`techo por tu revisión: ${capacity}`} />
          <Stat label="tu tiempo revisando" value={`${humanBusy}%`} tone={humanBusy > 90 ? 'bad' : humanBusy > 70 ? 'warn' : undefined} />
          <Stat label="tiempo de agentes en fila" value={`${waitPct}%`} tone={waitPct > 30 ? 'bad' : waitPct > 10 ? 'warn' : 'ok'} />
          <p className="pw-note">
            {humanBusy > 90
              ? 'Saturado: sumar agentes ya no suma tareas, solo fila (y revisiones apuradas). Baja el costo de revisar: specs claras, tests fuertes, diffs chicos.'
              : humanBusy < 40
                ? 'Te sobra atención: podrías sumar un agente o delegar tareas más grandes.'
                : 'Zona sana: los agentes casi no esperan y a ti te queda margen para pensar.'}
          </p>
        </div>
      }
    >
      <div className="pw-lanes">
        {run.lanes.map((lane, k) => (
          <Lane key={k} label={`wt-${k + 1} · ${BRANCHES[k]}`} lane={lane} />
        ))}
        <Lane label="Tú (revisando)" lane={run.human} human />
        <div className="pw-axis" aria-hidden="true">
          {[0, 60, 120, 180, 240].map((m) => (
            <span key={m} style={{ left: `${(m / HORIZON) * 100}%` }}>
              {m / 60} h
            </span>
          ))}
        </div>
      </div>
      <ul className="pw-legend">
        <li>
          <span className="pw-seg pw-seg--work" /> trabajando
        </li>
        <li>
          <span className="pw-seg pw-seg--wait" /> esperando tu review
        </li>
        <li>
          <span className="pw-seg pw-seg--review" /> en review
        </li>
        <li>
          <span className="pw-seg pw-seg--idle" /> libre
        </li>
      </ul>
    </WidgetFrame>
  )
}
