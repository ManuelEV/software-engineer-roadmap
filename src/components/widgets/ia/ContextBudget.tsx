import { useMemo, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Archive, FileText, MessageSquare, RotateCcw, Split, Terminal } from 'lucide-react'
import { Segmented, Stat, WidgetFrame } from '../kit'
import './ContextBudget.css'

type Cat = 'system' | 'tools' | 'memory' | 'chat' | 'reads' | 'outputs' | 'summary'

interface Block {
  id: number
  cat: Cat
  tokens: number
  /** is this block likely useful for the current step? */
  relevant: boolean
  label: string
}

const CAT_META: Record<Cat, { label: string; color: string }> = {
  system: { label: 'System prompt', color: 'var(--ink-2)' },
  tools: { label: 'Herramientas (+MCP)', color: 'var(--l4)' },
  memory: { label: 'CLAUDE.md / skills', color: 'var(--l5)' },
  chat: { label: 'Conversación', color: 'var(--l2)' },
  reads: { label: 'Archivos leídos', color: 'var(--l3)' },
  outputs: { label: 'Salidas de herramientas', color: 'var(--l1)' },
  summary: { label: 'Resúmenes', color: 'var(--rule-strong)' },
}

const K = 1000

let nextId = 1
const mk = (cat: Cat, tokens: number, relevant: boolean, label: string): Block => ({ id: nextId++, cat, tokens, relevant, label })

const BASE_LEAN = baseBlocks(true)
const BASE_BLOATED = baseBlocks(false)

function baseBlocks(lean: boolean): Block[] {
  return [
    mk('system', 4 * K, true, 'Instrucciones del agente'),
    mk('tools', 10 * K, true, 'Read, Edit, Bash, Grep…'),
    ...(lean
      ? [mk('memory', 2 * K, true, 'CLAUDE.md conciso'), mk('memory', 1 * K, true, 'Metadatos de skills')]
      : [
          mk('memory', 24 * K, false, 'CLAUDE.md inflado'),
          mk('tools', 45 * K, false, '6 servidores MCP cargados completos'),
        ]),
  ]
}

const fmt = (t: number) => (t >= 1000 * K ? `${(t / (1000 * K)).toFixed(2)} M` : `${Math.round(t / K)} K`)

export function ContextBudget() {
  const [windowSize, setWindowSize] = useState<'200' | '1000'>('200')
  const [lean, setLean] = useState<'lean' | 'bloated'>('lean')
  const [dynamic, setDynamic] = useState<Block[]>([])
  const [compactions, setCompactions] = useState(0)
  const reduced = useReducedMotion()

  const cap = (windowSize === '200' ? 200 : 1000) * K
  const blocks = useMemo(() => [...(lean === 'lean' ? BASE_LEAN : BASE_BLOATED), ...dynamic], [lean, dynamic])
  const used = blocks.reduce((s, b) => s + b.tokens, 0)
  const relevant = blocks.filter((b) => b.relevant).reduce((s, b) => s + b.tokens, 0)
  const pctUsed = Math.min(100, (used / cap) * 100)
  const overflow = used > cap
  const signal = used ? Math.round((relevant / used) * 100) : 100

  const add = (b: Omit<Block, 'id'>) => {
    setDynamic((d) => {
      // older reads/outputs become less relevant as the task moves on
      const aged = d.map((x, k) => (k < d.length - 4 && (x.cat === 'reads' || x.cat === 'outputs') ? { ...x, relevant: false } : x))
      return [...aged, { ...b, id: nextId++ }]
    })
  }

  const compact = () => {
    setDynamic((d) => {
      if (!d.length) return d
      const keep = d.slice(-2)
      const old = d.slice(0, -2)
      const oldTokens = old.reduce((s, b) => s + b.tokens, 0)
      if (oldTokens === 0) return d
      const summary = mk('summary', Math.max(2 * K, Math.round(oldTokens * 0.08)), true, 'Resumen de la sesión hasta aquí')
      return [summary, ...keep]
    })
    setCompactions((c) => c + 1)
  }

  const zone = pctUsed >= 90 ? 'bad' : pctUsed >= 60 ? 'warn' : 'ok'

  const actions = [
    { key: 'read', icon: FileText, text: 'Leer un archivo', hint: '+8 K', run: () => add({ cat: 'reads', tokens: 8 * K, relevant: true, label: 'src/…/archivo.ts' }) },
    {
      key: 'log',
      icon: Terminal,
      text: 'Correr tests (log completo)',
      hint: '+30 K',
      run: () => add({ cat: 'outputs', tokens: 30 * K, relevant: false, label: 'Log de 800 líneas, 2 relevantes' }),
    },
    {
      key: 'logq',
      icon: Terminal,
      text: 'Correr tests (solo fallos)',
      hint: '+1 K',
      run: () => add({ cat: 'outputs', tokens: 1 * K, relevant: true, label: 'Solo los tests que fallan' }),
    },
    { key: 'turn', icon: MessageSquare, text: 'Turno de conversación', hint: '+5 K', run: () => add({ cat: 'chat', tokens: 5 * K, relevant: true, label: 'Pedido + respuesta' }) },
    {
      key: 'sub',
      icon: Split,
      text: 'Explorar con subagente',
      hint: '+2 K',
      run: () => add({ cat: 'summary', tokens: 2 * K, relevant: true, label: 'Hallazgos del subagente (leyó ~60 K en su propio contexto)' }),
    },
    {
      key: 'explore',
      icon: FileText,
      text: 'Explorar en el hilo principal',
      hint: '+60 K',
      run: () => add({ cat: 'reads', tokens: 60 * K, relevant: false, label: 'Exploración: 15 archivos, 3 útiles' }),
    },
  ]

  const legendCats = (Object.keys(CAT_META) as Cat[]).filter((c) => blocks.some((b) => b.cat === c))

  return (
    <WidgetFrame
      caption="La ventana de contexto como presupuesto. Los tamaños son ilustrativos, pero las proporciones son realistas: un log sin filtrar o una exploración en el hilo principal cuestan más que todo tu CLAUDE.md."
      controls={
        <>
          <Segmented
            label="Ventana"
            value={windowSize}
            onChange={setWindowSize}
            options={[
              { value: '200', label: '200 K' },
              { value: '1000', label: '1 M' },
            ]}
          />
          <Segmented
            label="Contexto fijo"
            value={lean}
            onChange={setLean}
            options={[
              { value: 'lean', label: 'Curado' },
              { value: 'bloated', label: 'Inflado' },
            ]}
          />
        </>
      }
      readout={
        <div className="cb-readout">
          <Stat label="tokens usados" value={fmt(used)} hint={`de ${fmt(cap)}`} tone={overflow ? 'bad' : zone === 'ok' ? undefined : zone} />
          <Stat label="relevante para el paso actual" value={`${signal}%`} tone={signal < 50 ? 'bad' : signal < 75 ? 'warn' : 'ok'} />
          <Stat label="compactaciones" value={compactions} />
          <p className="cb-note">
            {overflow
              ? 'Te pasaste de la ventana: el harness tendría que compactar o cortar. Antes de llegar acá ya pagaste en calidad y costo.'
              : signal < 50
                ? 'Más de la mitad del contexto es ruido: el modelo tiene que encontrar la aguja entre distractores. Esto es lo que se llama context rot.'
                : pctUsed >= 60
                  ? 'Contexto cargado. Considera compactar, hacer /clear entre tareas o delegar exploración a un subagente.'
                  : 'Buen estado: poco ruido y margen de sobra.'}
          </p>
        </div>
      }
    >
      <div className="cb-actions" role="group" aria-label="Acciones del agente">
        {actions.map((a) => (
          <button key={a.key} type="button" className="btn cb-action" onClick={a.run}>
            <a.icon size={15} aria-hidden="true" />
            <span>{a.text}</span>
            <span className="cb-action__hint">{a.hint}</span>
          </button>
        ))}
        <button type="button" className="btn btn--line cb-action" onClick={compact} disabled={dynamic.length < 3}>
          <Archive size={15} aria-hidden="true" />
          <span>Compactar</span>
        </button>
        <button
          type="button"
          className="btn btn--ghost cb-action"
          onClick={() => {
            setDynamic([])
            setCompactions(0)
          }}
        >
          <RotateCcw size={15} aria-hidden="true" />
          <span>/clear</span>
        </button>
      </div>

      <div className="cb-bar-wrap">
        <div className="cb-scale" aria-hidden="true">
          <span style={{ left: '60%' }}>60%</span>
          <span style={{ left: '90%' }}>90%</span>
        </div>
        <div
          className={`cb-bar ${overflow ? 'is-overflow' : ''}`}
          role="img"
          aria-label={`Ventana de contexto: ${fmt(used)} de ${fmt(cap)} usados, ${signal}% relevante`}
        >
          <div className="cb-zone cb-zone--warn" style={{ left: '60%', width: '30%' }} />
          <div className="cb-zone cb-zone--bad" style={{ left: '90%', width: '10%' }} />
          <div className="cb-stack">
            {blocks.map((b) => {
              const w = (b.tokens / Math.max(cap, used)) * 100
              return (
                <motion.div
                  key={b.id}
                  className={`cb-seg ${b.relevant ? '' : 'is-noise'}`}
                  style={{ ['--cb-c' as string]: CAT_META[b.cat].color }}
                  initial={reduced ? { opacity: 0 } : { opacity: 0, width: 0 }}
                  animate={{ opacity: 1, width: `${w}%` }}
                  transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
                  title={`${CAT_META[b.cat].label}: ${b.label} (${fmt(b.tokens)})${b.relevant ? '' : ' — ruido'}`}
                />
              )
            })}
          </div>
        </div>
        <ul className="cb-legend">
          {legendCats.map((c) => (
            <li key={c}>
              <span className="cb-swatch" style={{ ['--cb-c' as string]: CAT_META[c].color }} />
              {CAT_META[c].label}
            </li>
          ))}
          <li>
            <span className="cb-swatch is-noise" style={{ ['--cb-c' as string]: 'var(--ink-3)' }} />
            Rayado = ruido para el paso actual
          </li>
        </ul>
      </div>
    </WidgetFrame>
  )
}
