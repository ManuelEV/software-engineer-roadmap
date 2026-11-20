import { useMemo, useRef, useState } from 'react'
import { animate, motion, useReducedMotion } from 'motion/react'
import { BookOpen, Send } from 'lucide-react'
import { WidgetFrame, Segmented, Slider, Stat } from '../kit'
import './FanoutSimulator.css'

type Strategy = 'push' | 'pull' | 'hybrid'
type Author = 'normal' | 'popular' | 'celeb'

const AUTHORS: Record<Author, { name: string; followers: number }> = {
  normal: { name: 'Lucía', followers: 300 },
  popular: { name: 'Diario local', followers: 80_000 },
  celeb: { name: 'Estrella pop', followers: 50_000_000 },
}

/** Supuesto: el clúster de fan-out inserta 1 M de entradas por segundo para un mismo tweet. */
const INSERTS_PER_SEC = 1_000_000
/** Supuesto: el lector sigue a 400 cuentas. */
const FOLLOWING = 400
/** ~20 bytes por entrada (tweet id + autor + flags), como en la charla de Twitter de 2012. */
const BYTES_PER_ENTRY = 20

/** Deterministic log-uniform follower counts for the 400 accounts the reader follows. */
const followeeFollowers: number[] = (() => {
  let a = 11
  const rnd = () => {
    a = (a * 16807) % 2147483647
    return a / 2147483647
  }
  return Array.from({ length: FOLLOWING }, () => {
    const r = rnd()
    // skewed: most accounts are small, a handful are huge
    return Math.round(Math.pow(10, 1.7 + Math.pow(r, 2.2) * 6.3))
  })
})()

const GRID_COLS = 12
const GRID_ROWS = 4
const GRID_N = GRID_COLS * GRID_ROWS
const SHOWN_FOLLOWEES = 24

function fmt(n: number) {
  if (n >= 1e9) return `${(n / 1e9).toLocaleString('es', { maximumFractionDigits: 1 })} mil M`
  if (n >= 1e6) return `${(n / 1e6).toLocaleString('es', { maximumFractionDigits: 1 })} M`
  if (n >= 1e3) return `${(n / 1e3).toLocaleString('es', { maximumFractionDigits: 1 })} mil`
  return n.toLocaleString('es')
}
function fmtTime(s: number) {
  if (s < 0.001) return 'menos de 1 ms'
  if (s < 1) return `${Math.round(s * 1000)} ms`
  if (s < 120) return `${s.toLocaleString('es', { maximumFractionDigits: 1 })} s`
  return `${(s / 60).toLocaleString('es', { maximumFractionDigits: 1 })} min`
}
function fmtBytes(b: number) {
  if (b >= 1e9) return `${(b / 1e9).toLocaleString('es', { maximumFractionDigits: 1 })} GB`
  if (b >= 1e6) return `${(b / 1e6).toLocaleString('es', { maximumFractionDigits: 1 })} MB`
  if (b >= 1e3) return `${(b / 1e3).toLocaleString('es', { maximumFractionDigits: 1 })} KB`
  return `${b} B`
}

export function FanoutSimulator() {
  const reduced = useReducedMotion()
  const [strategy, setStrategy] = useState<Strategy>('push')
  const [author, setAuthor] = useState<Author>('normal')
  const [thrExp, setThrExp] = useState(5) // threshold = 10^thrExp followers
  const [lit, setLit] = useState(0) // how many grid cells are lit (0..GRID_N)
  const [clock, setClock] = useState(0) // simulated seconds elapsed in fan-out
  const [reading, setReading] = useState(0) // increments to replay read animation
  const ctrl = useRef<ReturnType<typeof animate> | null>(null)

  const threshold = Math.pow(10, thrExp)
  const followers = AUTHORS[author].followers
  const isCeleb = followers >= threshold
  const pushes = strategy === 'push' || (strategy === 'hybrid' && !isCeleb)

  const writes = pushes ? followers : 1
  const fanoutTime = pushes ? followers / INSERTS_PER_SEC : 0

  const celebsFollowed = useMemo(() => followeeFollowers.filter((f) => f >= threshold).length, [threshold])
  const readQueries = strategy === 'push' ? 1 : strategy === 'pull' ? FOLLOWING : 1 + celebsFollowed

  // which of the 24 shown followee dots are "celebs" (sorted so that celebs are visible)
  const shown = useMemo(() => {
    const sorted = [...followeeFollowers].sort((a, b) => b - a)
    const celebs = sorted.filter((f) => f >= threshold).slice(0, 8)
    const rest = sorted.filter((f) => f < threshold)
    const picked = [...celebs, ...rest.filter((_, i) => i % Math.ceil(rest.length / (SHOWN_FOLLOWEES - celebs.length)) === 0)].slice(
      0,
      SHOWN_FOLLOWEES,
    )
    return picked.map((f) => ({ f, celeb: f >= threshold }))
  }, [threshold])

  const resetFanout = () => {
    ctrl.current?.stop()
    setLit(0)
    setClock(0)
  }

  const publish = () => {
    resetFanout()
    if (!pushes) return
    const dur = reduced ? 0 : 0.5 + 0.45 * Math.log10(Math.max(10, followers)) // 0.5 s .. ~4 s
    ctrl.current = animate(0, 1, {
      duration: dur,
      ease: 'linear',
      onUpdate: (p) => {
        setLit(Math.round(p * GRID_N))
        setClock(p * fanoutTime)
      },
    })
  }

  const read = () => setReading((r) => r + 1)

  const readTargets: { kind: 'cache' | 'followee'; idx: number }[] =
    strategy === 'push'
      ? [{ kind: 'cache', idx: 0 }]
      : strategy === 'pull'
        ? shown.map((_, i) => ({ kind: 'followee' as const, idx: i }))
        : [{ kind: 'cache', idx: 0 }, ...shown.map((s, i) => ({ s, i })).filter((x) => x.s.celeb).map((x) => ({ kind: 'followee' as const, idx: x.i }))]

  // geometry for read panel
  const RX = 46
  const RY = 80
  const CACHE = { x: 190, y: 26 }
  const fx = (i: number) => 150 + (i % 8) * 40
  const fy = (i: number) => 66 + Math.floor(i / 8) * 30

  return (
    <WidgetFrame
      caption="Publica un tweet con distintos autores y estrategias, y luego abre el home de un lector que sigue a 400 cuentas. El costo no desaparece: se mueve entre la escritura y la lectura."
      controls={
        <>
          <Segmented<Strategy>
            label="Estrategia"
            value={strategy}
            onChange={(v) => {
              resetFanout()
              setStrategy(v)
            }}
            options={[
              { value: 'push', label: 'Push (en escritura)' },
              { value: 'pull', label: 'Pull (en lectura)' },
              { value: 'hybrid', label: 'Híbrido' },
            ]}
          />
          <Segmented<Author>
            label="Autor"
            value={author}
            onChange={(v) => {
              resetFanout()
              setAuthor(v)
            }}
            options={(Object.keys(AUTHORS) as Author[]).map((k) => ({
              value: k,
              label: `${AUTHORS[k].name} · ${fmt(AUTHORS[k].followers)}`,
            }))}
          />
          {strategy === 'hybrid' && (
            <Slider
              label="Umbral de celebridad"
              value={thrExp}
              min={3}
              max={7}
              step={0.5}
              onChange={(v) => {
                resetFanout()
                setThrExp(v)
              }}
              format={(v) => `≥ ${fmt(Math.round(Math.pow(10, v)))} seguidores`}
            />
          )}
        </>
      }
      readout={
        <>
          <div className="fo-stats">
            <Stat
              label="Escrituras al publicar"
              value={fmt(writes)}
              tone={writes > 1e6 ? 'bad' : writes > 1e4 ? 'warn' : 'ok'}
              hint={pushes ? `${fmtBytes(writes * BYTES_PER_ENTRY)} de timelines` : 'solo se guarda el tweet'}
            />
            <Stat
              label="Hasta que el último seguidor lo tiene"
              value={pushes ? fmtTime(fanoutTime) : 'al leer'}
              tone={fanoutTime > 5 ? 'bad' : fanoutTime > 1 ? 'warn' : 'ok'}
              hint="a 1 M inserciones/s (supuesto)"
            />
            <Stat
              label="Consultas al abrir el home"
              value={fmt(readQueries)}
              tone={readQueries > 50 ? 'bad' : readQueries > 5 ? 'warn' : 'ok'}
              hint={strategy === 'hybrid' ? `1 timeline + ${celebsFollowed} celebridades` : strategy === 'pull' ? 'una por cuenta seguida + merge' : 'una lista precalculada'}
            />
          </div>
        </>
      }
    >
      <div className="fo">
        <section className="fo-panel" aria-label="Al publicar">
          <div className="fo-head">
            <span className="fo-title">Al publicar</span>
            <button type="button" className="btn btn--line" onClick={publish}>
              <Send size={16} aria-hidden="true" />
              Publicar tweet
            </button>
          </div>
          <svg viewBox="0 0 480 150" className="fo-svg" role="img" aria-label="Fan-out del tweet hacia los timelines de los seguidores">
            {/* author */}
            <circle cx={36} cy={75} r={16} fill="var(--paper)" stroke="var(--line)" strokeWidth={4} />
            <text x={36} y={112} textAnchor="middle" className="fo-lbl">
              {AUTHORS[author].name}
            </text>
            {/* worker */}
            <line x1={52} x2={118} y1={75} y2={75} stroke={pushes ? 'var(--line)' : 'var(--rule-strong)'} strokeWidth={4} />
            <rect x={118} y={57} width={60} height={36} rx={8} fill="var(--paper)" stroke={pushes ? 'var(--line)' : 'var(--rule-strong)'} strokeWidth={3} />
            <text x={148} y={80} textAnchor="middle" className="fo-lbl-sm">
              {pushes ? 'fan-out' : 'tweets'}
            </text>
            <text x={148} y={112} textAnchor="middle" className="fo-lbl">
              {pushes ? 'cola + workers' : 'solo se guarda'}
            </text>
            <line x1={178} x2={206} y1={75} y2={75} stroke={pushes ? 'var(--line)' : 'var(--rule-strong)'} strokeWidth={4} strokeDasharray={pushes ? undefined : '5 5'} />
            {/* follower timelines grid */}
            {Array.from({ length: GRID_N }, (_, i) => {
              const cx = 222 + (i % GRID_COLS) * 21
              const cy = 30 + Math.floor(i / GRID_COLS) * 21
              const on = i < lit
              return (
                <motion.circle
                  key={i}
                  cx={cx}
                  cy={cy}
                  r={7}
                  initial={false}
                  animate={{ fill: on ? 'var(--line)' : 'var(--paper)' }}
                  transition={{ duration: 0.15 }}
                  stroke={on ? 'var(--line)' : 'var(--rule-strong)'}
                  strokeWidth={2.5}
                />
              )
            })}
            <text x={340} y={130} textAnchor="middle" className="fo-lbl">
              timelines de seguidores (cada punto ≈ {fmt(Math.max(1, Math.round(followers / GRID_N)))})
            </text>
            {pushes && lit > 0 && (
              <text x={470} y={16} textAnchor="end" className="fo-clock" aria-live="polite">
                t = {fmtTime(clock)}
              </text>
            )}
          </svg>
        </section>

        <section className="fo-panel" aria-label="Al leer">
          <div className="fo-head">
            <span className="fo-title">Al abrir el home</span>
            <button type="button" className="btn" onClick={read}>
              <BookOpen size={16} aria-hidden="true" />
              Abrir home
            </button>
          </div>
          <svg viewBox="0 0 480 160" className="fo-svg" role="img" aria-label="Consultas que hace el lector al abrir su timeline">
            {/* read edges */}
            {readTargets.map((t) => {
              const x2 = t.kind === 'cache' ? CACHE.x : fx(t.idx)
              const y2 = t.kind === 'cache' ? CACHE.y + 12 : fy(t.idx)
              return (
                <motion.line
                  key={`${strategy}-${thrExp}-${reading}-${t.kind}-${t.idx}`}
                  x1={RX + 16}
                  y1={RY}
                  x2={x2}
                  y2={y2}
                  stroke={t.kind === 'cache' ? 'var(--line)' : shown[t.idx]?.celeb ? 'var(--warn)' : 'var(--ink-3)'}
                  strokeWidth={t.kind === 'cache' ? 4 : 1.5}
                  initial={reduced ? { opacity: 0 } : { pathLength: 0, opacity: 0.2 }}
                  animate={{ pathLength: 1, opacity: 1 }}
                  transition={{ duration: 0.35, delay: reduced ? 0 : (t.idx % 12) * 0.03, ease: [0.16, 1, 0.3, 1] }}
                />
              )
            })}
            {/* reader */}
            <circle cx={RX} cy={RY} r={16} fill="var(--paper)" stroke="var(--line)" strokeWidth={4} />
            <text x={RX} y={RY + 34} textAnchor="middle" className="fo-lbl">
              lector
            </text>
            {/* precomputed timeline cache */}
            <rect
              x={CACHE.x - 2}
              y={CACHE.y - 12}
              width={120}
              height={30}
              rx={8}
              fill="var(--paper)"
              stroke={strategy === 'pull' ? 'var(--rule-strong)' : 'var(--line)'}
              strokeWidth={3}
              strokeDasharray={strategy === 'pull' ? '5 5' : undefined}
            />
            <text x={CACHE.x + 58} y={CACHE.y + 8} textAnchor="middle" className="fo-lbl-sm">
              mi timeline (Redis)
            </text>
            {/* followees */}
            {shown.map((s, i) => (
              <circle
                key={i}
                cx={fx(i)}
                cy={fy(i)}
                r={s.celeb ? 9 : 6}
                fill="var(--paper)"
                stroke={s.celeb ? 'var(--warn)' : 'var(--rule-strong)'}
                strokeWidth={s.celeb ? 3.5 : 2.5}
              />
            ))}
            <text x={290} y={154} textAnchor="middle" className="fo-lbl">
              cuentas que sigue (muestra; las grandes en ámbar)
            </text>
          </svg>
        </section>
      </div>
    </WidgetFrame>
  )
}
