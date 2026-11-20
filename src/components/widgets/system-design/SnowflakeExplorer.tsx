import { useState } from 'react'
import { Clock, Layers, RotateCcw, Sparkles } from 'lucide-react'
import { Log, Segmented, Slider, Stat, WidgetFrame } from '../kit'
import { fmt } from './shared'
import './SnowflakeExplorer.css'

type EpochId = 'twitter' | 'discord' | 'custom'
const EPOCHS: Record<EpochId, { ms: number; label: string }> = {
  twitter: { ms: 1288834974657, label: 'Twitter (2010-11-04)' },
  discord: { ms: 1420070400000, label: 'Discord (2015-01-01)' },
  custom: { ms: 1704067200000, label: 'Propia (2024-01-01)' },
}

const FIELDS = [
  { key: 'sign', label: 'Signo', bits: 1 },
  { key: 'ts', label: 'Timestamp (ms desde la época)', bits: 41 },
  { key: 'dc', label: 'Datacenter', bits: 5 },
  { key: 'worker', label: 'Worker', bits: 5 },
  { key: 'seq', label: 'Secuencia', bits: 12 },
] as const

type Decoded = { ts: bigint; dc: bigint; worker: bigint; seq: bigint }

function encode(d: Decoded): bigint {
  return (d.ts << 22n) | (d.dc << 17n) | (d.worker << 12n) | d.seq
}
function decode(id: bigint): Decoded {
  return {
    ts: (id >> 22n) & ((1n << 41n) - 1n),
    dc: (id >> 17n) & 31n,
    worker: (id >> 12n) & 31n,
    seq: id & 4095n,
  }
}

type Gen = { lastTs: bigint; seq: bigint }

export function SnowflakeExplorer() {
  const [epoch, setEpoch] = useState<EpochId>('twitter')
  const [dc, setDc] = useState(1)
  const [worker, setWorker] = useState(7)
  const [gen, setGen] = useState<Gen>({ lastTs: -1n, seq: 0n })
  const [id, setId] = useState<bigint | null>(null)
  const [input, setInput] = useState('')
  const [log, setLog] = useState<{ id: number; text: string; tone?: 'ok' | 'warn' | 'bad' }[]>([])
  const [logId, setLogId] = useState(0)

  const epochMs = EPOCHS[epoch].ms

  const addLog = (entries: { text: string; tone?: 'ok' | 'warn' | 'bad' }[]) => {
    setLog((l) => [...entries.map((e, i) => ({ id: logId + i, ...e })).reverse(), ...l].slice(0, 14))
    setLogId((n) => n + entries.length)
  }

  /** Generates `count` ids starting at wall clock `now` (ms since Unix epoch). */
  const generate = (count: number, skewMs = 0) => {
    let { lastTs, seq } = gen
    if (skewMs < 0 && lastTs < 0n) {
      addLog([{ text: 'Genera un ID primero; luego atrasa el reloj.', tone: 'warn' }])
      return
    }
    // simulate an NTP step backwards relative to the last issued timestamp
    const now = skewMs < 0 ? lastTs + BigInt(skewMs) : BigInt(Date.now() - epochMs)
    const out: { text: string; tone?: 'ok' | 'warn' | 'bad' }[] = []
    let last: bigint | null = null
    for (let i = 0; i < count; i++) {
      let ts = now
      if (ts < lastTs) {
        out.push({ text: `Reloj retrocedió ${lastTs - ts} ms: el generador se niega a emitir (o espera) para no repetir IDs`, tone: 'bad' })
        break
      }
      if (ts === lastTs) {
        seq = (seq + 1n) & 4095n
        if (seq === 0n) ts = lastTs + 1n // sequence exhausted: wait for next millisecond
      } else {
        seq = 0n
      }
      lastTs = ts
      const v = encode({ ts, dc: BigInt(dc), worker: BigInt(worker), seq })
      last = v
      out.push({ text: `${v.toString()}  · seq ${seq}`, tone: seq > 0n ? 'warn' : undefined })
    }
    setGen({ lastTs, seq })
    if (last !== null) {
      setId(last)
      setInput(last.toString())
    }
    addLog(out)
  }

  let parsed: bigint | null = null
  let parseError = ''
  if (input.trim()) {
    try {
      parsed = BigInt(input.trim())
      if (parsed < 0n || parsed >= 1n << 63n) parseError = 'Fuera de rango (debe caber en 63 bits sin signo).'
    } catch {
      parseError = 'Escribe un entero decimal.'
    }
  }
  const shown = parsed !== null && !parseError ? parsed : id
  const d = shown !== null ? decode(shown) : null
  const bits = shown !== null ? shown.toString(2).padStart(64, '0') : '0'.repeat(64)
  const date = d ? new Date(Number(d.ts) + epochMs) : null
  const asNumber = shown !== null ? Number(shown) : null
  const lossy = shown !== null && BigInt(asNumber!) !== shown

  const fieldOf = (i: number) => {
    let acc = 0
    for (const f of FIELDS) {
      acc += f.bits
      if (i < acc) return f.key
    }
    return 'seq'
  }

  const lifetimeYears = Number(1n << 41n) / (1000 * 3600 * 24 * 365.25)
  const endDate = new Date(epochMs + Number(1n << 41n))

  return (
    <WidgetFrame
      caption="El layout de 64 bits de Snowflake: 1 bit de signo, 41 de tiempo, 10 de máquina (aquí 5 de datacenter + 5 de worker) y 12 de secuencia. Genera IDs o pega uno para decodificarlo."
      controls={
        <>
          <Segmented label="Época" value={epoch} options={(Object.keys(EPOCHS) as EpochId[]).map((k) => ({ value: k, label: EPOCHS[k].label }))} onChange={(v) => { setEpoch(v); setGen({ lastTs: -1n, seq: 0n }) }} />
          <Slider label="Datacenter" value={dc} min={0} max={31} onChange={setDc} />
          <Slider label="Worker" value={worker} min={0} max={31} onChange={setWorker} />
        </>
      }
      readout={
        <div className="sf-readout">
          <div className="sf-stats">
            <Stat label="IDs por ms y máquina" value="4.096" hint="2¹² secuencias" />
            <Stat label="Máquinas" value="1.024" hint="2¹⁰ ids de nodo" />
            <Stat label="Vida útil" value={`${fmt(lifetimeYears, 1)} años`} hint={`hasta ${endDate.getUTCFullYear()}`} />
          </div>
          <Log entries={log} empty="Genera algunos IDs: fíjate que crecen con el tiempo." />
        </div>
      }
    >
      <div className="sf-actions">
        <button type="button" className="btn btn--line" onClick={() => generate(1)}>
          <Sparkles size={16} aria-hidden="true" /> Generar ID
        </button>
        <button type="button" className="btn" onClick={() => generate(5)}>
          <Layers size={16} aria-hidden="true" /> 5 en el mismo ms
        </button>
        <button type="button" className="btn" onClick={() => generate(1, -5)}>
          <Clock size={16} aria-hidden="true" /> Reloj atrasado 5 ms
        </button>
        <button type="button" className="icon-btn" aria-label="Reiniciar" onClick={() => { setGen({ lastTs: -1n, seq: 0n }); setId(null); setInput(''); setLog([]) }}>
          <RotateCcw size={18} aria-hidden="true" />
        </button>
      </div>

      <label className="sf-input">
        <span>ID (decimal)</span>
        <input
          type="text"
          inputMode="numeric"
          value={input}
          placeholder="Genera uno o pega un ID de 64 bits"
          onChange={(e) => setInput(e.target.value)}
          aria-invalid={!!parseError}
        />
      </label>
      {parseError && <p className="sf-error">{parseError}</p>}

      <div className="sf-bits" role="img" aria-label={`Bits del ID: ${bits}`}>
        {bits.split('').map((b, i) => (
          <span key={i} className={`sf-bit sf-bit--${fieldOf(i)} ${b === '1' ? 'is-one' : ''}`}>
            {b}
          </span>
        ))}
      </div>

      <dl className="sf-fields">
        {FIELDS.map((f) => {
          const value =
            !d ? '—' : f.key === 'sign' ? '0' : f.key === 'ts' ? d.ts.toString() : f.key === 'dc' ? d.dc.toString() : f.key === 'worker' ? d.worker.toString() : d.seq.toString()
          return (
            <div key={f.key} className="sf-field">
              <dt>
                <i className={`sf-swatch sf-bit--${f.key}`} aria-hidden="true" />
                {f.label} <small>{f.bits} bit{f.bits > 1 ? 's' : ''}</small>
              </dt>
              <dd>{value}</dd>
            </div>
          )
        })}
      </dl>

      {d && date && (
        <div className="sf-decoded">
          <p>
            Creado: <b>{Number.isNaN(date.getTime()) ? '—' : date.toISOString().replace('T', ' ').replace('Z', ' UTC')}</b>
          </p>
          <p>
            Hex: <code>0x{shown!.toString(16).padStart(16, '0')}</code>
          </p>
          <p className={lossy ? 'sf-warn' : ''}>
            Como <code>Number</code> de JavaScript: <code>{String(asNumber)}</code>
            {lossy ? ' — perdió precisión (más de 2⁵³). Por eso las APIs devuelven el ID también como string.' : ' — cabe sin pérdida.'}
          </p>
        </div>
      )}
    </WidgetFrame>
  )
}
