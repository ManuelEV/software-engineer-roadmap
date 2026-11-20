import type { TopicDef } from '../types'

export const topics: TopicDef[] = [
  {
    slug: 'panorama',
    title: 'Cómo funciona un agente de código',
    summary:
      'Del autocompletado a las flotas de agentes: modelo, contexto, herramientas, loop, niveles de autonomía y qué dice la evidencia.',
    minutes: 15,
    keywords: ['coding agent', 'agentic coding', 'autonomy levels', 'vibe coding', 'agentic engineering', 'METR', 'DORA'],
    group: 'Fundamentos',
    load: () => import('./panorama.mdx'),
  },
  {
    slug: 'agent-loop',
    title: 'El loop agéntico',
    summary:
      'Reunir contexto, actuar, verificar y repetir: la anatomía del ciclo que mueve a todo agente.',
    minutes: 13,
    keywords: ['agent loop', 'tool use', 'tool_use', 'tool_result', 'ReAct', 'stop_reason', 'stop conditions'],
    group: 'Fundamentos',
    load: () => import('./agent-loop.mdx'),
  },
  {
    slug: 'ingenieria-de-contexto',
    title: 'Ingeniería de contexto',
    summary:
      'CLAUDE.md y AGENTS.md, memoria, compactación y cómo darle al modelo justo lo que necesita.',
    minutes: 15,
    keywords: ['context engineering', 'context window', 'context rot', 'CLAUDE.md', 'AGENTS.md', 'compaction', 'memory', 'subagents'],
    group: 'Fundamentos',
    load: () => import('./ingenieria-de-contexto.mdx'),
  },
  {
    slug: 'spec-driven',
    title: 'Spec-Driven Development',
    summary:
      'Especificar antes de generar: specs, planes y tareas con Spec Kit, Kiro y flujos propios.',
    minutes: 17,
    keywords: ['spec-driven development', 'SDD', 'Spec Kit', 'Kiro', 'EARS', 'requirements', 'constitution'],
    group: 'Métodos',
    load: () => import('./spec-driven.mdx'),
  },
  {
    slug: 'harness',
    title: 'Harness engineering',
    summary:
      'Herramientas, permisos, sandbox, hooks y bucles de feedback: el entorno que hace fiable al agente.',
    minutes: 16,
    keywords: ['harness engineering', 'permissions', 'sandbox', 'hooks', 'tool design', 'long-running agents', 'progress file'],
    group: 'Métodos',
    load: () => import('./harness.mdx'),
  },
  {
    slug: 'herramientas',
    title: 'Skills, MCP, subagentes y hooks',
    summary:
      'Extender un agente con conocimiento, herramientas externas y trabajo delegado.',
    minutes: 15,
    keywords: ['skills', 'Agent Skills', 'MCP', 'Model Context Protocol', 'subagents', 'slash commands', 'hooks', 'plugins'],
    group: 'Métodos',
    load: () => import('./herramientas.mdx'),
  },
  {
    slug: 'verificacion',
    title: 'Verificación: tests, evals y review',
    summary:
      'TDD con agentes, evals, revisión de código asistida y cómo confiar en lo generado.',
    minutes: 13,
    keywords: ['verification', 'TDD', 'evals', 'LLM-as-judge', 'code review', 'AI code review'],
    group: 'Métodos',
    load: () => import('./verificacion.mdx'),
  },
  {
    slug: 'flujos',
    title: 'Flujos de trabajo',
    summary:
      'Explorar, planificar, implementar; agentes en paralelo, loops autónomos y trabajo en segundo plano.',
    minutes: 15,
    keywords: ['workflows', 'plan mode', 'git worktrees', 'parallel agents', 'headless', 'CI', 'Ralph loop', 'multi-agent'],
    group: 'Práctica',
    load: () => import('./flujos.mdx'),
  },
  {
    slug: 'construir-agente',
    title: 'Construye tu propio agente',
    summary:
      'Un agente de código mínimo en TypeScript con el SDK de Anthropic: loop, herramientas, permisos y límites.',
    minutes: 17,
    keywords: ['build an agent', 'agent from scratch', 'Anthropic SDK', 'TypeScript', 'tool loop', 'permissions'],
    group: 'Práctica',
    load: () => import('./construir-agente.mdx'),
  },
  {
    slug: 'buenas-practicas',
    title: 'Buenas prácticas y riesgos',
    summary:
      'Seguridad, prompt injection, costos, revisión humana y los antipatrones del vibe coding.',
    minutes: 14,
    keywords: ['prompt injection', 'lethal trifecta', 'security', 'secrets', 'cost', 'tokens', 'vibe coding', 'team adoption'],
    group: 'Práctica',
    load: () => import('./buenas-practicas.mdx'),
  },
]
