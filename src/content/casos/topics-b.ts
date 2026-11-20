import type { TopicDef } from '../types'

export const topics: TopicDef[] = [
  {
    slug: 'uber',
    title: 'Uber: viajes en tiempo real',
    summary:
      'Ubicación de conductores, índices geoespaciales, matching y consistencia en la asignación.',
    minutes: 24,
    group: 'Tiempo real y geo',
    load: () => import('./uber.mdx'),
  },
  {
    slug: 'google-docs',
    title: 'Google Docs: edición colaborativa',
    summary:
      'OT vs CRDT, sincronización en tiempo real, cursores y versionado.',
    minutes: 22,
    group: 'Tiempo real y geo',
    load: () => import('./google-docs.mdx'),
  },
  {
    slug: 'dropbox',
    title: 'Dropbox: sincronización de archivos',
    summary:
      'Chunking, deduplicación, metadatos, sincronización entre dispositivos y conflictos.',
    minutes: 24,
    group: 'Almacenamiento',
    load: () => import('./dropbox.mdx'),
  },
  {
    slug: 'crawler',
    title: 'Web crawler',
    summary:
      'Frontera de URLs, politeness, deduplicación y cómo rastrear miles de millones de páginas.',
    minutes: 21,
    group: 'Infraestructura',
    load: () => import('./crawler.mdx'),
  },
  {
    slug: 'autocompletado',
    title: 'Autocompletado de búsqueda',
    summary:
      'Tries, top-k precalculado, agregación de datos y latencia de milisegundos.',
    minutes: 23,
    group: 'Infraestructura',
    load: () => import('./autocompletado.mdx'),
  },
  {
    slug: 'notificaciones',
    title: 'Sistema de notificaciones',
    summary:
      'Push, email y SMS: colas, preferencias, plantillas, reintentos y deduplicación.',
    minutes: 21,
    group: 'Infraestructura',
    load: () => import('./notificaciones.mdx'),
  },
  {
    slug: 'ticketmaster',
    title: 'Ticketmaster: venta de entradas',
    summary:
      'Contención extrema, reservas temporales, colas virtuales y evitar la doble venta.',
    minutes: 23,
    group: 'Transacciones',
    load: () => import('./ticketmaster.mdx'),
  },
  {
    slug: 'pagos',
    title: 'Sistema de pagos',
    summary:
      'Idempotencia, ledger de doble partida, conciliación y la integración con un PSP.',
    minutes: 22,
    group: 'Transacciones',
    load: () => import('./pagos.mdx'),
  },
]
