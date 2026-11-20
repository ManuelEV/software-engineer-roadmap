import { type KeyboardEvent, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { WidgetFrame } from '../kit'
import './HarnessDiagram.css'

interface Ring {
  id: string
  name: string
  what: string
  examples: string[]
  missing: string
}

// Ordered from the center outwards
const RINGS: Ring[] = [
  {
    id: 'model',
    name: 'Modelo',
    what: 'El LLM: recibe tokens, devuelve texto o llamadas a herramientas. No tiene memoria entre llamadas, no ve tu disco ni ejecuta nada por sí mismo.',
    examples: ['Elección de modelo y nivel de esfuerzo', 'Presupuesto de tokens por tarea'],
    missing: 'Sin harness, un modelo solo puede sugerir texto. Todo lo que “hace” un agente lo hace el sistema que lo rodea.',
  },
  {
    id: 'context',
    name: 'Contexto',
    what: 'Lo que el modelo ve en cada llamada: system prompt, instrucciones del repo, skills, historial, resultados de herramientas.',
    examples: ['CLAUDE.md / AGENTS.md cortos', 'Skills con carga progresiva', 'Compactación y notas de progreso'],
    missing: 'El agente redescubre el repo en cada sesión, repite errores que ya corregiste y copia patrones viejos que “parecen” la convención.',
  },
  {
    id: 'tools',
    name: 'Herramientas',
    what: 'Las acciones disponibles: leer, buscar, editar, ejecutar comandos, navegar, consultar APIs vía MCP. Su diseño (nombres, parámetros, mensajes de error) es una interfaz para el modelo.',
    examples: ['Read / Edit / Bash / Grep', 'Servidores MCP (issues, base de datos, navegador)', 'Salidas truncadas y paginadas'],
    missing: 'Herramientas ambiguas o verborrágicas: el agente elige mal, se ahoga en logs o inventa parámetros.',
  },
  {
    id: 'control',
    name: 'Permisos y hooks',
    what: 'Reglas deterministas sobre qué acción se permite, se pregunta o se niega, y scripts que corren en puntos fijos del loop (antes/después de una herramienta, al terminar).',
    examples: ['deny: Read(./.env)', 'ask: Bash(git push *)', 'PostToolUse → formateador', 'Stop hook → typecheck'],
    missing: 'Las reglas importantes viven solo en el prompt, y el modelo “casi siempre” las cumple. Casi.',
  },
  {
    id: 'sandbox',
    name: 'Sandbox',
    what: 'Aislamiento a nivel de sistema operativo o contenedor: qué archivos se pueden escribir y a qué dominios se puede conectar, sin importar lo que el modelo decida.',
    examples: ['Escritura solo en el workspace', 'Red solo a dominios permitidos', 'Contenedor o VM para modos sin permisos'],
    missing: 'Un prompt injection o un comando mal entendido tiene el mismo alcance que tu usuario: tus credenciales, tu red, tu home.',
  },
  {
    id: 'feedback',
    name: 'Entorno y feedback',
    what: 'El repo y sus señales: tests, tipos, linters con mensajes accionables, scripts de arranque, CI, observabilidad, y la revisión humana al final.',
    examples: ['Test que falla antes del cambio', 'Linters con mensajes de remediación', 'init.sh / setup reproducible', 'CI y ramas protegidas'],
    missing: 'El agente declara victoria cuando el código “parece” terminado. Tú terminas siendo el test suite.',
  },
]

const CX = 200
const CY = 200
const R0 = 46
const STEP = 29

export function HarnessDiagram() {
  const [sel, setSel] = useState(3)
  const reduced = useReducedMotion()
  const ring = RINGS[sel]

  const onKey = (e: KeyboardEvent<SVGGElement>, i: number) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setSel(i)
    }
  }

  return (
    <WidgetFrame caption="El harness: todo lo que rodea al modelo. Toca un anillo. Cuanto más afuera, más determinista: el modelo propone, el harness dispone.">
      <div className="hd-grid">
        <svg className="hd-svg" viewBox="0 0 400 400" role="group" aria-label="Capas del harness">
          {RINGS.slice()
            .reverse()
            .map((r) => {
              const i = RINGS.indexOf(r)
              const radius = i === 0 ? R0 : R0 + i * STEP
              const on = i === sel
              return (
                <g
                  key={r.id}
                  className={`hd-ring ${on ? 'is-on' : ''}`}
                  role="button"
                  tabIndex={0}
                  aria-pressed={on}
                  aria-label={r.name}
                  onClick={() => setSel(i)}
                  onKeyDown={(e) => onKey(e, i)}
                >
                  <circle cx={CX} cy={CY} r={radius} className={i === 0 ? 'hd-core' : 'hd-band'} />
                </g>
              )
            })}
          {RINGS.map((r, i) => {
            const on = i === sel
            if (i === 0)
              return (
                <text key={r.id} x={CX} y={CY + 5} textAnchor="middle" className={`hd-label hd-label--core ${on ? 'is-on' : ''}`}>
                  {r.name}
                </text>
              )
            const y = CY - (R0 + (i - 1) * STEP) - STEP / 2 + 5
            return (
              <text key={r.id} x={CX} y={y} textAnchor="middle" className={`hd-label ${on ? 'is-on' : ''}`} pointerEvents="none">
                {r.name}
              </text>
            )
          })}
        </svg>
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={ring.id}
            className="hd-panel"
            initial={{ opacity: 0, y: reduced ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: reduced ? 0 : -6 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            aria-live="polite"
          >
            <h4 className="hd-title">{ring.name}</h4>
            <p>{ring.what}</p>
            <ul className="hd-examples">
              {ring.examples.map((x) => (
                <li key={x}>
                  <code>{x}</code>
                </li>
              ))}
            </ul>
            <p className="hd-missing">
              <b>Si falta:</b> {ring.missing}
            </p>
          </motion.div>
        </AnimatePresence>
      </div>
    </WidgetFrame>
  )
}
