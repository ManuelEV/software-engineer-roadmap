import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Segmented, WidgetFrame } from '../kit'
import { useMediaQuery } from '../../../lib/hooks'
import './GitHistory.css'

/**
 * GitHistory: two branches drawn as a commit graph. Merge, rebase and squash
 * show the resulting graph and which hashes change (rebase rewrites, merge and
 * squash do not touch existing commits).
 */

type Mode = 'antes' | 'merge' | 'rebase' | 'squash'
type Lane = 'main' | 'feature'
type Tone = 'old' | 'new' | 'ghost'

interface Commit {
  id: string
  tag: string
  hash: string
  msg: string
  lane: Lane
  t: number
  parents: string[]
  tone: Tone
}

const BASE: Record<string, Omit<Commit, 'tone'>> = {
  A: { id: 'A', tag: 'A', hash: '3f2a9c1', msg: 'init', lane: 'main', t: 0, parents: [] },
  B: { id: 'B', tag: 'B', hash: '8b14e07', msg: 'agrega Pedido', lane: 'main', t: 1, parents: ['A'] },
  C: { id: 'C', tag: 'C', hash: 'c71d2aa', msg: 'fix: zona horaria', lane: 'main', t: 2, parents: ['B'] },
  D: { id: 'D', tag: 'D', hash: '5e9b3f0', msg: 'agrega cupones', lane: 'feature', t: 2, parents: ['B'] },
  E: { id: 'E', tag: 'E', hash: '91ac6d4', msg: 'tests de cupones', lane: 'feature', t: 3, parents: ['D'] },
}

const old = (id: string, over: Partial<Commit> = {}): Commit => ({ ...BASE[id], tone: 'old', ...over })

interface Scenario {
  commits: Commit[]
  branches: { name: string; at: string }[]
  log: string[]
  changed: string
  cmds: string[]
  note: string
}

const SCENARIOS: Record<Mode, Scenario> = {
  antes: {
    commits: [old('A'), old('B'), old('C'), old('D'), old('E')],
    branches: [
      { name: 'main', at: 'C' },
      { name: 'feature', at: 'E' },
    ],
    log: ['c71d2aa fix: zona horaria', '8b14e07 agrega Pedido', '3f2a9c1 init'],
    changed: 'Nada todavía.',
    cmds: ['git log --oneline --graph --all'],
    note: 'Sacaste feature desde B. Mientras trabajabas en D y E, alguien mergeó C en main. Las dos ramas divergieron: elige cómo integrarlas.',
  },
  merge: {
    commits: [old('A'), old('B'), old('C'), old('D'), old('E'), { id: 'M', tag: 'M', hash: '0d47e2b', msg: "Merge branch 'feature'", lane: 'main', t: 4, parents: ['C', 'E'], tone: 'new' }],
    branches: [
      { name: 'main', at: 'M' },
      { name: 'feature', at: 'E' },
    ],
    log: ["0d47e2b Merge branch 'feature'", '91ac6d4 tests de cupones', '5e9b3f0 agrega cupones', 'c71d2aa fix: zona horaria', '8b14e07 agrega Pedido', '3f2a9c1 init'],
    changed: 'Ninguno. Se agrega M, un commit con dos padres (C y E).',
    cmds: ['git switch main', 'git merge feature'],
    note: 'Merge no reescribe nada: D y E conservan sus hashes y la historia muestra que hubo una rama. Es seguro con ramas compartidas. El costo es un grafo con más bifurcaciones y commits de merge.',
  },
  rebase: {
    commits: [
      old('A'),
      old('B'),
      old('C'),
      old('D', { tone: 'ghost' }),
      old('E', { tone: 'ghost' }),
      { id: 'D2', tag: "D'", hash: 'a83f5c2', msg: 'agrega cupones', lane: 'main', t: 3, parents: ['C'], tone: 'new' },
      { id: 'E2', tag: "E'", hash: '6c1e9b8', msg: 'tests de cupones', lane: 'main', t: 4, parents: ['D2'], tone: 'new' },
    ],
    branches: [
      { name: 'main', at: 'E2' },
      { name: 'feature', at: 'E2' },
    ],
    log: ['6c1e9b8 tests de cupones', 'a83f5c2 agrega cupones', 'c71d2aa fix: zona horaria', '8b14e07 agrega Pedido', '3f2a9c1 init'],
    changed: "D 5e9b3f0 → D' a83f5c2 · E 91ac6d4 → E' 6c1e9b8",
    cmds: ['git switch feature', 'git rebase main', 'git switch main', 'git merge --ff-only feature'],
    note: "Rebase reaplica D y E encima de C. Son commits nuevos: mismo cambio, otro padre, otro hash. La historia queda lineal; los originales quedan sin rama (los recuperas con git reflog).",
  },
  squash: {
    commits: [old('A'), old('B'), old('C'), old('D'), old('E'), { id: 'S', tag: 'S', hash: 'f40b7a3', msg: 'agrega cupones (#42)', lane: 'main', t: 3, parents: ['C'], tone: 'new' }],
    branches: [
      { name: 'main', at: 'S' },
      { name: 'feature', at: 'E' },
    ],
    log: ['f40b7a3 agrega cupones (#42)', 'c71d2aa fix: zona horaria', '8b14e07 agrega Pedido', '3f2a9c1 init'],
    changed: 'Ninguno existente. S es nuevo y junta los cambios de D y E en un solo commit.',
    cmds: ['git switch main', 'git merge --squash feature', 'git commit -m "agrega cupones (#42)"'],
    note: 'Squash mete todo el trabajo de la rama en un único commit en main. Historia limpia, un commit por PR, fácil de revertir. Pierdes el detalle de D y E en main, y Git ya no sabe que feature está integrada: bórrala.',
  },
}

const LANE_ORDER: Lane[] = ['main', 'feature']

export function GitHistory() {
  const reduced = useReducedMotion()
  const narrow = useMediaQuery('(max-width: 559px)')
  const [mode, setMode] = useState<Mode>('antes')
  const [shared, setShared] = useState<'local' | 'publicada'>('local')
  const sc = SCENARIOS[mode]
  const byId = new Map(sc.commits.map((c) => [c.id, c]))

  // Horizontal on wide screens (time → right), vertical on phones (time ↓).
  const pos = (c: Commit) => {
    const lane = LANE_ORDER.indexOf(c.lane)
    return narrow ? { x: 110 + lane * 120, y: 46 + c.t * 82 } : { x: 56 + c.t * 124, y: 66 + lane * 106 }
  }
  const vb = narrow ? '0 0 340 430' : '0 0 640 250'
  const fade = { duration: reduced ? 0.15 : 0.35, ease: [0.16, 1, 0.3, 1] as const }
  const danger = mode === 'rebase' && shared === 'publicada'

  // branch tags sitting on the same commit stack
  const tagSlots = new Map<string, number>()

  return (
    <WidgetFrame
      caption="Dos ramas que divergieron. Elige cómo integrarlas y mira el grafo resultante, la historia de main y qué hashes cambian."
      controls={
        <>
          <Segmented
            label="Integrar con"
            value={mode}
            onChange={setMode}
            options={[
              { value: 'antes', label: 'Antes' },
              { value: 'merge', label: 'Merge' },
              { value: 'rebase', label: 'Rebase' },
              { value: 'squash', label: 'Squash' },
            ]}
          />
          <Segmented
            label="La rama feature está"
            value={shared}
            onChange={setShared}
            options={[
              { value: 'local', label: 'Solo en tu máquina' },
              { value: 'publicada', label: 'Publicada' },
            ]}
          />
        </>
      }
      readout={
        <div className="gith-readout" aria-live="polite">
          <p>{sc.note}</p>
          {danger && (
            <p className="gith-warn">
              <b>Cuidado:</b> feature ya estaba en el remoto. Tus compañeros tienen D y E; tú ahora tienes D' y E'. Para publicar necesitas <span className="gith-mono">push --force</span>, y quien haya construido encima de D o E queda con una historia que no coincide. Regla: no reescribas historia que otros ya bajaron.
            </p>
          )}
          <p>
            <b>Hashes que cambian:</b> {sc.changed}
          </p>
        </div>
      }
    >
      <div className="gith">
        <svg className="gith-svg" viewBox={vb} role="img" aria-label={`Grafo de commits: ${mode === 'antes' ? 'antes de integrar' : `después de ${mode}`}`}>
          {sc.commits.flatMap((c) =>
            c.parents.map((pid) => {
              const p = byId.get(pid)!
              const a = pos(p)
              const b = pos(c)
              const ghost = c.tone === 'ghost'
              const fresh = c.tone === 'new'
              return (
                <motion.line
                  key={`${pid}-${c.id}-${mode}`}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                  className={`gith-edge lane-${c.lane} ${ghost ? 'is-ghost' : ''} ${fresh ? 'is-new' : ''}`}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: ghost ? 0.55 : 1 }}
                  transition={fade}
                />
              )
            }),
          )}
          {sc.commits.map((c) => {
            const p = pos(c)
            const hashPos = narrow
              ? c.lane === 'main'
                ? { x: p.x - 24, y: p.y + 5, anchor: 'end' as const }
                : { x: p.x + 24, y: p.y + 5, anchor: 'start' as const }
              : { x: p.x, y: p.y + 36, anchor: 'middle' as const }
            return (
              <motion.g
                key={`${c.id}-${mode}`}
                className={`gith-commit lane-${c.lane} is-${c.tone}`}
                initial={{ opacity: 0 }}
                animate={{ opacity: c.tone === 'ghost' ? 0.6 : 1 }}
                transition={fade}
              >
                <circle cx={p.x} cy={p.y} r={17} className="gith-dot" />
                <text x={p.x} y={p.y + 5} textAnchor="middle" className="gith-tag">
                  {c.tag}
                </text>
                <text x={hashPos.x} y={hashPos.y} textAnchor={hashPos.anchor} className="gith-hash">
                  {c.hash}
                </text>
              </motion.g>
            )
          })}
          {sc.branches.map((br) => {
            const c = byId.get(br.at)!
            const p = pos(c)
            const slot = tagSlots.get(br.at) ?? 0
            tagSlots.set(br.at, slot + 1)
            const w = br.name.length * 9 + 18
            // wide: first tag above a main commit (below a feature one), a second tag on the other side
            const below = (c.lane === 'feature') !== (slot === 1)
            const x = narrow ? (c.lane === 'main' ? p.x - 24 - w : p.x + 24) : p.x - w / 2
            const y = narrow ? p.y + 14 + slot * 26 : below ? p.y + 48 : p.y - 50
            return (
              <motion.g key={`${br.name}-${mode}`} className={`gith-branch br-${br.name}`} initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={fade}>
                <rect x={x} y={y} width={w} height={22} rx={5} className="gith-branch__box" />
                <text x={x + w / 2} y={y + 15.5} textAnchor="middle" className="gith-branch__txt">
                  {br.name}
                </text>
              </motion.g>
            )
          })}
        </svg>

        <div className="gith-side">
          <div className="gith-box">
            <div className="gith-box__title">Comandos</div>
            <pre className="gith-pre">{sc.cmds.map((c) => `$ ${c}`).join('\n')}</pre>
          </div>
          <div className="gith-box">
            <div className="gith-box__title">git log --oneline main</div>
            <ol className="gith-log">
              {sc.log.map((l) => {
                const h = l.slice(0, 7)
                const isNew = sc.commits.some((c) => c.hash === h && c.tone === 'new')
                return (
                  <li key={l} className={isNew ? 'is-new' : ''}>
                    <span className="gith-mono gith-log__h">{h}</span> {l.slice(8)}
                  </li>
                )
              })}
            </ol>
          </div>
        </div>
      </div>
    </WidgetFrame>
  )
}
