import { useId, useMemo, useState } from 'react'
import { Segmented, WidgetFrame } from '../kit'
import { fmt } from './shared'
import './InvertedIndex.css'

const DOCS = [
  'Zapatillas de running para mujer',
  'Zapatillas urbanas de cuero',
  'Camiseta de running transpirable',
  'Mochila urbana impermeable',
  'Chaqueta impermeable para running',
  'Calcetines de running, pack de 3',
]

const STOP = new Set(['de', 'para', 'la', 'el', 'los', 'las', 'y', 'con', 'en', 'un', 'una'])

/** Analyzer: lowercase → strip accents → split → stopwords → naive singular (drop final s). */
function analyze(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .split(/[^a-z0-9]+/)
    .filter((t) => t && !STOP.has(t))
    // a deliberately crude "stemmer": the same rule runs at index and query time
    .map((t) => (t.length > 3 && t.endsWith('s') ? t.slice(0, -1) : t))
}

export function InvertedIndex() {
  const id = useId()
  const [query, setQuery] = useState('running impermeables')
  const [op, setOp] = useState<'and' | 'or'>('and')

  const index = useMemo(() => {
    const m = new Map<string, Map<number, number>>()
    DOCS.forEach((d, i) => {
      analyze(d).forEach((t) => {
        if (!m.has(t)) m.set(t, new Map())
        const p = m.get(t)!
        p.set(i, (p.get(i) ?? 0) + 1)
      })
    })
    return new Map([...m.entries()].sort((a, b) => a[0].localeCompare(b[0])))
  }, [])

  const terms = [...new Set(analyze(query))]
  const postings = terms.map((t) => ({ t, docs: index.get(t) ?? new Map<number, number>() }))
  let matches: number[] = []
  if (terms.length) {
    const sets = postings.map((p) => new Set(p.docs.keys()))
    const all = DOCS.map((_, i) => i)
    matches = op === 'and' ? all.filter((i) => sets.every((s) => s.has(i))) : all.filter((i) => sets.some((s) => s.has(i)))
  }
  const N = DOCS.length
  const scored = matches
    .map((i) => ({
      i,
      score: postings.reduce((acc, p) => {
        const tf = p.docs.get(i) ?? 0
        const df = p.docs.size
        return acc + (tf && df ? tf * Math.log(1 + N / df) : 0)
      }, 0),
    }))
    .sort((a, b) => b.score - a.score)

  const termSet = new Set(terms)

  return (
    <WidgetFrame
      caption="Un índice invertido mapea cada término (ya normalizado) a la lista de documentos que lo contienen. Buscar es intersectar o unir listas, no recorrer documentos."
      controls={
        <>
          <label className="ii-q" htmlFor={id}>
            <span>Búsqueda</span>
            <input id={id} type="search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="p. ej. zapatilla urbana" />
          </label>
          <Segmented
            label="Operador"
            value={op}
            options={[
              { value: 'and', label: 'AND' },
              { value: 'or', label: 'OR' },
            ]}
            onChange={setOp}
          />
        </>
      }
      readout={
        <div className="ii-readout">
          <p>
            Términos tras el análisis:{' '}
            {terms.length ? terms.map((t) => <code key={t} className="ii-term">{t}</code>) : <em>ninguno</em>}
          </p>
          <ol className="ii-results">
            {scored.length === 0 && <li className="ii-none">Sin resultados.</li>}
            {scored.map(({ i, score }) => (
              <li key={i}>
                <span className="ii-doc">d{i + 1}</span> {DOCS[i]} <span className="ii-score">score {fmt(score, 2)}</span>
              </li>
            ))}
          </ol>
        </div>
      }
    >
      <div className="ii-layout">
        <div>
          <h4 className="ii-h">Documentos</h4>
          <ol className="ii-docs">
            {DOCS.map((d, i) => (
              <li key={i} className={matches.includes(i) ? 'is-hit' : ''}>
                <span className="ii-doc">d{i + 1}</span> {d}
              </li>
            ))}
          </ol>
        </div>
        <div>
          <h4 className="ii-h">Índice invertido</h4>
          <dl className="ii-index">
            {[...index.entries()].map(([t, docs]) => (
              <div key={t} className={`ii-row ${termSet.has(t) ? 'is-q' : ''}`}>
                <dt>{t}</dt>
                <dd>
                  {[...docs.keys()].map((d) => (
                    <span key={d} className={`ii-post ${matches.includes(d) && termSet.has(t) ? 'is-hit' : ''}`}>
                      d{d + 1}
                    </span>
                  ))}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </WidgetFrame>
  )
}
