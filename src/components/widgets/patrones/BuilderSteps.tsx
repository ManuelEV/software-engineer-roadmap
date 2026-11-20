import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Check, Hammer, RotateCcw, TriangleAlert } from 'lucide-react'
import { Segmented, WidgetFrame } from '../kit'
import { CodeBlock } from '../../mdx/CodeBlock'
import './BuilderSteps.css'

type StepId = 'url' | 'post' | 'auth' | 'json' | 'body' | 'timeout' | 'retries'

const STEPS: { id: StepId; label: string; call: string; required?: boolean }[] = [
  { id: 'url', label: 'URL', call: ".url('https://api.tienda.com/pedidos')", required: true },
  { id: 'post', label: 'Método POST', call: ".method('POST')" },
  { id: 'auth', label: 'Token', call: ".bearer(token)" },
  { id: 'json', label: 'Content-Type', call: ".header('Content-Type', 'application/json')" },
  { id: 'body', label: 'Cuerpo', call: '.body({ sku: "LAP-15", qty: 1 })' },
  { id: 'timeout', label: 'Timeout 5 s', call: '.timeout(5_000)' },
  { id: 'retries', label: '3 reintentos', call: '.retries(3)' },
]

const ease = [0.16, 1, 0.3, 1] as const

function validate(on: Set<StepId>): string | null {
  if (!on.has('url')) return 'Falta la URL: es el único paso obligatorio.'
  if (on.has('post') && !on.has('body')) return 'Un POST de pedido necesita cuerpo.'
  if (on.has('body') && !on.has('post')) return 'Una petición GET no debería llevar cuerpo.'
  return null
}

function resultObject(on: Set<StepId>) {
  const headers: Record<string, string> = {}
  if (on.has('auth')) headers.Authorization = 'Bearer eyJhbGciOi…'
  if (on.has('json')) headers['Content-Type'] = 'application/json'
  const obj: Record<string, unknown> = {
    method: on.has('post') ? 'POST' : 'GET',
    url: 'https://api.tienda.com/pedidos',
    headers,
    body: on.has('body') ? { sku: 'LAP-15', qty: 1 } : null,
    timeoutMs: on.has('timeout') ? 5000 : 30000,
    retries: on.has('retries') ? 3 : 0,
  }
  return JSON.stringify(obj, null, 2)
}

export function BuilderSteps() {
  const reduced = useReducedMotion()
  const [mode, setMode] = useState<'builder' | 'telescopic'>('builder')
  const [on, setOn] = useState<Set<StepId>>(new Set(['url']))
  const [built, setBuilt] = useState<{ ok: boolean; text: string } | null>(null)

  const toggle = (id: StepId) => {
    setOn((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
    setBuilt(null)
  }

  const build = () => {
    const err = validate(on)
    setBuilt(err ? { ok: false, text: err } : { ok: true, text: resultObject(on) })
  }

  const chain = STEPS.filter((s) => on.has(s.id))
  const builderCode = ['const req = new HttpRequestBuilder()', ...chain.map((s) => '  ' + s.call), '  .build()'].join('\n')

  const arg = (id: StepId, v: string) => (on.has(id) ? v : 'undefined')
  const telescopic = [
    '// ¿Cuál es cuál? El orden de los argumentos es la documentación.',
    'const req = new HttpRequest(',
    `  ${arg('url', "'https://api.tienda.com/pedidos'")},`,
    `  ${on.has('post') ? "'POST'" : "'GET'"},`,
    `  ${arg('auth', 'token')},`,
    `  ${arg('json', "'application/json'")},`,
    `  ${arg('body', '{ sku: "LAP-15", qty: 1 }')},`,
    `  ${arg('timeout', '5000')},`,
    `  ${arg('retries', '3')},`,
    ')',
  ].join('\n')

  return (
    <WidgetFrame
      caption="Arma una petición HTTP paso a paso. El builder acumula configuración y valida todo junto al llamar build(); el constructor telescópico te obliga a recordar posiciones."
      controls={
        <>
          <Segmented
            label="Estilo"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'builder', label: 'Builder' },
              { value: 'telescopic', label: 'Constructor telescópico' },
            ]}
          />
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setOn(new Set(['url']))
              setBuilt(null)
            }}
          >
            <RotateCcw size={16} aria-hidden="true" /> Reiniciar
          </button>
        </>
      }
      readout={
        mode === 'builder' ? (
          <p>
            {chain.length} de {STEPS.length} pasos aplicados. Los opcionales tienen valores por defecto sensatos (timeout 30 s, sin reintentos); solo la URL es obligatoria. Las reglas que cruzan
            varios campos (POST ⇒ cuerpo) viven en <code>build()</code>.
          </p>
        ) : (
          <p>
            Siete parámetros posicionales, cuatro de ellos opcionales: cada <code>undefined</code> es un hueco que el lector tiene que contar. Intercambiar timeout y reintentos compila sin quejarse.
          </p>
        )
      }
    >
      <div className="bs-grid">
        <div className="bs-steps" role="group" aria-label="Pasos del builder">
          {STEPS.map((s) => {
            const active = on.has(s.id)
            return (
              <button
                key={s.id}
                type="button"
                className={`bs-step ${active ? 'is-on' : ''}`}
                aria-pressed={active}
                onClick={() => toggle(s.id)}
              >
                <span className="bs-step__dot" aria-hidden="true">
                  {active && <Check size={13} strokeWidth={3} />}
                </span>
                <span className="bs-step__label">{s.label}</span>
                {s.required && <span className="bs-step__req">obligatorio</span>}
              </button>
            )
          })}
        </div>
        <div className="bs-out">
          <CodeBlock code={mode === 'builder' ? builderCode : telescopic} lang="ts" bare />
          {mode === 'builder' && (
            <button type="button" className="btn btn--line bs-build" onClick={build}>
              <Hammer size={16} aria-hidden="true" /> build()
            </button>
          )}
          <AnimatePresence mode="wait" initial={false}>
            {mode === 'builder' && built && (
              <motion.div
                key={built.text}
                className={`bs-result ${built.ok ? 'is-ok' : 'is-bad'}`}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease }}
                aria-live="polite"
              >
                {built.ok ? (
                  <>
                    <div className="bs-result__head">
                      <Check size={16} aria-hidden="true" /> HttpRequest inmutable creado
                    </div>
                    <CodeBlock code={built.text} lang="json" bare />
                  </>
                ) : (
                  <div className="bs-result__head">
                    <TriangleAlert size={16} aria-hidden="true" /> build() lanzó un error: {built.text}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </WidgetFrame>
  )
}
