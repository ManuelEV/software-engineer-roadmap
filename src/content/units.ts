import type { Topic, UnitDef, UnitId } from './types'
import { topics as arquitectura } from './arquitectura/topics'
import { topics as systemDesign } from './system-design/topics'
import { topics as casos } from './casos/topics'
import { topics as patrones } from './patrones/topics'
import { topics as ia } from './ia/topics'

export const units: UnitDef[] = [
  {
    id: 'arquitectura',
    number: 1,
    title: 'Arquitectura de software',
    short: 'Arquitectura',
    description:
      'Cómo organizar un sistema para que cambie sin romperse: capas, hexagonal, clean, DDD, microservicios y arquitecturas orientadas a eventos.',
    topics: arquitectura,
  },
  {
    id: 'system-design',
    number: 2,
    title: 'System Design: fundamentos',
    short: 'System Design',
    description:
      'Las piezas con que se construyen sistemas a escala y el método para razonar sobre ellas en una entrevista: estimaciones, caché, bases de datos, colas, consistencia.',
    topics: systemDesign,
  },
  {
    id: 'casos',
    number: 3,
    title: 'Entrevistas técnicas',
    short: 'Entrevistas',
    description:
      'Todo el proceso, ronda por ronda: live coding con los patrones que más se repiten, preguntas conceptuales, casos de system design (Twitter, WhatsApp, Uber…), la entrevista conductual y la oferta.',
    topics: casos,
  },
  {
    id: 'patrones',
    number: 4,
    title: 'Patrones de diseño',
    short: 'Patrones',
    description:
      'Soluciones probadas a problemas recurrentes de diseño de código: principios SOLID, patrones creacionales, estructurales, de comportamiento y más allá del GoF.',
    topics: patrones,
  },
  {
    id: 'ia',
    number: 5,
    title: 'Desarrollo con IA',
    short: 'Desarrollo con IA',
    description:
      'Cómo trabajar con agentes de código de forma profesional: el loop agéntico, ingeniería de contexto, Spec-Driven Development, harness, verificación y buenas prácticas.',
    topics: ia,
  },
]

export const unitById = Object.fromEntries(units.map((u) => [u.id, u])) as Record<UnitId, UnitDef>

export const allTopics: Topic[] = units.flatMap((unit) =>
  unit.topics.map((t, index) => ({ ...t, unit, index, id: `${unit.id}/${t.slug}`, num: `${unit.number}.${index + 1}` })),
)

export const topicById = new Map(allTopics.map((t) => [t.id, t]))

export const topicPath = (t: Pick<Topic, 'unit' | 'slug'>) => `/${t.unit.id}/${t.slug}`

export function getTopic(unitId: string | undefined, slug: string | undefined): Topic | undefined {
  if (!unitId || !slug) return undefined
  return topicById.get(`${unitId}/${slug}`)
}

export function isUnitId(id: string | undefined): id is UnitId {
  return !!id && id in unitById
}

/** Previous/next topic inside the unit; at the end of a unit, the first topic of the next one. */
export function neighbors(topic: Topic) {
  const list = topic.unit.topics
  const at = (i: number) => topicById.get(`${topic.unit.id}/${list[i].slug}`)
  const prev = topic.index > 0 ? at(topic.index - 1) : undefined
  const next = topic.index < list.length - 1 ? at(topic.index + 1) : undefined
  let nextUnit: Topic | undefined
  if (!next) {
    const following = units[units.findIndex((u) => u.id === topic.unit.id) + 1]
    if (following?.topics[0]) nextUnit = topicById.get(`${following.id}/${following.topics[0].slug}`)
  }
  return { prev, next, nextUnit }
}
