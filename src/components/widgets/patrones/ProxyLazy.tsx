import { useEffect, useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { FileImage, Loader2, RotateCcw, Zap } from 'lucide-react'
import { Log, Segmented, Stat, WidgetFrame } from '../kit'
import './ProxyLazy.css'

type Mode = 'eager' | 'virtual' | 'cache'
type Status = 'idle' | 'loading' | 'ready'

const IMAGES = ['Plano planta 1', 'Plano planta 2', 'Fachada', 'Corte A-A', 'Instalaciones', 'Detalle escalera']
const MB = 2.4
const LOAD_MS = 700

export function ProxyLazy() {
  const reduced = useReducedMotion()
  const [mode, setMode] = useState<Mode>('virtual')
  const [status, setStatus] = useState<Status[]>(() => IMAGES.map(() => 'idle'))
  const [visible, setVisible] = useState<boolean[]>(() => IMAGES.map(() => false))
  const [stats, setStats] = useState({ loads: 0, hits: 0, waitMs: 0 })
  const [log, setLog] = useState<{ id: number; text: string; tone?: 'ok' | 'warn' | 'bad' }[]>([])
  const shared = useRef<Set<number>>(new Set()) // shared cache across document opens
  const seq = useRef(0)
  const timers = useRef<number[]>([])

  const push = (text: string, tone?: 'ok' | 'warn' | 'bad') => {
    seq.current += 1
    const id = seq.current
    setLog((l) => [{ id, text, tone }, ...l].slice(0, 10))
  }

  const clearTimers = () => {
    timers.current.forEach((t) => window.clearTimeout(t))
    timers.current = []
  }

  const startLoad = (i: number) => {
    setStatus((s) => s.map((v, k) => (k === i ? 'loading' : v)))
    setStats((s) => ({ ...s, loads: s.loads + 1, waitMs: s.waitMs + LOAD_MS }))
    push(`RemoteImage("${IMAGES[i]}") descarga ${MB} MB…`, 'warn')
    const t = window.setTimeout(() => {
      setStatus((s) => s.map((v, k) => (k === i ? 'ready' : v)))
      if (mode === 'cache') shared.current.add(i)
    }, LOAD_MS)
    timers.current.push(t)
  }

  const openDocument = (m: Mode = mode, resetShared = false) => {
    clearTimers()
    if (resetShared) shared.current = new Set()
    const initial: Status[] = IMAGES.map((_, i) => (m === 'cache' && shared.current.has(i) ? 'ready' : 'idle'))
    setStatus(initial)
    setVisible(IMAGES.map(() => m === 'eager'))
    push(m === 'eager' ? 'Documento abierto: crea las 6 imágenes reales de inmediato' : 'Documento abierto: crea 6 proxies livianos (nada se descarga)')
    if (m === 'eager') {
      IMAGES.forEach((_, i) => startLoad(i))
    }
  }

  const reset = (m: Mode) => {
    clearTimers()
    shared.current = new Set()
    setStats({ loads: 0, hits: 0, waitMs: 0 })
    setLog([])
    seq.current = 0
    openDocument(m, true)
  }

  useEffect(() => {
    reset(mode)
    return clearTimers
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  const view = (i: number) => {
    setVisible((v) => v.map((x, k) => (k === i ? true : x)))
    if (status[i] === 'ready') {
      setStats((s) => ({ ...s, hits: s.hits + 1 }))
      push(`display("${IMAGES[i]}") → ya está en memoria`, 'ok')
    } else if (status[i] === 'idle') {
      push(`display("${IMAGES[i]}") → el proxy crea el objeto real ahora`)
      startLoad(i)
    }
  }

  const viewed = visible.filter(Boolean).length
  const transferred = (stats.loads * MB).toFixed(1)

  return (
    <WidgetFrame
      caption="Un visor de planos con seis imágenes pesadas. Compara cargar todo al abrir, un proxy virtual que difiere la carga hasta que miras, y un proxy que además comparte una caché entre aperturas."
      controls={
        <>
          <Segmented
            label="Estrategia"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'eager', label: 'Sin proxy' },
              { value: 'virtual', label: 'Proxy virtual' },
              { value: 'cache', label: 'Proxy + caché' },
            ]}
          />
          <button type="button" className="btn" onClick={() => openDocument()}>
            <RotateCcw size={16} aria-hidden="true" /> Reabrir documento
          </button>
        </>
      }
      readout={
        <div className="pl-readout">
          <div className="pl-stats">
            <Stat label="descargas" value={stats.loads} tone={stats.loads > viewed + 1 ? 'warn' : undefined} />
            <Stat label="MB transferidos" value={transferred} />
            <Stat label="aciertos en memoria" value={stats.hits} tone={stats.hits ? 'ok' : undefined} />
            <Stat label="espera acumulada" value={`${(stats.waitMs / 1000).toFixed(1)} s`} />
          </div>
          <Log entries={log} empty="Toca una imagen para verla." />
        </div>
      }
    >
      <ul className="pl-grid">
        {IMAGES.map((name, i) => {
          const st = status[i]
          const isVisible = visible[i]
          return (
            <li key={name}>
              <button
                type="button"
                className={`pl-card is-${st} ${isVisible ? 'is-visible' : ''}`}
                onClick={() => view(i)}
                aria-label={`Ver ${name}${st === 'ready' ? ' (en memoria)' : st === 'loading' ? ' (cargando)' : ' (no cargada)'}`}
              >
                <span className="pl-card__thumb" aria-hidden="true">
                  <AnimatePresence mode="wait" initial={false}>
                    {st === 'loading' ? (
                      <motion.span key="l" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        <Loader2 size={22} className={reduced ? '' : 'pl-spin'} />
                      </motion.span>
                    ) : st === 'ready' ? (
                      <motion.span key="r" initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}>
                        <FileImage size={26} />
                      </motion.span>
                    ) : (
                      <motion.span key="i" className="pl-ghost" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                        proxy
                      </motion.span>
                    )}
                  </AnimatePresence>
                </span>
                <span className="pl-card__name">{name}</span>
                <span className="pl-card__state">
                  {st === 'ready' ? (
                    <>
                      <Zap size={12} aria-hidden="true" /> en memoria
                    </>
                  ) : st === 'loading' ? (
                    'descargando…'
                  ) : (
                    'sin cargar'
                  )}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </WidgetFrame>
  )
}
