import { useState } from 'react'
import { Plus, Minus } from 'lucide-react'
import { Segmented, Stat, WidgetFrame } from '../kit'
import './VisitorGrid.css'

type Mode = 'visitor' | 'oo'
type TypeId = 'Product' | 'Service' | 'GiftCard' | 'Subscription'
type OpId = 'Tax' | 'Json' | 'Shipping'

const typeLabel: Record<TypeId, string> = {
  Product: 'Producto',
  Service: 'Servicio',
  GiftCard: 'Tarjeta regalo',
  Subscription: 'Suscripción',
}
const opInfo: Record<OpId, { label: string; visitor: string; method: string }> = {
  Tax: { label: 'Impuesto', visitor: 'TaxVisitor', method: 'tax' },
  Json: { label: 'Exportar JSON', visitor: 'JsonVisitor', method: 'toJson' },
  Shipping: { label: 'Costo de envío', visitor: 'ShippingVisitor', method: 'shipping' },
}
const results: Record<TypeId, Record<OpId, string>> = {
  Product: { Tax: '19.00 (19 % de 100)', Json: '{"type":"product","sku":"BK-28"}', Shipping: '5.99 (por peso)' },
  Service: { Tax: '0.00 (exento)', Json: '{"type":"service","hours":2}', Shipping: '0.00 (no se envía)' },
  GiftCard: { Tax: '0.00 (tributa al canjear)', Json: '{"type":"gift_card","amount":30}', Shipping: '0.00 (digital)' },
  Subscription: { Tax: '2.28 (19 % de 12)', Json: '{"type":"subscription","plan":"monthly"}', Shipping: '0.00' },
}

export function VisitorGrid() {
  const [mode, setMode] = useState<Mode>('visitor')
  const [withSub, setWithSub] = useState(false)
  const [withShip, setWithShip] = useState(false)
  const [last, setLast] = useState<'op' | 'type' | null>(null)
  const [cell, setCell] = useState<[TypeId, OpId] | null>(['Product', 'Tax'])

  const types: TypeId[] = ['Product', 'Service', 'GiftCard', ...(withSub ? (['Subscription'] as TypeId[]) : [])]
  const ops: OpId[] = ['Tax', 'Json', ...(withShip ? (['Shipping'] as OpId[]) : [])]

  // What did the last change cost?
  let created = 0
  let modified = 0
  let touchedRows = new Set<TypeId>()
  let touchedCols = new Set<OpId>()
  if (last === 'op' && withShip) {
    if (mode === 'visitor') {
      created = 1
      touchedCols = new Set(['Shipping'])
    } else {
      modified = types.length + 1 // each element class + the Item interface
      touchedRows = new Set(types)
      touchedCols = new Set(['Shipping'])
    }
  }
  if (last === 'type' && withSub) {
    if (mode === 'visitor') {
      created = 1
      modified = ops.length + 1 // each concrete visitor + the Visitor interface
      touchedRows = new Set(['Subscription'])
      touchedCols = new Set(ops)
    } else {
      created = 1
      touchedRows = new Set(['Subscription'])
    }
  }

  const methodName = (t: TypeId, o: OpId) => (mode === 'visitor' ? `visit${t}()` : `${opInfo[o].method}()`)
  const owner = (t: TypeId, o: OpId) => (mode === 'visitor' ? opInfo[o].visitor : t)

  let msg = 'Agrega una operación o un tipo y mira cuántas clases tienes que tocar.'
  if (last === 'op' && withShip)
    msg =
      mode === 'visitor'
        ? 'Con Visitor, una operación nueva es una clase nueva (ShippingVisitor). Las clases de elementos no se tocan.'
        : 'Sin Visitor, una operación nueva obliga a abrir todas las clases de elementos para agregar shipping().'
  if (last === 'type' && withSub)
    msg =
      mode === 'visitor'
        ? 'Con Visitor, un tipo nuevo obliga a agregar visitSubscription() a la interfaz Visitor y a todos los visitantes concretos.'
        : 'Sin Visitor, un tipo nuevo es una clase nueva que implementa sus propios métodos. Nada más cambia.'

  return (
    <WidgetFrame
      caption="Filas = tipos de elementos; columnas = operaciones. Visitor organiza el código por columnas; la orientación a objetos clásica, por filas. Ese es el expression problem."
      controls={
        <>
          <Segmented<Mode>
            label="Organización"
            value={mode}
            onChange={(m) => {
              setMode(m)
              setLast(null)
            }}
            options={[
              { value: 'visitor', label: 'Con Visitor' },
              { value: 'oo', label: 'Métodos en cada clase' },
            ]}
          />
          <button
            type="button"
            className="btn"
            aria-pressed={withShip}
            onClick={() => {
              setWithShip((v) => !v)
              setLast(withShip ? null : 'op')
            }}
          >
            {withShip ? <Minus size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />} Operación: envío
          </button>
          <button
            type="button"
            className="btn"
            aria-pressed={withSub}
            onClick={() => {
              setWithSub((v) => !v)
              setLast(withSub ? null : 'type')
            }}
          >
            {withSub ? <Minus size={16} aria-hidden="true" /> : <Plus size={16} aria-hidden="true" />} Tipo: suscripción
          </button>
        </>
      }
      readout={
        <div className="vg-readout">
          <div className="vg-stats">
            <Stat label="Clases nuevas" value={created} />
            <Stat label="Clases modificadas" value={modified} tone={modified > 2 ? 'warn' : undefined} />
          </div>
          <p aria-live="polite">{msg}</p>
          {cell && types.includes(cell[0]) && ops.includes(cell[1]) && (
            <p className="vg-trace">
              {mode === 'visitor' ? (
                <>
                  <code>item.accept({opInfo[cell[1]].visitor.charAt(0).toLowerCase() + opInfo[cell[1]].visitor.slice(1)})</code> →{' '}
                  <code>
                    {opInfo[cell[1]].visitor}.visit{cell[0]}(this)
                  </code>{' '}
                  → {results[cell[0]][cell[1]]}
                </>
              ) : (
                <>
                  <code>
                    {cell[0].charAt(0).toLowerCase() + cell[0].slice(1)}.{opInfo[cell[1]].method}()
                  </code>{' '}
                  → {results[cell[0]][cell[1]]}
                </>
              )}
            </p>
          )}
        </div>
      }
    >
      <div className="vg-scroll">
        <table className="vg-table">
          <thead>
            <tr>
              <th scope="col" className="vg-corner">
                <span>tipo \ operación</span>
              </th>
              {ops.map((o) => (
                <th key={o} scope="col" className={touchedCols.has(o) ? 'is-touched' : ''}>
                  <span className="vg-h">{opInfo[o].label}</span>
                  {mode === 'visitor' && <code className="vg-sub">{opInfo[o].visitor}</code>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {types.map((t) => (
              <tr key={t}>
                <th scope="row" className={touchedRows.has(t) ? 'is-touched' : ''}>
                  <span className="vg-h">{typeLabel[t]}</span>
                  <code className="vg-sub">{t}</code>
                </th>
                {ops.map((o) => {
                  const touched = touchedRows.has(t) && touchedCols.has(o)
                  const sel = cell?.[0] === t && cell?.[1] === o
                  return (
                    <td key={o}>
                      <button
                        type="button"
                        className={`vg-cell ${touched ? 'is-touched' : ''} ${sel ? 'is-sel' : ''}`}
                        onClick={() => setCell([t, o])}
                        aria-pressed={sel}
                        aria-label={`${typeLabel[t]} × ${opInfo[o].label}: ${owner(t, o)}.${methodName(t, o)}`}
                      >
                        <span className="vg-cell__owner">{owner(t, o)}</span>
                        <code className="vg-cell__m">{methodName(t, o)}</code>
                      </button>
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </WidgetFrame>
  )
}
