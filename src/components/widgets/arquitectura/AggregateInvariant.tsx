import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Check, Plus, RotateCcw, X } from 'lucide-react'
import { Log, Segmented, WidgetFrame } from '../kit'
import { useTransition } from './shared'
import './AggregateInvariant.css'

type Mode = 'root' | 'direct'
interface Line {
  sku: string
  name: string
  qty: number
  priceCents: number
}

const PRODUCTS = [
  { sku: 'TSHIRT', name: 'Polera', priceCents: 2_500 },
  { sku: 'SHOES', name: 'Zapatillas', priceCents: 12_000 },
  { sku: 'JACKET', name: 'Chaqueta', priceCents: 18_000 },
]

const MAX_LINES = 3
const MAX_TOTAL = 50_000
const MAX_QTY = 5

const money = (c: number) => `$${(c / 100).toLocaleString('es', { minimumFractionDigits: 0 })}`
const totalOf = (lines: Line[]) => lines.reduce((s, l) => s + l.qty * l.priceCents, 0)

function rules(lines: Line[], confirmedThenChanged: boolean) {
  return [
    { id: 'lines', text: `Máximo ${MAX_LINES} líneas distintas`, ok: lines.length <= MAX_LINES },
    { id: 'qty', text: `Cada línea entre 1 y ${MAX_QTY} unidades`, ok: lines.every((l) => l.qty >= 1 && l.qty <= MAX_QTY) },
    { id: 'total', text: `Total hasta ${money(MAX_TOTAL)} (cliente nuevo)`, ok: totalOf(lines) <= MAX_TOTAL },
    { id: 'frozen', text: 'Sin cambios después de confirmar', ok: !confirmedThenChanged },
  ]
}

export function AggregateInvariant() {
  const [mode, setMode] = useState<Mode>('root')
  const [lines, setLines] = useState<Line[]>([])
  const [status, setStatus] = useState<'DRAFT' | 'CONFIRMED'>('DRAFT')
  const [tampered, setTampered] = useState(false)
  const [lastCall, setLastCall] = useState<string>('const order = Order.draft(customerId)')
  const [log, setLog] = useState<{ id: number; text: string; tone?: 'ok' | 'bad' | 'warn' }[]>([])
  const t = useTransition(0.25)

  const push = (text: string, tone?: 'ok' | 'bad' | 'warn') => setLog((l) => [{ id: Date.now() + Math.random(), text, tone }, ...l].slice(0, 12))

  const reset = (m: Mode = mode) => {
    setMode(m)
    setLines([])
    setStatus('DRAFT')
    setTampered(false)
    setLog([])
    setLastCall('const order = Order.draft(customerId)')
  }

  const add = (p: (typeof PRODUCTS)[number]) => {
    if (mode === 'direct') {
      setLastCall(`order.lines.push({ sku: '${p.sku}', qty: 1, priceCents: ${p.priceCents} })`)
      const existing = lines.find((l) => l.sku === p.sku)
      const next = existing ? lines.map((l) => (l.sku === p.sku ? { ...l, qty: l.qty + 1 } : l)) : [...lines, { ...p, qty: 1 }]
      setLines(next)
      if (status === 'CONFIRMED') setTampered(true)
      const broken = rules(next, tampered || status === 'CONFIRMED').filter((r) => !r.ok)
      push(
        broken.length ? `push() aceptado, pero el pedido quedó inválido: ${broken.map((b) => b.text.toLowerCase()).join('; ')}` : `push() aceptado: ${p.name}`,
        broken.length ? 'bad' : 'warn',
      )
      return
    }
    setLastCall(`order.addLine('${p.sku}', 1, Money.cents(${p.priceCents}))`)
    try {
      if (status === 'CONFIRMED') throw new Error('Un pedido confirmado no se puede modificar')
      const existing = lines.find((l) => l.sku === p.sku)
      if (!existing && lines.length >= MAX_LINES) throw new Error(`Un pedido admite máximo ${MAX_LINES} líneas`)
      if (existing && existing.qty + 1 > MAX_QTY) throw new Error(`Máximo ${MAX_QTY} unidades por línea`)
      const next = existing ? lines.map((l) => (l.sku === p.sku ? { ...l, qty: l.qty + 1 } : l)) : [...lines, { ...p, qty: 1 }]
      if (totalOf(next) > MAX_TOTAL) throw new Error(`El total superaría ${money(MAX_TOTAL)}, el límite para clientes nuevos`)
      setLines(next)
      push(`addLine() ok: ${p.name}. Total ${money(totalOf(next))}`, 'ok')
    } catch (e) {
      push(`DomainError: ${(e as Error).message}. El estado no cambió.`, 'bad')
    }
  }

  const confirm = () => {
    if (mode === 'direct') {
      setLastCall("order.status = 'CONFIRMED'")
      setStatus('CONFIRMED')
      push('status asignado directamente: nadie verificó nada', 'warn')
      return
    }
    setLastCall('order.confirm()')
    if (status === 'CONFIRMED') return push('DomainError: el pedido ya está confirmado', 'bad')
    if (lines.length === 0) return push('DomainError: no se puede confirmar un pedido vacío', 'bad')
    setStatus('CONFIRMED')
    push('confirm() ok: el pedido quedó congelado y emitió OrderConfirmed', 'ok')
  }

  const checks = rules(lines, tampered)
  const valid = checks.every((c) => c.ok)

  return (
    <WidgetFrame
      caption="Agrega productos y confirma el pedido. A través de la raíz del agregado, cada operación verifica las invariantes y rechaza lo inválido. Accediendo directo a la colección interna, todo se acepta y el pedido inválido llega a la base."
      controls={
        <>
          <Segmented<Mode>
            label="Acceso al pedido"
            value={mode}
            onChange={(m) => reset(m)}
            options={[
              { value: 'root', label: 'Por la raíz' },
              { value: 'direct', label: 'Directo a la colección' },
            ]}
          />
          <div className="ag-actions">
            {PRODUCTS.map((p) => (
              <button key={p.sku} type="button" className="btn" onClick={() => add(p)}>
                <Plus size={15} aria-hidden="true" /> {p.name} {money(p.priceCents)}
              </button>
            ))}
            <button type="button" className="btn btn--line" onClick={confirm}>
              Confirmar
            </button>
            <button type="button" className="icon-btn" aria-label="Reiniciar pedido" onClick={() => reset()}>
              <RotateCcw size={18} />
            </button>
          </div>
        </>
      }
      readout={<Log entries={log} empty="Agrega productos para empezar." />}
    >
      <div className="ag-layout">
        <div className={`ag-order ${valid ? '' : 'is-invalid'}`}>
          <div className="ag-order__head">
            <b>Order o-981</b>
            <span className={`ag-status ${status === 'CONFIRMED' ? 'is-confirmed' : ''}`}>{status}</span>
          </div>
          <ul className="ag-lines">
            <AnimatePresence initial={false}>
              {lines.map((l) => (
                <motion.li key={l.sku} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={t}>
                  <span>{l.name}</span>
                  <span className="ag-num">
                    {l.qty} × {money(l.priceCents)}
                  </span>
                </motion.li>
              ))}
            </AnimatePresence>
            {lines.length === 0 && <li className="ag-empty">Sin líneas</li>}
          </ul>
          <div className="ag-total">
            <span>Total</span>
            <b className="ag-num">{money(totalOf(lines))}</b>
          </div>
          <pre className="ag-call">
            <span className="ag-call__c">{'// última llamada'}</span>
            {'\n'}
            {lastCall}
          </pre>
        </div>
        <div className="ag-rules">
          <span className="ag-rules__title">Invariantes del agregado</span>
          <ul>
            {checks.map((c) => (
              <li key={c.id} className={c.ok ? 'is-ok' : 'is-bad'}>
                {c.ok ? <Check size={16} strokeWidth={3} aria-hidden="true" /> : <X size={16} strokeWidth={3} aria-hidden="true" />}
                <span>
                  <span className="visually-hidden">{c.ok ? 'Se cumple: ' : 'Rota: '}</span>
                  {c.text}
                </span>
              </li>
            ))}
          </ul>
          <p className={`ag-verdict ${valid ? 'is-ok' : 'is-bad'}`}>
            {valid ? 'Estado válido: se puede guardar.' : 'Estado inválido: el repositorio guardaría un pedido que el negocio prohíbe.'}
          </p>
        </div>
      </div>
    </WidgetFrame>
  )
}
