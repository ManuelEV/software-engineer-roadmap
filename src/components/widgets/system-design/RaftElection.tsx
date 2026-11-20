import { useEffect, useRef, useState } from 'react'
import { useReducedMotion } from 'motion/react'
import { HeartPulse, Pause, PenLine, Play, RotateCcw, Scissors, Skull } from 'lucide-react'
import { Log, Stat, WidgetFrame } from '../kit'
import { rng, useTicker } from './shared'
import './RaftElection.css'

/* ───────── Simulation model (simplified but faithful Raft) ───────── */

const N = 5
const MAJ = 3
const LAT = 7 // ticks a message takes
const HB = 12 // heartbeat interval (ticks)
const TO_MIN = 30 // election timeout range (ticks)
const TO_MAX = 60
const TICK_MS = 80

type Role = 'follower' | 'candidate' | 'leader'
interface Entry {
  term: number
  cmd: number // 0 = no-op
}
interface RNode {
  id: number
  role: Role
  term: number
  votedFor: number | null
  votes: number[]
  deadline: number
  log: Entry[]
  commit: number
  alive: boolean
  nextIndex: number[]
  matchIndex: number[]
  nextHb: number
}
type MsgBody =
  | { kind: 'vote-req'; term: number; lastIndex: number; lastTerm: number }
  | { kind: 'vote-res'; term: number; granted: boolean }
  | { kind: 'append'; term: number; prevIndex: number; prevTerm: number; entries: Entry[]; leaderCommit: number }
  | { kind: 'append-res'; term: number; success: boolean; match: number }
type Msg = MsgBody & { from: number; to: number; sent: number; at: number; id: number }
interface Ev {
  id: number
  text: string
  tone?: 'ok' | 'warn' | 'bad'
}
interface Sim {
  tick: number
  nodes: RNode[]
  msgs: Msg[]
  seq: number
  msgSeq: number
  minority: number[] | null
  events: Ev[]
}

const name = (i: number) => `n${i + 1}`

function initial(rand: () => number): Sim {
  return {
    tick: 0,
    seq: 0,
    msgSeq: 0,
    minority: null,
    msgs: [],
    events: [],
    nodes: Array.from({ length: N }, (_, id) => ({
      id,
      role: 'follower' as Role,
      term: 0,
      votedFor: null,
      votes: [],
      deadline: 12 + Math.floor(rand() * 40),
      log: [],
      commit: 0,
      alive: true,
      nextIndex: Array(N).fill(0),
      matchIndex: Array(N).fill(0),
      nextHb: 0,
    })),
  }
}

function cloneNodes(nodes: RNode[]): RNode[] {
  return nodes.map((n) => ({ ...n, log: [...n.log], votes: [...n.votes], nextIndex: [...n.nextIndex], matchIndex: [...n.matchIndex] }))
}

function step(s: Sim, rand: () => number): Sim {
  const t = s.tick + 1
  const nodes = cloneNodes(s.nodes)
  const out: Msg[] = []
  const evs: Ev[] = []
  let msgSeq = s.msgSeq
  const randTO = () => t + TO_MIN + Math.floor(rand() * (TO_MAX - TO_MIN))
  const cut = (a: number, b: number) => !!s.minority && s.minority.includes(a) !== s.minority.includes(b)
  const send = (from: number, to: number, body: MsgBody) => out.push({ ...body, from, to, sent: t, at: t + LAT, id: ++msgSeq })
  const ev = (text: string, tone?: Ev['tone']) => evs.push({ id: t * 100 + evs.length, text, tone })

  const sendAppends = (n: RNode) => {
    for (let p = 0; p < N; p++) {
      if (p === n.id) continue
      const prevIndex = Math.min(n.nextIndex[p], n.log.length)
      send(n.id, p, {
        kind: 'append',
        term: n.term,
        prevIndex,
        prevTerm: prevIndex > 0 ? n.log[prevIndex - 1].term : 0,
        entries: n.log.slice(prevIndex, prevIndex + 4),
        leaderCommit: n.commit,
      })
    }
  }
  const advanceCommit = (n: RNode) => {
    n.matchIndex[n.id] = n.log.length
    for (let idx = n.log.length; idx > n.commit; idx--) {
      if (n.log[idx - 1].term !== n.term) break
      const count = n.matchIndex.filter((m) => m >= idx).length
      if (count >= MAJ) {
        ev(`${name(n.id)} comprometió hasta la entrada ${idx}: ya está en ${count} de ${N} nodos (mayoría).`, 'ok')
        n.commit = idx
        break
      }
    }
  }
  const becomeLeader = (n: RNode) => {
    n.role = 'leader'
    n.nextIndex = Array(N).fill(n.log.length)
    n.matchIndex = Array(N).fill(0)
    n.log.push({ term: n.term, cmd: 0 }) // no-op so earlier entries can commit (Raft §8)
    n.matchIndex[n.id] = n.log.length
    n.nextHb = t
    ev(`${name(n.id)} gana con ${n.votes.length} votos: es líder del término ${n.term}.`, 'ok')
  }

  // 1. deliver messages
  const remaining: Msg[] = []
  for (const m of s.msgs) {
    if (m.at > t) {
      remaining.push(m)
      continue
    }
    const n = nodes[m.to]
    if (!n.alive || cut(m.from, m.to)) continue
    if (m.term > n.term) {
      if (n.role === 'leader') ev(`${name(n.id)} descubre el término ${m.term} y deja de ser líder.`, 'warn')
      n.term = m.term
      n.role = 'follower'
      n.votedFor = null
      n.votes = []
      n.deadline = randTO()
    }
    switch (m.kind) {
      case 'vote-req': {
        const myLastTerm = n.log.length ? n.log[n.log.length - 1].term : 0
        const upToDate = m.lastTerm > myLastTerm || (m.lastTerm === myLastTerm && m.lastIndex >= n.log.length)
        const granted = m.term === n.term && (n.votedFor === null || n.votedFor === m.from) && upToDate
        if (granted) {
          n.votedFor = m.from
          n.deadline = randTO()
        }
        send(n.id, m.from, { kind: 'vote-res', term: n.term, granted })
        break
      }
      case 'vote-res': {
        if (n.role === 'candidate' && m.term === n.term && m.granted && !n.votes.includes(m.from)) {
          n.votes.push(m.from)
          if (n.votes.length >= MAJ) becomeLeader(n)
        }
        break
      }
      case 'append': {
        if (m.term < n.term) {
          send(n.id, m.from, { kind: 'append-res', term: n.term, success: false, match: 0 })
          break
        }
        if (n.role !== 'follower') {
          n.role = 'follower'
          n.votes = []
        }
        n.deadline = randTO()
        if (m.prevIndex > n.log.length || (m.prevIndex > 0 && n.log[m.prevIndex - 1].term !== m.prevTerm)) {
          send(n.id, m.from, { kind: 'append-res', term: n.term, success: false, match: 0 })
          break
        }
        let dropped = 0
        m.entries.forEach((e, i) => {
          const idx = m.prevIndex + i
          if (n.log[idx] && n.log[idx].term !== e.term) {
            dropped += n.log.length - idx
            n.log.length = idx
          }
          if (!n.log[idx]) n.log.push(e)
        })
        if (dropped) ev(`${name(n.id)} descarta ${dropped} entrada(s) no comprometidas que chocan con el log del líder.`, 'warn')
        const lastNew = m.prevIndex + m.entries.length
        if (m.leaderCommit > n.commit) n.commit = Math.min(m.leaderCommit, lastNew)
        send(n.id, m.from, { kind: 'append-res', term: n.term, success: true, match: lastNew })
        break
      }
      case 'append-res': {
        if (n.role !== 'leader' || m.term !== n.term) break
        if (m.success) {
          n.matchIndex[m.from] = Math.max(n.matchIndex[m.from], m.match)
          n.nextIndex[m.from] = n.matchIndex[m.from]
        } else {
          n.nextIndex[m.from] = Math.max(0, n.nextIndex[m.from] - 1)
        }
        advanceCommit(n)
        break
      }
    }
  }

  // 2. timers
  for (const n of nodes) {
    if (!n.alive) continue
    if (n.role === 'leader') {
      if (t >= n.nextHb) {
        sendAppends(n)
        n.nextHb = t + HB
      }
    } else if (t >= n.deadline) {
      n.term += 1
      n.role = 'candidate'
      n.votedFor = n.id
      n.votes = [n.id]
      n.deadline = randTO()
      ev(`${name(n.id)} no oyó al líder a tiempo: se postula en el término ${n.term}.`)
      const lastTerm = n.log.length ? n.log[n.log.length - 1].term : 0
      for (let p = 0; p < N; p++) if (p !== n.id) send(n.id, p, { kind: 'vote-req', term: n.term, lastIndex: n.log.length, lastTerm })
    }
  }

  return { ...s, tick: t, nodes, msgs: [...remaining, ...out], msgSeq, events: [...evs.reverse(), ...s.events].slice(0, 40) }
}

const currentLeader = (s: Sim) =>
  s.nodes.filter((n) => n.alive && n.role === 'leader').sort((a, b) => b.term - a.term)[0] as RNode | undefined

/* ───────── View ───────── */

const CX = 180
const CY = 140
const RAD = 98
const pos = (i: number) => {
  const a = (-90 + i * 72) * (Math.PI / 180)
  return { x: CX + RAD * Math.cos(a), y: CY + RAD * Math.sin(a) }
}

function useInView<T extends Element>() {
  const ref = useRef<T>(null)
  const [inView, setInView] = useState(false)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') {
      setInView(true)
      return
    }
    const obs = new IntersectionObserver(([e]) => setInView(e.isIntersecting), { threshold: 0.15 })
    obs.observe(el)
    return () => obs.disconnect()
  }, [])
  return [ref, inView] as const
}

/**
 * Five-node Raft cluster: randomized election timeouts, leader election,
 * log replication and commit by majority. Kill the leader or isolate it in
 * a minority partition and watch the cluster recover.
 */
export function RaftElection() {
  const reduced = useReducedMotion()
  const randRef = useRef(rng(7))
  const [sim, setSim] = useState<Sim>(() => initial(randRef.current))
  const [playing, setPlaying] = useState(true)
  const [wrapRef, inView] = useInView<HTMLDivElement>()

  useTicker(() => setSim((s) => step(s, randRef.current)), TICK_MS, playing && inView)

  const leader = currentLeader(sim)
  const maxTerm = Math.max(...sim.nodes.map((n) => n.term))
  const leaders = sim.nodes.filter((n) => n.alive && n.role === 'leader')

  const write = () =>
    setSim((s) => {
      const nodes = cloneNodes(s.nodes)
      const ls = nodes.filter((n) => n.alive && n.role === 'leader')
      if (!ls.length) {
        return { ...s, events: [{ id: s.tick * 100 + 99, text: 'No hay líder: la escritura se rechaza (el cliente reintenta más tarde).', tone: 'bad' as const }, ...s.events].slice(0, 40) }
      }
      const seq = s.seq + 1
      ls.forEach((n) => {
        n.log.push({ term: n.term, cmd: seq })
        n.matchIndex[n.id] = n.log.length
      })
      const text =
        ls.length > 1
          ? `Dos nodos creen ser líder (${ls.map((n) => `${name(n.id)} en T${n.term}`).join(', ')}). Ambos aceptan la escritura ${seq}, pero solo el que tiene mayoría podrá comprometerla.`
          : `El cliente envía la escritura ${seq} al líder ${name(ls[0].id)}.`
      return { ...s, nodes, seq, events: [{ id: s.tick * 100 + 98, text }, ...s.events].slice(0, 40) }
    })

  const killLeader = () =>
    setSim((s) => {
      const l = currentLeader(s)
      if (!l) return s
      const nodes = cloneNodes(s.nodes)
      nodes[l.id].alive = false
      return { ...s, nodes, events: [{ id: s.tick * 100 + 97, text: `Se cae ${name(l.id)} (líder). Los seguidores dejarán de recibir heartbeats.`, tone: 'bad' as const }, ...s.events].slice(0, 40) }
    })

  const revive = () =>
    setSim((s) => {
      const nodes = cloneNodes(s.nodes)
      const back: string[] = []
      nodes.forEach((n) => {
        if (!n.alive) {
          n.alive = true
          n.role = 'follower'
          n.votes = []
          n.deadline = s.tick + TO_MIN + Math.floor(randRef.current() * (TO_MAX - TO_MIN))
          back.push(name(n.id))
        }
      })
      if (!back.length) return s
      return { ...s, nodes, events: [{ id: s.tick * 100 + 96, text: `Vuelve ${back.join(', ')} con su término y log guardados en disco.` }, ...s.events].slice(0, 40) }
    })

  const togglePartition = () =>
    setSim((s) => {
      if (s.minority) return { ...s, minority: null, events: [{ id: s.tick * 100 + 95, text: 'La red se recupera: todos vuelven a hablarse.', tone: 'ok' as const }, ...s.events].slice(0, 40) }
      const l = currentLeader(s)
      const a = l ? l.id : 0
      const minority = [a, (a + 1) % N]
      return {
        ...s,
        minority,
        events: [
          { id: s.tick * 100 + 94, text: `Partición: ${minority.map(name).join(' y ')} quedan aislados (minoría) del resto.`, tone: 'warn' as const },
          ...s.events,
        ].slice(0, 40),
      }
    })

  const reset = () => {
    randRef.current = rng(Math.floor(Math.random() * 1e9))
    setSim(initial(randRef.current))
    setPlaying(true)
  }

  // log columns to render
  const maxLen = Math.max(1, ...sim.nodes.map((n) => n.log.length))
  const from = Math.max(0, maxLen - 10)
  const cols = Array.from({ length: Math.min(10, maxLen) }, (_, i) => from + i)

  return (
    <WidgetFrame
      caption="Un clúster Raft de 5 nodos. El anillo alrededor de cada seguidor es su timeout de elección (aleatorio). Tumba al líder, aíslalo en una partición minoritaria o escribe y observa cuándo una entrada queda comprometida."
      controls={
        <div className="rf-controls">
          <button type="button" className="icon-btn" onClick={() => setPlaying((p) => !p)} aria-label={playing ? 'Pausar' : 'Reanudar'}>
            {playing ? <Pause size={18} aria-hidden="true" /> : <Play size={18} aria-hidden="true" />}
          </button>
          <button type="button" className="btn btn--line" onClick={write}>
            <PenLine size={16} aria-hidden="true" />
            Escribir
          </button>
          <button type="button" className="btn" onClick={killLeader} disabled={!leader}>
            <Skull size={16} aria-hidden="true" />
            Tumbar líder
          </button>
          <button type="button" className="btn" onClick={revive} disabled={sim.nodes.every((n) => n.alive)}>
            <HeartPulse size={16} aria-hidden="true" />
            Revivir
          </button>
          <button type="button" className="btn" onClick={togglePartition} aria-pressed={!!sim.minority}>
            <Scissors size={16} aria-hidden="true" />
            {sim.minority ? 'Sanar red' : 'Partición'}
          </button>
          <button type="button" className="icon-btn" onClick={reset} aria-label="Reiniciar simulación">
            <RotateCcw size={18} aria-hidden="true" />
          </button>
        </div>
      }
      readout={
        <div className="rf-readout">
          <div className="rf-stats">
            <Stat label="término más alto" value={maxTerm} />
            <Stat
              label={leaders.length > 1 ? 'nodos que creen ser líder' : 'líder'}
              value={leaders.length > 1 ? leaders.map((l) => name(l.id)).join(' · ') : leader ? name(leader.id) : 'ninguno'}
              tone={leaders.length > 1 ? 'warn' : leader ? 'ok' : 'bad'}
            />
            <Stat label="entradas comprometidas" value={leader ? leader.commit : '—'} />
          </div>
          <div className="rf-logs" aria-label="Log de cada nodo">
            {sim.nodes.map((n) => (
              <div key={n.id} className={`rf-logrow ${n.alive ? '' : 'is-dead'}`}>
                <span className="rf-logname">{name(n.id)}</span>
                <span className="rf-cells">
                  {cols.map((c) => {
                    const e = n.log[c]
                    if (!e) return <span key={c} className="rf-cell is-empty" />
                    const committed = c < n.commit
                    return (
                      <span
                        key={c}
                        className={`rf-cell ${committed ? 'is-committed' : ''} ${e.cmd === 0 ? 'is-noop' : ''}`}
                        title={`Entrada ${c + 1}, término ${e.term}${e.cmd ? `, escritura ${e.cmd}` : ' (no-op)'}${committed ? ', comprometida' : ''}`}
                      >
                        {e.term}
                      </span>
                    )
                  })}
                </span>
              </div>
            ))}
            <p className="rf-legend">Cada celda muestra el término de la entrada. Rellena = comprometida; punteada = no-op del nuevo líder.</p>
          </div>
          <Log entries={sim.events} empty="Esperando el primer timeout de elección…" />
        </div>
      }
    >
      <div ref={wrapRef}>
        <svg viewBox="0 0 360 270" className="rf-svg" role="img" aria-label={`Clúster Raft. Líder: ${leader ? name(leader.id) : 'ninguno'}. Término ${maxTerm}.`}>
          {sim.nodes.map((a) =>
            sim.nodes
              .filter((b) => b.id > a.id)
              .map((b) => {
                const pa = pos(a.id)
                const pb = pos(b.id)
                const broken = !!sim.minority && sim.minority.includes(a.id) !== sim.minority.includes(b.id)
                return <line key={`${a.id}-${b.id}`} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} className={`rf-link ${broken ? 'is-cut' : ''}`} />
              }),
          )}
          {sim.msgs.map((m) => {
            const pa = pos(m.from)
            const pb = pos(m.to)
            const p = Math.min(1, Math.max(0, (sim.tick - m.sent) / (m.at - m.sent)))
            const vote = m.kind === 'vote-req' || m.kind === 'vote-res'
            const heavy = m.kind === 'append' && m.entries.length > 0
            if (reduced) {
              return <line key={m.id} x1={pa.x} y1={pa.y} x2={pb.x} y2={pb.y} className={`rf-msgline ${vote ? 'is-vote' : ''}`} />
            }
            return (
              <circle
                key={m.id}
                cx={pa.x + (pb.x - pa.x) * p}
                cy={pa.y + (pb.y - pa.y) * p}
                r={heavy ? 6 : vote ? 5 : 3.5}
                className={`rf-msg ${vote ? 'is-vote' : ''} ${m.kind.endsWith('res') ? 'is-res' : ''}`}
              />
            )
          })}
          {sim.nodes.map((n) => {
            const p = pos(n.id)
            const remaining = Math.max(0, Math.min(1, (n.deadline - sim.tick) / TO_MAX))
            const circ = 2 * Math.PI * 33
            const isolated = sim.minority?.includes(n.id)
            return (
              <g key={n.id}>
                {isolated && <circle cx={p.x} cy={p.y} r={42} className="rf-isolated" />}
                {n.alive && n.role !== 'leader' && (
                  <circle
                    cx={p.x}
                    cy={p.y}
                    r={33}
                    className="rf-timeout"
                    strokeDasharray={`${circ * remaining} ${circ}`}
                    transform={`rotate(-90 ${p.x} ${p.y})`}
                  />
                )}
                <circle cx={p.x} cy={p.y} r={26} className={`rf-node is-${n.role} ${n.alive ? '' : 'is-dead'}`} />
                <text x={p.x} y={p.y - 2} textAnchor="middle" className="rf-name">
                  {name(n.id)}
                </text>
                <text x={p.x} y={p.y + 14} textAnchor="middle" className="rf-term">
                  {n.alive ? `T${n.term}` : 'caído'}
                </text>
                {n.alive && n.role !== 'follower' && (
                  <text x={p.x} y={p.y + (n.id === 0 ? 50 : -38)} textAnchor="middle" className={`rf-role is-${n.role}`}>
                    {n.role === 'leader' ? 'LÍDER' : `candidato (${n.votes.length})`}
                  </text>
                )}
              </g>
            )
          })}
        </svg>
      </div>
    </WidgetFrame>
  )
}
