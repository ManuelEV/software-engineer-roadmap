import type { TopicDef } from '../types'

export const topics: TopicDef[] = [
  {
    slug: 'fundamentos',
    title: 'Qué es arquitectura',
    summary:
      'Atributos de calidad medibles, trade-offs, decisiones reversibles e irreversibles, la ley de Conway y cómo documentar decisiones con ADRs.',
    minutes: 16,
    group: 'Fundamentos',
    keywords: ['software architecture', 'quality attributes', 'trade-offs', 'Conway', 'ADR', 'architecture decision record'],
    load: () => import('./fundamentos.mdx'),
  },
  {
    slug: 'monolito-y-capas',
    title: 'Capas y monolito modular',
    summary:
      'La arquitectura en capas y sus límites, por qué el monolito modular es el punto de partida sensato y cómo hacer cumplir sus fronteras en CI y en la base.',
    minutes: 15,
    group: 'Fundamentos',
    keywords: ['layered architecture', 'modular monolith', 'big ball of mud', 'dependency-cruiser', 'Packwerk', 'Shopify'],
    load: () => import('./monolito-y-capas.mdx'),
  },
  {
    slug: 'hexagonal',
    title: 'Arquitectura hexagonal',
    summary:
      'Puertos y adaptadores en TypeScript: dominio, puertos conductores y conducidos, adaptadores, raíz de composición y tests con adaptadores en memoria.',
    minutes: 18,
    group: 'Estilos',
    keywords: ['ports and adapters', 'hexagonal architecture', 'Cockburn', 'dependency inversion', 'composition root', 'contract tests'],
    load: () => import('./hexagonal.mdx'),
  },
  {
    slug: 'clean-y-onion',
    title: 'Clean Architecture y Onion',
    summary:
      'La regla de dependencia, flujo de control vs dependencias, casos de uso, Onion y una comparación honesta con hexagonal y capas.',
    minutes: 14,
    group: 'Estilos',
    keywords: ['clean architecture', 'onion architecture', 'dependency rule', 'Uncle Bob', 'Palermo', 'use cases', 'vertical slice'],
    load: () => import('./clean-y-onion.mdx'),
  },
  {
    slug: 'ddd-estrategico',
    title: 'DDD estratégico',
    summary:
      'Lenguaje ubicuo, subdominios core, de soporte y genéricos, bounded contexts, patrones de context mapping y Event Storming.',
    minutes: 16,
    group: 'Domain-Driven Design',
    keywords: ['domain-driven design', 'bounded context', 'context map', 'anticorruption layer', 'subdomain', 'event storming', 'ubiquitous language'],
    load: () => import('./ddd-estrategico.mdx'),
  },
  {
    slug: 'ddd-tactico',
    title: 'DDD táctico',
    summary:
      'Value objects, entidades, agregados e invariantes, repositorios, servicios y eventos de dominio y factories, con un agregado Order completo.',
    minutes: 17,
    group: 'Domain-Driven Design',
    keywords: ['aggregate', 'value object', 'entity', 'repository', 'domain event', 'domain service', 'Vernon', 'invariants'],
    load: () => import('./ddd-tactico.mdx'),
  },
  {
    slug: 'microservicios',
    title: 'Microservicios',
    summary:
      'Cuándo sí y cuándo no, cómo partir un sistema, comunicación síncrona y asíncrona, datos por servicio, API gateway y BFF, y migración con strangler fig.',
    minutes: 19,
    group: 'Sistemas distribuidos',
    keywords: ['microservices', 'distributed monolith', 'strangler fig', 'API gateway', 'BFF', 'database per service', 'Prime Video'],
    load: () => import('./microservicios.mdx'),
  },
  {
    slug: 'event-driven',
    title: 'Arquitectura orientada a eventos',
    summary:
      'Comandos vs eventos, colas y logs, notificación vs transferencia de estado, event sourcing, CQRS con proyecciones y evolución de esquemas.',
    minutes: 18,
    group: 'Sistemas distribuidos',
    keywords: ['event-driven architecture', 'event sourcing', 'CQRS', 'Kafka', 'projections', 'schema evolution', 'event-carried state transfer'],
    load: () => import('./event-driven.mdx'),
  },
  {
    slug: 'sagas-y-outbox',
    title: 'Transacciones distribuidas',
    summary:
      'Límites de 2PC, sagas orquestadas y coreografiadas con compensaciones, outbox transaccional, CDC y consumidores idempotentes.',
    minutes: 16,
    group: 'Sistemas distribuidos',
    keywords: ['saga', 'two-phase commit', 'transactional outbox', 'Debezium', 'CDC', 'idempotent consumer', 'inbox', 'compensation'],
    load: () => import('./sagas-y-outbox.mdx'),
  },
  {
    slug: 'elegir-arquitectura',
    title: 'Cómo elegir una arquitectura',
    summary:
      'Una guía de decisión práctica, arquitectura evolutiva, fitness functions con ArchUnit, dependency-cruiser y k6, y el encaje con los equipos.',
    minutes: 15,
    group: 'Decidir',
    keywords: ['evolutionary architecture', 'fitness functions', 'ArchUnit', 'team topologies', 'architecture decision'],
    load: () => import('./elegir-arquitectura.mdx'),
  },
]
