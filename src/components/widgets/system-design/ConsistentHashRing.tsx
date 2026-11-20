import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Plus, X } from 'lucide-react'
import { Segmented, Stat, WidgetFrame } from '../kit'
import { EASE, fmt, hash32 } from './shared'
import './ConsistentHashRing.css'

const ALL = ['S1', 'S2', 'S3', 'S4', 'S5', 'S6'] as const
type ServerId = (typeof ALL)[number]
const COLOR: Record<ServerId, string> = {
  S1: 'var(--l1)',
  S2: 'var(--l4)',
  S3: 'var(--l5)',
  S4: 'var(--l3)',
  S5: 'var(--l2)',
  S6: 'var(--ink-2)',
}

const TOTAL_KEYS = 2000 // used for statistics
const SHOWN_KEYS = 36 // drawn on the ring
const MAX = 2 ** 32

interface Token {
  pos: number
  server: ServerId
}

function buildRing(servers: ServerId[], vnodes: number): Token[] {
  const tokens: Token[] = []
  for (const s of servers) for (let v = 0; v < vnodes; v++) tokens.push({ pos: hash32(`${s}#${v}`), server: s })
  return tokens.sort((a, b) => a.pos - b.pos)
}

/** First token clockwise whose position is >= h (wraps around). */
function owner(ring: Token[], h: number): ServerId {
  let lo = 0
  let hi = ring.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (ring[mid].pos < h) lo = mid + 1
    else hi = mid
  }
  return ring[lo % ring.length].server
}

const keyHashes = Array.from({ length: TOTAL_KEYS }, (_, i) => hash32(`pedido:${i}`))

function assign(servers: ServerId[], vnodes: number, mode: 'ring' | 'mod') {
  if (mode === 'mod') return keyHashes.map((h) => servers[h % servers.length])
  const ring = buildRing(servers, vnodes)
  return keyHashes.map((h) => owner(ring, h))
}

const angle = (pos: number) => (pos / MAX) * Math.PI * 2 - Math.PI / 2
const CX = 180
const CY = 170
const R = 120

function arcPath(a0: number, a1: number, r: number) {
  // a1 > a0, both in radians
  const large = a1 - a0 > Math.PI ? 1 : 0
  const x0 = CX + r * Math.cos(a0)
  const y0 = CY + r * Math.sin(a0)
  const x1 = CX + r * Math.cos(a1)
  const y1 = CY + r * Math.sin(a1)
  return `M${x0},${y0} A${r},${r} 0 ${large} 1 ${x1},${y1}`
}

/**
 * Consistent hashing ring: add/remove servers, toggle virtual nodes, and
 * compare how many keys move against naive `hash % N`.
 */
export function ConsistentHashRing() {
  const reduced = useReducedMotion()
  const [servers, setServers] = useState<ServerId[]>(['S1', 'S2', 'S3', 'S4'])
  const [vnodes, setVnodes] = useState<'1' | '8' | '64'>('1')
  const [last, setLast] = useState<{ label: string; ring: number; mod: number; moved: Set<number> } | null>(null)
  const v = Number(vnodes)

  const ring = useMemo(() => buildRing(servers, v), [servers, v])
  const current = useMemo(() => assign(servers, v, 'ring'), [servers, v])

  const change = (next: ServerId[], label: string) => {
    const beforeRing = current
    const afterRing = assign(next, v, 'ring')
    const beforeMod = assign(servers, v, 'mod')
    const afterMod = assign(next, v, 'mod')
    const moved = new Set<number>()
    let mr = 0
    let mm = 0
    for (let i = 0; i < TOTAL_KEYS; i++) {
      if (beforeRing[i] !== afterRing[i]) {
        mr++
        if (i < SHOWN_KEYS) moved.add(i)
      }
      if (beforeMod[i] !== afterMod[i]) mm++
    }
    setLast({ label, ring: mr / TOTAL_KEYS, mod: mm / TOTAL_KEYS, moved })
    setServers(next)
  }

  const add = () => {
    const free = ALL.find((s) => !servers.includes(s))
    if (free) change([...servers, free].sort() as ServerId[], `Agregaste ${free}`)
  }
  const remove = (s: ServerId) => {
    if (servers.length <= 2) return
    change(
      servers.filter((x) => x !== s),
      `Quitaste ${s}`,
    )
  }

  // load distribution
  const counts = servers.map((s) => ({ s, n: current.filter((x) => x === s).length }))
  const ideal = TOTAL_KEYS / servers.length
  const maxLoad = Math.max(...counts.map((c) => c.n))
  const imbalance = maxLoad / ideal

  // arcs: token i owns (prev, pos]
  const arcs = ring.map((t, i) => {
    const prev = ring[(i - 1 + ring.length) % ring.length]
    const a0 = angle(prev.pos)
    let a1 = angle(t.pos)
    if (a1 <= a0) a1 += Math.PI * 2
    return { a0, a1, server: t.server, key: `${t.server}-${t.pos}` }
  })

  return (
    <WidgetFrame
      caption="Cada servidor (o cada nodo virtual) ocupa puntos del anillo; una clave pertenece al primer punto que encuentra girando en sentido horario. Agrega o quita servidores y compara cuántas claves se mueven contra hash % N."
      controls={
        <>
          <Segmented
            label="Nodos virtuales por servidor"
            value={vnodes}
            onChange={(x) => {
              setVnodes(x)
              setLast(null)
            }}
            options={[
              { value: '1', label: '1' },
              { value: '8', label: '8' },
              { value: '64', label: '64' },
            ]}
          />
          <div className="chr-servers" role="group" aria-label="Servidores">
            {servers.map((s) => (
              <button
                key={s}
                type="button"
                className="chr-chip"
                style={{ ['--chip' as string]: COLOR[s] }}
                onClick={() => remove(s)}
                disabled={servers.length <= 2}
                aria-label={`Quitar ${s}`}
              >
                <span className="chr-dot" aria-hidden="true" />
                {s}
                <X size={14} aria-hidden="true" />
              </button>
            ))}
            <button type="button" className="btn" onClick={add} disabled={servers.length >= ALL.length}>
              <Plus size={16} aria-hidden="true" />
              Servidor
            </button>
          </div>
        </>
      }
      readout={
        <div className="chr-readout">
          <div className="chr-stats">
            <Stat
              label={last ? `${last.label}: claves movidas (anillo)` : 'claves movidas (anillo)'}
              value={last ? `${fmt(last.ring * 100, 1)} %` : '—'}
              tone={last ? 'ok' : undefined}
            />
            <Stat
              label="con hash % N se habrían movido"
              value={last ? `${fmt(last.mod * 100, 1)} %` : '—'}
              tone={last ? 'bad' : undefined}
            />
            <Stat
              label="servidor más cargado vs. ideal"
              value={`${fmt(imbalance, 2)}×`}
              tone={imbalance > 1.5 ? 'warn' : 'ok'}
            />
          </div>
          <div className="chr-bars" aria-label="Claves por servidor">
            {counts.map((c) => (
              <div key={c.s} className="chr-bar">
                <span className="chr-bar__label">{c.s}</span>
                <span className="chr-bar__track">
                  <motion.span
                    className="chr-bar__fill"
                    style={{ background: COLOR[c.s] }}
                    animate={{ width: `${(c.n / maxLoad) * 100}%` }}
                    transition={{ duration: reduced ? 0 : 0.35, ease: EASE }}
                  />
                </span>
                <span className="chr-bar__n">{c.n}</span>
              </div>
            ))}
          </div>
          <p>
            Estadísticas sobre {fmt(TOTAL_KEYS, 0)} claves (en el anillo se dibujan {SHOWN_KEYS}). Al agregar un servidor, lo ideal es mover
            solo ~1/N de las claves; con <code>hash % N</code> se mueve casi todo.
          </p>
        </div>
      }
    >
      <svg viewBox="0 0 360 340" className="chr-svg" role="img" aria-label={`Anillo con ${servers.length} servidores y ${v} nodos virtuales cada uno`}>
        <circle cx={CX} cy={CY} r={R} className="chr-base" />
        {arcs.map((a) => (
          <path key={a.key} d={arcPath(a.a0, a.a1, R)} stroke={COLOR[a.server]} className="chr-arc" />
        ))}
        {ring.map((t) => {
          const a = angle(t.pos)
          return (
            <circle
              key={`t-${t.server}-${t.pos}`}
              cx={CX + R * Math.cos(a)}
              cy={CY + R * Math.sin(a)}
              r={v > 8 ? 3 : 7}
              className="chr-token"
              stroke={COLOR[t.server]}
            />
          )
        })}
        {v === 1 &&
          ring.map((t) => {
            const a = angle(t.pos)
            return (
              <text
                key={`l-${t.server}`}
                x={CX + (R + 24) * Math.cos(a)}
                y={CY + (R + 24) * Math.sin(a) + 5}
                textAnchor="middle"
                className="chr-label"
              >
                {t.server}
              </text>
            )
          })}
        {keyHashes.slice(0, SHOWN_KEYS).map((h, i) => {
          const a = angle(h)
          const r = R - 22 - (i % 3) * 13
          const moved = last?.moved.has(i)
          return (
            <circle
              key={`k-${i}`}
              cx={CX + r * Math.cos(a)}
              cy={CY + r * Math.sin(a)}
              r={moved ? 6 : 4.5}
              style={{ fill: COLOR[current[i]] }}
              className={`chr-key ${moved ? 'is-moved' : ''}`}
            />
          )
        })}
        <text x={CX} y={CY - 4} textAnchor="middle" className="chr-center">
          {servers.length} servidores
        </text>
        <text x={CX} y={CY + 16} textAnchor="middle" className="chr-center-sub">
          {servers.length * v} puntos en el anillo
        </text>
      </svg>
    </WidgetFrame>
  )
}
