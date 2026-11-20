import { type ReactNode, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ChevronLeft, ChevronRight, Eye, EyeOff, Shuffle } from 'lucide-react'
import { Segmented, WidgetFrame } from '../kit'
import './QuestionDeck.css'

export type Level = 'junior' | 'semi' | 'senior'

export interface QuestionCard {
  /** the question as the interviewer would ask it */
  q: string
  /** what the interviewer is really checking with it (one line) */
  checks?: string
  level?: Level
  /** a model answer, short enough to say out loud */
  answer: ReactNode
  /** what makes an answer stand out */
  strong?: string[]
  /** what sinks an answer */
  weak?: string[]
  /** likely follow-up questions */
  followups?: string[]
}

const LEVEL_LABEL: Record<Level, string> = { junior: 'Junior', semi: 'Semi senior', senior: 'Senior' }

/**
 * Practice cards: read the question, answer it out loud, then reveal a model
 * answer with the signals an interviewer listens for. Nothing is saved.
 */
export function QuestionDeck({ cards, caption, title = 'Practica' }: { cards: QuestionCard[]; caption?: ReactNode; title?: string }) {
  const reduced = useReducedMotion()
  const levels = (['junior', 'semi', 'senior'] as Level[]).filter((l) => cards.some((c) => c.level === l))
  const [level, setLevel] = useState<'all' | Level>('all')
  const [order, setOrder] = useState<number[]>(() => cards.map((_, k) => k))
  const [pos, setPos] = useState(0)
  const [shown, setShown] = useState(false)

  const list = order.filter((k) => level === 'all' || cards[k].level === level)
  const at = Math.min(pos, Math.max(0, list.length - 1))
  const card = cards[list[at]]

  const move = (d: number) => {
    setPos((p) => (Math.min(p, list.length - 1) + d + list.length) % list.length)
    setShown(false)
  }
  const shuffle = () => {
    const next = [...order]
    for (let k = next.length - 1; k > 0; k--) {
      const j = Math.floor(Math.random() * (k + 1))
      ;[next[k], next[j]] = [next[j], next[k]]
    }
    setOrder(next)
    setPos(0)
    setShown(false)
  }

  if (!card) return null

  return (
    <WidgetFrame
      title={title}
      caption={caption ?? 'Lee la pregunta, respóndela en voz alta como si estuvieras en la entrevista y recién ahí revela la respuesta.'}
      controls={
        <>
          {levels.length > 1 && (
            <Segmented
              label="Nivel"
              value={level}
              onChange={(v) => {
                setLevel(v)
                setPos(0)
                setShown(false)
              }}
              options={[{ value: 'all', label: 'Todas' }, ...levels.map((l) => ({ value: l, label: LEVEL_LABEL[l] }))]}
            />
          )}
          <button type="button" className="btn btn--ghost qd-shuffle" onClick={shuffle}>
            <Shuffle size={15} /> Mezclar
          </button>
        </>
      }
    >
      <div className="qd">
        <div className="qd__top">
          <span className="qd__count">
            Pregunta {at + 1} <span>de {list.length}</span>
          </span>
          {card.level && <span className="line-badge qd__level">{LEVEL_LABEL[card.level]}</span>}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={list[at]}
            initial={{ opacity: 0, x: reduced ? 0 : 12 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: reduced ? 0 : -12 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="qd__q">{card.q}</p>
            {card.checks && (
              <p className="qd__checks">
                <span className="hand">qué busca:</span> {card.checks}
              </p>
            )}

            <button type="button" className={`btn ${shown ? '' : 'btn--line'} qd__reveal`} onClick={() => setShown((s) => !s)} aria-expanded={shown}>
              {shown ? <EyeOff size={15} /> : <Eye size={15} />}
              {shown ? 'Ocultar respuesta' : 'Revelar respuesta'}
            </button>

            <AnimatePresence initial={false}>
              {shown && (
                <motion.div
                  className="qd__answer"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: 'auto' }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.28, ease: [0.16, 1, 0.3, 1] }}
                >
                  <div className="qd__answer-inner">
                    <div className="qd__model">{card.answer}</div>
                    {(card.strong?.length || card.weak?.length) && (
                      <div className="qd__signals">
                        {card.strong?.length ? (
                          <div className="qd__sig qd__sig--ok">
                            <h4>Suma puntos</h4>
                            <ul>
                              {card.strong.map((s) => (
                                <li key={s}>{s}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                        {card.weak?.length ? (
                          <div className="qd__sig qd__sig--bad">
                            <h4>Resta puntos</h4>
                            <ul>
                              {card.weak.map((s) => (
                                <li key={s}>{s}</li>
                              ))}
                            </ul>
                          </div>
                        ) : null}
                      </div>
                    )}
                    {card.followups?.length ? (
                      <div className="qd__follow">
                        <h4>Repreguntas probables</h4>
                        <ul>
                          {card.followups.map((s) => (
                            <li key={s}>{s}</li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </AnimatePresence>

        <div className="qd__nav">
          <button type="button" className="btn" onClick={() => move(-1)} disabled={list.length < 2}>
            <ChevronLeft size={16} /> Anterior
          </button>
          <button type="button" className="btn" onClick={() => move(1)} disabled={list.length < 2}>
            Siguiente <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </WidgetFrame>
  )
}
