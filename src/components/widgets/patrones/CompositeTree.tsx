import { useEffect, useMemo, useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { ChevronRight, Box, Package, Play, StepForward, RotateCcw } from 'lucide-react'
import { Segmented, WidgetFrame } from '../kit'
import './CompositeTree.css'

interface Node {
  id: string
  name: string
  /** leaf values, or the packaging's own value for boxes */
  price: number
  weight: number
  children?: Node[]
}

const TREE: Node = {
  id: 'big',
  name: 'Caja grande',
  price: 3,
  weight: 0.6,
  children: [
    { id: 'lap', name: 'Laptop', price: 1200, weight: 2.1 },
    {
      id: 'mid',
      name: 'Caja mediana',
      price: 1.5,
      weight: 0.3,
      children: [
        { id: 'mouse', name: 'Mouse', price: 25, weight: 0.1 },
        { id: 'cable', name: 'Cable USB-C', price: 12, weight: 0.05 },
        {
          id: 'small',
          name: 'Caja pequeña',
          price: 0.5,
          weight: 0.1,
          children: [{ id: 'bat', name: 'Batería externa', price: 40, weight: 0.3 }],
        },
      ],
    },
    { id: 'man', name: 'Manual impreso', price: 0, weight: 0.2 },
  ],
}

type Metric = 'price' | 'weight'

function total(n: Node, m: Metric): number {
  return (n.children ?? []).reduce((s, c) => s + total(c, m), n[m])
}

interface Ev {
  kind: 'enter' | 'return'
  id: string
  stack: string[]
  value?: number
}

function trace(n: Node, m: Metric, stack: string[] = [], out: Ev[] = []): Ev[] {
  const st = [...stack, n.id]
  out.push({ kind: 'enter', id: n.id, stack: st })
  ;(n.children ?? []).forEach((c) => trace(c, m, st, out))
  out.push({ kind: 'return', id: n.id, stack: st, value: total(n, m) })
  return out
}

const byId = new Map<string, Node>()
;(function index(n: Node) {
  byId.set(n.id, n)
  n.children?.forEach(index)
})(TREE)

const fmt = (v: number, m: Metric) => (m === 'price' ? `$${v.toFixed(v % 1 ? 2 : 0)}` : `${v.toFixed(2)} kg`)

export function CompositeTree() {
  const reduced = useReducedMotion()
  const [metric, setMetric] = useState<Metric>('price')
  const [open, setOpen] = useState<Set<string>>(new Set(['big', 'mid']))
  const [cursor, setCursor] = useState(-1)
  const [playing, setPlaying] = useState(false)
  const timer = useRef<number | undefined>(undefined)

  const events = useMemo(() => trace(TREE, metric), [metric])
  const ev = cursor >= 0 ? events[cursor] : null
  const returned = useMemo(() => {
    const done = new Set<string>()
    for (let i = 0; i <= cursor; i++) if (events[i].kind === 'return') done.add(events[i].id)
    return done
  }, [cursor, events])
  const stackSet = new Set(ev?.stack ?? [])

  useEffect(() => {
    if (!playing) return
    if (cursor >= events.length - 1) {
      setPlaying(false)
      return
    }
    timer.current = window.setTimeout(() => setCursor((c) => c + 1), 520)
    return () => window.clearTimeout(timer.current)
  }, [playing, cursor, events.length])

  const resetRun = () => {
    window.clearTimeout(timer.current)
    setPlaying(false)
    setCursor(-1)
  }

  const step = () => {
    setPlaying(false)
    setCursor((c) => (c >= events.length - 1 ? 0 : c + 1))
  }

  const play = () => {
    // Expand everything so the walk is visible
    setOpen(new Set(['big', 'mid', 'small']))
    if (cursor >= events.length - 1) setCursor(0)
    else if (cursor < 0) setCursor(0)
    setPlaying(true)
  }

  const toggle = (id: string) =>
    setOpen((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })

  const renderNode = (n: Node, depth: number) => {
    const isBox = !!n.children
    const isOpen = open.has(n.id)
    const current = ev?.id === n.id
    const inStack = stackSet.has(n.id)
    const done = returned.has(n.id)
    const showTotal = cursor < 0 || done
    const Icon = isBox ? Box : Package
    return (
      <li key={n.id} className="ct-li">
        <div className={`ct-row ${current ? 'is-current' : ''} ${inStack ? 'is-stack' : ''} ${done ? 'is-done' : ''}`} style={{ ['--depth' as string]: depth }}>
          <span className="ct-station" aria-hidden="true" />
          {isBox ? (
            <button type="button" className="ct-toggle" onClick={() => toggle(n.id)} aria-expanded={isOpen} aria-label={`${isOpen ? 'Contraer' : 'Expandir'} ${n.name}`}>
              <ChevronRight size={16} className={`ct-chev ${isOpen ? 'is-open' : ''}`} />
            </button>
          ) : (
            <span className="ct-toggle ct-toggle--leaf" aria-hidden="true" />
          )}
          <Icon size={16} className="ct-icon" aria-hidden="true" />
          <span className="ct-name">
            {n.name}
            {isBox && <span className="ct-own"> (+{fmt(n[metric], metric)} embalaje)</span>}
          </span>
          <motion.span
            key={`${metric}-${showTotal}`}
            className="ct-total"
            initial={reduced ? { opacity: 0 } : { opacity: 0, x: 6 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            {showTotal ? fmt(total(n, metric), metric) : '…'}
          </motion.span>
        </div>
        {isBox && isOpen && <ul className="ct-ul">{n.children!.map((c) => renderNode(c, depth + 1))}</ul>}
      </li>
    )
  }

  return (
    <WidgetFrame
      caption="Un envío como árbol: productos (hojas) y cajas (compuestos) que comparten la operación total(). Recorre la recursión paso a paso para ver la pila de llamadas."
      controls={
        <>
          <Segmented
            label="Operación"
            value={metric}
            onChange={(v) => {
              setMetric(v)
              resetRun()
            }}
            options={[
              { value: 'price', label: 'precio()' },
              { value: 'weight', label: 'peso()' },
            ]}
          />
          <div className="ct-buttons">
            <button type="button" className="btn btn--line" onClick={play} disabled={playing}>
              <Play size={16} aria-hidden="true" /> Recorrer
            </button>
            <button type="button" className="btn" onClick={step}>
              <StepForward size={16} aria-hidden="true" /> Paso
            </button>
            <button type="button" className="icon-btn" onClick={resetRun} aria-label="Reiniciar recorrido">
              <RotateCcw size={18} />
            </button>
          </div>
        </>
      }
      readout={
        <div className="ct-readout" aria-live="polite">
          {ev ? (
            <>
              <p className="ct-stack">
                <b>Pila:</b>{' '}
                {ev.stack.map((id, i) => (
                  <span key={id}>
                    {i > 0 && ' › '}
                    <code>{byId.get(id)!.name}.{metric === 'price' ? 'precio' : 'peso'}()</code>
                  </span>
                ))}
              </p>
              <p>
                {ev.kind === 'enter'
                  ? byId.get(ev.id)!.children
                    ? `Entra a «${byId.get(ev.id)!.name}»: delega en sus ${byId.get(ev.id)!.children!.length} hijos sin saber si son cajas o productos.`
                    : `«${byId.get(ev.id)!.name}» es una hoja: devuelve su propio valor.`
                  : `«${byId.get(ev.id)!.name}» retorna ${fmt(ev.value!, metric)}.`}
              </p>
            </>
          ) : (
            <p>
              Total del envío: <b>{fmt(total(TREE, metric), metric)}</b>. El cliente llama <code>{metric === 'price' ? 'precio' : 'peso'}()</code> sobre la raíz y no distingue hojas de cajas.
              Contraer una caja no cambia su total.
            </p>
          )}
        </div>
      }
    >
      <ul className="ct-ul ct-root" aria-label="Árbol del envío">
        {renderNode(TREE, 0)}
      </ul>
    </WidgetFrame>
  )
}
