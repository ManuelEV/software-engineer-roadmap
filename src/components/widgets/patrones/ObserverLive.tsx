import { useRef, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { BarChart3, Mail, MessageSquare, Package, Radio, ShoppingCart, TriangleAlert } from 'lucide-react'
import { Log, Segmented, Stat, WidgetFrame } from '../kit'
import './ObserverLive.css'

type EventName = 'OrderPaid' | 'OrderShipped'
type SubId = 'email' | 'sms' | 'analytics' | 'inventory'

const services: { id: SubId; cls: string; label: string; Icon: typeof Mail; msg: Record<EventName, string> }[] = [
  {
    id: 'email',
    cls: 'EmailNotifier',
    label: 'Correo',
    Icon: Mail,
    msg: { OrderPaid: 'Recibo enviado a ana@correo.com', OrderShipped: 'Correo con número de guía' },
  },
  {
    id: 'sms',
    cls: 'SmsNotifier',
    label: 'SMS',
    Icon: MessageSquare,
    msg: { OrderPaid: 'SMS: “Pago confirmado”', OrderShipped: 'SMS: “Tu pedido va en camino”' },
  },
  {
    id: 'analytics',
    cls: 'AnalyticsTracker',
    label: 'Analítica',
    Icon: BarChart3,
    msg: { OrderPaid: 'track("order_paid")', OrderShipped: 'track("order_shipped")' },
  },
  {
    id: 'inventory',
    cls: 'InventoryService',
    label: 'Inventario',
    Icon: Package,
    msg: { OrderPaid: 'Stock reservado (3 ítems)', OrderShipped: 'Stock descontado del almacén' },
  },
]

const ease = [0.16, 1, 0.3, 1] as const

export function ObserverLive() {
  const reduced = useReducedMotion()
  const [event, setEvent] = useState<EventName>('OrderPaid')
  const [subs, setSubs] = useState<Record<SubId, boolean>>({ email: true, sms: false, analytics: true, inventory: true })
  // UI component: mounted? how many live subscriptions does it hold?
  const [mounted, setMounted] = useState(true)
  const [cartSubs, setCartSubs] = useState(1)
  const [cleanup, setCleanup] = useState(false)
  const [pulse, setPulse] = useState(0)
  const [log, setLog] = useState<{ id: number; text: string; tone?: 'ok' | 'warn' | 'bad' }[]>([])
  const nextId = useRef(0)

  const add = (entries: { text: string; tone?: 'ok' | 'warn' | 'bad' }[]) =>
    setLog((l) => [...entries.reverse().map((e) => ({ ...e, id: nextId.current++ })), ...l].slice(0, 30))

  const zombies = cartSubs - (mounted ? 1 : 0)
  const total = Object.values(subs).filter(Boolean).length + cartSubs

  const publish = () => {
    setPulse((p) => p + 1)
    const entries: { text: string; tone?: 'ok' | 'warn' | 'bad' }[] = [{ text: `order.notify("${event}") → ${total} observador(es)` }]
    services.forEach((s) => {
      if (subs[s.id]) entries.push({ text: `  ${s.cls}.update(): ${s.msg[event]}`, tone: 'ok' })
    })
    for (let i = 0; i < cartSubs; i++) {
      const isZombie = !mounted || i > 0
      entries.push(
        isZombie
          ? { text: `  CartBadge.update() en componente desmontado: listener huérfano`, tone: 'bad' }
          : { text: `  CartBadge.update(): badge actualizado`, tone: 'ok' },
      )
    }
    if (total === 0) entries.push({ text: '  (nadie escucha: el evento se pierde)', tone: 'warn' })
    add(entries)
  }

  const toggleScreen = () => {
    if (mounted) {
      setMounted(false)
      if (cleanup) {
        setCartSubs((n) => n - 1)
        add([{ text: 'CartBadge desmontado → order.unsubscribe(badge)', tone: 'ok' }])
      } else {
        add([{ text: 'CartBadge desmontado SIN unsubscribe: el sujeto aún lo referencia', tone: 'warn' }])
      }
    } else {
      setMounted(true)
      setCartSubs((n) => n + 1)
      add([{ text: 'CartBadge montado → order.subscribe(badge)' }])
    }
  }

  return (
    <WidgetFrame
      caption="El sujeto (Order) no conoce a sus observadores concretos: solo recorre una lista y llama update(). Suscribe, desuscribe y publica. Luego cierra la pantalla del carrito sin limpiar y vuelve a abrirla."
      controls={
        <>
          <Segmented<EventName>
            label="Evento"
            value={event}
            onChange={setEvent}
            options={[
              { value: 'OrderPaid', label: 'OrderPaid' },
              { value: 'OrderShipped', label: 'OrderShipped' },
            ]}
          />
          <label className="ol-check">
            <input type="checkbox" checked={cleanup} onChange={(e) => setCleanup(e.target.checked)} />
            <span>unsubscribe al desmontar</span>
          </label>
          <button type="button" className="btn btn--line" onClick={publish}>
            <Radio size={16} aria-hidden="true" /> Publicar evento
          </button>
        </>
      }
      readout={
        <div className="ol-readout">
          <div className="ol-stats">
            <Stat label="Listeners registrados" value={total} />
            <Stat label="Huérfanos" value={zombies} tone={zombies > 0 ? 'bad' : undefined} />
          </div>
          <Log entries={log} empty="Publica un evento para ver a quién le llega." />
        </div>
      }
    >
      <div className="ol-subject">
        <motion.span
          key={pulse}
          className="ol-subject__ring"
          initial={{ opacity: pulse ? 0.9 : 0, scale: 1 }}
          animate={{ opacity: 0, scale: reduced ? 1 : 1.6 }}
          transition={{ duration: 0.6, ease }}
          aria-hidden="true"
        />
        <span className="ol-subject__name">Order</span>
        <span className="ol-subject__sub">sujeto · {total} en la lista</span>
      </div>
      <ul className="ol-grid">
        {services.map((s, i) => {
          const on = subs[s.id]
          return (
            <li key={s.id} className={`ol-card ${on ? 'is-on' : ''}`}>
              <div className="ol-card__head">
                <s.Icon size={18} aria-hidden="true" />
                <span className="ol-card__label">{s.label}</span>
              </div>
              <code className="ol-card__cls">{s.cls}</code>
              <button
                type="button"
                className={`btn ${on ? '' : 'btn--ghost'} ol-card__btn`}
                aria-pressed={on}
                onClick={() => {
                  setSubs((x) => ({ ...x, [s.id]: !on }))
                  add([{ text: `order.${on ? 'unsubscribe' : 'subscribe'}(${s.cls})` }])
                }}
              >
                {on ? 'Desuscribir' : 'Suscribir'}
              </button>
              <AnimatePresence>
                {on && pulse > 0 && (
                  <motion.div
                    key={pulse}
                    className="ol-toast"
                    initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.3, delay: reduced ? 0 : i * 0.08, ease }}
                  >
                    {s.msg[event]}
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          )
        })}
        <li className={`ol-card ol-card--ui ${cartSubs > 0 ? 'is-on' : ''} ${zombies > 0 ? 'is-zombie' : ''}`}>
          <div className="ol-card__head">
            <ShoppingCart size={18} aria-hidden="true" />
            <span className="ol-card__label">Badge del carrito</span>
          </div>
          <code className="ol-card__cls">CartBadge (UI) · {mounted ? 'montado' : 'desmontado'}</code>
          <button type="button" className="btn ol-card__btn" onClick={toggleScreen}>
            {mounted ? 'Cerrar pantalla' : 'Abrir pantalla'}
          </button>
          {zombies > 0 && (
            <div className="ol-warn" role="status">
              <TriangleAlert size={15} aria-hidden="true" /> {zombies} suscripción(es) huérfana(s): fuga de memoria y
              handlers duplicados.
            </div>
          )}
          <AnimatePresence>
            {cartSubs > 0 && pulse > 0 && (
              <motion.div
                key={pulse}
                className={`ol-toast ${zombies > 0 ? 'is-bad' : ''}`}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, delay: reduced ? 0 : 0.32, ease }}
              >
                update() × {cartSubs}
              </motion.div>
            )}
          </AnimatePresence>
        </li>
      </ul>
    </WidgetFrame>
  )
}
