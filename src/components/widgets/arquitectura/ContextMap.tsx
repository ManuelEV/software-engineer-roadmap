import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { WidgetFrame } from '../kit'
import { useMediaQuery } from '../../../lib/hooks'
import { useTransition } from './shared'
import './ContextMap.css'

type Ctx = 'catalog' | 'identity' | 'pricing' | 'orders' | 'billing' | 'shipping' | 'carrier' | 'reviews'
type Kind = 'core' | 'supporting' | 'generic' | 'external' | 'legacy'

const KIND_LABEL: Record<Kind, string> = {
  core: 'core',
  supporting: 'de soporte',
  generic: 'genérico',
  external: 'externo',
  legacy: 'legado',
}

const CTX: Record<Ctx, { label: string; kind: Kind; wide: [number, number]; narrow: [number, number] }> = {
  identity: { label: 'Identidad', kind: 'generic', wide: [340, 46], narrow: [180, 40] },
  catalog: { label: 'Catálogo', kind: 'supporting', wide: [100, 90], narrow: [70, 140] },
  pricing: { label: 'Precios', kind: 'core', wide: [580, 90], narrow: [290, 140] },
  orders: { label: 'Pedidos', kind: 'core', wide: [340, 190], narrow: [180, 252] },
  billing: { label: 'Facturación', kind: 'legacy', wide: [100, 300], narrow: [70, 372] },
  shipping: { label: 'Envíos', kind: 'supporting', wide: [460, 320], narrow: [290, 400] },
  carrier: { label: 'Transportista', kind: 'external', wide: [600, 220], narrow: [290, 540] },
  reviews: { label: 'Reseñas', kind: 'supporting', wide: [240, 336], narrow: [70, 512] },
}

type Team = 'Mutuamente dependientes' | 'Upstream / downstream' | 'Libres'

interface Rel {
  id: string
  abbr: string
  name: string
  a: Ctx
  b: Ctx
  /** upstream context, if the relation is directional */
  up?: Ctx
  team: Team
  what: string
  here: string
  when: string
  risk: string
}

const RELS: Rel[] = [
  {
    id: 'sk', abbr: 'SK', name: 'Shared Kernel', a: 'orders', b: 'pricing', team: 'Mutuamente dependientes',
    what: 'Dos contextos comparten explícitamente un subconjunto pequeño del modelo (y su código). Cualquier cambio en esa parte se acuerda entre ambos equipos.',
    here: 'Pedidos y Precios comparten una librería mínima con Money, Currency y Sku. Nada más.',
    when: 'Cuando dos equipos muy cercanos duplicarían un concepto delicado y caro de mantener en sincronía.',
    risk: 'Crece sin control y se vuelve un modelo compartido gigante. Mantenlo diminuto, con dueños de ambos lados y tests propios.',
  },
  {
    id: 'cs', abbr: 'C/S', name: 'Customer / Supplier', a: 'catalog', b: 'orders', up: 'catalog', team: 'Upstream / downstream',
    what: 'El equipo upstream (proveedor) planifica teniendo en cuenta las necesidades del downstream (cliente). Las necesidades se negocian y entran al backlog del proveedor.',
    here: 'Catálogo es upstream de Pedidos. Si Pedidos necesita el peso del producto para calcular envío, lo pide y Catálogo lo prioriza.',
    when: 'Cuando el upstream tiene incentivos para escuchar al downstream (misma organización, metas compartidas).',
    risk: 'Si el proveedor no tiene capacidad o incentivos, la relación degenera en conformista sin que nadie lo decida.',
  },
  {
    id: 'p', abbr: 'P', name: 'Partnership', a: 'orders', b: 'shipping', team: 'Mutuamente dependientes',
    what: 'Dos equipos que tienen éxito o fracasan juntos coordinan planificación, integración y releases como socios.',
    here: 'Lanzar "entrega en el día" requiere cambios simultáneos en Pedidos y Envíos. Los dos equipos planifican juntos ese trimestre.',
    when: 'Para un objetivo compartido y temporal, con equipos que se comunican bien.',
    risk: 'Es cara: exige sincronización constante. Si se vuelve permanente, quizá los dos contextos deberían ser uno, o necesitan un contrato más estable.',
  },
  {
    id: 'ohs', abbr: 'OHS / PL', name: 'Open Host Service + Published Language', a: 'identity', b: 'orders', up: 'identity', team: 'Upstream / downstream',
    what: 'El upstream expone un protocolo abierto y bien documentado para todos sus consumidores (OHS), con un lenguaje publicado y versionado (PL), en lugar de integraciones a medida.',
    here: 'Identidad expone OpenID Connect y tokens JWT con claims documentados. Pedidos, y cualquier otro contexto, los consume sin pedir nada especial.',
    when: 'Cuando un contexto tiene muchos consumidores y no puede negociar con cada uno.',
    risk: 'Un protocolo publicado es caro de cambiar: necesitas versionado y compatibilidad hacia atrás.',
  },
  {
    id: 'cf', abbr: 'CF', name: 'Conformist', a: 'carrier', b: 'shipping', up: 'carrier', team: 'Upstream / downstream',
    what: 'El downstream adopta el modelo del upstream tal cual, sin traducir. Renuncia a su propio modelo en esa zona a cambio de simplicidad.',
    here: 'Envíos usa directamente los estados de tracking del transportista. No podemos influir en su API y su modelo es razonable.',
    when: 'Cuando no puedes influir en el upstream y su modelo es suficientemente bueno para ti.',
    risk: 'Si el modelo del upstream es malo o cambia seguido, su desorden se filtra a tu dominio. Ahí conviene un ACL.',
  },
  {
    id: 'acl', abbr: 'ACL', name: 'Anticorruption Layer', a: 'billing', b: 'orders', up: 'billing', team: 'Upstream / downstream',
    what: 'El downstream construye una capa de traducción que convierte el modelo del upstream al suyo, para que conceptos ajenos no contaminen su dominio.',
    here: 'El ERP legado de Facturación habla de "documentos" con 200 campos y códigos numéricos. Pedidos tiene un ACL que traduce a Invoice con 8 campos claros.',
    when: 'Al integrar sistemas legados o externos con un modelo malo o muy distinto, especialmente si proteges un subdominio core.',
    risk: 'Es código extra que mantener y testear. No lo pongas frente a un upstream cuyo modelo ya te sirve.',
  },
  {
    id: 'sw', abbr: 'SW', name: 'Separate Ways', a: 'reviews', b: 'shipping', team: 'Libres',
    what: 'Los contextos no se integran. Cada uno resuelve su necesidad por su cuenta, aunque eso implique algo de duplicación.',
    here: 'Reseñas podría escuchar "pedido entregado" de Envíos, pero decidió pedir la reseña a los 10 días de la compra. Sin integración que mantener.',
    when: 'Cuando el costo de integrar supera el beneficio.',
    risk: 'Duplicación de datos o de lógica que más tarde alguien querrá unificar. Documenta que fue una decisión.',
  },
]

const BOX_W = 128
const BOX_H = 48

export function ContextMap() {
  const narrow = useMediaQuery('(max-width: 559px)')
  const [sel, setSel] = useState<string>('acl')
  const t = useTransition(0.25)
  const rel = RELS.find((r) => r.id === sel)!
  const P = (c: Ctx) => (narrow ? CTX[c].narrow : CTX[c].wide)
  const vb = narrow ? '0 0 360 580' : '0 0 680 380'

  return (
    <WidgetFrame
      caption="Mapa de contextos de una tienda online. Toca una relación (en el mapa o en la lista) para ver qué patrón es, cómo se aplica aquí, cuándo conviene y qué riesgo trae. U = upstream, D = downstream."
      controls={
        <div className="cm-chips" role="radiogroup" aria-label="Relación">
          {RELS.map((r) => (
            <button
              key={r.id}
              type="button"
              role="radio"
              aria-checked={r.id === sel}
              className={`cm-chip ${r.id === sel ? 'is-on' : ''}`}
              onClick={() => setSel(r.id)}
            >
              {r.name}
            </button>
          ))}
        </div>
      }
      readout={
        <AnimatePresence mode="wait" initial={false}>
          <motion.div key={rel.id} className="cm-detail" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={t}>
            <p className="cm-detail__head">
              <span className="line-badge">{rel.abbr}</span> <b>{rel.name}</b> <span className="cm-team">Equipos: {rel.team.toLowerCase()}</span>
            </p>
            <dl className="cm-dl">
              <dt>Qué es</dt>
              <dd>{rel.what}</dd>
              <dt>En este mapa</dt>
              <dd>{rel.here}</dd>
              <dt>Cuándo</dt>
              <dd>{rel.when}</dd>
              <dt>Riesgo</dt>
              <dd>{rel.risk}</dd>
            </dl>
          </motion.div>
        </AnimatePresence>
      }
    >
      <svg className="cm-svg" viewBox={vb} role="img" aria-label="Mapa de contextos con sus relaciones">
        {RELS.map((r) => {
          const [ax, ay] = P(r.a)
          const [bx, by] = P(r.b)
          const on = r.id === sel
          const mx = (ax + bx) / 2
          const my = (ay + by) / 2
          const up = r.up
          const down = up ? (up === r.a ? r.b : r.a) : undefined
          const lerp = (from: Ctx, k: number) => {
            const [fx, fy] = P(from)
            const [tx, ty] = from === r.a ? [bx, by] : [ax, ay]
            return [fx + (tx - fx) * k, fy + (ty - fy) * k]
          }
          const k = narrow ? 0.3 : 0.27
          const uPos = up ? lerp(up, k) : null
          const dPos = down ? lerp(down, k) : null
          const pillW = r.abbr.length * 8 + 18
          return (
            <g key={r.id} className={`cm-rel ${on ? 'is-on' : ''} ${r.id === 'sw' ? 'is-sw' : ''}`}>
              <line x1={ax} y1={ay} x2={bx} y2={by} className="cm-line" />
              {uPos && (
                <text x={uPos[0] + 10} y={uPos[1] - 6} className="cm-ud">
                  U
                </text>
              )}
              {dPos && (
                <text x={dPos[0] + 10} y={dPos[1] - 6} className="cm-ud">
                  D
                </text>
              )}
              <g
                className="cm-pill"
                role="button"
                tabIndex={0}
                aria-label={r.name}
                aria-pressed={on}
                onClick={() => setSel(r.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setSel(r.id)
                  }
                }}
              >
                <rect x={mx - pillW / 2 - 6} y={my - 20} width={pillW + 12} height={40} rx={20} className="cm-pill__hit" />
                <rect x={mx - pillW / 2} y={my - 13} width={pillW} height={26} rx={13} className="cm-pill__bg" />
                <text x={mx} y={my + 5} textAnchor="middle" className="cm-pill__text">
                  {r.abbr}
                </text>
              </g>
            </g>
          )
        })}
        {(Object.keys(CTX) as Ctx[]).map((c) => {
          const [x, y] = P(c)
          const involved = rel.a === c || rel.b === c
          return (
            <g key={c} className={`cm-ctx cm-ctx--${CTX[c].kind} ${involved ? 'is-on' : ''}`}>
              <rect x={x - BOX_W / 2} y={y - BOX_H / 2} width={BOX_W} height={BOX_H} rx={10} />
              <text x={x} y={y - 2} textAnchor="middle" className="cm-ctx__label">
                {CTX[c].label}
              </text>
              <text x={x} y={y + 15} textAnchor="middle" className="cm-ctx__kind">
                {KIND_LABEL[CTX[c].kind]}
              </text>
            </g>
          )
        })}
      </svg>
    </WidgetFrame>
  )
}
