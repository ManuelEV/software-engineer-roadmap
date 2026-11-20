import { useId, useMemo, useState } from 'react'
import { Segmented, WidgetFrame } from '../kit'
import './JoinExplorer.css'

/**
 * JoinExplorer: two tiny tables and the five joins people get asked about.
 * The result is computed with a real nested-loop join over the rows, and each
 * source row is marked as matched, padded with NULLs, or left out.
 */

type Mode = 'inner' | 'left' | 'right' | 'full' | 'anti'

interface Emp {
  id: number
  nombre: string
  depto_id: number | null
}
interface Dep {
  id: number
  nombre: string
}

const EMPLEADOS: Emp[] = [
  { id: 1, nombre: 'Ana', depto_id: 10 },
  { id: 2, nombre: 'Beto', depto_id: 20 },
  { id: 3, nombre: 'Carla', depto_id: 10 },
  { id: 4, nombre: 'Diego', depto_id: null },
  { id: 5, nombre: 'Elena', depto_id: 20 },
]
const DEPTOS: Dep[] = [
  { id: 10, nombre: 'Ventas' },
  { id: 20, nombre: 'Ingeniería' },
  { id: 30, nombre: 'Legal' },
]

const MODES: { value: Mode; label: string }[] = [
  { value: 'inner', label: 'INNER' },
  { value: 'left', label: 'LEFT' },
  { value: 'right', label: 'RIGHT' },
  { value: 'full', label: 'FULL' },
  { value: 'anti', label: 'LEFT … IS NULL' },
]

const SQL: Record<Mode, string[]> = {
  inner: ['SELECT e.nombre, d.nombre AS depto', 'FROM empleados e', 'INNER JOIN departamentos d', '  ON e.depto_id = d.id;'],
  left: ['SELECT e.nombre, d.nombre AS depto', 'FROM empleados e', 'LEFT JOIN departamentos d', '  ON e.depto_id = d.id;'],
  right: ['SELECT e.nombre, d.nombre AS depto', 'FROM empleados e', 'RIGHT JOIN departamentos d', '  ON e.depto_id = d.id;'],
  full: ['SELECT e.nombre, d.nombre AS depto', 'FROM empleados e', 'FULL OUTER JOIN departamentos d', '  ON e.depto_id = d.id;'],
  anti: ['SELECT e.nombre', 'FROM empleados e', 'LEFT JOIN departamentos d', '  ON e.depto_id = d.id', 'WHERE d.id IS NULL;'],
}

const EXPLAIN: Record<Mode, string> = {
  inner: 'Solo los pares que cumplen la condición. Diego (depto NULL) y Legal (sin empleados) desaparecen. Ventas aparece dos veces porque tiene dos empleados.',
  left: 'Todos los empleados, tengan o no departamento. Diego aparece con NULL en las columnas de la derecha. Legal sigue fuera.',
  right: 'Todos los departamentos. Legal aparece con NULL a la izquierda; Diego queda fuera. Es un LEFT JOIN con las tablas al revés, y casi nadie lo escribe así.',
  full: 'La unión de LEFT y RIGHT: todo lo que calza, más lo que sobra de cada lado relleno con NULL. MySQL no lo soporta; se emula con LEFT UNION RIGHT.',
  anti: 'Anti-join: los empleados sin departamento. El LEFT JOIN rellena con NULL, y el WHERE se queda solo con esas filas. Equivale a NOT EXISTS.',
}

interface Row {
  e: Emp | null
  d: Dep | null
}

function runJoin(mode: Mode): Row[] {
  const rows: Row[] = []
  const usedD = new Set<number>()
  for (const e of EMPLEADOS) {
    let matched = false
    for (const d of DEPTOS) {
      // NULL = 10 is not true in SQL, so a NULL key never matches
      if (e.depto_id !== null && e.depto_id === d.id) {
        matched = true
        usedD.add(d.id)
        if (mode !== 'anti') rows.push({ e, d })
      }
    }
    if (!matched && (mode === 'left' || mode === 'full' || mode === 'anti')) rows.push({ e, d: null })
  }
  if (mode === 'right' || mode === 'full') for (const d of DEPTOS) if (!usedD.has(d.id)) rows.push({ e: null, d })
  if (mode === 'right') {
    // keep the right table's order, which is how people usually picture it
    rows.sort((a, b) => DEPTOS.indexOf(a.d!) - DEPTOS.indexOf(b.d!))
  }
  return rows
}

type SrcState = 'match' | 'alone' | 'out'

export function JoinExplorer() {
  const uid = useId().replace(/:/g, '')
  const [mode, setMode] = useState<Mode>('inner')
  const [sel, setSel] = useState<number | null>(null)
  const rows = useMemo(() => runJoin(mode), [mode])
  const selRow = sel !== null ? rows[sel] : null

  const stateE = (e: Emp): SrcState => {
    const inRows = rows.filter((r) => r.e === e)
    if (inRows.length === 0) return 'out'
    return inRows.some((r) => r.d) ? 'match' : 'alone'
  }
  const stateD = (d: Dep): SrcState => {
    const inRows = rows.filter((r) => r.d === d)
    if (inRows.length === 0) return 'out'
    return inRows.some((r) => r.e) ? 'match' : 'alone'
  }

  const showLeftOnly = mode === 'left' || mode === 'full' || mode === 'anti'
  const showRightOnly = mode === 'right' || mode === 'full'
  const showBoth = mode !== 'anti'

  const cell = (v: string | number | null | undefined) => (v === null || v === undefined ? <span className="jx-null">NULL</span> : v)

  return (
    <WidgetFrame
      caption="Empleados y departamentos. Elige el tipo de JOIN: se marcan las filas que participan y se calcula el resultado. Toca una fila del resultado para ver de dónde salió."
      controls={
        <Segmented
          label="Tipo de JOIN"
          value={mode}
          onChange={(v) => {
            setMode(v)
            setSel(null)
          }}
          options={MODES}
        />
      }
      readout={<p>{EXPLAIN[mode]}</p>}
    >
      <div className="jx">
        <div className="jx-sources">
          <table className="jx-table" aria-label="Tabla empleados">
            <caption>empleados e</caption>
            <thead>
              <tr>
                <th>id</th>
                <th>nombre</th>
                <th>depto_id</th>
              </tr>
            </thead>
            <tbody>
              {EMPLEADOS.map((e) => (
                <tr key={e.id} className={`is-${stateE(e)} ${selRow?.e === e ? 'is-sel' : ''}`}>
                  <td>{e.id}</td>
                  <td>{e.nombre}</td>
                  <td>{cell(e.depto_id)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <table className="jx-table" aria-label="Tabla departamentos">
            <caption>departamentos d</caption>
            <thead>
              <tr>
                <th>id</th>
                <th>nombre</th>
              </tr>
            </thead>
            <tbody>
              {DEPTOS.map((d) => (
                <tr key={d.id} className={`is-${stateD(d)} ${selRow?.d === d ? 'is-sel' : ''}`}>
                  <td>{d.id}</td>
                  <td>{d.nombre}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="jx-legend" aria-hidden="true">
          <span className="jx-key is-match">con pareja</span>
          <span className="jx-key is-alone">sin pareja, con NULL</span>
          <span className="jx-key is-out">fuera del resultado</span>
        </div>

        <div className="jx-mid">
          <svg className="jx-venn" viewBox="0 0 220 132" role="img" aria-label={`Diagrama de Venn del ${MODES.find((m) => m.value === mode)!.label}`}>
            <defs>
              <clipPath id={`${uid}-cr`}>
                <circle cx="132" cy="58" r="50" />
              </clipPath>
              <mask id={`${uid}-ml`}>
                <rect width="220" height="132" fill="white" />
                <circle cx="132" cy="58" r="50" fill="black" />
              </mask>
              <mask id={`${uid}-mr`}>
                <rect width="220" height="132" fill="white" />
                <circle cx="88" cy="58" r="50" fill="black" />
              </mask>
            </defs>
            <circle cx="88" cy="58" r="50" className={`jx-region ${showLeftOnly ? 'is-on' : ''}`} mask={`url(#${uid}-ml)`} />
            <circle cx="132" cy="58" r="50" className={`jx-region ${showRightOnly ? 'is-on' : ''}`} mask={`url(#${uid}-mr)`} />
            <circle cx="88" cy="58" r="50" className={`jx-region ${showBoth ? 'is-on' : ''}`} clipPath={`url(#${uid}-cr)`} />
            <circle cx="88" cy="58" r="50" className="jx-ring" />
            <circle cx="132" cy="58" r="50" className="jx-ring" />
            <text x="62" y="127" textAnchor="middle" className="jx-vlabel">
              empleados
            </text>
            <text x="160" y="127" textAnchor="middle" className="jx-vlabel">
              departamentos
            </text>
          </svg>
          <pre className="jx-sql" aria-label="Consulta SQL">
            <code>{SQL[mode].join('\n')}</code>
          </pre>
        </div>

        <table className="jx-table jx-result" aria-label={`Resultado: ${rows.length} filas`}>
          <caption>
            resultado · {rows.length} {rows.length === 1 ? 'fila' : 'filas'}
          </caption>
          <thead>
            <tr>
              <th>e.nombre</th>
              {mode !== 'anti' && <th>depto</th>}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, k) => (
              <tr key={`${mode}-${k}`} className={sel === k ? 'is-sel' : ''}>
                <td colSpan={mode === 'anti' ? 1 : undefined}>
                  <button
                    type="button"
                    className="jx-rowbtn"
                    onClick={() => setSel(sel === k ? null : k)}
                    aria-pressed={sel === k}
                    aria-label={`Fila ${k + 1}: ${r.e?.nombre ?? 'NULL'}${mode !== 'anti' ? `, ${r.d?.nombre ?? 'NULL'}` : ''}. Ver origen.`}
                  >
                    {cell(r.e?.nombre)}
                  </button>
                </td>
                {mode !== 'anti' && <td>{cell(r.d?.nombre)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </WidgetFrame>
  )
}
