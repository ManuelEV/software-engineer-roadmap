import { useEffect, useRef, useState } from "react"
import { motion, useReducedMotion } from 'motion/react'
import { ArrowDown, ArrowUp, Play, RotateCcw, TriangleAlert } from 'lucide-react'
import { Log, Stat, WidgetFrame } from '../kit'
import './DecoratorStack.css'

type LayerId = 'logging' | 'auth' | 'cache' | 'retry'

const LAYER_INFO: Record<LayerId, { name: string; cls: string }> = {
  logging: { name: 'Logging', cls: 'LoggingClient' },
  auth: { name: 'Auth', cls: 'AuthClient' },
  cache: { name: 'Caché', cls: 'CachingClient' },
  retry: { name: 'Retry', cls: 'RetryClient' },
}

interface Ev {
  at: string // layer id or 'core'
  text: string
  tone?: 'ok' | 'warn' | 'bad'
}

interface SimResult {
  events: Ev[]
  status: number
  coreCalls: number
  ms: number
}

function simulate(layers: LayerId[], failFirst: boolean, cacheWarm: boolean): SimResult {
  const events: Ev[] = []
  const ctx = { coreCalls: 0, hasAuth: false, ms: 0 }
  const call = (i: number): number => {
    if (i === layers.length) {
      ctx.coreCalls += 1
      ctx.ms += 120
      if (!ctx.hasAuth) {
        events.push({ at: 'core', text: 'HttpClient → 401 Unauthorized (sin token)', tone: 'bad' })
        return 401
      }
      if (failFirst && ctx.coreCalls === 1) {
        events.push({ at: 'core', text: 'HttpClient → 503 Service Unavailable', tone: 'bad' })
        return 503
      }
      events.push({ at: 'core', text: 'HttpClient → 200 OK (120 ms)', tone: 'ok' })
      return 200
    }
    const id = layers[i]
    if (id === 'logging') {
      events.push({ at: id, text: 'log: → GET /pedidos/42' })
      const s = call(i + 1)
      events.push({ at: id, text: `log: ← ${s}`, tone: s === 200 ? 'ok' : 'warn' })
      return s
    }
    if (id === 'auth') {
      ctx.hasAuth = true
      events.push({ at: id, text: 'auth: agrega Authorization: Bearer …' })
      return call(i + 1)
    }
    if (id === 'cache') {
      if (cacheWarm) {
        ctx.ms += 2
        events.push({ at: id, text: 'cache: HIT, responde sin bajar (2 ms)', tone: 'ok' })
        return 200
      }
      events.push({ at: id, text: 'cache: MISS, delega hacia adentro' })
      const s = call(i + 1)
      if (s === 200) events.push({ at: id, text: 'cache: guarda la respuesta' })
      return s
    }
    // retry
    let s = 0
    for (let attempt = 1; attempt <= 3; attempt++) {
      if (attempt > 1) events.push({ at: id, text: `retry: intento ${attempt}` })
      s = call(i + 1)
      if (s < 500) break
      if (attempt < 3) {
        const wait = 100 * 2 ** (attempt - 1)
        ctx.ms += wait
        events.push({ at: id, text: `retry: ${s} es transitorio, espera ${wait} ms`, tone: 'warn' })
      }
    }
    return s
  }
  const status = call(0)
  return { events, status, coreCalls: ctx.coreCalls, ms: ctx.ms }
}

const ALL: LayerId[] = ['logging', 'auth', 'cache', 'retry']

export function DecoratorStack() {
  const reduced = useReducedMotion()
  const [order, setOrder] = useState<LayerId[]>(ALL)
  const [enabled, setEnabled] = useState<Record<LayerId, boolean>>({ logging: true, auth: true, cache: true, retry: true })
  const [failFirst, setFailFirst] = useState(true)
  const [cacheWarm, setCacheWarm] = useState(false)
  const [run, setRun] = useState<SimResult | null>(null)
  const [cursor, setCursor] = useState(-1)
  const timer = useRef<number | undefined>(undefined)

  const layers = order.filter((l) => enabled[l])

  const warnings = (() => {
    const w: string[] = []
    const idx = (l: LayerId) => layers.indexOf(l)
    if (idx('cache') >= 0 && idx('auth') >= 0 && idx('cache') < idx('auth'))
      w.push('La caché está por fuera de Auth: la clave no incluye al usuario y un cliente compartido podría servir la respuesta de otra persona.')
    if (idx('logging') >= 0 && idx('retry') >= 0)
      w.push(
        idx('logging') < idx('retry')
          ? 'Logging envuelve a Retry: ves una sola llamada lógica; los reintentos quedan ocultos.'
          : 'Logging está dentro de Retry: registra cada intento por separado.',
      )
    if (idx('cache') >= 0 && idx('retry') >= 0 && idx('retry') < idx('cache'))
      w.push('Retry envuelve a la caché: cada reintento vuelve a consultarla (barato, pero redundante).')
    if (idx('auth') < 0) w.push('Sin Auth, el servidor rechaza la petición.')
    return w
  })()

  const send = () => {
    window.clearTimeout(timer.current)
    const r = simulate(layers, failFirst, cacheWarm)
    setRun(r)
    setCursor(0)
  }

  useEffect(() => {
    if (!run || cursor < 0 || cursor >= run.events.length - 1) return
    timer.current = window.setTimeout(() => setCursor((c) => c + 1), reduced ? 220 : 420)
    return () => window.clearTimeout(timer.current)
  }, [run, cursor, reduced])

  // Changing configuration invalidates the last run
  useEffect(() => {
    window.clearTimeout(timer.current)
    setRun(null)
    setCursor(-1)
  }, [order, enabled, failFirst, cacheWarm])

  const move = (id: LayerId, dir: -1 | 1) => {
    setOrder((o) => {
      const i = o.indexOf(id)
      const j = i + dir
      if (j < 0 || j >= o.length) return o
      const next = [...o]
      ;[next[i], next[j]] = [next[j], next[i]]
      return next
    })
  }

  const activeAt = run && cursor >= 0 ? run.events[cursor]?.at : null
  const shown = run ? run.events.slice(0, cursor + 1) : []
  const done = !!run && cursor >= run.events.length - 1

  const renderLayer = (i: number) => {
    if (i === layers.length) {
      return (
        <motion.div className={`ds-core ${activeAt === 'core' ? 'is-on' : ''}`} layout={!reduced}>
          <span className="ds-core__name">HttpClient</span>
          <span className="ds-core__sub">get(url)</span>
        </motion.div>
      )
    }
    const id = layers[i]
    return (
      <motion.div key={id} className={`ds-layer ${activeAt === id ? 'is-on' : ''}`} layout={!reduced} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
        <span className="ds-layer__name">{LAYER_INFO[id].cls}</span>
        {renderLayer(i + 1)}
      </motion.div>
    )
  }

  return (
    <WidgetFrame
      caption="Cada capa implementa la misma interfaz que el cliente que envuelve. Activa, desactiva y reordena capas: el orden cambia el comportamiento."
      controls={
        <div className="ds-controls">
          <ol className="ds-order" aria-label="Capas, de afuera hacia adentro">
            {order.map((id, i) => (
              <li key={id} className={enabled[id] ? '' : 'is-off'}>
                <label className="ds-toggle">
                  <input type="checkbox" checked={enabled[id]} onChange={(e) => setEnabled((s) => ({ ...s, [id]: e.target.checked }))} />
                  <span>{LAYER_INFO[id].name}</span>
                </label>
                <button type="button" className="icon-btn" onClick={() => move(id, -1)} disabled={i === 0} aria-label={`Mover ${LAYER_INFO[id].name} hacia afuera`}>
                  <ArrowUp size={16} />
                </button>
                <button type="button" className="icon-btn" onClick={() => move(id, 1)} disabled={i === order.length - 1} aria-label={`Mover ${LAYER_INFO[id].name} hacia adentro`}>
                  <ArrowDown size={16} />
                </button>
              </li>
            ))}
          </ol>
          <div className="ds-scenario">
            <label className="ds-toggle">
              <input type="checkbox" checked={failFirst} onChange={(e) => setFailFirst(e.target.checked)} />
              <span>El servidor falla una vez (503)</span>
            </label>
            <label className="ds-toggle">
              <input type="checkbox" checked={cacheWarm} onChange={(e) => setCacheWarm(e.target.checked)} />
              <span>La respuesta ya está en caché</span>
            </label>
            <div className="ds-buttons">
              <button type="button" className="btn btn--line" onClick={send}>
                <Play size={16} aria-hidden="true" /> GET /pedidos/42
              </button>
              <button
                type="button"
                className="icon-btn"
                aria-label="Restaurar orden"
                onClick={() => {
                  setOrder(ALL)
                  setEnabled({ logging: true, auth: true, cache: true, retry: true })
                }}
              >
                <RotateCcw size={18} />
              </button>
            </div>
          </div>
        </div>
      }
      readout={
        <div className="ds-readout">
          <div className="ds-stats">
            <Stat label="estado final" value={done ? run!.status : '—'} tone={done ? (run!.status === 200 ? 'ok' : 'bad') : undefined} />
            <Stat label="llamadas a la red" value={done ? run!.coreCalls : '—'} />
            <Stat label="latencia simulada" value={done ? `${run!.ms} ms` : '—'} />
          </div>
          {warnings.length > 0 && (
            <ul className="ds-warn">
              {warnings.map((w) => (
                <li key={w}>
                  <TriangleAlert size={14} aria-hidden="true" /> {w}
                </li>
              ))}
            </ul>
          )}
          <Log entries={[...shown].reverse().map((e, i) => ({ id: shown.length - i, text: e.text, tone: e.tone }))} empty="Envía la petición para ver el recorrido." />
        </div>
      }
    >
      <div className="ds-stage" aria-hidden="true">
        <div className="ds-onion">{renderLayer(0)}</div>
        <div className="ds-legend">
          {layers.length > 0 ? `${layers.map((l) => `new ${LAYER_INFO[l].cls}(`).join('')}new HttpClient()${')'.repeat(layers.length)}` : 'new HttpClient()'}
        </div>
      </div>
    </WidgetFrame>
  )
}
