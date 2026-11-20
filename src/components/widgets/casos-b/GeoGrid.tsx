import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Pause, Play, Shuffle } from 'lucide-react'
import { Segmented, Slider, Stat, WidgetFrame } from '../kit'
import './GeoGrid.css'

/** Ciudad de 20 km × 20 km (supuesto). Coordenadas normalizadas 0..1. */
const CITY_KM = 20
const VIEW = 320
const N_DRIVERS = 70

type Mode = 'cell' | 'nine' | 'rings'
type Level = '2' | '3' | '4' | '5'

const levelInfo: Record<Level, { cells: number; label: string; approx: string }> = {
  '2': { cells: 4, label: '5 km', approx: 'parecido a geohash de 5 caracteres (≈ 4,9 km)' },
  '3': { cells: 8, label: '2,5 km', approx: 'entre geohash 5 y 6' },
  '4': { cells: 16, label: '1,25 km', approx: 'parecido a geohash de 6 caracteres (≈ 1,2 × 0,6 km)' },
  '5': { cells: 32, label: '625 m', approx: 'entre geohash 6 (≈ 1,2 km) y 7 (≈ 150 m)' },
}

type Driver = { id: number; x: number; y: number }

function mulberry32(seed: number) {
  let a = seed
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function makeDrivers(seed: number): Driver[] {
  const rnd = mulberry32(seed)
  const out: Driver[] = []
  for (let i = 0; i < N_DRIVERS; i++) {
    // 60 % cerca del centro (el "downtown"), 40 % repartidos
    const dense = rnd() < 0.6
    const x = dense ? 0.5 + (rnd() - 0.5) * 0.45 : 0.04 + rnd() * 0.92
    const y = dense ? 0.5 + (rnd() - 0.5) * 0.45 : 0.04 + rnd() * 0.92
    out.push({ id: i, x, y })
  }
  // Un conductor justo al otro lado del borde central: enseña el problema de "solo su celda".
  out[0] = { id: 0, x: 0.488, y: 0.53 }
  return out
}

const clamp = (v: number, lo = 0.01, hi = 0.99) => Math.min(hi, Math.max(lo, v))
const distKm = (a: { x: number; y: number }, b: { x: number; y: number }) =>
  Math.hypot(a.x - b.x, a.y - b.y) * CITY_KM

/** Intercala los bits de x e y (curva Z), la misma idea que usa geohash. */
function zKey(cx: number, cy: number, bits: number) {
  let s = ''
  for (let b = bits - 1; b >= 0; b--) {
    s += ((cx >> b) & 1).toString() + ((cy >> b) & 1).toString()
    if (b > 0) s += ' '
  }
  return s
}

export function GeoGrid() {
  const reduced = useReducedMotion()
  const [level, setLevel] = useState<Level>('4')
  const [mode, setMode] = useState<Mode>('nine')
  const [radius, setRadius] = useState(2)
  const [k, setK] = useState(3)
  const [seed, setSeed] = useState(7)
  const [drivers, setDrivers] = useState<Driver[]>(() => makeDrivers(7))
  const [rider, setRider] = useState({ x: 0.505, y: 0.52 })
  const [playing, setPlaying] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const rndRef = useRef(mulberry32(99))

  // Los conductores se mueven: cada tick es un "ping" de ubicación (~ cada 4 s en la vida real).
  useEffect(() => {
    if (!playing) return
    const t = window.setInterval(() => {
      const rnd = rndRef.current
      setDrivers((ds) =>
        ds.map((d) => ({ ...d, x: clamp(d.x + (rnd() - 0.5) * 0.03), y: clamp(d.y + (rnd() - 0.5) * 0.03) })),
      )
    }, 700)
    return () => window.clearInterval(t)
  }, [playing])

  const { cells } = levelInfo[level]
  const bits = Number(level)
  const size = 1 / cells // tamaño de celda normalizado
  const cellKm = CITY_KM / cells
  const rcx = Math.min(cells - 1, Math.floor(rider.x * cells))
  const rcy = Math.min(cells - 1, Math.floor(rider.y * cells))

  // Índice: celda -> conductores (lo que haría un mapa geohash -> set de IDs)
  const index = useMemo(() => {
    const m = new Map<string, Driver[]>()
    for (const d of drivers) {
      const key = `${Math.min(cells - 1, Math.floor(d.x * cells))},${Math.min(cells - 1, Math.floor(d.y * cells))}`
      const arr = m.get(key)
      if (arr) arr.push(d)
      else m.set(key, [d])
    }
    return m
  }, [drivers, cells])

  const result = useMemo(() => {
    const searched: { cx: number; cy: number }[] = []
    const read: Driver[] = []
    const take = (cx: number, cy: number) => {
      if (cx < 0 || cy < 0 || cx >= cells || cy >= cells) return
      searched.push({ cx, cy })
      read.push(...(index.get(`${cx},${cy}`) ?? []))
    }
    let rings = 0
    if (mode === 'cell') take(rcx, rcy)
    else if (mode === 'nine') {
      for (let dx = -1; dx <= 1; dx++) for (let dy = -1; dy <= 1; dy++) take(rcx + dx, rcy + dy)
    } else {
      // Anillos expansivos: paramos cuando tenemos K candidatos y el anillo siguiente
      // ya no puede contener a nadie más cerca que el K-ésimo.
      for (let r = 0; r < cells; r++) {
        if (r === 0) take(rcx, rcy)
        else {
          for (let dx = -r; dx <= r; dx++) {
            take(rcx + dx, rcy - r)
            take(rcx + dx, rcy + r)
          }
          for (let dy = -r + 1; dy <= r - 1; dy++) {
            take(rcx - r, rcy + dy)
            take(rcx + r, rcy + dy)
          }
        }
        rings = r + 1
        if (read.length >= k) {
          const dk = read.map((d) => distKm(d, rider)).sort((a, b) => a - b)[k - 1]
          const nextRingMin =
            Math.min(rider.x - (rcx - r) * size, (rcx + r + 1) * size - rider.x, rider.y - (rcy - r) * size, (rcy + r + 1) * size - rider.y) *
            CITY_KM
          if (nextRingMin >= dk) break
        }
      }
    }
    const withDist = read.map((d) => ({ d, km: distKm(d, rider) })).sort((a, b) => a.km - b.km)
    const matches = mode === 'rings' ? withDist.slice(0, k) : withDist.filter((w) => w.km <= radius)
    const trueNearest = drivers.map((d) => ({ d, km: distKm(d, rider) })).sort((a, b) => a.km - b.km)[0]
    return { searched, read, matches, rings, trueNearest }
  }, [mode, rcx, rcy, cells, index, k, rider, radius, size, drivers])

  const readIds = new Set(result.read.map((d) => d.id))
  const matchIds = new Set(result.matches.map((m) => m.d.id))
  const best = result.matches[0]
  const missedNearest = result.trueNearest && (!best || best.d.id !== result.trueNearest.d.id) && result.trueNearest.km <= (mode === 'rings' ? Infinity : radius)

  const setFromPointer = (e: PointerEvent<SVGSVGElement>) => {
    const svg = svgRef.current
    if (!svg) return
    const r = svg.getBoundingClientRect()
    setRider({ x: clamp((e.clientX - r.left) / r.width), y: clamp((e.clientY - r.top) / r.height) })
  }
  const onKey = (e: KeyboardEvent<SVGSVGElement>) => {
    const step = 0.015
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    }
    const m = moves[e.key]
    if (!m) return
    e.preventDefault()
    setRider((p) => ({ x: clamp(p.x + m[0]), y: clamp(p.y + m[1]) }))
  }

  const tr = reduced ? { duration: 0 } : { duration: 0.6, ease: [0.16, 1, 0.3, 1] as const }
  const px = (v: number) => v * VIEW

  return (
    <WidgetFrame
      caption={
        <>
          Una ciudad de 20 × 20 km con {N_DRIVERS} conductores. Toca el mapa (o usa las flechas) para mover al pasajero. Cambia el tamaño de celda y la
          estrategia: mira cuántas celdas consultas, cuántos conductores lees del índice y si encuentras de verdad al más cercano.
        </>
      }
      controls={
        <>
          <Segmented<Level>
            label="Tamaño de celda"
            value={level}
            onChange={setLevel}
            options={(['2', '3', '4', '5'] as Level[]).map((l) => ({ value: l, label: levelInfo[l].label }))}
          />
          <Segmented<Mode>
            label="Búsqueda"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'cell', label: 'Solo su celda' },
              { value: 'nine', label: 'Celda + 8 vecinas' },
              { value: 'rings', label: 'Anillos hasta K' },
            ]}
          />
          {mode === 'rings' ? (
            <Slider label="K conductores" value={k} min={1} max={6} onChange={setK} />
          ) : (
            <Slider label="Radio" value={radius} min={0.5} max={5} step={0.25} onChange={setRadius} format={(v) => `${v.toLocaleString('es')} km`} />
          )}
          <div className="gg-actions">
            <button type="button" className="btn" onClick={() => setPlaying((p) => !p)} aria-pressed={playing}>
              {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
              {playing ? 'Pausar' : 'Mover conductores'}
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Repartir conductores de nuevo"
              title="Repartir conductores de nuevo"
              onClick={() => {
                const s = seed + 1
                setSeed(s)
                setDrivers(makeDrivers(s))
              }}
            >
              <Shuffle size={18} aria-hidden="true" />
            </button>
          </div>
        </>
      }
      readout={
        <>
          <div className="gg-stats">
            <Stat label="Celdas consultadas" value={result.searched.length} hint={mode === 'rings' ? `${result.rings} anillo(s)` : undefined} />
            <Stat label="Conductores leídos" value={result.read.length} hint="del índice" />
            <Stat label={mode === 'rings' ? 'Encontrados' : 'Dentro del radio'} value={result.matches.length} tone={result.matches.length === 0 ? 'warn' : undefined} />
            <Stat
              label="Más cercano"
              value={best ? `${best.km.toLocaleString('es', { maximumFractionDigits: 2 })} km` : '—'}
              tone={missedNearest ? 'bad' : best ? 'ok' : undefined}
              hint={missedNearest ? `el real está a ${result.trueNearest.km.toLocaleString('es', { maximumFractionDigits: 2 })} km` : undefined}
            />
          </div>
          <p>
            Celda del pasajero: <code>({rcx}, {rcy})</code>, clave Z-order <code>{zKey(rcx, rcy, bits)}</code> — {levelInfo[level].approx}.{' '}
            {mode === 'cell' &&
              'Solo mirar la propia celda es barato, pero si el pasajero está cerca de un borde, el conductor más cercano puede estar en la celda de al lado.'}
            {mode === 'nine' &&
              (cellKm < radius
                ? `Ojo: las celdas miden ${cellKm.toLocaleString('es')} km y el radio es ${radius.toLocaleString('es')} km; 3 × 3 celdas no cubren el círculo completo.`
                : 'Celda + 8 vecinas cubre el radio siempre que la celda sea al menos tan grande como el radio. Celdas grandes = más conductores leídos y filtrados.')}
            {mode === 'rings' &&
              'Los anillos crecen hasta tener K candidatos y hasta que el siguiente anillo ya no pueda contener a nadie más cerca. Así funciona bien tanto en el centro denso como en la periferia vacía.'}
          </p>
        </>
      }
    >
      <svg
        ref={svgRef}
        className="gg-map"
        viewBox={`0 0 ${VIEW} ${VIEW}`}
        role="application"
        tabIndex={0}
        aria-label="Mapa de la ciudad. Toca para ubicar al pasajero o usa las flechas del teclado para moverlo."
        onPointerDown={setFromPointer}
        onKeyDown={onKey}
      >
        <rect x={0} y={0} width={VIEW} height={VIEW} className="gg-ground" />
        {result.searched.map((c) => (
          <rect
            key={`s${c.cx}-${c.cy}`}
            x={px(c.cx * size)}
            y={px(c.cy * size)}
            width={px(size)}
            height={px(size)}
            className={c.cx === rcx && c.cy === rcy ? 'gg-cell gg-cell--home' : 'gg-cell'}
          />
        ))}
        {Array.from({ length: cells + 1 }, (_, i) => (
          <g key={`g${i}`}>
            <line x1={px(i * size)} x2={px(i * size)} y1={0} y2={VIEW} className="gg-grid" />
            <line y1={px(i * size)} y2={px(i * size)} x1={0} x2={VIEW} className="gg-grid" />
          </g>
        ))}
        {mode !== 'rings' && (
          <circle cx={px(rider.x)} cy={px(rider.y)} r={px(radius / CITY_KM)} className="gg-radius" />
        )}
        {drivers.map((d) => {
          const cls = matchIds.has(d.id) ? 'gg-driver is-match' : readIds.has(d.id) ? 'gg-driver is-read' : 'gg-driver'
          return (
            <motion.circle
              key={d.id}
              className={cls}
              r={best && best.d.id === d.id ? 7 : 4.5}
              initial={false}
              animate={{ cx: px(d.x), cy: px(d.y) }}
              transition={tr}
            />
          )
        })}
        {best && (
          <line x1={px(rider.x)} y1={px(rider.y)} x2={px(best.d.x)} y2={px(best.d.y)} className="gg-link" />
        )}
        <g transform={`translate(${px(rider.x)} ${px(rider.y)})`} className="gg-rider">
          <circle r={9} />
          <circle r={3.5} className="gg-rider__dot" />
        </g>
        <text x={8} y={VIEW - 8} className="gg-scale">
          celda = {levelInfo[level].label}
        </text>
      </svg>
      <ul className="gg-legend" aria-label="Leyenda">
        <li>
          <span className="gg-sw gg-sw--rider" /> pasajero
        </li>
        <li>
          <span className="gg-sw" /> conductor
        </li>
        <li>
          <span className="gg-sw gg-sw--read" /> leído del índice
        </li>
        <li>
          <span className="gg-sw gg-sw--match" /> candidato
        </li>
      </ul>
    </WidgetFrame>
  )
}
