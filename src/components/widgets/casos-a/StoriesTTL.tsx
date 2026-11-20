import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Camera, Pause, Play } from 'lucide-react'
import { WidgetFrame, Segmented, Slider } from '../kit'
import './StoriesTTL.css'

interface Story {
  id: number
  author: string
  t: number // hour published
}

const AUTHORS = ['Vale', 'Tomás', 'Majo', 'Pedro', 'Tú']
const TTL = 24
const H = 48

const SEED: Story[] = [
  { id: 1, author: 'Vale', t: 1 },
  { id: 2, author: 'Vale', t: 3.5 },
  { id: 3, author: 'Tomás', t: 6 },
  { id: 4, author: 'Majo', t: 14 },
  { id: 5, author: 'Pedro', t: 20 },
  { id: 6, author: 'Vale', t: 26 },
  { id: 7, author: 'Majo', t: 31 },
  { id: 8, author: 'Tomás', t: 40 },
]

type Cleanup = 'read' | 'job'

const fmtH = (h: number) => {
  const total = Math.round(h * 60)
  const day = Math.floor(total / 1440) + 1
  const hh = Math.floor((total % 1440) / 60)
  const mm = total % 60
  return `día ${day}, ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`
}

const X0 = 64
const X1 = 470
const xs = (h: number) => X0 + (Math.min(h, H) / H) * (X1 - X0)

export function StoriesTTL() {
  const reduced = useReducedMotion()
  const [now, setNow] = useState(22)
  const [stories, setStories] = useState<Story[]>(SEED)
  const [seen, setSeen] = useState<Set<number>>(() => new Set())
  const [cleanup, setCleanup] = useState<Cleanup>('job')
  const [playing, setPlaying] = useState(false)
  const raf = useRef<number | null>(null)
  const nextId = useRef(100)

  useEffect(() => {
    if (!playing) return
    let prev = performance.now()
    const tick = (ts: number) => {
      const d = (ts - prev) / 1000
      prev = ts
      setNow((n) => {
        const v = n + d * 3 // 3 hours per second
        if (v >= H) {
          setPlaying(false)
          return H
        }
        return v
      })
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => {
      if (raf.current) cancelAnimationFrame(raf.current)
    }
  }, [playing])

  const published = stories.filter((s) => s.t <= now)
  const active = published.filter((s) => now < s.t + TTL)
  const expired = published.filter((s) => now >= s.t + TTL)
  // with an hourly job, entries expired since the last full hour are still in the index
  const lastJob = Math.floor(now)
  const inIndex = cleanup === 'read' ? active : published.filter((s) => s.t + TTL > lastJob)
  const pendingPurge = inIndex.filter((s) => now >= s.t + TTL)

  const tray = useMemo(
    () =>
      AUTHORS.map((a) => {
        const mine = active.filter((s) => s.author === a)
        return { author: a, count: mine.length, unseen: mine.some((s) => !seen.has(s.id)), ids: mine.map((s) => s.id) }
      }).filter((x) => x.count > 0),
    [active, seen],
  )

  const publish = () => {
    const id = nextId.current++
    setStories((s) => [...s, { id, author: 'Tú', t: now }])
  }
  const view = (ids: number[]) =>
    setSeen((prev) => {
      const n = new Set(prev)
      ids.forEach((i) => n.add(i))
      return n
    })

  const LANE_H = 30
  const laneY = (a: string) => 26 + AUTHORS.indexOf(a) * LANE_H

  return (
    <WidgetFrame
      caption="Cada historia vive 24 horas. Mueve el reloj: la bandeja de arriba se arma solo con historias vigentes, y abajo ves el índice que la alimenta (un sorted set con la hora de expiración como puntaje)."
      controls={
        <>
          <Slider label="Hora actual" value={now} min={0} max={H} step={0.25} onChange={(v) => setNow(v)} format={fmtH} />
          <div className="st-row">
            <button type="button" className="btn" onClick={() => (reduced ? setNow(H) : setPlaying((p) => !p))}>
              {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
              {playing ? 'Pausar' : 'Avanzar'}
            </button>
            <button type="button" className="btn btn--line" onClick={publish}>
              <Camera size={16} aria-hidden="true" />
              Publicar historia
            </button>
          </div>
          <Segmented<Cleanup>
            label="Limpieza del índice"
            value={cleanup}
            onChange={setCleanup}
            options={[
              { value: 'job', label: 'Job cada hora' },
              { value: 'read', label: 'Inmediata' },
            ]}
          />
        </>
      }
      readout={
        <div className="st-index">
          <div className="st-index-head">
            <code>ZRANGEBYSCORE tray:yo {Math.round(now * 10) / 10} +inf</code>
            <span>
              {active.length} vigentes · {expired.length} archivadas
            </span>
          </div>
          <ul className="st-index-list">
            {inIndex
              .slice()
              .sort((a, b) => a.t - b.t)
              .map((s) => {
                const stale = now >= s.t + TTL
                return (
                  <li key={s.id} className={stale ? 'is-stale' : ''}>
                    <code>story:{s.id}</code> <span>{s.author}</span>{' '}
                    <span className="st-score">expira {fmtH(s.t + TTL)}</span>
                    {stale && <em> expirada: el filtro por puntaje la oculta; el job la borrará</em>}
                  </li>
                )
              })}
            {inIndex.length === 0 && <li className="st-empty">Índice vacío.</li>}
          </ul>
          {cleanup === 'job' && pendingPurge.length > 0 && (
            <p className="st-hint">
              La corrección no depende del job: la lectura pide solo puntajes mayores que “ahora”. El job (<code>ZREMRANGEBYSCORE … -inf ahora</code>) es para liberar memoria.
            </p>
          )}
        </div>
      }
    >
      <div className="st">
        <div className="st-tray">
          {tray.length === 0 && <span className="st-empty">Nadie tiene historias vigentes.</span>}
          {tray.length > 0 && (
            <ul className="st-tray-list" aria-label="Bandeja de historias">
              {tray.map((x) => (
                <li key={x.author}>
                  <button
                    type="button"
                    className={`st-ring ${x.unseen ? 'is-unseen' : 'is-seen'}`}
                    onClick={() => view(x.ids)}
                    aria-label={`${x.author}: ${x.count} historia${x.count > 1 ? 's' : ''}${x.unseen ? ' sin ver' : ' vistas'}`}
                  >
                    <span className="st-avatar">{x.author.slice(0, 1)}</span>
                    <span className="st-name">{x.author}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <svg className="st-svg" viewBox={`0 0 480 ${26 + AUTHORS.length * LANE_H + 22}`} role="img" aria-label="Línea de tiempo de 48 horas con la vida de cada historia">
          {AUTHORS.map((a) => (
            <g key={a}>
              <text x={8} y={laneY(a) + 5} className="st-lane">
                {a}
              </text>
              <line x1={X0} x2={X1} y1={laneY(a)} y2={laneY(a)} stroke="var(--rule)" strokeWidth={1} />
            </g>
          ))}
          <line x1={xs(24)} x2={xs(24)} y1={10} y2={26 + AUTHORS.length * LANE_H - 10} stroke="var(--rule-strong)" strokeDasharray="4 4" />
          {stories.map((s) => {
            const isPub = s.t <= now
            const isActive = isPub && now < s.t + TTL
            const y = laneY(s.author) + ((s.id % 3) - 1) * 5
            return (
              <g key={s.id} opacity={isPub ? 1 : 0.35}>
                <motion.line
                  x1={xs(s.t)}
                  x2={xs(s.t + TTL)}
                  y1={y}
                  y2={y}
                  initial={false}
                  animate={{ stroke: isActive ? 'var(--line)' : 'var(--rule-strong)' }}
                  transition={{ duration: reduced ? 0 : 0.2 }}
                  strokeWidth={5}
                  strokeLinecap="round"
                  strokeDasharray={isPub ? undefined : '4 5'}
                />
                <circle cx={xs(s.t)} cy={y} r={6} fill="var(--paper)" stroke={isActive ? 'var(--line)' : 'var(--rule-strong)'} strokeWidth={3} />
              </g>
            )
          })}
          {[0, 12, 24, 36, 48].map((h) => (
            <text key={h} x={xs(h)} y={26 + AUTHORS.length * LANE_H + 14} textAnchor="middle" className="st-axis">
              {h} h
            </text>
          ))}
          <line x1={xs(now)} x2={xs(now)} y1={8} y2={26 + AUTHORS.length * LANE_H - 6} stroke="var(--ink)" strokeWidth={2} />
          <circle cx={xs(now)} cy={8} r={4} fill="var(--ink)" />
        </svg>
      </div>
    </WidgetFrame>
  )
}
