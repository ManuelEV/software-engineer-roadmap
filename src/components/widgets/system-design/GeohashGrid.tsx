import { type KeyboardEvent, useState } from 'react'
import { ArrowUpLeft, Crosshair } from 'lucide-react'
import { Segmented, Slider, Stat, WidgetFrame } from '../kit'
import { fmt } from './shared'
import './GeohashGrid.css'

const B32 = '0123456789bcdefghjkmnpqrstuvwxyz'
const MAX_LEN = 8

type Box = { latMin: number; latMax: number; lonMin: number; lonMax: number }

function bounds(hash: string): Box {
  const b: Box = { latMin: -90, latMax: 90, lonMin: -180, lonMax: 180 }
  let even = true // first bit refines longitude
  for (const ch of hash) {
    const idx = B32.indexOf(ch)
    for (let bit = 4; bit >= 0; bit--) {
      const on = (idx >> bit) & 1
      if (even) {
        const mid = (b.lonMin + b.lonMax) / 2
        if (on) b.lonMin = mid
        else b.lonMax = mid
      } else {
        const mid = (b.latMin + b.latMax) / 2
        if (on) b.latMin = mid
        else b.latMax = mid
      }
      even = !even
    }
  }
  return b
}

function encode(lat: number, lon: number, len: number): string {
  let hash = ''
  const b: Box = { latMin: -90, latMax: 90, lonMin: -180, lonMax: 180 }
  let even = true
  let bit = 0
  let idx = 0
  while (hash.length < len) {
    if (even) {
      const mid = (b.lonMin + b.lonMax) / 2
      if (lon >= mid) {
        idx = (idx << 1) | 1
        b.lonMin = mid
      } else {
        idx <<= 1
        b.lonMax = mid
      }
    } else {
      const mid = (b.latMin + b.latMax) / 2
      if (lat >= mid) {
        idx = (idx << 1) | 1
        b.latMin = mid
      } else {
        idx <<= 1
        b.latMax = mid
      }
    }
    even = !even
    if (++bit === 5) {
      hash += B32[idx]
      bit = 0
      idx = 0
    }
  }
  return hash
}

function sizeKm(b: Box) {
  const lat = (b.latMin + b.latMax) / 2
  const h = (b.latMax - b.latMin) * 111.32
  const w = (b.lonMax - b.lonMin) * 111.32 * Math.cos((lat * Math.PI) / 180)
  return { w, h }
}

function fmtKm(km: number) {
  if (km >= 10) return `${fmt(km, 0)} km`
  if (km >= 1) return `${fmt(km, 1)} km`
  return `${fmt(km * 1000, 0)} m`
}

type PlaceId = 'cdmx' | 'bog' | 'bue' | 'gre'
const PLACES: Record<PlaceId, { name: string; lat: number; lon: number }> = {
  cdmx: { name: 'Zócalo, CDMX', lat: 19.4326, lon: -99.1332 },
  bog: { name: 'Plaza de Bolívar, Bogotá', lat: 4.5981, lon: -74.076 },
  bue: { name: 'Obelisco, Buenos Aires', lat: -34.6037, lon: -58.3816 },
  gre: { name: 'Observatorio de Greenwich', lat: 51.4779, lon: -0.0015 },
}

function commonPrefix(a: string, b: string) {
  let i = 0
  while (i < a.length && a[i] === b[i]) i++
  return i
}

export function GeohashGrid() {
  const [mode, setMode] = useState<'zoom' | 'vecinos'>('zoom')
  const [placeId, setPlaceId] = useState<PlaceId>('cdmx')
  const [hash, setHash] = useState('')
  const [precision, setPrecision] = useState(6)
  const place = PLACES[placeId]
  const pointHash = encode(place.lat, place.lon, MAX_LEN)

  const choosePlace = (id: PlaceId) => {
    setPlaceId(id)
    const p = PLACES[id]
    setHash(encode(p.lat, p.lon, hash.length))
  }

  // ---------- zoom mode ----------
  const parent = bounds(hash)
  const VW = 480
  const VH = 320
  const px = (lon: number) => ((lon - parent.lonMin) / (parent.lonMax - parent.lonMin)) * VW
  const py = (lat: number) => ((parent.latMax - lat) / (parent.latMax - parent.latMin)) * VH
  const children = B32.split('').map((ch) => ({ ch, b: bounds(hash + ch) }))
  const pointInside = pointHash.startsWith(hash)
  const childSize = sizeKm(children[0].b)
  const here = sizeKm(parent)

  const onKey = (e: KeyboardEvent, ch: string) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      if (hash.length < MAX_LEN) setHash(hash + ch)
    }
  }

  // ---------- neighbours mode ----------
  const center = encode(place.lat, place.lon, precision)
  const cb = bounds(center)
  const dLat = cb.latMax - cb.latMin
  const dLon = cb.lonMax - cb.lonMin
  const clat = (cb.latMin + cb.latMax) / 2
  const clon = (cb.lonMin + cb.lonMax) / 2
  const grid = [1, 0, -1].map((dy) =>
    [-1, 0, 1].map((dx) => {
      const lat = clat + dy * dLat
      let lon = clon + dx * dLon
      if (lon >= 180) lon -= 360
      if (lon < -180) lon += 360
      if (lat > 90 || lat < -90) return null
      return encode(lat, lon, precision)
    }),
  )
  const flat = grid.flat().filter(Boolean) as string[]
  const minShared = Math.min(...flat.map((g) => commonPrefix(g, center)))
  const csize = sizeKm(cb)

  return (
    <WidgetFrame
      caption={
        mode === 'zoom'
          ? 'Cada carácter de un geohash elige una de 32 subceldas (5 bits que alternan longitud y latitud). Toca una subcelda para bajar un nivel.'
          : 'La celda del punto y sus 8 vecinas. Cerca de un borde, celdas contiguas pueden no compartir prefijo: por eso una búsqueda de cercanía consulta las 9.'
      }
      controls={
        <>
          <Segmented
            label="Vista"
            value={mode}
            options={[
              { value: 'zoom', label: 'Subdividir' },
              { value: 'vecinos', label: 'Vecinos' },
            ]}
            onChange={setMode}
          />
          <Segmented
            label="Lugar"
            value={placeId}
            options={[
              { value: 'cdmx', label: 'CDMX' },
              { value: 'bog', label: 'Bogotá' },
              { value: 'bue', label: 'Buenos Aires' },
              { value: 'gre', label: 'Greenwich (borde)' },
            ]}
            onChange={choosePlace}
          />
          {mode === 'vecinos' && <Slider label="Precisión" value={precision} min={1} max={8} onChange={setPrecision} format={(v) => `${v} caracteres`} />}
        </>
      }
      readout={
        mode === 'zoom' ? (
          <div className="gh-readout">
            <Stat label="Celda actual" value={hash ? <code className="gh-code">{hash}</code> : 'el mundo'} hint={`${hash.length} de ${MAX_LEN} caracteres`} />
            <Stat label="Tamaño de la celda" value={`${fmtKm(here.w)} × ${fmtKm(here.h)}`} hint="ancho × alto aprox." />
            <Stat label="Cada subcelda" value={`${fmtKm(childSize.w)} × ${fmtKm(childSize.h)}`} />
            <p className="gh-note">
              Punto: {place.name} → <code className="gh-code">{pointHash}</code>
            </p>
          </div>
        ) : (
          <div className="gh-readout">
            <Stat label="Celda del punto" value={<code className="gh-code">{center}</code>} hint={`${fmtKm(csize.w)} × ${fmtKm(csize.h)}`} />
            <Stat
              label="Prefijo común mínimo"
              value={`${minShared} de ${precision}`}
              tone={minShared === 0 ? 'bad' : minShared < precision - 1 ? 'warn' : 'ok'}
              hint={minShared === 0 ? 'vecinas sin nada en común' : 'entre la celda y sus vecinas'}
            />
          </div>
        )
      }
    >
      {mode === 'zoom' ? (
        <div className="gh-zoom">
          <div className="gh-crumbs">
            <button type="button" className="btn" onClick={() => setHash(hash.slice(0, -1))} disabled={!hash}>
              <ArrowUpLeft size={16} aria-hidden="true" /> Subir
            </button>
            <button type="button" className="btn" onClick={() => setHash(pointHash.slice(0, Math.min(MAX_LEN, hash.length + 1)))} disabled={hash.length >= MAX_LEN}>
              <Crosshair size={16} aria-hidden="true" /> Bajar hacia el punto
            </button>
            <span className="gh-path" aria-label="Geohash actual">
              {hash.split('').map((c, i) => (
                <button key={i} type="button" className="gh-char" onClick={() => setHash(hash.slice(0, i + 1))} aria-label={`Volver al nivel ${i + 1}`}>
                  {c}
                </button>
              ))}
              {!hash && <span className="gh-world">mundo</span>}
            </span>
          </div>
          <svg className="gh-svg" viewBox={`0 0 ${VW} ${VH}`} role="group" aria-label={`Subceldas de ${hash || 'el mundo'}`}>
            {children.map(({ ch, b }) => {
              const x = px(b.lonMin)
              const y = py(b.latMax)
              const w = px(b.lonMax) - x
              const h = py(b.latMin) - y
              const hasPoint = pointHash.startsWith(hash + ch)
              return (
                <g
                  key={ch}
                  role="button"
                  tabIndex={hash.length < MAX_LEN ? 0 : -1}
                  aria-label={`Subcelda ${hash}${ch}`}
                  className={`gh-cell ${hasPoint ? 'has-point' : ''}`}
                  onClick={() => hash.length < MAX_LEN && setHash(hash + ch)}
                  onKeyDown={(e) => onKey(e, ch)}
                >
                  <rect x={x + 1} y={y + 1} width={w - 2} height={h - 2} rx={4} />
                  <text x={x + w / 2} y={y + h / 2 + 6} textAnchor="middle">
                    {ch}
                  </text>
                </g>
              )
            })}
            {pointInside && (
              <g className="gh-point" aria-hidden="true">
                <circle cx={px(place.lon)} cy={py(place.lat)} r={9} />
                <circle cx={px(place.lon)} cy={py(place.lat)} r={3} className="gh-point__dot" />
              </g>
            )}
          </svg>
        </div>
      ) : (
        <div className="gh-grid" role="table" aria-label="Celda y vecinas">
          {grid.map((row, r) => (
            <div className="gh-grid__row" role="row" key={r}>
              {row.map((g, c) => {
                const isCenter = r === 1 && c === 1
                if (!g) return <div key={c} role="cell" className="gh-n is-void">—</div>
                const k = commonPrefix(g, center)
                return (
                  <div key={c} role="cell" className={`gh-n ${isCenter ? 'is-center' : ''} ${k === 0 ? 'is-far' : k < precision - 1 ? 'is-diff' : ''}`}>
                    <code>
                      <b>{g.slice(0, k)}</b>
                      <span>{g.slice(k)}</span>
                    </code>
                  </div>
                )
              })}
            </div>
          ))}
          <p className="gh-note">
            En negrita, el prefijo compartido con la celda central. {placeId === 'gre' ? 'Greenwich está pegado al meridiano 0: al este y al oeste los geohashes empiezan con letras distintas (g… y u…).' : 'Prueba Greenwich para ver el problema del borde.'}
          </p>
        </div>
      )}
    </WidgetFrame>
  )
}
