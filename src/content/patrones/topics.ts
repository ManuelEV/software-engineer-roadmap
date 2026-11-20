import type { TopicDef } from '../types'

export const topics: TopicDef[] = [
  {
    slug: 'introduccion',
    title: 'Qué es un patrón (y SOLID)',
    summary:
      'De dónde salen los patrones, el mapa de los 23 del GoF, SOLID con antes y después, y cuándo no usar un patrón.',
    minutes: 16,
    keywords: ['design patterns', 'GoF', 'SOLID', 'composition over inheritance', 'YAGNI', 'SRP', 'OCP', 'LSP', 'ISP', 'DIP'],
    group: 'Fundamentos',
    load: () => import('./introduccion.mdx'),
  },
  {
    slug: 'creacionales',
    title: 'Patrones creacionales',
    summary:
      'Factory Method, Abstract Factory, Builder, Prototype y Singleton (y por qué desconfiar de él).',
    minutes: 20,
    keywords: ['creational patterns', 'factory', 'builder', 'prototype', 'singleton', 'abstract factory'],
    group: 'GoF',
    load: () => import('./creacionales.mdx'),
  },
  {
    slug: 'estructurales',
    title: 'Patrones estructurales',
    summary:
      'Adapter, Decorator, Facade, Proxy, Composite, Bridge y Flyweight.',
    minutes: 24,
    keywords: ['structural patterns', 'adapter', 'decorator', 'facade', 'proxy', 'composite', 'bridge', 'flyweight'],
    group: 'GoF',
    load: () => import('./estructurales.mdx'),
  },
  {
    slug: 'comportamiento-1',
    title: 'Comportamiento I',
    summary:
      'Strategy, Observer, Command y State: encapsular lo que varía, y la diferencia entre Strategy y State.',
    minutes: 22,
    keywords: ['behavioral patterns', 'strategy', 'observer', 'command', 'state', 'undo', 'state machine'],
    group: 'GoF',
    load: () => import('./comportamiento-1.mdx'),
  },
  {
    slug: 'comportamiento-2',
    title: 'Comportamiento II',
    summary:
      'Template Method, Chain of Responsibility, Iterator, Mediator, Memento y Visitor (más Interpreter).',
    minutes: 24,
    keywords: ['behavioral patterns', 'template method', 'chain of responsibility', 'iterator', 'mediator', 'memento', 'visitor', 'interpreter'],
    group: 'GoF',
    load: () => import('./comportamiento-2.mdx'),
  },
  {
    slug: 'patrones-aplicacion',
    title: 'Patrones de aplicación',
    summary:
      'Inyección de dependencias, Repository, Unit of Work, Specification, Result en lugar de excepciones, Middleware y Null Object.',
    minutes: 20,
    keywords: ['dependency injection', 'IoC', 'repository', 'unit of work', 'specification', 'result', 'either', 'middleware', 'null object'],
    group: 'Más allá del GoF',
    load: () => import('./patrones-aplicacion.mdx'),
  },
  {
    slug: 'patrones-resiliencia',
    title: 'Patrones cloud y de resiliencia',
    summary:
      'Timeout, Retry con jitter, Circuit Breaker, Bulkhead, cómo componerlos, Sidecar/Ambassador, Strangler Fig y Cache-Aside.',
    minutes: 20,
    keywords: ['resilience', 'retry', 'backoff', 'jitter', 'circuit breaker', 'bulkhead', 'timeout', 'sidecar', 'ambassador', 'strangler fig', 'cache-aside'],
    group: 'Más allá del GoF',
    load: () => import('./patrones-resiliencia.mdx'),
  },
  {
    slug: 'antipatrones',
    title: 'Antipatrones y code smells',
    summary:
      'God object, dominio anémico, abstracción prematura, monolito distribuido, el catálogo de code smells y cómo refactorizar sin romper.',
    minutes: 17,
    keywords: ['anti-patterns', 'code smells', 'god object', 'anemic domain model', 'golden hammer', 'speculative generality', 'distributed monolith', 'refactoring'],
    group: 'Más allá del GoF',
    load: () => import('./antipatrones.mdx'),
  },
]
