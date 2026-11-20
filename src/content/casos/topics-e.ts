import type { TopicDef } from '../types'

/** Unit 3, last part: behavioural interview and closing the process. */
export const topics: TopicDef[] = [
  {
    slug: 'entrevista-conductual',
    title: 'La entrevista conductual y el método STAR',
    summary:
      'Qué evalúan con "cuéntame de una vez que…", cómo armar un banco de historias, el método STAR y las preguntas típicas: conflicto, fracaso, liderazgo y prioridades.',
    minutes: 23,
    keywords: ['behavioral interview', 'star method', 'tell me about a time', 'conflict', 'failure', 'leadership', 'story bank', 'leadership principles'],
    group: 'Conductual y cierre',
    load: () => import('./entrevista-conductual.mdx'),
  },
  {
    slug: 'hablame-de-ti',
    title: '"Háblame de ti" y las preguntas personales',
    summary:
      'Tu presentación de dos minutos, por qué esta empresa, por qué te vas, tus debilidades, las preguntas que tú haces al final y cómo manejar una entrevista en inglés.',
    minutes: 19,
    keywords: ['tell me about yourself', 'why this company', 'weaknesses', 'questions to ask the interviewer', 'english interview', 'red flags', 'culture fit'],
    group: 'Conductual y cierre',
    load: () => import('./hablame-de-ti.mdx'),
  },
  {
    slug: 'oferta-y-negociacion',
    title: 'Expectativas, oferta y negociación',
    summary:
      'Cómo responder la pregunta del sueldo, comparar ofertas (base, bonos, acciones, contrato local o en dólares) y negociar sin quemar la relación.',
    minutes: 18,
    keywords: ['salary expectations', 'offer negotiation', 'compensation', 'equity', 'contractor', 'remote', 'counter offer', 'multiple offers'],
    group: 'Conductual y cierre',
    load: () => import('./oferta-y-negociacion.mdx'),
  },
]
