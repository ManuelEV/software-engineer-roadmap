import { useRef, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Copy, Link2, RotateCcw } from 'lucide-react'
import { Segmented, WidgetFrame, Log } from '../kit'
import './PrototypeClone.css'

interface Item {
  sku: string
  qty: number
}
interface Order {
  id: string
  customer: { name: string; city: string }
  items: Item[]
}

const fresh = (): Order => ({
  id: 'PED-1001',
  customer: { name: 'Ana Díaz', city: 'Lima' },
  items: [
    { sku: 'LAP-15', qty: 1 },
    { sku: 'MOU-02', qty: 2 },
  ],
})

type Path = 'id' | 'customer' | 'items' | 'item0'

export function PrototypeClone() {
  const reduced = useReducedMotion()
  const [mode, setMode] = useState<'shallow' | 'deep'>('shallow')
  const data = useRef<{ orig: Order; clone: Order | null }>({ orig: fresh(), clone: null })
  const [, force] = useState(0)
  const [flash, setFlash] = useState<{ path: Path; n: number } | null>(null)
  const [log, setLog] = useState<{ id: number; text: string; tone?: 'ok' | 'warn' | 'bad' }[]>([])
  const seq = useRef(0)

  const { orig, clone } = data.current
  const push = (text: string, tone?: 'ok' | 'warn' | 'bad') => {
    seq.current += 1
    setLog((l) => [{ id: seq.current, text, tone }, ...l].slice(0, 8))
  }

  const reset = () => {
    data.current = { orig: fresh(), clone: null }
    setFlash(null)
    setLog([])
    force((n) => n + 1)
  }

  const doClone = () => {
    data.current.orig = fresh()
    data.current.clone = mode === 'shallow' ? { ...data.current.orig } : structuredClone(data.current.orig)
    setFlash(null)
    push(mode === 'shallow' ? 'clone = { ...original }  // copia superficial' : 'clone = structuredClone(original)  // copia profunda')
    force((n) => n + 1)
  }

  const mutate = (path: Path) => {
    const c = data.current.clone
    if (!c) return
    const o = data.current.orig
    let shared = false
    if (path === 'id') {
      c.id = 'PED-1002'
      shared = false
    } else if (path === 'customer') {
      c.customer.name = 'Bruno Paz'
      shared = c.customer === o.customer
    } else if (path === 'items') {
      c.items.push({ sku: 'CAB-USB', qty: 3 })
      shared = c.items === o.items
    } else {
      c.items[0].qty += 1
      shared = c.items[0] === o.items[0]
    }
    const label = { id: 'clone.id = "PED-1002"', customer: 'clone.customer.name = "Bruno Paz"', items: 'clone.items.push(CAB-USB)', item0: 'clone.items[0].qty += 1' }[path]
    push(shared ? `${label}  → ¡el original también cambió!` : `${label}  → original intacto`, shared ? 'bad' : 'ok')
    setFlash({ path, n: seq.current })
    force((n) => n + 1)
  }

  const sharedCustomer = !!clone && clone.customer === orig.customer
  const sharedItems = !!clone && clone.items === orig.items

  const renderCard = (who: "orig" | "clone", o: Order) => {
    const hl = (p: Path, isShared: boolean) => (flash && flash.path === p && (who === 'clone' || isShared) ? 'is-flash' : '')
    return (
      <div className={`pc-card ${who === 'clone' ? 'is-clone' : ''}`}>
        <div className="pc-card__title">{who === 'orig' ? 'original' : 'clon'}</div>
        <div className={`pc-row ${hl('id', false)}`}>
          <span className="pc-k">id</span> <span className="pc-v">{o.id}</span>
        </div>
        <div className={`pc-box ${sharedCustomer ? 'is-shared' : ''} ${hl('customer', sharedCustomer)}`}>
          <span className="pc-k">customer</span>
          {sharedCustomer && (
            <span className="pc-shared">
              <Link2 size={13} aria-hidden="true" /> misma referencia
            </span>
          )}
          <div className="pc-v">
            {o.customer.name} · {o.customer.city}
          </div>
        </div>
        <div className={`pc-box ${sharedItems ? 'is-shared' : ''} ${hl('items', sharedItems)}`}>
          <span className="pc-k">items</span>
          {sharedItems && (
            <span className="pc-shared">
              <Link2 size={13} aria-hidden="true" /> misma referencia
            </span>
          )}
          <ul className="pc-items">
            {o.items.map((it, i) => (
              <motion.li
                key={i}
                className={i === 0 ? hl('item0', sharedItems) : ''}
                initial={reduced ? { opacity: 0 } : { opacity: 0, x: -6 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
              >
                {it.sku} × {it.qty}
              </motion.li>
            ))}
          </ul>
        </div>
      </div>
    )
  }

  return (
    <WidgetFrame
      caption="Clona un pedido y modifica el clon. Con copia superficial, los objetos anidados (cliente, ítems) siguen compartidos entre ambos."
      controls={
        <>
          <Segmented
            label="Tipo de copia"
            value={mode}
            onChange={(v) => {
              setMode(v)
              reset()
            }}
            options={[
              { value: 'shallow', label: 'Superficial' },
              { value: 'deep', label: 'Profunda' },
            ]}
          />
          <button type="button" className="btn btn--line" onClick={doClone}>
            <Copy size={16} aria-hidden="true" /> Clonar
          </button>
          <button type="button" className="icon-btn" onClick={reset} aria-label="Reiniciar">
            <RotateCcw size={18} />
          </button>
        </>
      }
      readout={<Log entries={log} empty="Pulsa «Clonar» y luego modifica el clon." />}
    >
      <div className="pc-actions" role="group" aria-label="Modificar el clon">
        <button type="button" className="btn" disabled={!clone} onClick={() => mutate('id')}>
          Cambiar id
        </button>
        <button type="button" className="btn" disabled={!clone} onClick={() => mutate('customer')}>
          Cambiar cliente
        </button>
        <button type="button" className="btn" disabled={!clone} onClick={() => mutate('items')}>
          Agregar ítem
        </button>
        <button type="button" className="btn" disabled={!clone} onClick={() => mutate('item0')}>
          +1 al primer ítem
        </button>
      </div>
      <div className="pc-cards">
        {renderCard("orig", orig)}
        {clone ? renderCard("clone", clone) : <div className="pc-empty">Todavía no hay clon.</div>}
      </div>
    </WidgetFrame>
  )
}
