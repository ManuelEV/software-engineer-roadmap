import type { MDXContent } from 'mdx/types'

export type UnitId = 'arquitectura' | 'system-design' | 'casos' | 'patrones' | 'ia'

/** One topic ("tema") as declared in each unit's topics.ts */
export interface TopicDef {
  /** URL slug, kebab-case, unique inside the unit */
  slug: string
  /** Topic name, short (<= 40 chars ideally) */
  title: string
  /** One or two sentences: what the reader will understand after this page */
  summary: string
  /** Estimated reading minutes */
  minutes: number
  /** Extra search terms (English synonyms welcome) */
  keywords?: string[]
  /** Optional sub-group label inside a unit, e.g. "Fundamentos" */
  group?: string
  /** Lazy MDX loader: () => import('./slug.mdx') */
  load: () => Promise<{ default: MDXContent }>
}

/** A unit of the notebook (a coloured divider): Arquitectura, System Design… */
export interface UnitDef {
  id: UnitId
  /** 1-based position; topics are numbered `${number}.${index + 1}` */
  number: number
  title: string
  short: string
  description: string
  topics: TopicDef[]
}

export interface Topic extends TopicDef {
  unit: UnitDef
  index: number
  /** `${unit.id}/${slug}` */
  id: string
  /** Printed number, e.g. "2.4" */
  num: string
}
