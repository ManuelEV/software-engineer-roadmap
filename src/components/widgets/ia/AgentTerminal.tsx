import { useEffect, useRef, useState } from 'react'
import { ChevronRight, RotateCcw } from 'lucide-react'
import { WidgetFrame } from '../kit'
import './AgentTerminal.css'

type Kind = 'user' | 'assistant' | 'call' | 'result' | 'perm' | 'end'

interface Node {
  kind: Kind
  text: string
  /** which part of the agent's code is running */
  code: string
  next?: string
  yes?: string
  no?: string
}

const SCRIPT: Record<string, Node> = {
  start: { kind: 'user', text: 'Agrega validación de email en src/signup.ts y deja los tests en verde.', code: 'main() → messages.push(user)', next: 'a1' },
  a1: { kind: 'assistant', text: 'Primero veo la estructura y el archivo.', code: 'client.messages.create() → stop_reason: tool_use', next: 'c1' },
  c1: { kind: 'call', text: 'list_files {"path": "src"}', code: 'runTool("list_files") — solo lectura, sin permiso', next: 'r1' },
  r1: { kind: 'result', text: 'signup.ts\nsignup.test.ts\nlib/validators.ts', code: 'messages.push({ role: "user", content: [tool_result] })', next: 'c2' },
  c2: { kind: 'call', text: 'read_file {"path": "src/signup.ts"}', code: 'runTool("read_file") — solo lectura', next: 'r2' },
  r2: {
    kind: 'result',
    text: 'export function signup(input: SignupInput) {\n  return users.create({ email: input.email, name: input.name })\n}',
    code: 'tool_result → siguiente vuelta del loop',
    next: 'c3',
  },
  c3: {
    kind: 'call',
    text: 'edit_file {"path": "src/signup.ts",\n  "old": "  return users.create(",\n  "new": "  if (!isEmail(input.email)) throw new ValidationError(\'email\')\\n  return users.create("}',
    code: 'runTool("edit_file") → askPermission()',
    next: 'p1',
  },
  p1: { kind: 'perm', text: '¿Permitir edit_file en src/signup.ts? [s/N]', code: 'askPermission() espera a readline', yes: 'r3', no: 'r3n' },
  r3: { kind: 'result', text: 'OK: 1 reemplazo en src/signup.ts', code: 'edit aplicado; tool_result con éxito', next: 'c4' },
  r3n: { kind: 'result', text: 'ERROR: el usuario rechazó esta acción.', code: 'tool_result con is_error: true', next: 'a3n' },
  a3n: {
    kind: 'assistant',
    text: 'Entendido, no edito. Este es el cambio que propongo para que lo apliques tú:\n+ if (!isEmail(input.email)) throw new ValidationError(\'email\')',
    code: 'stop_reason: end_turn → el loop termina',
    next: 'endn',
  },
  endn: { kind: 'end', text: 'Fin: 4 llamadas al modelo, 3 herramientas (1 rechazada).', code: 'return' },
  c4: { kind: 'call', text: 'bash {"command": "npm test -- src/signup"}', code: 'runTool("bash") → askPermission()', next: 'p2' },
  p2: { kind: 'perm', text: '¿Permitir bash: npm test -- src/signup? [s/N]', code: 'askPermission()', yes: 'r4', no: 'r4n' },
  r4n: { kind: 'result', text: 'ERROR: el usuario rechazó esta acción.', code: 'tool_result con is_error: true', next: 'a4n' },
  a4n: { kind: 'assistant', text: 'Hice el cambio pero no pude verificarlo. Corre npm test -- src/signup y pásame la salida si algo falla.', code: 'stop_reason: end_turn', next: 'end4n' },
  end4n: { kind: 'end', text: 'Fin sin verificación: el agente lo dice explícitamente en vez de declarar éxito.', code: 'return' },
  r4: {
    kind: 'result',
    text: "FAIL src/signup.test.ts\n  ✕ crea un usuario\n    ValidationError: email\n    at signup (src/signup.ts:2)\n    input: { email: 'ana@pagos', name: 'Ana' }",
    code: 'stdout + stderr truncados a 10 000 caracteres',
    next: 'a5',
  },
  a5: {
    kind: 'assistant',
    text: "El test usa 'ana@pagos' (sin dominio de primer nivel). Es un dato de prueba inválido, no un bug: lo corrijo en el test en lugar de aflojar la validación.",
    code: 'el modelo lee el tool_result y decide',
    next: 'c6',
  },
  c6: { kind: 'call', text: 'edit_file {"path": "src/signup.test.ts",\n  "old": "ana@pagos", "new": "ana@pagos.com"}', code: 'runTool("edit_file") → askPermission()', next: 'p3' },
  p3: { kind: 'perm', text: '¿Permitir edit_file en src/signup.test.ts? [s/N]', code: 'askPermission()', yes: 'r6', no: 'r6n' },
  r6n: { kind: 'result', text: 'ERROR: el usuario rechazó esta acción.', code: 'tool_result con is_error: true', next: 'a6n' },
  a6n: {
    kind: 'assistant',
    text: "No toco el test. La validación quedó hecha, pero el test usa un email inválido ('ana@pagos'): ¿lo corriges tú o prefieres que acepte emails sin dominio de primer nivel?",
    code: 'stop_reason: end_turn → devuelve la decisión al humano',
    next: 'end6n',
  },
  end6n: { kind: 'end', text: 'Fin: el agente pregunta en vez de forzar el verde.', code: 'return' },
  r6: { kind: 'result', text: 'OK: 1 reemplazo en src/signup.test.ts', code: 'tool_result', next: 'c7' },
  c7: { kind: 'call', text: 'bash {"command": "npm test -- src/signup"}', code: 'runTool("bash") → askPermission()', next: 'p4' },
  p4: { kind: 'perm', text: '¿Permitir bash: npm test -- src/signup? [s/N]', code: 'askPermission()', yes: 'r7', no: 'r4n' },
  r7: { kind: 'result', text: 'PASS src/signup.test.ts\n  ✓ crea un usuario\n  ✓ rechaza email inválido\nTests: 2 passed', code: 'tool_result', next: 'a8' },
  a8: {
    kind: 'assistant',
    text: 'Listo. signup() valida el email con isEmail(); corregí un dato de prueba inválido en el test. Evidencia: npm test -- src/signup → 2 passed.',
    code: 'stop_reason: end_turn → el loop termina',
    next: 'end',
  },
  end: { kind: 'end', text: 'Fin: 7 llamadas al modelo, 6 herramientas, cambio verificado.', code: 'return' },
}

const PROMPT: Record<Kind, string> = { user: 'tú', assistant: 'agente', call: 'tool_use', result: 'tool_result', perm: 'permiso', end: '' }

export function AgentTerminal() {
  const [trail, setTrail] = useState<string[]>(['start'])
  const [answers, setAnswers] = useState<Record<string, 's' | 'n'>>({})
  const logRef = useRef<HTMLOListElement>(null)
  const current = SCRIPT[trail[trail.length - 1]]
  const waiting = current.kind === 'perm' && !answers[trail[trail.length - 1]]
  const finished = current.kind === 'end'

  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [trail])

  const advance = () => {
    if (waiting || finished || !current.next) return
    setTrail((t) => [...t, current.next!])
  }

  const answer = (a: 's' | 'n') => {
    const id = trail[trail.length - 1]
    setAnswers((x) => ({ ...x, [id]: a }))
    const nxt = a === 's' ? current.yes : current.no
    if (nxt) setTrail((t) => [...t, nxt])
  }

  const reset = () => {
    setTrail(['start'])
    setAnswers({})
  }

  return (
    <WidgetFrame
      caption="Lo que verías en la terminal al correr el agente de esta página. Avanza paso a paso y decide tú los permisos: si rechazas, el modelo recibe el rechazo como tool_result y adapta su plan."
      controls={
        <div className="at-controls">
          <button type="button" className="btn btn--line" onClick={advance} disabled={waiting || finished}>
            Siguiente <ChevronRight size={15} aria-hidden="true" />
          </button>
          <button type="button" className="btn btn--ghost" onClick={reset}>
            <RotateCcw size={15} aria-hidden="true" /> Reiniciar
          </button>
        </div>
      }
      readout={
        <p>
          <b>Código en ejecución:</b> <code className="at-code">{current.code}</code>
        </p>
      }
      grid={false}
    >
      <ol className="at-term" ref={logRef} aria-live="polite">
        {trail.map((id, k) => {
          const nd = SCRIPT[id]
          return (
            <li key={`${id}-${k}`} className={`at-line at-line--${nd.kind}`}>
              {PROMPT[nd.kind] && <span className="at-tag">{PROMPT[nd.kind]}</span>}
              <span className="at-text">
                {nd.text}
                {nd.kind === 'perm' && answers[id] && <b className="at-answer"> {answers[id]}</b>}
              </span>
            </li>
          )
        })}
      </ol>
      {waiting && (
        <div className="at-perm">
          <span>{current.text}</span>
          <div className="at-perm__btns">
            <button type="button" className="btn" onClick={() => answer('s')}>
              s (sí)
            </button>
            <button type="button" className="btn" onClick={() => answer('n')}>
              n (no)
            </button>
          </div>
        </div>
      )}
    </WidgetFrame>
  )
}
