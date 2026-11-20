import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Bot, FileText, ShieldCheck, User } from 'lucide-react'
import { WidgetFrame } from '../kit'
import { StationRow } from './StationRow'
import './SddPipeline.css'

interface Stage {
  id: string
  name: string
  file: string
  who: string
  question: string
  gate: string
  body: string
}

const STAGES: Stage[] = [
  {
    id: 'const',
    name: 'Constitución',
    file: '.specify/memory/constitution.md',
    who: 'Lo escribe el equipo una vez; el agente lo lee en cada fase.',
    question: '¿Qué principios no se negocian en este repo?',
    gate: 'Que sean pocos, verificables y que de verdad apliquen a todo cambio.',
    body: `# Principios del servicio de pagos

1. Test primero: ningún código de producción
   sin un test que falle antes.
2. Dinero en centavos (integer), nunca float.
3. Toda operación sobre pagos es idempotente
   (Idempotency-Key obligatoria).
4. Nada de dependencias nuevas sin ADR.
5. Logs sin datos de tarjeta (PCI).`,
  },
  {
    id: 'spec',
    name: 'Spec',
    file: 'specs/014-reembolsos-parciales/spec.md',
    who: 'Tú describes el qué y el por qué; el agente redacta y te pregunta lo ambiguo.',
    question: '¿Qué tiene que pasar, para quién, y cómo sé que está bien?',
    gate: 'Cada requisito es testeable; no hay detalles de implementación; las ambigüedades están marcadas.',
    body: `## Historia
Como agente de soporte quiero reembolsar parte
de un pedido para compensar un ítem dañado
sin anular la venta completa.

## Requisitos (EARS)
R1. CUANDO soporte solicita un reembolso parcial
    de un pedido pagado, EL SISTEMA DEBERÁ
    reembolsar el monto indicado al medio de pago
    original.
R2. SI el monto excede lo reembolsable restante,
    ENTONCES EL SISTEMA DEBERÁ rechazar la
    solicitud con el error REFUND_EXCEEDS_BALANCE.
R3. CUANDO se repite una solicitud con la misma
    Idempotency-Key, EL SISTEMA DEBERÁ devolver
    el resultado original sin reembolsar de nuevo.

## Fuera de alcance
Reembolsos a otro medio de pago.
[NECESITA ACLARACIÓN] ¿Se reembolsa el envío?`,
  },
  {
    id: 'plan',
    name: 'Plan',
    file: 'specs/014-reembolsos-parciales/plan.md',
    who: 'El agente propone el cómo (stack, diseño, contratos); tú lo corriges.',
    question: '¿Cómo lo construimos en ESTE código, respetando la constitución?',
    gate: 'Reusa lo que existe, respeta los principios, nombra riesgos y alternativas descartadas.',
    body: `## Enfoque
- Nuevo agregado Refund en src/payments/refunds/
- POST /orders/:id/refunds  (body: amountCents,
  reason) con header Idempotency-Key.
- Saldo reembolsable = total - sum(refunds OK).
- Llamada al PSP vía PaymentGateway.refund()
  (ya existe, hoy solo con montos totales).

## Datos
tabla refunds(id, order_id, amount_cents,
  status, idempotency_key UNIQUE, created_at)

## Chequeo de constitución
✔ centavos  ✔ idempotencia  ✔ sin deps nuevas`,
  },
  {
    id: 'tasks',
    name: 'Tareas',
    file: 'specs/014-reembolsos-parciales/tasks.md',
    who: 'El agente parte el plan en pasos chicos y ordenados; tú validas el orden.',
    question: '¿En qué pasos verificables se divide, y cuáles se pueden paralelizar?',
    gate: 'Cada tarea cabe en una sesión, tiene su test y referencia el requisito que cubre.',
    body: `- [ ] T1  Migración tabla refunds            (R1)
- [ ] T2  Test: saldo reembolsable          (R2)
- [ ] T3  Refund.create() + validación      (R1,R2)
- [ ] T4  [P] Test idempotencia             (R3)
- [ ] T5  [P] PaymentGateway.refund(monto)  (R1)
- [ ] T6  Endpoint POST /refunds            (R1-R3)
- [ ] T7  Test e2e contra PSP sandbox       (R1)

[P] = paralelizable, no toca los mismos archivos`,
  },
  {
    id: 'impl',
    name: 'Implementar',
    file: 'git log --oneline',
    who: 'El agente implementa tarea por tarea; tú miras el primer minuto y los diffs.',
    question: '¿El código hace lo que dice la tarea, y nada más?',
    gate: 'Un commit por tarea, tests en verde antes de marcar [x], sin cambios fuera de alcance.',
    body: `a1f3c2e T1 migración refunds
b7d9e01 T2 test saldo reembolsable (rojo)
c2e44aa T3 Refund.create con validación (verde)
d91b7f3 T4 test idempotencia
e0a6b12 T5 gateway acepta monto parcial
f5c8d70 T6 endpoint POST /orders/:id/refunds`,
  },
  {
    id: 'verify',
    name: 'Verificar',
    file: 'checklist de revisión',
    who: 'Tests, tipos y CI lo verifican; un revisor (humano o agente fresco) contrasta contra la spec.',
    question: '¿Cada requisito tiene evidencia? ¿La spec sigue siendo verdad?',
    gate: 'Trazabilidad R → test → código; la spec se actualiza si la implementación aprendió algo.',
    body: `R1 reembolso parcial      → refunds.e2e.test.ts ✔
R2 excede saldo            → refund.test.ts:41   ✔
R3 idempotencia            → refund.test.ts:77   ✔
Constitución: centavos ✔ idempotencia ✔ PCI ✔

Hallazgo: el PSP rechaza reembolsos < 50 centavos.
→ Agregar R4 a spec.md y volver a Plan.`,
  },
]

export function SddPipeline() {
  const [i, setI] = useState(1)
  const reduced = useReducedMotion()
  const st = STAGES[i]
  return (
    <WidgetFrame
      caption="El pipeline de Spec-Driven Development aplicado a una feature real (reembolsos parciales). Toca cada etapa para ver el artefacto que produce y qué revisas antes de avanzar."
      readout={
        <p>
          <ShieldCheck size={15} aria-hidden="true" className="sdd-inline-icon" /> <b>Puerta de calidad:</b> {st.gate}
        </p>
      }
    >
      <StationRow label="Fase del pipeline" items={STAGES.map((s) => ({ id: s.id, label: s.name }))} value={i} onChange={setI} />
      <AnimatePresence mode="wait" initial={false}>
        <motion.div
          key={st.id}
          className="sdd-body"
          initial={{ opacity: 0, y: reduced ? 0 : 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: reduced ? 0 : -6 }}
          transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}
        >
          <div className="sdd-meta">
            <p className="sdd-question">{st.question}</p>
            <p className="sdd-who">
              <span className="sdd-who__icons" aria-hidden="true">
                <User size={15} />
                <Bot size={15} />
              </span>
              {st.who}
            </p>
          </div>
          <div className="sdd-file">
            <div className="sdd-file__head">
              <FileText size={14} aria-hidden="true" />
              <code>{st.file}</code>
            </div>
            <pre className="sdd-file__body">{st.body}</pre>
          </div>
        </motion.div>
      </AnimatePresence>
    </WidgetFrame>
  )
}
