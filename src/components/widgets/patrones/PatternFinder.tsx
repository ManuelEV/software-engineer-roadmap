/**
 * PatternFinder — pick the symptoms you see in your code, get candidate
 * patterns (and sometimes the advice to use none).
 */
import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowRight, Check, RotateCcw, TriangleAlert } from 'lucide-react'
import { WidgetFrame } from '../kit'
import './PatternFinder.css'

interface Hit {
  pattern: string
  page: string
  why: string
}

interface Symptom {
  id: string
  text: string
  hits: Hit[]
}

const YAGNI = 'Ningún patrón (todavía)'

const symptoms: Symptom[] = [
  {
    id: 'switch',
    text: 'Un switch por tipo que crece con cada caso nuevo',
    hits: [
      { pattern: 'Strategy', page: 'comportamiento-1', why: 'cada rama se vuelve un objeto (o función) intercambiable.' },
      { pattern: 'Factory Method', page: 'creacionales', why: 'si el switch decide qué clase instanciar, encapsúlalo en un solo lugar.' },
    ],
  },
  {
    id: 'status',
    text: 'Lo que se puede hacer depende del estado, y hay transiciones prohibidas',
    hits: [{ pattern: 'State', page: 'comportamiento-1', why: 'cada estado es un objeto que sabe qué transiciones admite.' }],
  },
  {
    id: 'ctor',
    text: 'Un constructor con muchos parámetros, la mitad opcionales',
    hits: [{ pattern: 'Builder', page: 'creacionales', why: 'construcción paso a paso con nombres legibles y validación al final.' }],
  },
  {
    id: 'concrete',
    text: 'Crear objetos distintos según país, plan o configuración',
    hits: [
      { pattern: 'Factory Method', page: 'creacionales', why: 'el cliente pide "un notificador" y la fábrica decide cuál.' },
      { pattern: 'Abstract Factory', page: 'creacionales', why: 'si son familias completas que deben combinar entre sí.' },
    ],
  },
  {
    id: 'sdk',
    text: 'Una librería externa no calza con la interfaz que necesito',
    hits: [{ pattern: 'Adapter', page: 'estructurales', why: 'traduce la interfaz del proveedor a la tuya, en un solo lugar.' }],
  },
  {
    id: 'cross',
    text: 'Quiero sumar logging, caché o reintentos sin tocar la clase',
    hits: [
      { pattern: 'Decorator', page: 'estructurales', why: 'envuelve el objeto con capas combinables que respetan su interfaz.' },
      { pattern: 'Proxy', page: 'estructurales', why: 'si lo que agregas es control de acceso, caché o carga perezosa.' },
      { pattern: 'Middleware', page: 'patrones-aplicacion', why: 'si las capas rodean peticiones HTTP o mensajes.' },
    ],
  },
  {
    id: 'react',
    text: 'Varias partes deben reaccionar cuando algo pasa',
    hits: [
      { pattern: 'Observer', page: 'comportamiento-1', why: 'el emisor publica y no conoce a quienes escuchan.' },
      { pattern: 'Mediator', page: 'comportamiento-2', why: 'si las reacciones se cruzan entre sí y necesitas un coordinador.' },
    ],
  },
  {
    id: 'undo',
    text: 'Necesito deshacer, encolar o auditar acciones',
    hits: [
      { pattern: 'Command', page: 'comportamiento-1', why: 'cada acción es un objeto con execute() y undo().' },
      { pattern: 'Memento', page: 'comportamiento-2', why: 'si deshacer es volver a una foto del estado.' },
    ],
  },
  {
    id: 'filters',
    text: 'Una petición pasa por filtros que pueden cortarla',
    hits: [
      { pattern: 'Chain of Responsibility', page: 'comportamiento-2', why: 'cada handler decide si sigue o corta.' },
      { pattern: 'Middleware', page: 'patrones-aplicacion', why: 'la versión de todos los días en Express, Koa o ASP.NET.' },
    ],
  },
  {
    id: 'tree',
    text: 'Una estructura en árbol: tratar igual a hojas y grupos',
    hits: [
      { pattern: 'Composite', page: 'estructurales', why: 'hoja y grupo comparten interfaz; la recursión hace el resto.' },
      { pattern: 'Visitor', page: 'comportamiento-2', why: 'si necesitas muchas operaciones distintas sobre ese árbol.' },
    ],
  },
  {
    id: 'facade',
    text: 'Para usar un subsistema hay que llamar a seis cosas en orden',
    hits: [{ pattern: 'Facade', page: 'estructurales', why: 'una puerta de entrada simple que orquesta el subsistema.' }],
  },
  {
    id: 'tests',
    text: 'El negocio importa el SDK o el ORM y no puedo testear sin red',
    hits: [
      { pattern: 'Inyección de dependencias', page: 'patrones-aplicacion', why: 'recibe las dependencias por el constructor en vez de crearlas.' },
      { pattern: 'Repository', page: 'patrones-aplicacion', why: 'una colección en memoria para el dominio; el SQL vive detrás.' },
      { pattern: 'Adapter', page: 'estructurales', why: 'el SDK queda detrás de una interfaz que define tu dominio.' },
    ],
  },
  {
    id: 'nulls',
    text: 'Chequeos de null por todos lados',
    hits: [
      { pattern: 'Null Object', page: 'patrones-aplicacion', why: 'un objeto que no hace nada reemplaza al null.' },
      { pattern: 'Result / Either', page: 'patrones-aplicacion', why: 'si el null en realidad significa "falló".' },
    ],
  },
  {
    id: 'errors',
    text: 'Errores esperables (validación, sin stock) manejados con excepciones',
    hits: [{ pattern: 'Result / Either', page: 'patrones-aplicacion', why: 'el error es parte del tipo de retorno y el compilador te obliga a tratarlo.' }],
  },
  {
    id: 'remote',
    text: 'Una API remota falla a ratos o se pone lenta',
    hits: [
      { pattern: 'Timeout + Retry', page: 'patrones-resiliencia', why: 'no esperes para siempre y reintenta fallas transitorias con backoff.' },
      { pattern: 'Circuit Breaker', page: 'patrones-resiliencia', why: 'deja de insistir cuando la falla es persistente.' },
      { pattern: 'Bulkhead', page: 'patrones-resiliencia', why: 'que una dependencia lenta no se coma todos tus recursos.' },
    ],
  },
  {
    id: 'legacy',
    text: 'Tengo que migrar un sistema legado sin un big bang',
    hits: [{ pattern: 'Strangler Fig', page: 'patrones-resiliencia', why: 'reemplazas por partes detrás de una fachada de ruteo.' }],
  },
  {
    id: 'memory',
    text: 'Millones de objetos casi idénticos se comen la memoria',
    hits: [{ pattern: 'Flyweight', page: 'estructurales', why: 'comparte el estado repetido entre todas las instancias.' }],
  },
  {
    id: 'maybe',
    text: 'Hoy hay un solo caso, pero "quizás mañana haya más"',
    hits: [
      { pattern: YAGNI, page: 'antipatrones', why: 'una abstracción con un solo caso es especulación. Espera el segundo o tercer caso real.' },
    ],
  },
]

export function PatternFinder() {
  const [picked, setPicked] = useState<string[]>(['switch', 'tests'])
  const reduced = useReducedMotion()

  const results = useMemo(() => {
    const map = new Map<string, { pattern: string; page: string; whys: string[]; score: number }>()
    symptoms
      .filter((s) => picked.includes(s.id))
      .forEach((s) =>
        s.hits.forEach((h) => {
          const cur = map.get(h.pattern) ?? { pattern: h.pattern, page: h.page, whys: [], score: 0 }
          cur.score += 1
          if (!cur.whys.includes(h.why)) cur.whys.push(h.why)
          map.set(h.pattern, cur)
        }),
      )
    return [...map.values()].sort((a, b) => b.score - a.score || a.pattern.localeCompare(b.pattern))
  }, [picked])

  const toggle = (id: string) => setPicked((p) => (p.includes(id) ? p.filter((x) => x !== id) : [...p, id]))

  return (
    <WidgetFrame
      caption="Empieza por el síntoma, no por el patrón. Marca lo que ves en tu código."
      grid={false}
      controls={
        <div className="pf-bar">
          <span className="pf-bar__label">¿Qué problema tienes?</span>
          <button type="button" className="btn btn--ghost" onClick={() => setPicked([])} disabled={!picked.length}>
            <RotateCcw size={15} aria-hidden="true" /> Limpiar
          </button>
        </div>
      }
      readout={
        <p>
          {picked.length === 0
            ? 'Marca al menos un síntoma.'
            : `${picked.length} síntoma${picked.length > 1 ? 's' : ''} → ${results.length} candidato${results.length !== 1 ? 's' : ''}. Un candidato no es una orden: compáralo con la solución más simple.`}
        </p>
      }
    >
      <div className="pf-grid">
        <ul className="pf-symptoms" aria-label="Síntomas">
          {symptoms.map((s) => {
            const on = picked.includes(s.id)
            return (
              <li key={s.id}>
                <button type="button" className={`pf-chip ${on ? 'is-on' : ''}`} aria-pressed={on} onClick={() => toggle(s.id)}>
                  <span className="pf-chip__box" aria-hidden="true">
                    {on && <Check size={13} strokeWidth={3} />}
                  </span>
                  {s.text}
                </button>
              </li>
            )
          })}
        </ul>
        <div className="pf-results" aria-live="polite">
          <div className="pf-results__title">Candidatos</div>
          {results.length === 0 && <p className="pf-empty">Aquí aparecerán los patrones que encajan.</p>}
          <ul>
            <AnimatePresence initial={false}>
              {results.map((r) => (
                <motion.li
                  key={r.pattern}
                  layout={!reduced}
                  initial={{ opacity: 0, y: reduced ? 0 : 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
                  className={`pf-res ${r.pattern === YAGNI ? 'is-warn' : ''}`}
                >
                  <div className="pf-res__head">
                    {r.pattern === YAGNI && <TriangleAlert size={16} aria-hidden="true" />}
                    <b>{r.pattern}</b>
                    {r.score > 1 && <span className="pf-res__score">×{r.score}</span>}
                    <a href={`/patrones/${r.page}`} className="pf-res__link" aria-label={`Ir a ${r.pattern}`}>
                      <ArrowRight size={16} aria-hidden="true" />
                    </a>
                  </div>
                  {r.whys.map((w) => (
                    <p key={w}>{w}</p>
                  ))}
                </motion.li>
              ))}
            </AnimatePresence>
          </ul>
        </div>
      </div>
    </WidgetFrame>
  )
}
