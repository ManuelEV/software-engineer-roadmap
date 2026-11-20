import { type CSSProperties, Fragment, useId, useState } from 'react'
import { RotateCcw } from 'lucide-react'
import { Segmented, WidgetFrame } from '../kit'
import './OfferCompare.css'

/**
 * Compare two or three job offers by component. The reader types the numbers;
 * the defaults are explicitly fictitious. Equity can be discounted, and a
 * self-defined "contractor cost" percentage is taken off the cash part.
 * Nothing is saved.
 */

interface Offer {
  name: string
  base: string
  bonus: string
  equity: string
  benefits: string
  cost: string
}

const DEFAULTS: Offer[] = [
  { name: 'A · Local', base: '30000', bonus: '2500', equity: '0', benefits: '3000', cost: '0' },
  { name: 'B · Contractor', base: '54000', bonus: '0', equity: '0', benefits: '0', cost: '22' },
  { name: 'C · Startup', base: '40000', bonus: '0', equity: '16000', benefits: '2000', cost: '0' },
]

type Field = Exclude<keyof Offer, 'name'>
const FIELDS: { key: Field; label: string; hint: string }[] = [
  { key: 'base', label: 'Base anual', hint: 'Sueldo fijo bruto del año.' },
  { key: 'bonus', label: 'Bono anual', hint: 'El esperado: lo que realmente se paga, no el máximo.' },
  { key: 'equity', label: 'Equity anual', hint: 'Estimado: valor total de la concesión dividido por los años de vesting.' },
  { key: 'benefits', label: 'Beneficios', hint: 'Valorizados: lo que te costaría pagar tú el seguro, el equipo, los cursos…' },
  { key: 'cost', label: 'Costo contractor %', hint: 'Porcentaje de base + bono que pagarías tú como contractor: previsión, salud, vacaciones sin goce de sueldo, contador. 0 si eres empleado.' },
]

type Part = 'base' | 'bonus' | 'equity' | 'benefits'
const PARTS: { key: Part; label: string; risk: string }[] = [
  { key: 'base', label: 'Base', risk: 'Lo más seguro. Es la base de casi todos los aumentos y bonos futuros.' },
  { key: 'bonus', label: 'Bono', risk: 'Depende de tu desempeño y de los resultados de la empresa. Pregunta cuánto se pagó de verdad los últimos años.' },
  { key: 'equity', label: 'Equity', risk: 'El más incierto. En una startup privada puede valer cero; en una empresa pública sube y baja con la acción. Revisa vesting, cliff y qué pasa si te vas.' },
  { key: 'benefits', label: 'Beneficios', risk: 'Valen lo que te ahorran, no lo que dice el folleto. Un seguro que no usarías vale menos.' },
]

const num = (s: string) => {
  const n = Number(s.replace(/[^\d.]/g, ''))
  return Number.isFinite(n) ? n : 0
}
/** thousands with a dot, as in the rest of the site (58.000) */
const fmt = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')

export function OfferCompare() {
  const uid = useId()
  const [offers, setOffers] = useState<Offer[]>(DEFAULTS)
  const [count, setCount] = useState<'2' | '3'>('3')
  const [eqFactor, setEqFactor] = useState<'1' | '0.5' | '0'>('1')

  const shown = offers.slice(0, Number(count))
  const f = Number(eqFactor)
  const rows = shown.map((o) => {
    const parts: Record<Part, number> = { base: num(o.base), bonus: num(o.bonus), equity: num(o.equity) * f, benefits: num(o.benefits) }
    const gross = parts.base + parts.bonus + parts.equity + parts.benefits
    const costPct = Math.min(90, num(o.cost))
    const cost = ((parts.base + parts.bonus) * costPct) / 100
    return { name: o.name.trim() || 'Sin nombre', parts, gross, cost, net: gross - cost }
  })
  const max = Math.max(1, ...rows.map((r) => r.gross))
  const ranked = [...rows].sort((a, b) => b.net - a.net)
  const best = ranked[0]
  const second = ranked[1]
  const gap = second && second.net > 0 ? Math.round(((best.net - second.net) / second.net) * 100) : 0
  const eqShare = best.net > 0 ? Math.round((best.parts.equity / best.net) * 100) : 0

  const update = (i: number, key: keyof Offer, v: string) => setOffers((os) => os.map((o, k) => (k === i ? { ...o, [key]: v } : o)))
  const w = (n: number) => `${(Math.max(0, n) / max) * 100}%`

  return (
    <WidgetFrame
      caption="Los valores iniciales son ficticios: reemplázalos por los tuyos, en la misma moneda para todas las ofertas. El equity se puede descontar según cuánto confíes en él. No se guarda nada y no es asesoría financiera."
      controls={
        <>
          <Segmented
            label="Ofertas"
            value={count}
            onChange={setCount}
            options={[
              { value: '2', label: '2' },
              { value: '3', label: '3' },
            ]}
          />
          <Segmented
            label="Cuenta el equity al"
            value={eqFactor}
            onChange={setEqFactor}
            options={[
              { value: '1', label: '100 %' },
              { value: '0.5', label: '50 %' },
              { value: '0', label: '0 %' },
            ]}
          />
          <button
            type="button"
            className="btn btn--ghost oc-reset"
            onClick={() => {
              setOffers(DEFAULTS)
              setEqFactor('1')
            }}
          >
            <RotateCcw size={15} /> Valores de ejemplo
          </button>
        </>
      }
      readout={
        <p className="oc-sum" aria-live="polite">
          Con estos supuestos, <b>{best.name}</b> queda primera en total ajustado ({fmt(best.net)} al año)
          {second ? (
            <>
              , {gap > 0 ? `un ${gap} % más que` : 'prácticamente empatada con'} <b>{second.name}</b>.
            </>
          ) : (
            '.'
          )}{' '}
          {eqShare >= 20 ? (
            <>
              Ojo: el {eqShare} % de ese total es equity. Prueba a contarlo al 50 % o al 0 % y mira si cambia el orden.
            </>
          ) : (
            <>El equity pesa poco en ese total, así que la comparación depende sobre todo del dinero fijo.</>
          )}{' '}
          Lo que no entra en un número (el equipo, lo que vas a aprender, la estabilidad) también cuenta.
        </p>
      }
    >
      <div className="oc">
        <div className="oc-grid" style={{ '--oc-n': shown.length } as CSSProperties} role="group" aria-label="Valores de cada oferta">
          <span className="oc-grid__corner">Oferta</span>
          {shown.map((o, i) => (
            <input
              key={`n${i}`}
              type="text"
              className="oc-input oc-input--name"
              aria-label={`Nombre de la oferta ${i + 1}`}
              value={o.name}
              maxLength={32}
              onChange={(e) => update(i, 'name', e.target.value)}
            />
          ))}
          {FIELDS.map((fd) => (
            <Fragment key={fd.key}>
              <span className="oc-grid__label" id={`${uid}-${fd.key}`}>
                {fd.label}
              </span>
              {shown.map((o, i) => (
                <input
                  key={i}
                  type="text"
                  inputMode="decimal"
                  className="oc-input"
                  aria-label={`${fd.label}, ${o.name || `oferta ${i + 1}`}`}
                  value={o[fd.key]}
                  onChange={(e) => update(i, fd.key, e.target.value)}
                />
              ))}
            </Fragment>
          ))}
        </div>

        <ul className="oc-hints">
          {FIELDS.map((fd) => (
            <li key={fd.key}>
              <b>{fd.label}:</b> {fd.hint}
            </li>
          ))}
        </ul>

        <div className="oc-chart" role="list" aria-label="Comparación de ofertas por componente">
          {rows.map((r, i) => (
            <div key={i} className={`oc-row ${r === best ? 'is-best' : ''}`} role="listitem">
              <div className="oc-row__head">
                <span className="oc-row__name">{r.name}</span>
                <span className="oc-row__total">
                  ajustado <b>{fmt(r.net)}</b>
                </span>
              </div>
              <div
                className="oc-bar"
                role="img"
                aria-label={`${r.name}: ${PARTS.map((p) => `${p.label} ${fmt(r.parts[p.key])}`).join(', ')}; total bruto ${fmt(r.gross)}; costos propios ${fmt(r.cost)}; ajustado ${fmt(r.net)}.`}
              >
                {PARTS.map((p) => (
                  <span key={p.key} className={`oc-seg oc-seg--${p.key}`} style={{ width: w(r.parts[p.key]) } as CSSProperties} />
                ))}
              </div>
              <div className="oc-net" aria-hidden>
                <span className="oc-net__fill" style={{ width: w(r.net) }} />
                <span className="oc-net__cost" style={{ left: w(r.net), width: w(r.cost) }} />
              </div>
              <div className="oc-row__foot" aria-hidden>
                <span>bruto {fmt(r.gross)}</span>
                {r.cost > 0 && <span className="oc-row__cost">− costos propios {fmt(r.cost)}</span>}
              </div>
            </div>
          ))}
        </div>

        <ul className="oc-legend">
          {PARTS.map((p) => (
            <li key={p.key}>
              <i className={`oc-sw oc-seg--${p.key}`} aria-hidden />
              <span>
                <b>{p.label}.</b> {p.risk}
              </span>
            </li>
          ))}
          <li>
            <i className="oc-sw oc-sw--cost" aria-hidden />
            <span>
              <b>Costos propios.</b> Lo que como contractor pagas tú y un empleador pagaría por ti. El porcentaje lo defines tú: depende de tu país y de tu situación.
            </span>
          </li>
        </ul>
      </div>
    </WidgetFrame>
  )
}
