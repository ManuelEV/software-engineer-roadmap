import { useEffect, useMemo, useRef, useState } from 'react'
import { motion } from 'motion/react'
import { Play, RotateCcw, Workflow } from 'lucide-react'
import { Log, Segmented, WidgetFrame } from '../kit'
import { useTransition } from './shared'
import './SagaSimulator.css'

type Mode = 'orch' | 'chor'
type Fail = 'none' | '1' | '2' | '3'
type Status = 'idle' | 'running' | 'done' | 'failed' | 'compensating' | 'compensated' | 'retrying'
type Kind = 'compensable' | 'pivot' | 'retriable'

interface StepDef {
  svc: string
  action: string
  cmd: string
  evt: string
  failEvt: string
  comp?: string
  compEvt?: string
  kind: Kind
}

const STEPS: StepDef[] = [
  { svc: 'Pedidos', action: 'Crear pedido (PENDIENTE)', cmd: 'CrearPedido', evt: 'PedidoCreado', failEvt: '', comp: 'Cancelar pedido', compEvt: 'PedidoCancelado', kind: 'compensable' },
  { svc: 'Inventario', action: 'Reservar stock', cmd: 'ReservarStock', evt: 'StockReservado', failEvt: 'StockInsuficiente', comp: 'Liberar stock', compEvt: 'StockLiberado', kind: 'compensable' },
  { svc: 'Pagos', action: 'Autorizar pago', cmd: 'AutorizarPago', evt: 'PagoAutorizado', failEvt: 'PagoRechazado', kind: 'pivot' },
  { svc: 'Envíos', action: 'Programar envío', cmd: 'ProgramarEnvio', evt: 'EnvioProgramado', failEvt: 'EnvioFallo', kind: 'retriable' },
  { svc: 'Pedidos', action: 'Aprobar pedido', cmd: 'AprobarPedido', evt: 'PedidoAprobado', failEvt: '', kind: 'retriable' },
]

const KIND_LABEL: Record<Kind, string> = { compensable: 'compensable', pivot: 'pivote', retriable: 'reintentable' }
const STATUS_LABEL: Record<Status, string> = {
  idle: 'en espera',
  running: 'ejecutando',
  done: 'hecho',
  failed: 'falló',
  compensating: 'compensando',
  compensated: 'compensado',
  retrying: 'reintentando',
}

interface Frame {
  statuses: Status[]
  log: string
  tone?: 'ok' | 'warn' | 'bad'
  orch: string
}

function buildFrames(mode: Mode, fail: Fail): Frame[] {
  const frames: Frame[] = []
  const st: Status[] = STEPS.map(() => 'idle')
  const push = (log: string, orch: string, tone?: Frame['tone']) => frames.push({ statuses: [...st], log, orch, tone })
  const failAt = fail === 'none' ? -1 : Number(fail)

  for (let i = 0; i < STEPS.length; i++) {
    const s = STEPS[i]
    st[i] = 'running'
    if (mode === 'orch') push(`Orquestador → ${s.svc}: ${s.cmd} (comando)`, s.cmd.toUpperCase())
    else push(i === 0 ? `Cliente → Pedidos: ${s.cmd}` : `${STEPS[i - 1].svc} publicó ${STEPS[i - 1].evt} → ${s.svc} reacciona`, '')

    if (i === failAt) {
      if (s.kind === 'retriable') {
        st[i] = 'retrying'
        push(`${s.svc}: falla transitoria (timeout). Paso reintentable: se reintenta, no se compensa`, mode === 'orch' ? 'REINTENTANDO' : '', 'warn')
        push(`${s.svc}: reintento 2 con backoff… ok (operación idempotente)`, mode === 'orch' ? 'REINTENTANDO' : '', 'warn')
      } else {
        st[i] = 'failed'
        push(`${s.svc}: ${s.failEvt}`, mode === 'orch' ? 'COMPENSANDO' : '', 'bad')
        let trigger = s.failEvt
        for (let j = i - 1; j >= 0; j--) {
          const c = STEPS[j]
          if (!c.comp) continue
          st[j] = 'compensating'
          if (mode === 'orch') push(`Orquestador → ${c.svc}: ${c.comp} (compensación)`, 'COMPENSANDO', 'warn')
          else push(`${c.svc} escucha ${trigger} → ${c.comp.toLowerCase()}`, '', 'warn')
          st[j] = 'compensated'
          push(`${c.svc}: ${c.compEvt}`, mode === 'orch' ? 'COMPENSANDO' : '', 'warn')
          trigger = c.compEvt ?? trigger
        }
        push('Saga terminada: pedido rechazado. Cada servicio deshizo su parte; el sistema quedó consistente.', mode === 'orch' ? 'RECHAZADO' : '', 'ok')
        return frames
      }
    }
    st[i] = 'done'
    if (mode === 'orch') push(`${s.svc} → Orquestador: ${s.evt}`, s.evt.toUpperCase())
    else push(`${s.svc} publica ${s.evt}`, '')
  }
  push('Saga completada: pedido aprobado.', mode === 'orch' ? 'APROBADO' : '', 'ok')
  return frames
}

export function SagaSimulator() {
  const [mode, setMode] = useState<Mode>('orch')
  const [fail, setFail] = useState<Fail>('2')
  const [i, setI] = useState(-1)
  const timer = useRef<number | null>(null)
  const t = useTransition(0.25)
  const frames = useMemo(() => buildFrames(mode, fail), [mode, fail])

  const stop = () => {
    if (timer.current) window.clearInterval(timer.current)
    timer.current = null
  }
  useEffect(() => stop, [])

  const reset = () => {
    stop()
    setI(-1)
  }
  const run = () => {
    stop()
    setI(0)
    timer.current = window.setInterval(() => {
      setI((x) => {
        if (x + 1 >= frames.length) {
          stop()
          return x
        }
        return x + 1
      })
    }, 1000)
  }

  const frame = i >= 0 ? frames[i] : null
  const statuses = frame?.statuses ?? STEPS.map(() => 'idle' as Status)
  const entries = frames
    .slice(0, i + 1)
    .map((f, k) => ({ id: k, text: f.log, tone: f.tone }))
    .reverse()

  return (
    <WidgetFrame
      caption="Saga para crear un pedido. Inyecta una falla y observa: antes del pivote (el pago), los pasos hechos se compensan en orden inverso; después del pivote, los pasos se reintentan hasta completar, porque ya no hay vuelta atrás."
      controls={
        <>
          <Segmented<Mode>
            label="Coordinación"
            value={mode}
            onChange={(m) => {
              setMode(m)
              reset()
            }}
            options={[
              { value: 'orch', label: 'Orquestación' },
              { value: 'chor', label: 'Coreografía' },
            ]}
          />
          <Segmented<Fail>
            label="Inyectar falla en"
            value={fail}
            onChange={(f) => {
              setFail(f)
              reset()
            }}
            options={[
              { value: 'none', label: 'Ninguno' },
              { value: '1', label: 'Inventario' },
              { value: '2', label: 'Pagos' },
              { value: '3', label: 'Envíos' },
            ]}
          />
          <div className="sg-actions">
            <button type="button" className="btn btn--line" onClick={run}>
              <Play size={16} aria-hidden="true" /> Ejecutar saga
            </button>
            <button type="button" className="icon-btn" onClick={reset} aria-label="Reiniciar">
              <RotateCcw size={18} />
            </button>
          </div>
        </>
      }
      readout={<Log entries={entries} empty="Pulsa 'Ejecutar saga'." />}
    >
      <div className="sg-wrap">
        <div className={`sg-coord ${mode === 'orch' ? 'is-orch' : ''}`}>
          <Workflow size={18} aria-hidden="true" />
          {mode === 'orch' ? (
            <span>
              <b>Orquestador</b> CrearPedidoSaga · estado: <code>{frame?.orch || 'INICIO'}</code>
            </span>
          ) : (
            <span>
              <b>Sin coordinador:</b> cada servicio escucha eventos y decide qué hacer
            </span>
          )}
        </div>
        <ol className="sg-steps">
          {STEPS.map((s, k) => {
            const status = statuses[k]
            return (
              <li key={k} className={`sg-step is-${status}`}>
                <span className="sg-step__dot" aria-hidden="true" />
                <div className="sg-step__body">
                  <div className="sg-step__top">
                    <b>{s.svc}</b>
                    <span className={`sg-kind sg-kind--${s.kind}`}>{KIND_LABEL[s.kind]}</span>
                  </div>
                  <div className="sg-step__action">
                    {s.action}
                    {s.comp && <span className="sg-comp"> · compensación: {s.comp.toLowerCase()}</span>}
                  </div>
                </div>
                <motion.span key={status} className="sg-status" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={t}>
                  {STATUS_LABEL[status]}
                </motion.span>
              </li>
            )
          })}
        </ol>
      </div>
    </WidgetFrame>
  )
}
