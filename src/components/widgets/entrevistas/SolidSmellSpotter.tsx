import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Check, ChevronLeft, ChevronRight, Eye, X } from 'lucide-react'
import { WidgetFrame } from '../kit'
import { pickLang, useCodeLang } from '../../../lib/codeLang'
import './SolidSmellSpotter.css'

/**
 * SolidSmellSpotter: a short snippet plus the pain it causes; the reader picks
 * which SOLID principle is violated (or none) and gets the reasoning and the fix.
 */

type Choice = 'S' | 'O' | 'L' | 'I' | 'D' | 'none'

const CHOICES: { value: Choice; short: string; label: string }[] = [
  { value: 'S', short: 'S', label: 'Responsabilidad única' },
  { value: 'O', short: 'O', label: 'Abierto/cerrado' },
  { value: 'L', short: 'L', label: 'Liskov' },
  { value: 'I', short: 'I', label: 'Segregación de interfaces' },
  { value: 'D', short: 'D', label: 'Inversión de dependencias' },
  { value: 'none', short: '—', label: 'Ninguno: está bien así' },
]

interface Snippet {
  title: string
  file: string
  code: string
  /** the same snippet in Java */
  javaFile: string
  java: string
  symptom: string
  answer: Choice
  why: string
  fix: string
  /** explanation for the most likely wrong picks */
  misses: Partial<Record<Choice, string>>
}

const SNIPPETS: Snippet[] = [
  {
    title: 'Empleado',
    file: 'empleado.ts',
    code: `class Empleado {
  calcularPago(): number { /* usa horasRegulares() */ }
  reportarHoras(): Reporte { /* usa horasRegulares() */ }
  guardar(): void { db.save(this) }

  private horasRegulares(): number { /* ... */ }
}`,
    javaFile: 'Empleado.java',
    java: `class Empleado {
    double calcularPago() { /* usa horasRegulares() */ }
    Reporte reportarHoras() { /* usa horasRegulares() */ }
    void guardar() { Db.save(this); }

    private double horasRegulares() { /* ... */ }
}`,
    symptom: 'Finanzas pide cambiar cómo se cuentan las horas para el pago. El cambio en horasRegulares() descuadra el reporte que usa Recursos Humanos.',
    answer: 'S',
    why: 'Tres actores distintos (Finanzas, Recursos Humanos y quien decide la persistencia) piden cambios a la misma clase. Un cambio pedido por uno rompe lo de otro porque comparten un helper. Es el ejemplo que usa Robert C. Martin en Clean Architecture.',
    fix: 'Separar en CalculadoraDePago, ReporteDeHoras y RepositorioEmpleados; cada una con su propia regla de horas si los actores la definen distinto.',
    misses: {
      O: 'Aquí no aparece un caso nuevo que obligue a editar un switch. El problema es que dos equipos distintos tocan el mismo código.',
      I: 'No hay un cliente obligado a depender de métodos que no usa; el problema está dentro de la clase, no en su contrato.',
    },
  },
  {
    title: 'Costo de envío',
    file: 'envios.ts',
    code: `function costoEnvio(p: Pedido): number {
  switch (p.transportista) {
    case 'dhl':      return 50 + p.pesoKg * 4
    case 'fedex':    return 45 + p.pesoKg * 5
    case 'estafeta': return 30 + p.pesoKg * 6 // agregado ayer
    default: throw new Error('transportista desconocido')
  }
}`,
    javaFile: 'Envios.java',
    java: `static int costoEnvio(Pedido p) {
    return switch (p.transportista()) {
        case "dhl" -> 50 + p.pesoKg() * 4;
        case "fedex" -> 45 + p.pesoKg() * 5;
        case "estafeta" -> 30 + p.pesoKg() * 6; // agregado ayer
        default -> throw new IllegalArgumentException("transportista desconocido");
    };
}`,
    symptom: 'Cada transportista nuevo obliga a editar esta función y sus tests. Y hay otro switch idéntico en tiempoEntrega().',
    answer: 'O',
    why: 'El eje que cambia (los transportistas) ya cambió varias veces, y cada vez hay que editar código que funcionaba. Abierto/cerrado pide poder agregar un caso nuevo sin tocar los existentes.',
    fix: 'Una interfaz Transportista con costo(p) y tiempo(p), una implementación por transportista y un registro { dhl: new Dhl(), ... }. Agregar uno nuevo es agregar un archivo.',
    misses: {
      S: 'La función hace una sola cosa: calcular el costo. El problema no es cuántas responsabilidades tiene, sino que no puedes extenderla sin editarla.',
      none: 'Con dos casos, un switch está bien. Pero aquí el eje ya cambió tres veces y el switch está duplicado: es el momento de abrirlo.',
    },
  },
  {
    title: 'Cuadrado y rectángulo',
    file: 'figuras.ts',
    code: `class Rectangulo {
  setAncho(w: number) { this.ancho = w }
  setAlto(h: number)  { this.alto = h }
  area() { return this.ancho * this.alto }
}
class Cuadrado extends Rectangulo {
  setAncho(w: number) { this.ancho = w; this.alto = w }
  setAlto(h: number)  { this.ancho = h; this.alto = h }
}`,
    javaFile: 'Figuras.java',
    java: `class Rectangulo {
    protected int ancho, alto;
    void setAncho(int w) { ancho = w; }
    void setAlto(int h) { alto = h; }
    int area() { return ancho * alto; }
}
class Cuadrado extends Rectangulo {
    @Override void setAncho(int w) { ancho = w; alto = w; }
    @Override void setAlto(int h) { ancho = h; alto = h; }
}`,
    symptom: 'Un test hace r.setAncho(5); r.setAlto(4) y espera área 20. Si r es un Cuadrado, da 16.',
    answer: 'L',
    why: 'Cuadrado compila como Rectangulo pero rompe su contrato implícito: cambiar el alto no debería cambiar el ancho. Código que funciona con la base deja de funcionar con la subclase.',
    fix: 'No modelar Cuadrado como subtipo mutable de Rectangulo. Que ambos implementen una interfaz Figura con area(), o que sean inmutables (un Cuadrado inmutable sí es un Rectangulo válido).',
    misses: {
      O: 'Nadie está editando código existente para agregar un caso. Lo que falla es la sustitución: un subtipo que no se comporta como su base.',
      I: 'La interfaz no es demasiado grande; el problema es que la subclase cambia el significado de los métodos heredados.',
    },
  },
  {
    title: 'Repositorio gigante',
    file: 'reporte-ventas.ts',
    code: `interface RepositorioPedidos {
  buscarPorId(id: string): Pedido
  guardar(p: Pedido): void
  borrar(id: string): void
  buscarPorFecha(desde: Date, hasta: Date): Pedido[]
  importarCsv(ruta: string): void
  reconstruirIndices(): void
}
class ReporteVentas {
  constructor(private repo: RepositorioPedidos) {} // solo usa buscarPorFecha
}`,
    javaFile: 'ReporteVentas.java',
    java: `interface RepositorioPedidos {
    Pedido buscarPorId(String id);
    void guardar(Pedido p);
    void borrar(String id);
    List<Pedido> buscarPorFecha(LocalDate desde, LocalDate hasta);
    void importarCsv(String ruta);
    void reconstruirIndices();
}
class ReporteVentas {
    private final RepositorioPedidos repo; // solo usa buscarPorFecha
    ReporteVentas(RepositorioPedidos repo) { this.repo = repo; }
}`,
    symptom: 'Para testear ReporteVentas hay que escribir un fake con seis métodos, y cualquier cambio en importarCsv toca al reporte.',
    answer: 'I',
    why: 'ReporteVentas depende de un contrato mucho más grande que lo que usa. Las interfaces se diseñan desde el cliente: este cliente solo necesita leer pedidos por fecha.',
    fix: 'Una interfaz PedidosPorFecha con un solo método. La clase concreta PostgresPedidos puede implementar esa y varias más.',
    misses: {
      S: 'Podría discutirse que el repositorio hace mucho, pero el dolor del enunciado está del lado del cliente: depende de métodos que no usa. Eso es ISP.',
      D: 'ReporteVentas ya depende de una abstracción (una interfaz), no de una clase concreta. El problema es el tamaño de esa abstracción.',
    },
  },
  {
    title: 'Checkout',
    file: 'checkout.ts',
    code: `class Checkout {
  private pagos = new StripeClient(process.env.STRIPE_KEY!)
  private db = new PostgresPool(process.env.DB_URL!)

  async pagar(carrito: Carrito) {
    const cargo = await this.pagos.charges.create({ amount: carrito.total })
    await this.db.query('INSERT INTO pagos VALUES ($1)', [cargo.id])
  }
}`,
    javaFile: 'Checkout.java',
    java: `class Checkout {
    private final StripeClient pagos = new StripeClient(System.getenv("STRIPE_KEY"));
    private final JdbcTemplate db = new JdbcTemplate(System.getenv("DB_URL"));

    void pagar(Carrito carrito) {
        Cargo cargo = pagos.cobrar(carrito.total());
        db.update("INSERT INTO pagos VALUES (?)", cargo.id());
    }
}`,
    symptom: 'No hay forma de probar Checkout sin red ni base de datos, y pasar a MercadoPago obliga a reescribir la clase.',
    answer: 'D',
    why: 'La regla de negocio (cobrar un carrito) depende directamente de dos detalles de infraestructura que ella misma crea. El alto nivel queda atado al bajo nivel.',
    fix: 'Definir PasarelaDePago y RepositorioPagos en el dominio y recibirlos por el constructor. Un solo lugar (la composition root) crea StripeGateway y lo inyecta.',
    misses: {
      S: 'Hay algo de mezcla, pero el síntoma (imposible de testear, atado a Stripe) apunta a que la clase crea sus propias dependencias concretas.',
      O: 'Cambiar de proveedor sí obliga a editar, pero la causa es la dependencia concreta. Al invertirla, la extensión sale gratis.',
    },
  },
  {
    title: 'Gift card',
    file: 'pagos.ts',
    code: `class Pago {
  reembolsar(monto: number): void { /* devuelve el dinero */ }
}
class PagoGiftCard extends Pago {
  reembolsar(monto: number): void {
    throw new Error('Las gift cards no se reembolsan')
  }
}
// en devoluciones.ts
if (!(pago instanceof PagoGiftCard)) pago.reembolsar(total)`,
    javaFile: 'Pagos.java',
    java: `class Pago {
    void reembolsar(long monto) { /* devuelve el dinero */ }
}
class PagoGiftCard extends Pago {
    @Override void reembolsar(long monto) {
        throw new UnsupportedOperationException("Las gift cards no se reembolsan");
    }
}
// en Devoluciones.java
if (!(pago instanceof PagoGiftCard)) pago.reembolsar(total);`,
    symptom: 'El módulo de devoluciones tuvo que preguntar por el tipo concreto para no explotar.',
    answer: 'L',
    why: 'Una subclase que lanza "no soportado" en un método heredado promete menos que su base. La señal es el instanceof en el cliente: el código ya no puede tratar a todos los pagos por igual.',
    fix: 'Sacar reembolsar() de Pago y crear una interfaz Reembolsable que solo implementen los medios que lo soportan, o modelar el reembolso de la gift card como un crédito.',
    misses: {
      I: 'Está cerca: la solución pasa por una interfaz más chica. Pero el síntoma central es un subtipo que no puede sustituir a su base, y eso es Liskov.',
      O: 'El instanceof obliga a editar el cliente cuando aparece otro caso especial, pero esa es la consecuencia. La causa es la sustitución rota.',
    },
  },
  {
    title: 'Descuento',
    file: 'precios.ts',
    code: `function precioConDescuento(centavos: number, porcentaje: number): number {
  if (porcentaje < 0 || porcentaje > 100) {
    throw new RangeError('porcentaje fuera de rango')
  }
  return Math.round((centavos * (100 - porcentaje)) / 100)
}`,
    javaFile: 'Precios.java',
    java: `static long precioConDescuento(long centavos, int porcentaje) {
    if (porcentaje < 0 || porcentaje > 100) {
        throw new IllegalArgumentException("porcentaje fuera de rango");
    }
    return Math.round(centavos * (100 - porcentaje) / 100.0);
}`,
    symptom: 'Hay una sola regla de descuento y nadie pidió otras. Un compañero propone una DescuentoStrategy con su fábrica "para estar preparados".',
    answer: 'none',
    why: 'No hay ningún eje de cambio real ni un dolor que diagnosticar. Una Strategy aquí es generalidad especulativa: pagas hoy por una variación que quizá nunca llegue.',
    fix: 'Dejarla así, bien testeada. Si mañana aparece una segunda regla, extraer la interfaz con dos casos reales es un refactor de minutos.',
    misses: {
      O: 'Abierto/cerrado se aplica a ejes que ya cambiaron o que el negocio anunció. Con una sola regla, abrirla es YAGNI.',
      S: 'La función valida y calcula un precio con descuento: una sola razón para cambiar.',
    },
  },
]

const EASE = [0.16, 1, 0.3, 1] as const

export function SolidSmellSpotter() {
  const reduced = useReducedMotion()
  const [pref, setPref] = useCodeLang()
  const langs = ['Java', 'TypeScript']
  const lang = langs[pickLang(langs, pref)]
  const [at, setAt] = useState(0)
  const [picks, setPicks] = useState<Record<number, Choice[]>>({})
  const [revealed, setRevealed] = useState<Record<number, boolean>>({})

  const s = SNIPPETS[at]
  const mine = picks[at] ?? []
  const solved = mine.includes(s.answer) || !!revealed[at]
  const lastWrong = !solved && mine.length > 0 ? mine[mine.length - 1] : null
  const firstTry = SNIPPETS.filter((sn, k) => picks[k]?.[0] === sn.answer).length
  const attempted = SNIPPETS.filter((_, k) => (picks[k]?.length ?? 0) > 0 || revealed[k]).length

  const pick = (c: Choice) => {
    if (solved || mine.includes(c)) return
    setPicks((p) => ({ ...p, [at]: [...(p[at] ?? []), c] }))
  }
  const go = (d: number) => setAt((a) => (a + d + SNIPPETS.length) % SNIPPETS.length)
  const label = (c: Choice) => CHOICES.find((x) => x.value === c)!

  return (
    <WidgetFrame
      caption="Lee el fragmento y el síntoma, y elige qué principio se viola. Ojo: a veces la respuesta correcta es que no hace falta ningún principio."
      readout={
        <p className="ssp-score">
          {attempted === 0 ? (
            `Todavía no respondiste ningún fragmento. Son ${SNIPPETS.length}; usa las flechas para recorrerlos.`
          ) : (
            <>
              Aciertos al primer intento: <b>{firstTry}</b> de {attempted} {attempted === 1 ? 'fragmento intentado' : 'fragmentos intentados'}.
            </>
          )}
        </p>
      }
    >
      <div className="ssp">
        <div className="ssp-top">
          <button type="button" className="icon-btn" onClick={() => go(-1)} aria-label="Fragmento anterior">
            <ChevronLeft size={18} />
          </button>
          <span className="ssp-count">
            Fragmento {at + 1} <span>de {SNIPPETS.length}</span> · {s.title}
          </span>
          <button type="button" className="icon-btn" onClick={() => go(1)} aria-label="Fragmento siguiente">
            <ChevronRight size={18} />
          </button>
        </div>

        <div className="ssp-code">
          <div className="ssp-code__bar">
            <span className="ssp-code__file">{lang === 'Java' ? s.javaFile : s.file}</span>
            <div className="ssp-code__tabs" role="tablist" aria-label="Lenguaje del código">
              {langs.map((l) => (
                <button key={l} type="button" role="tab" aria-selected={l === lang} className={`ssp-code__tab ${l === lang ? 'is-on' : ''}`} onClick={() => setPref(l)}>
                  {l}
                </button>
              ))}
            </div>
          </div>
          <pre>
            <code>{lang === 'Java' ? s.java : s.code}</code>
          </pre>
        </div>

        <p className="ssp-symptom">
          <span className="hand">síntoma:</span> {s.symptom}
        </p>

        <div className="ssp-choices" role="group" aria-label="¿Qué principio se viola?">
          {CHOICES.map((c) => {
            const tried = mine.includes(c.value)
            const isAnswer = c.value === s.answer
            const state = solved && isAnswer ? 'is-right' : tried && !isAnswer ? 'is-wrong' : ''
            return (
              <button
                key={c.value}
                type="button"
                className={`ssp-choice ${state}`}
                onClick={() => pick(c.value)}
                disabled={solved || tried}
                aria-pressed={tried}
              >
                <span className="ssp-choice__k" aria-hidden="true">
                  {c.short}
                </span>
                <span className="ssp-choice__l">{c.label}</span>
                {state === 'is-right' && <Check size={16} className="ssp-choice__i" aria-label="correcto" />}
                {state === 'is-wrong' && <X size={16} className="ssp-choice__i" aria-label="incorrecto" />}
              </button>
            )
          })}
        </div>

        <AnimatePresence mode="wait" initial={false}>
          {solved ? (
            <motion.div
              key={`ok-${at}`}
              className="ssp-feedback is-ok"
              initial={{ opacity: 0, y: reduced ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: EASE }}
              aria-live="polite"
            >
              <p>
                <b>
                  {s.answer === 'none' ? 'Ninguno.' : `${label(s.answer).short}: ${label(s.answer).label}.`}
                </b>{' '}
                {s.why}
              </p>
              <p>
                <span className="hand">cómo se arregla:</span> {s.fix}
              </p>
            </motion.div>
          ) : lastWrong ? (
            <motion.div
              key={`bad-${at}-${lastWrong}`}
              className="ssp-feedback is-bad"
              initial={{ opacity: 0, y: reduced ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25, ease: EASE }}
              aria-live="polite"
            >
              <p>
                <b>No es {lastWrong === 'none' ? '"ninguno"' : label(lastWrong).label}.</b>{' '}
                {s.misses[lastWrong] ?? 'Ese principio no explica el síntoma del enunciado. Pregúntate qué cambio duele y por qué.'} Prueba otra opción.
              </p>
              <button type="button" className="btn btn--ghost ssp-reveal" onClick={() => setRevealed((r) => ({ ...r, [at]: true }))}>
                <Eye size={15} /> Ver la respuesta
              </button>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </WidgetFrame>
  )
}
