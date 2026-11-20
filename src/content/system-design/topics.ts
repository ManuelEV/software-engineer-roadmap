import type { TopicDef } from '../types'

export const topics: TopicDef[] = [
  {
    slug: 'metodo-entrevista',
    title: 'El método de la entrevista',
    summary:
      'Un marco de 45 minutos: requisitos, entidades, API, diseño de alto nivel y profundizaciones; qué se evalúa en cada nivel y un ejemplo resuelto.',
    minutes: 15,
    keywords: ['system design interview', 'framework', 'requisitos', 'requirements', 'deep dive', 'mid senior staff'],
    group: 'Método',
    load: () => import('./metodo-entrevista.mdx'),
  },
  {
    slug: 'estimaciones',
    title: 'Estimaciones rápidas',
    summary:
      'Cálculos de servilleta: QPS, almacenamiento, ancho de banda, la ley de Little y los números de latencia que todo ingeniero debe saber.',
    minutes: 14,
    keywords: ['back of the envelope', 'napkin math', 'latency numbers', 'QPS', 'little law', 'nueves', 'availability'],
    group: 'Método',
    load: () => import('./estimaciones.mdx'),
  },
  {
    slug: 'escalabilidad',
    title: 'Escalar de 1 a millones',
    summary:
      'Carga y percentiles, escalado vertical y horizontal, servicios sin estado, la evolución de 1 a millones de usuarios y los límites de agregar máquinas.',
    minutes: 15,
    keywords: ['scalability', 'scale up', 'scale out', 'stateless', 'sticky sessions', 'USL', 'autoscaling', 'tail latency'],
    group: 'Bloques',
    load: () => import('./escalabilidad.mdx'),
  },
  {
    slug: 'balanceo-de-carga',
    title: 'Balanceo de carga',
    summary:
      'L4 vs L7, algoritmos (round robin, least request, P2C, hash), health checks, sticky sessions y balanceo global con DNS y anycast.',
    minutes: 15,
    keywords: ['load balancer', 'L4', 'L7', 'round robin', 'least connections', 'power of two choices', 'health check', 'sticky sessions', 'anycast', 'GeoDNS'],
    group: 'Bloques',
    load: () => import('./balanceo-de-carga.mdx'),
  },
  {
    slug: 'caching',
    title: 'Caché y CDN',
    summary:
      'Dónde cachear, cache-aside y write-through, invalidación, LRU/LFU, estampidas, claves calientes y CDN.',
    minutes: 16,
    keywords: ['cache-aside', 'write-through', 'write-behind', 'TTL', 'LRU', 'LFU', 'thundering herd', 'cache stampede', 'hot key', 'CDN', 'Cache-Control'],
    group: 'Bloques',
    load: () => import('./caching.mdx'),
  },
  {
    slug: 'bases-de-datos',
    title: 'Bases de datos',
    summary:
      'Familias de bases de datos, ACID, niveles de aislamiento y sus anomalías, B-tree vs LSM y cómo elegir.',
    minutes: 15,
    keywords: ['SQL', 'NoSQL', 'ACID', 'isolation levels', 'snapshot isolation', 'write skew', 'lost update', 'B-tree', 'LSM', 'index', 'Cassandra', 'DynamoDB'],
    group: 'Datos',
    load: () => import('./bases-de-datos.mdx'),
  },
  {
    slug: 'replicacion-y-sharding',
    title: 'Replicación y sharding',
    summary:
      'Líder-seguidor, multi-líder y sin líder; lag de réplicas; particionado por rango y hash; hashing consistente y particiones calientes.',
    minutes: 17,
    keywords: ['replication', 'read replicas', 'failover', 'read your writes', 'sharding', 'partitioning', 'consistent hashing', 'virtual nodes', 'hot partition'],
    group: 'Datos',
    load: () => import('./replicacion-y-sharding.mdx'),
  },
  {
    slug: 'consistencia',
    title: 'Consistencia, CAP y consenso',
    summary:
      'Modelos de consistencia, CAP bien explicado, PACELC, quórums N/R/W, consenso con Raft y fencing tokens.',
    minutes: 16,
    keywords: ['linearizability', 'CAP', 'PACELC', 'quorum', 'Raft', 'consensus', 'distributed lock', 'fencing token'],
    group: 'Datos',
    load: () => import('./consistencia.mdx'),
  },
  {
    slug: 'colas-y-streaming',
    title: 'Colas y streaming',
    summary:
      'Colas, pub/sub y logs; Kafka (particiones y grupos); garantías de entrega, idempotencia, outbox, DLQ y backpressure.',
    minutes: 16,
    keywords: ['message queue', 'pub/sub', 'Kafka', 'consumer group', 'exactly-once', 'idempotency', 'outbox', 'dead letter queue', 'backpressure'],
    group: 'Comunicación',
    load: () => import('./colas-y-streaming.mdx'),
  },
  {
    slug: 'apis',
    title: 'APIs y tiempo real',
    summary:
      'REST, gRPC y GraphQL, paginación por cursor, idempotency keys, versionado y tiempo real: polling, SSE y WebSockets.',
    minutes: 16,
    keywords: ['idempotency key', 'cursor pagination', 'keyset', 'websocket', 'sse', 'long polling', 'grpc', 'graphql', 'api gateway', 'versioning'],
    group: 'Comunicación',
    load: () => import('./apis.mdx'),
  },
  {
    slug: 'confiabilidad',
    title: 'Confiabilidad',
    summary:
      'SLOs y error budgets, timeouts, reintentos con backoff y jitter, circuit breakers, rate limiting, load shedding y observabilidad.',
    minutes: 17,
    keywords: ['rate limiter', 'token bucket', 'sliding window', 'exponential backoff', 'jitter', 'circuit breaker', 'bulkhead', 'load shedding', 'SLO', 'SLI', 'error budget', 'observability', 'tracing'],
    group: 'Operación',
    load: () => import('./confiabilidad.mdx'),
  },
  {
    slug: 'piezas-especiales',
    title: 'IDs, búsqueda, geo y blobs',
    summary:
      'Generación de IDs únicos, índices invertidos, geohash/quadtree y almacenamiento de objetos.',
    minutes: 16,
    keywords: ['snowflake', 'uuidv7', 'ulid', 'unique id', 'inverted index', 'elasticsearch', 'bm25', 'geohash', 'quadtree', 's2', 'h3', 'presigned url', 's3', 'multipart upload', 'blob storage'],
    group: 'Operación',
    load: () => import('./piezas-especiales.mdx'),
  },
]
