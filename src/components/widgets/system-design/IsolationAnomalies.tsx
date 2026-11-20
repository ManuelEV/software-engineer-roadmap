import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Check, ChevronLeft, ChevronRight, RotateCcw, X } from 'lucide-react'
import { Segmented, WidgetFrame } from '../kit'
import { EASE } from './shared'
import './IsolationAnomalies.css'

type Level = 'ru' | 'rc' | 'rr' | 'ser'
type ScenarioId = 'dirty' | 'nonrep' | 'phantom' | 'lost' | 'skew'

const LEVELS: { value: Level; label: string; short: string }[] = [
  { value: 'ru', label: 'Read uncommitted', short: 'RU' },
  { value: 'rc', label: 'Read committed', short: 'RC' },
  { value: 'rr', label: 'Repeatable read', short: 'RR' },
  { value: 'ser', label: 'Serializable', short: 'SER' },
]

type ByLevel = Partial<Record<Level, string>> & { all?: string }
interface Step {
  tx: 1 | 2
  sql: string
  out?: string | ByLevel
}
interface Scenario {
  label: string
  setup: string
  steps: Step[]
  occurs: Record<Level, boolean>
  verdict: Record<Level, string>
  note: string
}

const SCENARIOS: Record<ScenarioId, Scenario> = {
  dirty: {
    label: 'Lectura sucia',
    setup: 'cuentas: ana.saldo = 100',
    steps: [
      { tx: 2, sql: "BEGIN; UPDATE cuentas SET saldo = 0 WHERE id = 'ana';", out: '1 fila modificada, sin COMMIT' },
      { tx: 1, sql: "BEGIN; SELECT saldo FROM cuentas WHERE id = 'ana';", out: { ru: '→ 0  (lee un dato no confirmado)', all: '→ 100' } },
      { tx: 2, sql: 'ROLLBACK;', out: 'se deshace: el saldo nunca fue 0' },
      { tx: 1, sql: 'COMMIT;', out: { ru: 'T1 rechazó un pago por “saldo 0”, un valor que nunca existió', all: 'T1 decidió con el último valor confirmado' } },
    ],
    occurs: { ru: true, rc: false, rr: false, ser: false },
    verdict: {
      ru: 'Ocurre: T1 vio una escritura que luego se deshizo.',
      rc: 'Prevenida: solo se leen datos confirmados.',
      rr: 'Prevenida: lee de una foto (snapshot) confirmada.',
      ser: 'Prevenida.',
    },
    note: 'En PostgreSQL, READ UNCOMMITTED se comporta como READ COMMITTED: con MVCC nunca hay lecturas sucias.',
  },
  nonrep: {
    label: 'No repetible',
    setup: 'productos: #42.precio = 10',
    steps: [
      { tx: 1, sql: 'BEGIN; SELECT precio FROM productos WHERE id = 42;', out: '→ 10' },
      { tx: 2, sql: 'UPDATE productos SET precio = 12 WHERE id = 42; COMMIT;', out: 'confirmado' },
      { tx: 1, sql: 'SELECT precio FROM productos WHERE id = 42;', out: { ru: '→ 12  (cambió dentro de la misma transacción)', rc: '→ 12  (cambió dentro de la misma transacción)', all: '→ 10  (misma snapshot)' } },
      { tx: 1, sql: 'COMMIT;', out: { ru: 'la factura usa 10 en el detalle y 12 en el total', rc: 'la factura usa 10 en el detalle y 12 en el total', all: 'lecturas coherentes entre sí' } },
    ],
    occurs: { ru: true, rc: true, rr: false, ser: false },
    verdict: {
      ru: 'Ocurre.',
      rc: 'Ocurre: cada sentencia ve los últimos datos confirmados, así que dos lecturas pueden diferir.',
      rr: 'Prevenida: toda la transacción lee la snapshot tomada al inicio.',
      ser: 'Prevenida.',
    },
    note: 'Esta variante, leer dos filas relacionadas en momentos distintos y verlas inconsistentes (read skew), arruina backups y reportes largos. Por eso pg_dump usa una snapshot.',
  },
  phantom: {
    label: 'Fantasma',
    setup: 'reservas: ninguna para sala 1 a las 10:00',
    steps: [
      { tx: 1, sql: "BEGIN; SELECT count(*) FROM reservas WHERE sala = 1 AND hora = '10:00';", out: '→ 0' },
      { tx: 2, sql: "INSERT INTO reservas (sala, hora) VALUES (1, '10:00'); COMMIT;", out: 'confirmado' },
      { tx: 1, sql: "SELECT count(*) FROM reservas WHERE sala = 1 AND hora = '10:00';", out: { ru: '→ 1  (apareció una fila “fantasma”)', rc: '→ 1  (apareció una fila “fantasma”)', all: '→ 0  (misma snapshot)' } },
      { tx: 1, sql: 'COMMIT;', out: { ru: 'el mismo filtro devolvió conjuntos distintos', rc: 'el mismo filtro devolvió conjuntos distintos', all: 'el filtro devolvió siempre lo mismo' } },
    ],
    occurs: { ru: true, rc: true, rr: false, ser: false },
    verdict: {
      ru: 'Ocurre.',
      rc: 'Ocurre: una inserción confirmada entra en el resultado de una consulta repetida.',
      rr: 'Prevenida en PostgreSQL (snapshot). El estándar SQL sí permite fantasmas en este nivel.',
      ser: 'Prevenida.',
    },
    note: 'Ojo: que T1 no vea el fantasma no impide que T1 inserte su propia reserva y queden dos. Eso es write skew (siguiente pestaña) y solo SERIALIZABLE o un lock explícito lo evitan.',
  },
  lost: {
    label: 'Update perdido',
    setup: 'inventario: sku 7, stock = 10',
    steps: [
      { tx: 1, sql: 'BEGIN; SELECT stock FROM inventario WHERE sku = 7;', out: '→ 10' },
      { tx: 2, sql: 'BEGIN; SELECT stock FROM inventario WHERE sku = 7;', out: '→ 10' },
      { tx: 1, sql: 'UPDATE inventario SET stock = 9 WHERE sku = 7; COMMIT;', out: 'la app calculó 10 − 1; confirmado' },
      {
        tx: 2,
        sql: 'UPDATE inventario SET stock = 8 WHERE sku = 7;',
        out: { ru: 'OK  (la app calculó 10 − 2)', rc: 'OK  (la app calculó 10 − 2)', all: 'ERROR 40001: could not serialize access due to concurrent update' },
      },
      { tx: 2, sql: 'COMMIT;', out: { ru: 'stock = 8, pero debería ser 7: se perdió la venta de T1', rc: 'stock = 8, pero debería ser 7: se perdió la venta de T1', all: 'T2 abortó; la app reintenta, lee 9 y escribe 7' } },
    ],
    occurs: { ru: true, rc: true, rr: false, ser: false },
    verdict: {
      ru: 'Ocurre.',
      rc: 'Ocurre: ciclo leer-modificar-escribir sin protección.',
      rr: 'Prevenida en PostgreSQL: gana el primero que actualiza y el segundo aborta. En MySQL/InnoDB, REPEATABLE READ no la previene.',
      ser: 'Prevenida: el segundo aborta y debe reintentar.',
    },
    note: 'En cualquier motor y nivel: usa un UPDATE atómico (SET stock = stock − 2), SELECT … FOR UPDATE, o control optimista con columna de versión (WHERE version = 3).',
  },
  skew: {
    label: 'Write skew',
    setup: 'guardias: Ana y Beto de turno hoy. Regla: al menos 1',
    steps: [
      { tx: 1, sql: 'BEGIN; SELECT count(*) FROM guardias WHERE hoy AND activo;', out: '→ 2  (Ana puede irse)' },
      { tx: 2, sql: 'BEGIN; SELECT count(*) FROM guardias WHERE hoy AND activo;', out: '→ 2  (Beto puede irse)' },
      { tx: 1, sql: "UPDATE guardias SET activo = false WHERE medico = 'ana';", out: 'OK' },
      { tx: 2, sql: "UPDATE guardias SET activo = false WHERE medico = 'beto';", out: 'OK  (otra fila: no hay conflicto de escritura)' },
      { tx: 1, sql: 'COMMIT;', out: 'confirmado' },
      { tx: 2, sql: 'COMMIT;', out: { ser: 'ERROR 40001: could not serialize access due to read/write dependencies', all: 'confirmado → 0 médicos de guardia: se rompió la regla' } },
    ],
    occurs: { ru: true, rc: true, rr: true, ser: false },
    verdict: {
      ru: 'Ocurre.',
      rc: 'Ocurre.',
      rr: 'Ocurre: snapshot isolation no detecta conflictos entre lo que leíste y lo que otro escribió en filas distintas.',
      ser: 'Prevenida: SSI detecta el ciclo de dependencias y aborta a una de las dos.',
    },
    note: 'Sin SERIALIZABLE: bloquea las filas leídas con SELECT … FOR UPDATE, “materializa” el conflicto en una fila que ambos deban actualizar, o usa una restricción (exclusion constraint) en la base.',
  },
}

const resolve = (out: Step['out'], level: Level) => (typeof out === 'string' || out === undefined ? out : (out[level] ?? out.all))

export function IsolationAnomalies() {
  const reduce = useReducedMotion()
  const [sid, setSid] = useState<ScenarioId>('lost')
  const [level, setLevel] = useState<Level>('rc')
  const [cur, setCur] = useState(0) // number of executed steps
  const sc = SCENARIOS[sid]
  const done = cur >= sc.steps.length
  const isBad = (o?: string) => !!o && (o.includes('ERROR') ? 'warn' : /perdi|rompi|no confirmado|nunca existió|10 en el detalle|distintos|fantasma|cambió/.test(o) ? 'bad' : '')

  return (
    <WidgetFrame
      caption="Dos transacciones concurrentes, paso a paso. Elige la anomalía y el nivel de aislamiento; puedes cambiar el nivel en cualquier momento y ver cómo cambian los resultados. Semántica estilo PostgreSQL (MVCC)."
      controls={
        <>
          <Segmented<ScenarioId>
            label="Anomalía"
            value={sid}
            onChange={(v) => {
              setSid(v)
              setCur(0)
            }}
            options={(Object.keys(SCENARIOS) as ScenarioId[]).map((k) => ({ value: k, label: SCENARIOS[k].label }))}
          />
          <Segmented<Level> label="Nivel de aislamiento" value={level} onChange={setLevel} options={LEVELS.map((l) => ({ value: l.value, label: l.label }))} />
        </>
      }
      readout={
        <>
          <div className="iso-matrix" aria-label="En qué niveles ocurre esta anomalía">
            {LEVELS.map((l) => (
              <span key={l.value} className={`iso-chip ${sc.occurs[l.value] ? 'is-bad' : 'is-ok'} ${l.value === level ? 'is-current' : ''}`}>
                {sc.occurs[l.value] ? <X size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />}
                {l.short}
                <span className="visually-hidden">{sc.occurs[l.value] ? ': ocurre' : ': prevenida'}</span>
              </span>
            ))}
          </div>
          {done ? (
            <p>
              <b className={sc.occurs[level] ? 'iso-verdict is-bad' : 'iso-verdict is-ok'}>{sc.verdict[level]}</b> {sc.note}
            </p>
          ) : (
            <p>Estado inicial: <code>{sc.setup}</code>. Avanza paso a paso.</p>
          )}
        </>
      }
    >
      <div className="iso-head" aria-hidden="true">
        <span className="iso-tx iso-tx--1">T1</span>
        <span />
        <span className="iso-tx iso-tx--2">T2</span>
      </div>
      <ol className="iso-steps">
        {sc.steps.map((s, i) => {
          const shown = i < cur
          const out = resolve(s.out, level)
          const tone = shown ? isBad(out) : ''
          return (
            <li key={`${sid}-${i}`} className={`iso-step iso-step--t${s.tx} ${shown ? 'is-shown' : ''} ${i === cur - 1 ? 'is-last' : ''}`}>
              <span className="iso-dot" aria-hidden="true">
                {i + 1}
              </span>
              <div className="iso-card">
                <span className={`iso-badge iso-badge--${s.tx}`}>T{s.tx}</span>
                <code className="iso-sql">{s.sql}</code>
                <AnimatePresence initial={false}>
                  {shown && out && (
                    <motion.div
                      key={`${level}-${out}`}
                      className={`iso-out ${tone ? `is-${tone}` : ''}`}
                      initial={{ opacity: 0, y: reduce ? 0 : -4 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.25, ease: EASE }}
                    >
                      {out}
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            </li>
          )
        })}
      </ol>
      <div className="iso-nav">
        <button type="button" className="btn" onClick={() => setCur((c) => Math.max(0, c - 1))} disabled={cur === 0} aria-label="Paso anterior">
          <ChevronLeft size={16} aria-hidden="true" />
          Atrás
        </button>
        <button type="button" className="btn btn--line" onClick={() => setCur((c) => Math.min(sc.steps.length, c + 1))} disabled={done} aria-label="Ejecutar siguiente paso">
          Siguiente
          <ChevronRight size={16} aria-hidden="true" />
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => setCur(0)} aria-label="Reiniciar escenario">
          <RotateCcw size={16} aria-hidden="true" />
        </button>
        <span className="iso-count">
          {cur}/{sc.steps.length}
        </span>
      </div>
    </WidgetFrame>
  )
}
