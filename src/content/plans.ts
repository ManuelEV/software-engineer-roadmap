import { topicById } from './units'
import type { Topic } from './types'

/** A study plan: topics from several units in the order that serves one goal. */
export interface StudyPlan {
  id: string
  title: string
  description: string
  topics: Topic[]
}

const raw: { id: string; title: string; description: string; topics: string[] }[] = [
  {
    id: 'live-coding',
    title: 'Live coding desde cero',
    description:
      'El método y los patrones que más se repiten en las rondas de código, de lo más frecuente a lo más avanzado, con cada algoritmo animado paso a paso.',
    topics: [
      'casos/metodo-live-coding',
      'casos/arrays-y-hashing',
      'casos/two-pointers-y-sliding-window',
      'casos/pilas-y-colas',
      'casos/busqueda-binaria',
      'casos/listas-enlazadas',
      'casos/arboles',
      'casos/heaps-y-top-k',
      'casos/grafos',
      'casos/intervalos-y-greedy',
      'casos/backtracking',
      'casos/programacion-dinamica',
    ],
  },
  {
    id: 'proceso-completo',
    title: 'Un proceso de entrevistas completo',
    description:
      'Una pasada por cada ronda de un proceso típico de backend: cómo funciona, código, teoría, diseño, conductual y oferta. Para cuando la entrevista es en unas semanas.',
    topics: [
      'casos/proceso-de-entrevistas',
      'casos/metodo-live-coding',
      'casos/arrays-y-hashing',
      'casos/two-pointers-y-sliding-window',
      'casos/arboles',
      'casos/grafos',
      'casos/estructuras-de-datos',
      'casos/poo-y-solid',
      'casos/backend-y-bases-de-datos',
      'casos/concurrencia',
      'system-design/metodo-entrevista',
      'casos/acortador-urls',
      'casos/diseno-orientado-a-objetos',
      'casos/otros-formatos',
      'casos/entrevista-conductual',
      'casos/hablame-de-ti',
      'casos/oferta-y-negociacion',
    ],
  },
  {
    id: 'entrevista-system-design',
    title: 'Entrevista de system design en dos semanas',
    description:
      'El método, los bloques que más se preguntan y los casos clásicos, en el orden en que conviene practicarlos.',
    topics: [
      'system-design/metodo-entrevista',
      'system-design/estimaciones',
      'system-design/caching',
      'system-design/bases-de-datos',
      'system-design/replicacion-y-sharding',
      'system-design/colas-y-streaming',
      'system-design/consistencia',
      'casos/acortador-urls',
      'casos/rate-limiter',
      'casos/twitter',
      'casos/whatsapp',
      'casos/youtube',
      'casos/uber',
      'casos/ticketmaster',
    ],
  },
  {
    id: 'programador-a-arquitecto',
    title: 'De programador a arquitecto',
    description:
      'Del diseño de clases al diseño de sistemas: principios, patrones de aplicación, hexagonal, DDD y cuándo partir en servicios.',
    topics: [
      'patrones/introduccion',
      'patrones/patrones-aplicacion',
      'arquitectura/fundamentos',
      'arquitectura/monolito-y-capas',
      'arquitectura/hexagonal',
      'arquitectura/clean-y-onion',
      'arquitectura/ddd-estrategico',
      'arquitectura/ddd-tactico',
      'arquitectura/microservicios',
      'arquitectura/event-driven',
      'arquitectura/elegir-arquitectura',
    ],
  },
  {
    id: 'equipo-con-agentes',
    title: 'Un equipo que empieza a trabajar con agentes',
    description:
      'Lo mínimo para usar agentes de código con criterio: cómo funcionan, cómo darles contexto, especificar, verificar y no meterse en problemas.',
    topics: [
      'ia/panorama',
      'ia/agent-loop',
      'ia/ingenieria-de-contexto',
      'ia/spec-driven',
      'ia/harness',
      'ia/verificacion',
      'ia/flujos',
      'ia/buenas-practicas',
    ],
  },
  {
    id: 'backend-resiliente',
    title: 'Backend que no se cae',
    description:
      'Consistencia entre servicios, reintentos sin duplicados y patrones de resiliencia, cerrando con un sistema de pagos.',
    topics: [
      'arquitectura/event-driven',
      'arquitectura/sagas-y-outbox',
      'system-design/colas-y-streaming',
      'system-design/confiabilidad',
      'patrones/patrones-resiliencia',
      'casos/notificaciones',
      'casos/pagos',
    ],
  },
]

export const studyPlans: StudyPlan[] = raw.map((r) => ({
  ...r,
  topics: r.topics.map((id) => topicById.get(id)).filter((t): t is Topic => !!t),
}))
