import type { TopicDef } from '../types'
import { topics as entrevistaYCodigo } from './topics-c'
import { topics as conceptuales } from './topics-d'
import { topics as a } from './topics-a'
import { topics as b } from './topics-b'
import { topics as conductual } from './topics-e'

/**
 * Unit 3, "Entrevistas técnicas", in the order an interview process usually
 * runs: the process, live coding, conceptual questions, system design cases,
 * then the behavioural round and the offer. (The id stays `casos` so the
 * system design URLs keep working.)
 */
export const topics: TopicDef[] = [
  ...entrevistaYCodigo,
  ...conceptuales,
  ...[...a, ...b].map((t) => ({ ...t, group: 'System design' })),
  ...conductual,
]
