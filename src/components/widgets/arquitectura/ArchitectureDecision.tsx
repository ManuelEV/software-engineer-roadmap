import { useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Boxes, Database, Hexagon, TriangleAlert } from 'lucide-react'
import { Segmented, WidgetFrame } from '../kit'
import { useTransition } from './shared'
import './ArchitectureDecision.css'

type Teams = '1' | '2-4' | '5+'
type Domain = 'explore' | 'stable'
type Logic = 'crud' | 'rich'
type Scale = 'uniform' | 'diff'
type Ops = 'basic' | 'mature'
type History = 'no' | 'yes'

interface Answers {
  teams: Teams
  domain: Domain
  logic: Logic
  scale: Scale
  ops: Ops
  history: History
}

interface Rec {
  deploy: { title: string; why: string }
  inside: { title: string; why: string }
  data: { title: string; why: string }
  warnings: string[]
  fitness: string[]
}

function recommend(a: Answers): Rec {
  const warnings: string[] = []
  const fitness: string[] = ['Reglas de dependencias entre módulos en CI (dependency-cruiser, ArchUnit, Packwerk)']

  let deploy: Rec['deploy']
  if (a.teams === '5+' && a.domain === 'stable' && a.ops === 'mature') {
    deploy = {
      title: 'Microservicios por bounded context',
      why: 'Varios equipos, fronteras de dominio estables y operación madura: el despliegue independiente compensa la prima de la distribución. Empieza por los contextos con más presión de cambio o de escalado, no por todos a la vez.',
    }
    fitness.push('Pruebas de contrato entre servicios (Pact o similar)', 'Alerta si un release necesita desplegar más de un servicio a la vez')
  } else if ((a.teams === '5+' || a.scale === 'diff') && a.ops === 'mature') {
    deploy = {
      title: 'Monolito modular + servicios puntuales',
      why: 'Mantén la mayor parte en un desplegable con módulos fuertes y extrae solo lo que tiene una razón concreta (perfil de escalado distinto, ritmo de despliegue, aislamiento).',
    }
    fitness.push('Presupuesto de latencia p99 por endpoint en las pruebas de carga')
  } else if (a.teams === '1' && a.logic === 'crud' && a.scale === 'uniform') {
    deploy = {
      title: 'Monolito simple',
      why: 'Un equipo y un dominio mayormente CRUD: lo que más vale es velocidad de entrega. Organiza por funcionalidad desde el día uno para que modularizar después sea barato.',
    }
  } else {
    deploy = {
      title: 'Monolito modular',
      why: 'Te da fronteras por capacidad de negocio, transacciones locales y una sola cosa que operar, y deja la puerta abierta para extraer servicios cuando aparezca una razón concreta.',
    }
  }

  const inside: Rec['inside'] =
    a.logic === 'rich'
      ? {
          title: 'Hexagonal o Clean en los módulos core, con DDD táctico',
          why: 'Las reglas de negocio son el activo: aíslalas de la infraestructura, modela agregados con invariantes y pruébalas sin levantar nada. En los módulos de soporte, algo más liviano.',
        }
      : {
          title: 'Capas simples o vertical slices',
          why: 'Sin reglas ricas, puertos y mapeos son ceremonia. Mantén la regla de dependencia (el dominio no importa infraestructura) y nada más.',
        }

  const data: Rec['data'] =
    a.history === 'yes'
      ? {
          title: 'Event sourcing solo en el contexto donde la historia importa',
          why: 'Auditoría y consultas temporales justifican el costo allí; el resto del sistema guarda estado actual. Agrega CQRS para las lecturas de ese contexto.',
        }
      : {
          title: 'Estado actual en base relacional, esquema por módulo',
          why: 'Lo más simple que funciona. Si los módulos o servicios intercambian eventos, publícalos con outbox transaccional desde el principio.',
        }

  if (a.domain === 'explore' && a.teams !== '1') warnings.push('El dominio todavía se está descubriendo: invierte en Event Storming y DDD estratégico antes de fijar fronteras caras de mover.')
  if (a.teams === '5+' && a.ops === 'basic') warnings.push('Con 5 o más equipos y operación básica, el tren de despliegue va a doler, pero los microservicios dolerían más: primero CI/CD, observabilidad y despliegues automatizados.')
  if (a.scale === 'diff' && a.ops === 'basic') warnings.push('Hay partes con perfiles de escalado distintos, pero extraerlas sin madurez operativa multiplica incidentes. Escala el monolito horizontalmente mientras tanto.')
  if (a.history === 'yes' && a.logic === 'crud') warnings.push('Event sourcing en un dominio CRUD suele ser excesivo: considera una tabla de auditoría o CDC hacia un data lake.')
  if (a.logic === 'rich') fitness.push('El paquete domain no puede importar infraestructura ni frameworks')
  if (a.history === 'yes') fitness.push('Test de compatibilidad de esquemas de eventos en CI (schema registry)')

  return { deploy, inside, data, warnings, fitness }
}

export function ArchitectureDecision() {
  const [a, setA] = useState<Answers>({ teams: '2-4', domain: 'explore', logic: 'rich', scale: 'uniform', ops: 'basic', history: 'no' })
  const t = useTransition(0.25)
  const r = recommend(a)
  const set = <K extends keyof Answers>(k: K) => (v: Answers[K]) => setA((s) => ({ ...s, [k]: v }))

  const rows = [
    { key: 'deploy', label: 'Despliegue', Icon: Boxes, rec: r.deploy },
    { key: 'inside', label: 'Interior', Icon: Hexagon, rec: r.inside },
    { key: 'data', label: 'Datos', Icon: Database, rec: r.data },
  ] as const

  return (
    <WidgetFrame
      caption="Una guía de partida, no un oráculo: responde con honestidad sobre tu contexto actual (no el que esperas tener en tres años) y lee el porqué de cada recomendación. Las reglas resumen el consenso de las fuentes de esta unidad."
      controls={
        <div className="ad-qs">
          <Segmented<Teams> label="Equipos sobre el sistema" value={a.teams} onChange={set('teams')} options={[{ value: '1', label: '1' }, { value: '2-4', label: '2 a 4' }, { value: '5+', label: '5 o más' }]} />
          <Segmented<Domain> label="Dominio" value={a.domain} onChange={set('domain')} options={[{ value: 'explore', label: 'Se descubre' }, { value: 'stable', label: 'Estable' }]} />
          <Segmented<Logic> label="Reglas de negocio" value={a.logic} onChange={set('logic')} options={[{ value: 'crud', label: 'Casi CRUD' }, { value: 'rich', label: 'Ricas' }]} />
          <Segmented<Scale> label="Escalado" value={a.scale} onChange={set('scale')} options={[{ value: 'uniform', label: 'Parejo' }, { value: 'diff', label: 'Muy distinto por parte' }]} />
          <Segmented<Ops> label="Madurez operativa" value={a.ops} onChange={set('ops')} options={[{ value: 'basic', label: 'Básica' }, { value: 'mature', label: 'CI/CD + observabilidad' }]} />
          <Segmented<History> label="Historia y auditoría" value={a.history} onChange={set('history')} options={[{ value: 'no', label: 'Secundaria' }, { value: 'yes', label: 'Es el negocio' }]} />
        </div>
      }
      readout={
        <div className="ad-foot">
          {r.warnings.length > 0 && (
            <ul className="ad-warn">
              {r.warnings.map((w) => (
                <li key={w}>
                  <TriangleAlert size={16} aria-hidden="true" /> <span>{w}</span>
                </li>
              ))}
            </ul>
          )}
          <p className="ad-fit">
            <b>Fitness functions sugeridas:</b> {r.fitness.join('; ')}.
          </p>
        </div>
      }
    >
      <div className="ad-recs" aria-live="polite">
        {rows.map(({ key, label, Icon, rec }) => (
          <div key={key} className="ad-rec">
            <span className="ad-rec__icon" aria-hidden="true">
              <Icon size={20} />
            </span>
            <div>
              <span className="ad-rec__label">{label}</span>
              <AnimatePresence mode="wait" initial={false}>
                <motion.div key={rec.title} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={t}>
                  <p className="ad-rec__title">{rec.title}</p>
                  <p className="ad-rec__why">{rec.why}</p>
                </motion.div>
              </AnimatePresence>
            </div>
          </div>
        ))}
      </div>
    </WidgetFrame>
  )
}
