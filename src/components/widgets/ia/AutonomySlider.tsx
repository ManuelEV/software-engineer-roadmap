import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Bot, User, Wrench } from 'lucide-react'
import { WidgetFrame } from '../kit'
import { StationRow } from './StationRow'
import './AutonomySlider.css'

interface Level {
  id: string
  name: string
  short: string
  example: string
  agent: string
  human: string
  needs: string
  /** 1–5: how often the human intervenes per unit of work */
  oversight: number
  /** 1–5: how much harness (tests, permissions, sandbox, specs) must exist */
  harness: number
  /** 1–5: size of the unit of work delegated */
  unit: number
}

const LEVELS: Level[] = [
  {
    id: 'auto',
    name: 'Autocompletado',
    short: 'Autocompletar',
    example: 'Sugerencias en línea del editor (aceptas con Tab).',
    agent: 'Predice las próximas líneas a partir del archivo abierto y lo que tienes alrededor.',
    human: 'Escribes el código, decides cada línea y mantienes todo el modelo mental.',
    needs: 'Nada especial: tu propio criterio es el verificador.',
    oversight: 5,
    harness: 1,
    unit: 1,
  },
  {
    id: 'chat',
    name: 'Chat',
    short: 'Chat',
    example: 'Pegas un error en un chat y copias la respuesta.',
    agent: 'Responde con fragmentos, explicaciones o funciones completas, sin tocar tu repo.',
    human: 'Haces de “herramienta” del modelo: copias contexto, pegas código, corres y reportas.',
    needs: 'Saber dar contexto suficiente en el prompt.',
    oversight: 5,
    harness: 1,
    unit: 2,
  },
  {
    id: 'sup',
    name: 'Agente supervisado',
    short: 'Supervisado',
    example: 'Agente en terminal o IDE que pide permiso antes de editar o ejecutar.',
    agent: 'Lee archivos, busca, edita y ejecuta comandos en tu máquina; itera con los resultados.',
    human: 'Apruebas acciones una por una, corriges el rumbo en el primer minuto y revisas el diff.',
    needs: 'Comandos de test/lint claros (idealmente en CLAUDE.md o AGENTS.md).',
    oversight: 4,
    harness: 2,
    unit: 3,
  },
  {
    id: 'trusted',
    name: 'Agente con permisos amplios',
    short: 'Auto + sandbox',
    example: 'Reglas allow/deny, sandbox de red y archivos, hooks que corren el linter.',
    agent: 'Trabaja sin pedir permiso dentro de los límites que definiste; se verifica con tests.',
    human: 'Diseñas los límites (permisos, sandbox, hooks) y revisas al final, no en cada paso.',
    needs: 'Tests confiables, reglas de permisos, sandbox, hooks deterministas.',
    oversight: 3,
    harness: 3,
    unit: 3,
  },
  {
    id: 'bg',
    name: 'Agente en segundo plano',
    short: 'Background',
    example: 'Una tarea que corre en la nube o en CI y te entrega un pull request.',
    agent: 'Clona el repo en un entorno aislado, implementa, corre la suite y abre un PR.',
    human: 'Escribes una tarea bien especificada y haces code review del PR como con un colega.',
    needs: 'Entorno reproducible (setup scripts), CI fuerte, specs o issues claros.',
    oversight: 2,
    harness: 4,
    unit: 4,
  },
  {
    id: 'fleet',
    name: 'Loops y flotas',
    short: 'Loops / flota',
    example: 'Varios agentes en paralelo o un loop autónomo que trabaja horas.',
    agent: 'Toma tareas de una lista, implementa, verifica, deja notas de progreso y sigue.',
    human: 'Diseñas el harness: specs, lista de tareas, criterios de “terminado”, límites de gasto y la revisión por lotes.',
    needs: 'Todo lo anterior + archivos de progreso, presupuestos, ramas protegidas.',
    oversight: 1,
    harness: 5,
    unit: 5,
  },
]

function Meter({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="as-meter">
      <div className="as-meter__top">
        <span className="as-meter__label">{label}</span>
        <span className="as-meter__hint">{hint}</span>
      </div>
      <div className="as-meter__cells" role="img" aria-label={`${label}: ${value} de 5`}>
        {[1, 2, 3, 4, 5].map((c) => (
          <span key={c} className={`as-meter__cell ${c <= value ? 'is-on' : ''}`} />
        ))}
      </div>
    </div>
  )
}

export function AutonomySlider() {
  const [i, setI] = useState(2)
  const reduced = useReducedMotion()
  const lv = LEVELS[i]
  return (
    <WidgetFrame
      caption="Niveles de autonomía. A medida que delegas unidades de trabajo más grandes, tu rol pasa de escribir código a diseñar el entorno que lo verifica."
      readout={
        <p>
          <b>Ejemplo:</b> {lv.example}
        </p>
      }
    >
      <StationRow
        label="Nivel de autonomía"
        items={LEVELS.map((l) => ({ id: l.id, label: l.short }))}
        value={i}
        onChange={setI}
      />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={lv.id}
          className="as-body"
          initial={{ opacity: 0, y: reduced ? 0 : 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduced ? 0 : -6 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          <h4 className="as-title">
            <span className="line-badge">N{i}</span> {lv.name}
          </h4>
          <div className="as-cols">
            <div className="as-col">
              <div className="as-col__head">
                <Bot size={16} aria-hidden="true" /> El agente
              </div>
              <p>{lv.agent}</p>
            </div>
            <div className="as-col">
              <div className="as-col__head">
                <User size={16} aria-hidden="true" /> Tú
              </div>
              <p>{lv.human}</p>
            </div>
            <div className="as-col">
              <div className="as-col__head">
                <Wrench size={16} aria-hidden="true" /> Tiene que existir
              </div>
              <p>{lv.needs}</p>
            </div>
          </div>
          <div className="as-meters">
            <Meter label="Intervención humana" value={lv.oversight} hint="por unidad de trabajo" />
            <Meter label="Tamaño de lo delegado" value={lv.unit} hint="línea → proyecto" />
            <Meter label="Harness necesario" value={lv.harness} hint="tests, permisos, specs" />
          </div>
        </motion.div>
      </AnimatePresence>
    </WidgetFrame>
  )
}
