import { useMemo, useState } from 'react'
import { LayoutGroup, motion, useReducedMotion } from 'motion/react'
import { Compass, Music2, Repeat2, User } from 'lucide-react'
import { WidgetFrame, Segmented, Slider } from '../kit'
import './RecommendationFunnel.css'

type Source = 'seguidos' | 'similares' | 'tendencia' | 'exploración'

interface Video {
  id: number
  title: string
  creator: string
  sound: string
  source: Source
  /** model predictions for THIS user (made-up numbers for the demo) */
  pFinish: number
  pLike: number
  pShare: number
}

const POOL: Video[] = [
  { id: 1, title: 'Arepas en 30 s', creator: '@cocina_ana', sound: 'Original', source: 'similares', pFinish: 0.62, pLike: 0.08, pShare: 0.02 },
  { id: 2, title: 'Arepas, parte 2', creator: '@cocina_ana', sound: 'Original', source: 'seguidos', pFinish: 0.6, pLike: 0.07, pShare: 0.01 },
  { id: 3, title: 'Truco de guitarra', creator: '@riff_mx', sound: 'Viral A', source: 'similares', pFinish: 0.45, pLike: 0.1, pShare: 0.03 },
  { id: 4, title: 'Gato contra pepino', creator: '@michi_tv', sound: 'Viral A', source: 'tendencia', pFinish: 0.7, pLike: 0.12, pShare: 0.09 },
  { id: 5, title: 'Gol en el 90', creator: '@futbolazo', sound: 'Narración', source: 'tendencia', pFinish: 0.52, pLike: 0.09, pShare: 0.06 },
  { id: 6, title: 'CSS grid en 1 min', creator: '@dev_cami', sound: 'Lo-fi', source: 'similares', pFinish: 0.4, pLike: 0.06, pShare: 0.05 },
  { id: 7, title: 'Rutina de 5 min', creator: '@fit_leo', sound: 'Viral B', source: 'tendencia', pFinish: 0.35, pLike: 0.05, pShare: 0.02 },
  { id: 8, title: 'Baile del momento', creator: '@dance_sol', sound: 'Viral A', source: 'tendencia', pFinish: 0.5, pLike: 0.16, pShare: 0.04 },
  { id: 9, title: 'Volcán en Islandia', creator: '@geo_nico', sound: 'Ambiente', source: 'exploración', pFinish: 0.46, pLike: 0.07, pShare: 0.07 },
  { id: 10, title: 'Arepas con queso', creator: '@cocina_ana', sound: 'Original', source: 'seguidos', pFinish: 0.57, pLike: 0.06, pShare: 0.01 },
  { id: 11, title: 'El gato duerme raro', creator: '@michi_tv', sound: 'Original', source: 'similares', pFinish: 0.67, pLike: 0.11, pShare: 0.05 },
  { id: 12, title: 'Debug en vivo', creator: '@dev_cami', sound: 'Lo-fi', source: 'seguidos', pFinish: 0.38, pLike: 0.05, pShare: 0.03 },
  { id: 13, title: 'Roma en 60 s', creator: '@historia_ya', sound: 'Narración', source: 'exploración', pFinish: 0.44, pLike: 0.06, pShare: 0.08 },
]

const FEED = 8

interface Ranked extends Video {
  score: number
  pureRank: number
  note?: string
}

function rank(weights: { watch: number; like: number; share: number }): Ranked[] {
  return POOL.map((v) => ({
    ...v,
    // value model: weighted sum of predicted probabilities (likes/shares are rarer, so they are scaled up)
    score: weights.watch * v.pFinish + weights.like * v.pLike * 5 + weights.share * v.pShare * 8,
    pureRank: 0,
  }))
    .sort((a, b) => b.score - a.score)
    .map((v, i) => ({ ...v, pureRank: i + 1 }))
}

/** Greedy re-ranking: no same creator / sound back-to-back, and one exploration slot in the top 5. */
function rerank(list: Ranked[]): Ranked[] {
  const remaining = [...list]
  const out: Ranked[] = []
  while (out.length < FEED && remaining.length) {
    const prev = out[out.length - 1]
    const pos = out.length
    const hasExplore = out.some((v) => v.source === 'exploración')
    let idx = -1
    if (pos === 3 && !hasExplore) {
      idx = remaining.findIndex((v) => v.source === 'exploración' && (!prev || (v.creator !== prev.creator && v.sound !== prev.sound)))
      if (idx >= 0) {
        const [v] = remaining.splice(idx, 1)
        out.push({ ...v, note: 'slot de exploración' })
        continue
      }
    }
    idx = remaining.findIndex((v) => !prev || (v.creator !== prev.creator && v.sound !== prev.sound))
    if (idx < 0) idx = 0
    const [v] = remaining.splice(idx, 1)
    out.push(v)
  }
  // annotate demotions: items whose position got worse because of a rule
  return out.map((v, i) => {
    if (v.note) return v
    const delta = i + 1 - v.pureRank
    if (delta > 0) return { ...v, note: 'bajó: evitar repetir creador o sonido' }
    if (delta < 0) return { ...v, note: 'subió al apartarse otro' }
    return v
  })
}

const STAGES = [
  { label: 'Catálogo', value: 'miles de M' },
  { label: 'Recuperación', value: '~ miles' },
  { label: 'Pre-ranking', value: '~ cientos' },
  { label: 'Ranking', value: `${POOL.length} aquí` },
  { label: 'Re-ranking', value: `${FEED} al feed` },
]

const sourceLabel: Record<Source, string> = {
  seguidos: 'de cuentas que sigues',
  similares: 'similar a lo que viste',
  tendencia: 'tendencia en tu región',
  exploración: 'fuera de tus intereses',
}

export function RecommendationFunnel() {
  const reduced = useReducedMotion()
  const [watch, setWatch] = useState(2)
  const [like, setLike] = useState(1)
  const [share, setShare] = useState(1)
  const [diversity, setDiversity] = useState<'on' | 'off'>('on')

  const ranked = useMemo(() => rank({ watch, like, share }), [watch, like, share])
  const feed = useMemo(() => (diversity === 'on' ? rerank(ranked) : ranked.slice(0, FEED)), [ranked, diversity])
  const maxScore = ranked[0]?.score || 1

  const violations = feed.reduce((n, v, i) => {
    const p = feed[i - 1]
    return n + (p && (p.creator === v.creator || p.sound === v.sound) ? 1 : 0)
  }, 0)

  return (
    <WidgetFrame
      caption="El embudo de un feed tipo Para ti. Mueve los pesos del modelo de valor y mira cómo cambia el orden; apaga el re-ranking para ver lo que pasaría si solo ordenaras por puntaje."
      controls={
        <>
          <Slider label="Peso: ver completo" value={watch} min={0} max={3} step={0.25} onChange={setWatch} format={(v) => v.toFixed(2)} />
          <Slider label="Peso: like" value={like} min={0} max={3} step={0.25} onChange={setLike} format={(v) => v.toFixed(2)} />
          <Slider label="Peso: compartir" value={share} min={0} max={3} step={0.25} onChange={setShare} format={(v) => v.toFixed(2)} />
          <Segmented
            label="Re-ranking con reglas"
            value={diversity}
            onChange={setDiversity}
            options={[
              { value: 'on', label: 'Activado' },
              { value: 'off', label: 'Solo puntaje' },
            ]}
          />
        </>
      }
      readout={
        <p>
          {diversity === 'on'
            ? 'Con reglas: nunca dos videos seguidos del mismo creador o con el mismo sonido, y un hueco en la posición 4 para algo fuera de tus intereses. Pierdes un poco de puntaje inmediato a cambio de no aburrir al usuario y de seguir aprendiendo sobre él.'
            : `Solo puntaje: ${violations} ${violations === 1 ? 'repetición' : 'repeticiones'} consecutiva${violations === 1 ? '' : 's'} de creador o sonido, y ningún contenido de exploración garantizado. El modelo maximiza el siguiente video, no la sesión.`}
        </p>
      }
    >
      <div className="rf">
        <ol className="rf-funnel" aria-label="Etapas del embudo">
          {STAGES.map((s, i) => (
            <li key={s.label} className={`rf-stage ${i >= 3 ? 'is-here' : ''}`}>
              <span className="rf-dot" aria-hidden="true" />
              <span className="rf-stage-label">{s.label}</span>
              <span className="rf-stage-val">{s.value}</span>
            </li>
          ))}
        </ol>

        <LayoutGroup>
          <ol className="rf-list" aria-label="Feed resultante">
            {feed.map((v, i) => {
              const prev = feed[i - 1]
              const clash = prev && (prev.creator === v.creator || prev.sound === v.sound)
              return (
                <motion.li
                  key={v.id}
                  layout={!reduced}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  className={`rf-item ${clash ? 'is-clash' : ''} ${v.source === 'exploración' ? 'is-explore' : ''}`}
                >
                  <span className="rf-rank" aria-label={`posición ${i + 1}`}>
                    {i + 1}
                  </span>
                  <div className="rf-body">
                    <div className="rf-title">{v.title}</div>
                    <div className="rf-meta">
                      <span>
                        <User size={13} aria-hidden="true" /> {v.creator}
                      </span>
                      <span>
                        <Music2 size={13} aria-hidden="true" /> {v.sound}
                      </span>
                      <span>
                        {v.source === 'exploración' ? <Compass size={13} aria-hidden="true" /> : null} {sourceLabel[v.source]}
                      </span>
                    </div>
                    {clash && (
                      <div className="rf-note is-bad">
                        <Repeat2 size={13} aria-hidden="true" /> repite {prev.creator === v.creator ? 'creador' : 'sonido'} con el anterior
                      </div>
                    )}
                    {!clash && v.note && <div className="rf-note">{v.note}</div>}
                  </div>
                  <div className="rf-score" aria-label={`puntaje ${v.score.toFixed(2)}`}>
                    <div className="rf-bar">
                      <motion.div
                        className="rf-fill"
                        initial={false}
                        animate={{ width: `${(v.score / maxScore) * 100}%` }}
                        transition={{ duration: reduced ? 0 : 0.3 }}
                      />
                    </div>
                    <span className="rf-num">{v.score.toFixed(2)}</span>
                  </div>
                </motion.li>
              )
            })}
          </ol>
        </LayoutGroup>
      </div>
    </WidgetFrame>
  )
}
