import { useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { Check, ChevronRight, X } from 'lucide-react'
import { Segmented, WidgetFrame } from '../kit'
import './ExtensionMap.css'

type MechId = 'memory' | 'skill' | 'command' | 'subagent' | 'hook' | 'mcp' | 'plugin'

interface Mech {
  id: MechId
  name: string
  loads: string
  trigger: string
  deterministic: string
  cost: string
  file: string
  snippet: string
}

const MECHS: Mech[] = [
  {
    id: 'memory',
    name: 'CLAUDE.md / AGENTS.md',
    loads: 'Siempre, al iniciar la sesión.',
    trigger: 'Nadie: está en todo momento.',
    deterministic: 'No. Es contexto: el modelo decide cómo aplicarlo.',
    cost: 'Cada línea ocupa contexto en todos los turnos.',
    file: 'CLAUDE.md',
    snippet: `# Comandos
- Tests de un archivo: pnpm vitest run <ruta>
- Tipos: pnpm tsc --noEmit

# Convenciones
- Errores con helpers de src/lib/errors.ts
- src/legacy/ sigue vivo; no copies sus patrones`,
  },
  {
    id: 'skill',
    name: 'Skill',
    loads: 'Nombre y descripción al inicio; el cuerpo solo cuando es relevante.',
    trigger: 'El modelo (por la descripción) o tú con /nombre.',
    deterministic: 'No. Es conocimiento procedimental bajo demanda.',
    cost: 'Casi nulo hasta que se usa (carga progresiva).',
    file: '.claude/skills/reporte-pdf/SKILL.md',
    snippet: `---
name: reporte-pdf
description: Genera reportes PDF de ventas con el
  script interno. Úsalo cuando pidan un reporte
  o exportar ventas a PDF.
---
1. Corre scripts/ventas.ts --desde --hasta
2. Valida totales contra la tabla orders
3. Detalles de formato en referencia.md`,
  },
  {
    id: 'command',
    name: 'Comando slash',
    loads: 'Solo cuando tú lo escribes.',
    trigger: 'Tú, explícitamente (/release).',
    deterministic: 'El disparo sí (lo decides tú); la ejecución la hace el modelo.',
    cost: 'Cero hasta invocarlo.',
    file: '.claude/skills/release/SKILL.md',
    snippet: `---
name: release
description: Publica una versión nueva
disable-model-invocation: true
allowed-tools: Bash(git tag *) Bash(npm run changelog)
---
1. npm run changelog y muéstrame el diff
2. Crea el tag con la versión que te paso
3. No hagas push: dime el comando`,
  },
  {
    id: 'subagent',
    name: 'Subagente',
    loads: 'En su propia ventana de contexto, limpia.',
    trigger: 'El modelo delega por la descripción, o tú lo pides.',
    deterministic: 'No, pero sus herramientas se pueden restringir.',
    cost: 'Tokens propios; al hilo principal solo vuelve el resumen.',
    file: '.claude/agents/revisor-seguridad.md',
    snippet: `---
name: revisor-seguridad
description: Revisa diffs buscando inyección,
  secretos y authz rota. Úsalo antes de un PR.
tools: Read, Grep, Glob
model: sonnet
---
Eres un revisor de seguridad. Reporta solo
hallazgos con archivo:línea y severidad.`,
  },
  {
    id: 'hook',
    name: 'Hook',
    loads: 'No entra al contexto; corre en eventos del ciclo de vida.',
    trigger: 'El harness, siempre que ocurre el evento.',
    deterministic: 'Sí. Corre aunque el modelo “se olvide”.',
    cost: 'Solo su salida, si la devuelve al modelo.',
    file: '.claude/settings.json',
    snippet: `{
  "hooks": {
    "PreToolUse": [{
      "matcher": "Edit|Write",
      "hooks": [{
        "type": "command",
        "command": "./.claude/hooks/proteger-gen.sh"
      }]
    }]
  }
}`,
  },
  {
    id: 'mcp',
    name: 'Servidor MCP',
    loads: 'Sus herramientas se anuncian al modelo (con tool search, bajo demanda).',
    trigger: 'El modelo, cuando llama a una de sus herramientas.',
    deterministic: 'No: es una capacidad nueva, no una regla.',
    cost: 'Definiciones de herramientas + lo que devuelvan.',
    file: '.mcp.json',
    snippet: `{
  "mcpServers": {
    "notion": {
      "type": "http",
      "url": "https://mcp.notion.com/mcp"
    }
  }
}`,
  },
  {
    id: 'plugin',
    name: 'Plugin',
    loads: 'Lo que contenga (skills, agentes, hooks, MCP) al habilitarlo.',
    trigger: 'Se instala desde un marketplace; luego cada pieza funciona como siempre.',
    deterministic: 'Depende de sus piezas.',
    cost: 'La suma de sus piezas, en cada sesión donde esté habilitado.',
    file: '.claude-plugin/plugin.json',
    snippet: `{
  "name": "pagos-toolkit",
  "version": "1.3.0",
  "description": "Skills, hooks y MCP del equipo de pagos"
}
// + skills/  agents/  hooks/hooks.json  .mcp.json`,
  },
]

const SCENARIOS: { text: string; answer: MechId; why: string }[] = [
  {
    text: 'El agente insiste en correr npm test, pero en este repo los tests se corren con pnpm vitest run.',
    answer: 'memory',
    why: 'Es un hecho estable del repo que hace falta en casi toda sesión: una línea en CLAUDE.md/AGENTS.md.',
  },
  {
    text: 'Bajo ninguna circunstancia debe editar src/gen/ (código generado). Ni una vez.',
    answer: 'hook',
    why: 'Una regla sin excepciones no puede depender de que el modelo la recuerde: hook PreToolUse que sale con código 2 (o una regla deny de Edit).',
  },
  {
    text: 'El agente necesita leer las páginas de Notion del equipo y consultar la base de datos de staging.',
    answer: 'mcp',
    why: 'Son capacidades externas nuevas: un servidor MCP expone esas herramientas con autenticación propia.',
  },
  {
    text: 'Generar el reporte PDF de ventas requiere 3 páginas de instrucciones y un script, pero solo pasa una vez al mes.',
    answer: 'skill',
    why: 'Conocimiento procedimental que solo importa a veces: un skill carga su cuerpo solo cuando hace falta.',
  },
  {
    text: 'Quieres una revisión de seguridad del diff hecha por alguien que no vio cómo se escribió el código.',
    answer: 'subagent',
    why: 'Un subagente arranca con contexto limpio (no hereda el razonamiento que produjo el código) y herramientas de solo lectura.',
  },
  {
    text: 'Publicar una versión son 6 pasos con efectos secundarios; quieres dispararlo tú, nunca el modelo por su cuenta.',
    answer: 'command',
    why: 'Un skill con disable-model-invocation: true funciona como comando: solo corre cuando escribes /release.',
  },
  {
    text: 'Tus 40 compañeros deben tener los mismos skills, hooks y el MCP de Sentry, versionados.',
    answer: 'plugin',
    why: 'Un plugin empaqueta todo y se distribuye por un marketplace con versiones.',
  },
]

export function ExtensionMap() {
  const [tab, setTab] = useState<'explore' | 'pick'>('explore')
  const [sel, setSel] = useState<MechId>('skill')
  const [sc, setSc] = useState(0)
  const [picked, setPicked] = useState<MechId | null>(null)
  const [score, setScore] = useState<boolean[]>([])
  const reduced = useReducedMotion()
  const m = MECHS.find((x) => x.id === sel)!
  const scenario = SCENARIOS[sc]

  const pick = (id: MechId) => {
    if (picked) return
    setPicked(id)
    setScore((s) => {
      const n = [...s]
      n[sc] = id === scenario.answer
      return n
    })
  }

  const next = () => {
    setSc((v) => (v + 1) % SCENARIOS.length)
    setPicked(null)
  }

  const right = score.filter(Boolean).length

  return (
    <WidgetFrame
      caption="Mapa de mecanismos de extensión de un agente de código (nombres de Claude Code; otras herramientas tienen equivalentes). Explora cada uno o pon a prueba tu criterio con casos reales."
      controls={
        <Segmented
          label="Modo"
          value={tab}
          onChange={setTab}
          options={[
            { value: 'explore', label: 'Explorar' },
            { value: 'pick', label: '¿Cuál uso?' },
          ]}
        />
      }
      readout={
        tab === 'pick' ? (
          <p>
            Aciertos: <b>{right}</b> de {score.filter((x) => x !== undefined).length} respondidos · caso {sc + 1} de {SCENARIOS.length}
          </p>
        ) : (
          <p>
            Regla práctica: <b>si debe pasar siempre, es un hook o una regla de permisos</b>; si es conocimiento, es contexto (CLAUDE.md o skill); si es una capacidad nueva, es una herramienta (MCP).
          </p>
        )
      }
    >
      {tab === 'explore' ? (
        <div className="em-explore">
          <div className="em-list" role="radiogroup" aria-label="Mecanismo">
            {MECHS.map((x) => (
              <button
                key={x.id}
                type="button"
                role="radio"
                aria-checked={sel === x.id}
                className={`em-chip ${sel === x.id ? 'is-on' : ''}`}
                onClick={() => setSel(x.id)}
              >
                {x.name}
              </button>
            ))}
          </div>
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={m.id}
              className="em-card"
              initial={{ opacity: 0, y: reduced ? 0 : 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: reduced ? 0 : -6 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              <dl className="em-props">
                <div>
                  <dt>Cuándo entra al contexto</dt>
                  <dd>{m.loads}</dd>
                </div>
                <div>
                  <dt>Quién lo dispara</dt>
                  <dd>{m.trigger}</dd>
                </div>
                <div>
                  <dt>¿Determinista?</dt>
                  <dd>{m.deterministic}</dd>
                </div>
                <div>
                  <dt>Costo de contexto</dt>
                  <dd>{m.cost}</dd>
                </div>
              </dl>
              <div className="em-file">
                <div className="em-file__head">
                  <code>{m.file}</code>
                </div>
                <pre>{m.snippet}</pre>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      ) : (
        <div className="em-pick">
          <p className="em-scenario">{scenario.text}</p>
          <div className="em-options">
            {MECHS.map((x) => {
              const state = !picked ? '' : x.id === scenario.answer ? 'is-right' : x.id === picked ? 'is-wrong' : 'is-dim'
              return (
                <button key={x.id} type="button" className={`em-opt ${state}`} onClick={() => pick(x.id)} aria-pressed={picked === x.id} disabled={!!picked && state === 'is-dim'}>
                  {picked && x.id === scenario.answer && <Check size={15} aria-hidden="true" />}
                  {picked && x.id === picked && x.id !== scenario.answer && <X size={15} aria-hidden="true" />}
                  {x.name}
                </button>
              )
            })}
          </div>
          <AnimatePresence initial={false}>
            {picked && (
              <motion.div
                className={`em-why ${picked === scenario.answer ? 'is-right' : 'is-wrong'}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                aria-live="polite"
              >
                <p>
                  <b>{picked === scenario.answer ? 'Correcto.' : `Mejor: ${MECHS.find((x) => x.id === scenario.answer)!.name}.`}</b> {scenario.why}
                </p>
                <button type="button" className="btn btn--line" onClick={next}>
                  Siguiente caso <ChevronRight size={15} aria-hidden="true" />
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      )}
    </WidgetFrame>
  )
}
