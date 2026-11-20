import { useId, useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { WidgetFrame, Segmented, Slider, Stat } from '../kit'
import './Base62Encoder.css'

const ALPHABET = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ'
const EASE = [0.16, 1, 0.3, 1] as const
const SUP: Record<number, string> = { 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹', 10: '¹⁰' }

type Mode = 'encode' | 'space'

function toBase62(n: bigint): { code: string; steps: { q: bigint; r: number }[] } {
  if (n === 0n) return { code: '0', steps: [{ q: 0n, r: 0 }] }
  const steps: { q: bigint; r: number }[] = []
  let x = n
  let code = ''
  while (x > 0n) {
    const r = Number(x % 62n)
    const q = x / 62n
    steps.push({ q, r })
    code = ALPHABET[r] + code
    x = q
  }
  return { code, steps }
}

const fmtBig = (n: bigint) => n.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.')

function fmtHuman(n: number): string {
  if (n >= 1e12) return `${(n / 1e12).toLocaleString('es', { maximumFractionDigits: 1 })} billones`
  if (n >= 1e9) return `${(n / 1e9).toLocaleString('es', { maximumFractionDigits: 1 })} mil M`
  if (n >= 1e6) return `${(n / 1e6).toLocaleString('es', { maximumFractionDigits: 1 })} M`
  if (n >= 1e3) return `${(n / 1e3).toLocaleString('es', { maximumFractionDigits: 1 })} mil`
  return n.toLocaleString('es', { maximumFractionDigits: 2 })
}

function fmtPct(p: number): string {
  if (p >= 0.9995) return '≈ 100 %'
  if (p < 0.0001) return `${(p * 100).toExponential(1).replace('e', '·10^')} %`
  return `${(p * 100).toLocaleString('es', { maximumFractionDigits: p < 0.01 ? 3 : 1 })} %`
}

const PRESETS: { label: string; value: string }[] = [
  { label: '125', value: '125' },
  { label: '1 M', value: '1000000' },
  { label: '62⁶ − 1', value: '56800235583' },
  { label: '62⁷ − 1', value: '3521614606207' },
]

export function Base62Encoder() {
  const reduced = useReducedMotion()
  const inputId = useId()
  const [mode, setMode] = useState<Mode>('encode')
  const [raw, setRaw] = useState('2009215674938')
  const [len, setLen] = useState(7)
  const [urls, setUrls] = useState(9) // log10 of stored URLs

  const parsed = useMemo(() => {
    const clean = raw.replace(/[^\d]/g, '').slice(0, 22)
    if (!clean) return null
    return BigInt(clean)
  }, [raw])

  const enc = useMemo(() => (parsed === null ? null : toBase62(parsed)), [parsed])

  // ---- code space numbers
  const space = Math.pow(62, len)
  const n = Math.pow(10, urls)
  // birthday approximation: probability of at least one collision among n random codes
  const pAny = 1 - Math.exp(-(n * n) / (2 * space))
  // probability that the NEXT random code collides with an existing one
  const pNext = Math.min(1, n / space)
  const fill = Math.min(1, n / space)
  // years until exhaustion at 100M new URLs / month (assumption used in the text)
  const years = space / (100e6 * 12)

  return (
    <WidgetFrame
      caption={
        mode === 'encode'
          ? 'Base62 es solo cambiar de base: divides por 62 una y otra vez y cada resto es un carácter. Escribe un ID y mira cómo nace el código corto.'
          : 'Cuánto espacio te da cada longitud de código y qué tan rápido aparecen colisiones si generas códigos al azar (paradoja del cumpleaños).'
      }
      controls={
        <Segmented<Mode>
          label="Vista"
          value={mode}
          onChange={setMode}
          options={[
            { value: 'encode', label: 'Codificar un ID' },
            { value: 'space', label: 'Espacio y colisiones' },
          ]}
        />
      }
      readout={
        mode === 'encode' ? (
          <p>
            Un contador global de 64 bits nunca repite, así que no hay colisiones que revisar. El precio: los
            códigos son <b>predecibles</b> (el siguiente a <code>{enc?.code ?? '…'}</code> es fácil de adivinar) y
            necesitas coordinar el contador entre servidores.
          </p>
        ) : (
          <div className="b62-stats">
            <Stat label={`Códigos posibles con ${len} caracteres`} value={fmtHuman(space)} />
            <Stat label="Ocupación del espacio" value={fmtPct(fill)} tone={fill > 0.5 ? 'bad' : fill > 0.05 ? 'warn' : undefined} />
            <Stat
              label="P(el próximo código aleatorio choca)"
              value={fmtPct(pNext)}
              tone={pNext > 0.01 ? 'bad' : pNext > 0.0001 ? 'warn' : 'ok'}
            />
            <Stat
              label="P(al menos un choque en total)"
              value={fmtPct(pAny)}
              tone={pAny > 0.5 ? 'bad' : pAny > 0.01 ? 'warn' : 'ok'}
              hint="aprox. 1 − e^(−n²/2N)"
            />
            <Stat label="Años hasta agotarlo a 100 M/mes" value={years >= 1000 ? '+1.000' : fmtHuman(years)} />
          </div>
        )
      }
    >
      {mode === 'encode' ? (
        <div className="b62">
          <div className="b62-input">
            <label htmlFor={inputId} className="b62-label">
              ID numérico (salida del contador)
            </label>
            <input
              id={inputId}
              className="b62-field"
              inputMode="numeric"
              value={raw}
              onChange={(e) => setRaw(e.target.value)}
              aria-describedby={`${inputId}-hint`}
            />
            <div className="b62-presets" id={`${inputId}-hint`}>
              {PRESETS.map((p) => (
                <button key={p.value} type="button" className="btn btn--ghost b62-preset" onClick={() => setRaw(p.value)}>
                  {p.label}
                </button>
              ))}
            </div>
          </div>

          {enc && parsed !== null ? (
            <>
              <ol className="b62-steps" aria-label="Divisiones sucesivas por 62">
                <AnimatePresence initial={false}>
                  {enc.steps.map((s, i) => {
                    const dividend = i === 0 ? parsed : enc.steps[i - 1].q
                    return (
                      <motion.li
                        key={`${i}-${dividend.toString()}`}
                        className="b62-step"
                        initial={reduced ? { opacity: 0 } : { opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.25, delay: reduced ? 0 : i * 0.04, ease: EASE }}
                      >
                        <span className="b62-math">
                          {fmtBig(dividend)} ÷ 62 = {fmtBig(s.q)}
                        </span>
                        <span className="b62-rest">
                          resto <b>{s.r}</b>
                        </span>
                        <span className="b62-char" aria-label={`carácter ${ALPHABET[s.r]}`}>
                          {ALPHABET[s.r]}
                        </span>
                      </motion.li>
                    )
                  })}
                </AnimatePresence>
              </ol>
              <div className="b62-result">
                <span className="b62-label">Se leen los restos de abajo hacia arriba</span>
                <div className="b62-code" aria-live="polite">
                  <span className="b62-host">sho.rt/</span>
                  {enc.code.split('').map((c, i) => (
                    <motion.span
                      key={`${enc.code}-${i}`}
                      className="b62-codechar"
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      transition={{ duration: 0.2, delay: reduced ? 0 : 0.1 + i * 0.05 }}
                    >
                      {c}
                    </motion.span>
                  ))}
                </div>
                <span className="b62-meta">
                  {enc.code.length} caracteres · alfabeto 0–9 a–z A–Z
                </span>
              </div>
            </>
          ) : (
            <p className="b62-empty">Escribe un número entero positivo.</p>
          )}
        </div>
      ) : (
        <div className="b62">
          <div className="b62-sliders">
            <Slider label="Longitud del código" value={len} min={4} max={10} onChange={setLen} format={(v) => `${v} caracteres`} />
            <Slider
              label="URLs ya guardadas"
              value={urls}
              min={3}
              max={12}
              step={0.5}
              onChange={setUrls}
              format={(v) => fmtHuman(Math.pow(10, v))}
            />
          </div>
          <svg className="b62-bars" viewBox="0 0 420 196" role="img" aria-label="Tamaño del espacio de códigos por longitud, en escala logarítmica">
            {[4, 5, 6, 7, 8, 9, 10].map((L, i) => {
              const logv = L * Math.log10(62)
              const h = (logv / 18) * 130
              const x = 14 + i * 58
              const on = L === len
              return (
                <g key={L}>
                  <motion.rect
                    x={x}
                    width={40}
                    rx={4}
                    initial={false}
                    animate={{ y: 150 - h, height: h }}
                    transition={{ duration: reduced ? 0 : 0.3, ease: EASE }}
                    fill={on ? 'var(--line)' : 'var(--paper-3)'}
                    stroke={on ? 'var(--line)' : 'var(--rule-strong)'}
                    strokeWidth={1.5}
                  />
                  <text x={x + 20} y={172} textAnchor="middle" className="b62-axis">
                    {L}
                  </text>
                  <text x={x + 20} y={142 - h} textAnchor="middle" className={on ? 'b62-val is-on' : 'b62-val'}>
                    62{SUP[L]}
                  </text>
                </g>
              )
            })}
            {/* stored URLs marker, log scale */}
            <motion.line
              x1={8}
              x2={410}
              initial={false}
              animate={{ y1: 150 - (urls / 18) * 130, y2: 150 - (urls / 18) * 130 }}
              transition={{ duration: reduced ? 0 : 0.3, ease: EASE }}
              stroke="var(--bad)"
              strokeWidth={2}
              strokeDasharray="6 5"
            />
            <motion.text
              x={410}
              textAnchor="end"
              initial={false}
              animate={{ y: 144 - (urls / 18) * 130 }}
              transition={{ duration: reduced ? 0 : 0.3, ease: EASE }}
              className="b62-marker"
            >
              URLs guardadas
            </motion.text>
            <text x={8} y={192} className="b62-axis">
              caracteres (altura en escala log)
            </text>
          </svg>
        </div>
      )}
    </WidgetFrame>
  )
}
