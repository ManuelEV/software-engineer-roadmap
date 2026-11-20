import type { TopicDef } from '../types'

/** Unit 3: conceptual questions. */
export const topics: TopicDef[] = [
  {
    slug: 'estructuras-de-datos',
    title: 'Estructuras de datos: preguntas teóricas',
    summary:
      'Lo que te preguntan sin pedirte código: cómo funciona una tabla hash por dentro, arreglo contra lista enlazada, por qué las bases de datos usan árboles B y la tabla de complejidades.',
    minutes: 24,
    keywords: ['data structures', 'hash table', 'collisions', 'load factor', 'amortized', 'b-tree', 'big o cheat sheet', 'array vs linked list'],
    group: 'Preguntas conceptuales',
    load: () => import('./estructuras-de-datos.mdx'),
  },
  {
    slug: 'poo-y-solid',
    title: 'POO y SOLID en la entrevista',
    summary:
      'Los cuatro pilares, interfaz contra clase abstracta, composición contra herencia y SOLID explicado con ejemplos, como lo preguntan y como conviene responder.',
    minutes: 25,
    keywords: ['oop', 'object oriented programming', 'solid', 'encapsulation', 'polymorphism', 'interface vs abstract class', 'composition over inheritance', 'dependency injection'],
    group: 'Preguntas conceptuales',
    load: () => import('./poo-y-solid.mdx'),
  },
  {
    slug: 'backend-y-bases-de-datos',
    title: 'Backend, APIs y bases de datos',
    summary:
      'HTTP y REST, autenticación, SQL contra NoSQL, índices, transacciones y niveles de aislamiento, el problema N+1 y las consultas SQL que piden escribir en vivo.',
    minutes: 27,
    keywords: ['rest', 'http status codes', 'idempotency', 'jwt', 'oauth', 'sql vs nosql', 'index', 'acid', 'isolation levels', 'n+1', 'sql joins', 'window functions'],
    group: 'Preguntas conceptuales',
    load: () => import('./backend-y-bases-de-datos.mdx'),
  },
  {
    slug: 'concurrencia',
    title: 'Concurrencia y paralelismo',
    summary:
      'Procesos e hilos, condiciones de carrera, locks, deadlocks, async/await y el event loop: las preguntas de concurrencia y cómo explicarlas sin enredarte.',
    minutes: 27,
    keywords: ['concurrency', 'parallelism', 'thread', 'process', 'race condition', 'mutex', 'semaphore', 'deadlock', 'event loop', 'async await', 'optimistic locking'],
    group: 'Preguntas conceptuales',
    load: () => import('./concurrencia.mdx'),
  },
  {
    slug: 'diseno-orientado-a-objetos',
    title: 'Diseño orientado a objetos (LLD)',
    summary:
      'La entrevista de low-level design: de los requisitos a las clases, relaciones y patrones, con un estacionamiento resuelto de principio a fin.',
    minutes: 24,
    keywords: ['low level design', 'lld', 'object oriented design', 'ood', 'parking lot', 'class diagram', 'uml', 'machine coding'],
    group: 'Preguntas conceptuales',
    load: () => import('./diseno-orientado-a-objetos.mdx'),
  },
  {
    slug: 'practicas-de-ingenieria',
    title: 'Testing, Git y prácticas de equipo',
    summary:
      'Las preguntas sobre cómo trabajas: la pirámide de tests, mocks, merge contra rebase, CI/CD, revisiones de código, observabilidad y cómo depuras un incidente.',
    minutes: 23,
    keywords: ['testing pyramid', 'unit test', 'integration test', 'mocks', 'git merge vs rebase', 'ci cd', 'code review', 'observability', 'debugging', 'incident'],
    group: 'Preguntas conceptuales',
    load: () => import('./practicas-de-ingenieria.mdx'),
  },
]
