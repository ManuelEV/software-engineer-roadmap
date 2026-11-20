import { useEffect, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Brain, ChevronLeft, ChevronRight, Pause, Play, RotateCcw, Terminal, Wrench } from 'lucide-react'
import { WidgetFrame } from '../kit'
import './AgentLoopTrace.css'

type Phase = 'contexto' | 'accion' | 'verificar' | 'fin'

interface TraceStep {
  phase: Phase
  thought: string
  tool?: string
  input?: string
  result?: string
  tone?: 'ok' | 'bad' | 'neutral'
}

const STEPS: TraceStep[] = [
  {
    phase: 'contexto',
    thought: 'Antes de tocar nada, reproduzco el fallo para ver el error exacto.',
    tool: 'bash',
    input: 'npm test -- src/checkout',
    result:
      'FAIL src/checkout/total.test.ts\n  ✕ aplica cupón de 10% una sola vez\n    Expected: 90\n    Received: 81\nTests: 1 failed, 11 passed',
    tone: 'bad',
  },
  {
    phase: 'contexto',
    thought: '81 = 100 × 0,9 × 0,9: el descuento se aplica dos veces. Leo la función bajo prueba.',
    tool: 'read_file',
    input: 'src/checkout/total.ts',
    result:
      'export function orderTotal(cart: Cart, coupon?: Coupon) {\n  const subtotal = sum(cart.items)\n  const discounted = coupon ? applyCoupon(subtotal, coupon) : subtotal\n  return discounted + shipping(cart)\n}',
    tone: 'neutral',
  },
  {
    phase: 'contexto',
    thought: 'total.ts aplica el cupón una vez. ¿Quién más lo llama?',
    tool: 'grep',
    input: 'applyCoupon  src/',
    result: 'src/checkout/total.ts:3   applyCoupon(subtotal, coupon)\nsrc/cart/cart.ts:31        item.price = applyCoupon(item.price, coupon)',
    tone: 'neutral',
  },
  {
    phase: 'accion',
    thought: 'cart.ts muta el precio de cada ítem con el cupón y luego total.ts lo aplica otra vez. El test dice que la fuente de verdad es orderTotal. Quito la mutación en cart.ts.',
    tool: 'edit_file',
    input: 'src/cart/cart.ts\n- item.price = applyCoupon(item.price, coupon)\n+ // el cupón se aplica solo en orderTotal()',
    result: 'OK: 1 reemplazo en src/cart/cart.ts',
    tone: 'neutral',
  },
  {
    phase: 'verificar',
    thought: 'Corro el test que fallaba.',
    tool: 'bash',
    input: 'npm test -- src/checkout',
    result: 'PASS src/checkout/total.test.ts\nTests: 12 passed',
    tone: 'ok',
  },
  {
    phase: 'verificar',
    thought: 'Pasó, pero cambié cart.ts: corro la suite completa por si algo dependía del comportamiento viejo.',
    tool: 'bash',
    input: 'npm test',
    result:
      'FAIL src/cart/cart.test.ts\n  ✕ el carrito muestra el subtotal con descuento\n    Expected: "$90.00"  Received: "$100.00"\nTests: 1 failed, 213 passed',
    tone: 'bad',
  },
  {
    phase: 'contexto',
    thought: 'La UI del carrito necesitaba mostrar el precio con descuento. Leo el test para entender el contrato.',
    tool: 'read_file',
    input: 'src/cart/cart.test.ts',
    result: "it('el carrito muestra el subtotal con descuento', () => {\n  const view = cartView(cart, coupon10)\n  expect(view.displaySubtotal).toBe('$90.00')\n})",
    tone: 'neutral',
  },
  {
    phase: 'accion',
    thought: 'Separo responsabilidades: cartView calcula un subtotal de presentación sin mutar los ítems; el total real sigue en orderTotal.',
    tool: 'edit_file',
    input: "src/cart/cart.ts\n+ displaySubtotal: formatMoney(\n+   coupon ? applyCoupon(sum(items), coupon) : sum(items)\n+ ),",
    result: 'OK: 1 reemplazo en src/cart/cart.ts',
    tone: 'neutral',
  },
  {
    phase: 'verificar',
    thought: 'Suite completa y chequeo de tipos.',
    tool: 'bash',
    input: 'npm test && npx tsc --noEmit',
    result: 'Tests: 214 passed\ntsc: sin errores',
    tone: 'ok',
  },
  {
    phase: 'fin',
    thought: 'Todo verde. No hay más trabajo pendiente: respondo con el resumen y la evidencia, y dejo de llamar herramientas.',
    result:
      'Causa: el cupón se aplicaba en cart.ts (mutando item.price) y otra vez en orderTotal().\nCambio: cart.ts ya no muta precios; cartView calcula displaySubtotal aparte.\nEvidencia: npm test → 214 passed; tsc sin errores.',
    tone: 'ok',
  },
]

const PHASE_LABEL: Record<Phase, string> = {
  contexto: 'Reunir contexto',
  accion: 'Actuar',
  verificar: 'Verificar',
  fin: 'Terminar',
}

// Loop geometry (viewBox 0 0 340 214)
const C = { x: 170, y: 100, r: 66 }
const at = (deg: number) => ({ x: C.x + C.r * Math.cos((deg * Math.PI) / 180), y: C.y + C.r * Math.sin((deg * Math.PI) / 180) })
const POS: Record<Phase, { x: number; y: number }> = {
  contexto: at(210),
  accion: at(330),
  verificar: at(90),
  fin: { x: 296, y: C.y + C.r },
}

function LoopMap({ phase, lap }: { phase: Phase; lap: number }) {
  const reduced = useReducedMotion()
  const stops: Phase[] = ['contexto', 'accion', 'verificar', 'fin']
  return (
    <svg className="alt-map" viewBox="0 0 340 214" role="img" aria-label={`Fase actual: ${PHASE_LABEL[phase]}, vuelta ${lap}`}>
      <circle cx={C.x} cy={C.y} r={C.r} className="alt-map__loop" />
      <path d={`M${POS.verificar.x},${POS.verificar.y} H${POS.fin.x}`} className={`alt-map__spur ${phase === 'fin' ? 'is-on' : ''}`} />
      {/* direction arrows on the loop */}
      {[270, 30, 150].map((deg) => {
        const p = at(deg)
        return (
          <g key={deg} transform={`translate(${p.x},${p.y}) rotate(${deg + 90})`}>
            <path d="M-5,-4 L1,0 L-5,4" className="alt-map__arrow" />
          </g>
        )
      })}
      <text x={C.x} y={C.y - 4} textAnchor="middle" className="alt-map__center">
        vuelta
      </text>
      <text x={C.x} y={C.y + 16} textAnchor="middle" className="alt-map__lap">
        {lap}
      </text>
      {stops.map((s) => {
        const p = POS[s]
        const on = s === phase
        const lx = s === 'contexto' ? p.x - 18 : s === 'accion' ? p.x + 18 : p.x
        const ly = s === 'verificar' || s === 'fin' ? p.y + 32 : p.y + 5
        const anchor = s === 'contexto' ? 'end' : s === 'accion' ? 'start' : 'middle'
        return (
          <g key={s}>
            {on && !reduced && (
              <motion.circle
                cx={p.x}
                cy={p.y}
                r={16}
                className="alt-map__halo"
                initial={{ opacity: 0.5, scale: 0.7 }}
                animate={{ opacity: 0, scale: 1.4 }}
                transition={{ duration: 1.2, repeat: Infinity, ease: [0.16, 1, 0.3, 1] }}
                style={{ transformOrigin: `${p.x}px ${p.y}px` }}
              />
            )}
            <circle cx={p.x} cy={p.y} r={s === 'fin' ? 9 : 11} className={`alt-map__stop ${on ? 'is-on' : ''} ${s === 'fin' ? 'is-terminus' : ''}`} />
            <text x={lx} y={ly} textAnchor={anchor} className={`alt-map__label ${on ? 'is-on' : ''}`}>
              {PHASE_LABEL[s]}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function AgentLoopTrace() {
  const [i, setI] = useState(0)
  const [playing, setPlaying] = useState(false)
  const reduced = useReducedMotion()
  const step = STEPS[i]
  const lap = 1 + STEPS.slice(0, i + 1).filter((s, k) => k > 0 && s.phase === 'contexto' && STEPS[k - 1].phase !== 'contexto').length
  const toolCalls = STEPS.slice(0, i + 1).filter((s) => s.tool).length

  const atEnd = i >= STEPS.length - 1
  const isPlaying = playing && !atEnd

  useEffect(() => {
    if (!isPlaying) return
    const t = window.setTimeout(() => setI((v) => Math.min(STEPS.length - 1, v + 1)), 2600)
    return () => window.clearTimeout(t)
  }, [isPlaying, i])

  const togglePlay = () => {
    if (atEnd) {
      setI(0)
      setPlaying(true)
    } else setPlaying(!isPlaying)
  }

  const controls = (
    <div className="alt-controls">
      <button type="button" className="icon-btn" onClick={() => setI((v) => Math.max(0, v - 1))} disabled={i === 0} aria-label="Paso anterior">
        <ChevronLeft size={20} />
      </button>
      <button type="button" className="btn btn--line" onClick={togglePlay} aria-label={isPlaying ? 'Pausar' : 'Reproducir'}>
        {isPlaying ? <Pause size={16} /> : <Play size={16} />}
        {isPlaying ? 'Pausar' : 'Reproducir'}
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={() => setI((v) => Math.min(STEPS.length - 1, v + 1))}
        disabled={i === STEPS.length - 1}
        aria-label="Paso siguiente"
      >
        <ChevronRight size={20} />
      </button>
      <button
        type="button"
        className="icon-btn"
        onClick={() => {
          setPlaying(false)
          setI(0)
        }}
        aria-label="Reiniciar"
      >
        <RotateCcw size={18} />
      </button>
      <span className="alt-count">
        Paso {i + 1} / {STEPS.length} · {toolCalls} llamadas a herramientas
      </span>
    </div>
  )

  return (
    <WidgetFrame
      caption="Una sesión real (simplificada) de un agente arreglando un test que falla. Cada paso es una vuelta del loop: el modelo piensa, pide una herramienta, el harness la ejecuta y le devuelve el resultado."
      controls={controls}
      readout={
        <p>
          <b>Tarea:</b> “El test <code>aplica cupón de 10% una sola vez</code> falla en CI. Arréglalo.”
        </p>
      }
    >
      <div className="alt-grid">
        <LoopMap phase={step.phase} lap={lap} />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={i}
            className="alt-panes"
            initial={{ opacity: 0, x: reduced ? 0 : 8 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: reduced ? 0 : -8 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            aria-live="polite"
          >
            <div className="alt-pane">
              <div className="alt-pane__head">
                <Brain size={15} aria-hidden="true" /> Razonamiento del modelo
              </div>
              <p className="alt-thought">{step.thought}</p>
            </div>
            {step.tool && (
              <div className="alt-pane">
                <div className="alt-pane__head">
                  <Wrench size={15} aria-hidden="true" /> tool_use · <code>{step.tool}</code>
                </div>
                <pre className="alt-code">{step.input}</pre>
              </div>
            )}
            {step.result && (
              <div className={`alt-pane alt-pane--${step.tone ?? 'neutral'}`}>
                <div className="alt-pane__head">
                  <Terminal size={15} aria-hidden="true" /> {step.phase === 'fin' ? 'Respuesta final (sin tool_use)' : 'tool_result'}
                </div>
                <pre className="alt-code">{step.result}</pre>
              </div>
            )}
          </motion.div>
        </AnimatePresence>
      </div>
    </WidgetFrame>
  )
}
