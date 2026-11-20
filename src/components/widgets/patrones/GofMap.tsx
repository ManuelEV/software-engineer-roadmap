/**
 * GofMap — the 23 GoF patterns sorted into a three-row chart (creational,
 * structural, behavioral), like a classification table in class notes.
 * Tap a pattern to read its intent.
 */
import { useState } from 'react'
import { Link } from 'react-router'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { ArrowRight } from 'lucide-react'
import { Segmented, WidgetFrame } from '../kit'
import './GofMap.css'

type Family = 'cre' | 'est' | 'com'

interface Station {
  id: string
  name: string
  family: Family
  intent: string
  hint: string
  page: string
  /** how often you will meet it in day-to-day code today */
  daily: boolean
}

const S: Station[] = [
  { id: 'factory-method', name: 'Factory Method', family: 'cre', page: 'creacionales', daily: true, intent: 'Define un método para crear un objeto y deja que las subclases (o una función) decidan qué clase concreta instanciar.', hint: 'El código cliente no debería saber si crea un PdfInvoice o un HtmlInvoice.' },
  { id: 'abstract-factory', name: 'Abstract Factory', family: 'cre', page: 'creacionales', daily: false, intent: 'Crea familias de objetos relacionados sin acoplarte a sus clases concretas.', hint: 'Necesitas que botón, menú y diálogo sean todos del mismo tema o plataforma.' },
  { id: 'builder', name: 'Builder', family: 'cre', page: 'creacionales', daily: true, intent: 'Construye un objeto complejo paso a paso y separa la construcción de su representación final.', hint: 'Tu constructor tiene 9 parámetros y la mitad son opcionales.' },
  { id: 'prototype', name: 'Prototype', family: 'cre', page: 'creacionales', daily: false, intent: 'Crea objetos nuevos copiando una instancia existente que sirve de modelo.', hint: 'Configurar un objeto desde cero es caro y casi siempre partes de una plantilla.' },
  { id: 'singleton', name: 'Singleton', family: 'cre', page: 'creacionales', daily: true, intent: 'Garantiza una sola instancia de una clase y da un punto de acceso global a ella.', hint: 'Lo verás a diario… y a menudo es mejor reemplazarlo con inyección de dependencias.' },

  { id: 'adapter', name: 'Adapter', family: 'est', page: 'estructurales', daily: true, intent: 'Convierte la interfaz de una clase en otra que el cliente espera, para que trabajen juntas.', hint: 'El SDK del proveedor de pagos no calza con tu interfaz PaymentGateway.' },
  { id: 'bridge', name: 'Bridge', family: 'est', page: 'estructurales', daily: false, intent: 'Separa una abstracción de su implementación para que ambas varíen de forma independiente.', hint: 'Tienes Notificación × Canal y la jerarquía de clases explota en combinaciones.' },
  { id: 'composite', name: 'Composite', family: 'est', page: 'estructurales', daily: true, intent: 'Compone objetos en árboles y trata igual a las hojas y a los grupos.', hint: 'Una caja puede contener productos u otras cajas, y quieres el peso total.' },
  { id: 'decorator', name: 'Decorator', family: 'est', page: 'estructurales', daily: true, intent: 'Agrega responsabilidades a un objeto envolviéndolo, sin modificar su clase.', hint: 'Quieres logging, retry y caché alrededor de un cliente HTTP, combinables.' },
  { id: 'facade', name: 'Facade', family: 'est', page: 'estructurales', daily: true, intent: 'Ofrece una interfaz simple a un subsistema complejo.', hint: 'Para hacer un checkout hay que hablar con 6 servicios en el orden correcto.' },
  { id: 'flyweight', name: 'Flyweight', family: 'est', page: 'estructurales', daily: false, intent: 'Comparte el estado común entre muchos objetos pequeños para ahorrar memoria.', hint: 'Renderizas un millón de glifos o de árboles en un mapa.' },
  { id: 'proxy', name: 'Proxy', family: 'est', page: 'estructurales', daily: true, intent: 'Pone un sustituto con la misma interfaz que controla el acceso al objeto real.', hint: 'Carga perezosa, caché, control de acceso o un objeto remoto.' },

  { id: 'chain', name: 'Chain of Responsibility', family: 'com', page: 'comportamiento-2', daily: true, intent: 'Pasa una petición por una cadena de handlers; cada uno la procesa o la deja pasar.', hint: 'Autenticación, rate limit y validación antes del handler: middleware.' },
  { id: 'command', name: 'Command', family: 'com', page: 'comportamiento-1', daily: true, intent: 'Encapsula una petición como un objeto para encolarla, registrarla o deshacerla.', hint: 'Deshacer/rehacer, colas de trabajos, acciones de Redux.' },
  { id: 'iterator', name: 'Iterator', family: 'com', page: 'comportamiento-2', daily: true, intent: 'Recorre los elementos de una colección sin exponer su estructura interna.', hint: 'Ya está en el lenguaje: for…of, generadores, __iter__.' },
  { id: 'mediator', name: 'Mediator', family: 'com', page: 'comportamiento-2', daily: false, intent: 'Centraliza la comunicación entre objetos para que no se refieran unos a otros.', hint: 'Los campos de un formulario se habilitan y deshabilitan entre sí.' },
  { id: 'memento', name: 'Memento', family: 'com', page: 'comportamiento-2', daily: false, intent: 'Captura el estado interno de un objeto para restaurarlo después sin romper su encapsulamiento.', hint: 'Historial de versiones de un documento.' },
  { id: 'observer', name: 'Observer', family: 'com', page: 'comportamiento-1', daily: true, intent: 'Cuando un objeto cambia, notifica a todos sus suscriptores automáticamente.', hint: 'addEventListener, EventEmitter, RxJS, señales.' },
  { id: 'state', name: 'State', family: 'com', page: 'comportamiento-1', daily: false, intent: 'Permite que un objeto cambie su comportamiento cuando cambia su estado interno.', hint: 'Un pedido pagado no se puede volver a pagar, pero sí enviar.' },
  { id: 'strategy', name: 'Strategy', family: 'com', page: 'comportamiento-1', daily: true, intent: 'Define una familia de algoritmos intercambiables y elige uno en tiempo de ejecución.', hint: 'Cálculo de envío estándar, exprés o internacional.' },
  { id: 'template', name: 'Template Method', family: 'com', page: 'comportamiento-2', daily: false, intent: 'Define el esqueleto de un algoritmo y deja que las subclases rellenen algunos pasos.', hint: 'Todos los reportes se generan igual, salvo cómo se obtienen los datos.' },
  { id: 'visitor', name: 'Visitor', family: 'com', page: 'comportamiento-2', daily: false, intent: 'Agrega operaciones nuevas sobre una estructura de objetos sin cambiar sus clases.', hint: 'Recorrer un AST para hacer lint, formatear o compilar.' },
  { id: 'interpreter', name: 'Interpreter', family: 'com', page: 'comportamiento-2', daily: false, intent: 'Representa la gramática de un lenguaje pequeño y lo evalúa con un árbol de objetos.', hint: 'Reglas de descuento escritas en un mini lenguaje. Hoy casi siempre usas un parser hecho.' },
]

const families: { id: Family; label: string; short: string; color: string; question: string }[] = [
  { id: 'cre', label: 'Creacionales', short: 'Crear', color: 'var(--l1)', question: '¿Cómo se crean los objetos?' },
  { id: 'est', label: 'Estructurales', short: 'Componer', color: 'var(--l2)', question: '¿Cómo se ensamblan en estructuras más grandes?' },
  { id: 'com', label: 'Comportamiento', short: 'Comunicar', color: 'var(--l4)', question: '¿Cómo se reparten responsabilidades y se comunican?' },
]

export function GofMap() {
  const reduced = useReducedMotion()
  const [selected, setSelected] = useState<string>('strategy')
  const [view, setView] = useState<'all' | 'daily'>('all')

  const sel = S.find((s) => s.id === selected)!
  const fam = families.find((f) => f.id === sel.family)!

  return (
    <WidgetFrame
      caption="Los 23 patrones del libro de Gamma, Helm, Johnson y Vlissides (1994), agrupados por el problema que atacan. Toca un patrón."
      controls={
        <Segmented
          label="Mostrar"
          value={view}
          onChange={setView}
          options={[
            { value: 'all', label: 'Los 23' },
            { value: 'daily', label: 'Los que verás seguido' },
          ]}
        />
      }
      readout={
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={sel.id}
            className="gof-read"
            initial={{ opacity: 0, y: reduced ? 0 : 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
            aria-live="polite"
          >
            <div className="gof-read__head">
              <span className="gof-read__dot" style={{ background: fam.color }} aria-hidden="true" />
              <b>{sel.name}</b>
              <span className="gof-read__fam">{fam.label}</span>
            </div>
            <p>{sel.intent}</p>
            <p className="gof-read__hint">
              <i>Lo reconoces cuando:</i> {sel.hint}
            </p>
            <Link className="gof-read__link" to={`/patrones/${sel.page}`}>
              Ir al tema <ArrowRight size={15} aria-hidden="true" />
            </Link>
          </motion.div>
        </AnimatePresence>
      }
    >
      <div className="gof-chart" role="group" aria-label="Los patrones GoF por familia">
        {families.map((f) => (
          <section key={f.id} className="gof-fam" style={{ ['--gof-c' as string]: f.color }} aria-label={f.label}>
            <div className="gof-fam__head">
              <b>{f.label}</b>
              <span>{f.question}</span>
            </div>
            <div className="gof-fam__cells">
              {S.filter((st) => st.family === f.id).map((st) => {
                const on = st.id === selected
                const faded = view === 'daily' && !st.daily
                return (
                  <button
                    key={st.id}
                    type="button"
                    className={`gof-cell ${on ? 'is-on' : ''} ${faded ? 'is-faded' : ''}`}
                    aria-pressed={on}
                    onClick={() => setSelected(st.id)}
                  >
                    {st.name}
                  </button>
                )
              })}
            </div>
          </section>
        ))}
      </div>
    </WidgetFrame>
  )
}
