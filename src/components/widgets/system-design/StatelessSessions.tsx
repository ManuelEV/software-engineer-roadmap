import { useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import { Pause, Play, RotateCcw } from 'lucide-react'
import { Log, Segmented, Stat, WidgetFrame } from '../kit'
import { EASE, rng, useTicker } from './shared'
import './StatelessSessions.css'

type Mode = 'memory' | 'sticky' | 'shared' | 'jwt'

const USERS = ['Ana', 'Beto', 'Caro', 'Dani', 'Eva', 'Fede']
const W = 420
const UX = (i: number) => 40 + i * 68
const SX = [70, 210, 350]
const LB = { x: 210, y: 128 }

type State = {
  up: boolean[]
  mem: string[][]
  store: string[]
  pin: Record<string, number>
  rr: number
  ok: number
  relogin: number
  lost: number
  last: { user: number; server: number; ok: boolean } | null
  log: { id: number; text: string; tone?: 'ok' | 'warn' | 'bad' }[]
  seq: number
}

function initial(): State {
  const mem: string[][] = [[], [], []]
  const pin: Record<string, number> = {}
  USERS.forEach((u, i) => {
    mem[i % 3].push(u)
    pin[u] = i % 3
  })
  return { up: [true, true, true], mem, store: [...USERS], pin, rr: 0, ok: 0, relogin: 0, lost: 0, last: null, log: [], seq: 0 }
}

const MODE_TEXT: Record<Mode, string> = {
  memory:
    'Cada servidor guarda las sesiones en su RAM y el balanceador reparte en round robin. Casi todas las peticiones caen en un servidor que no conoce al usuario.',
  sticky:
    'Sticky sessions: el balanceador manda siempre al mismo usuario al mismo servidor. Funciona… hasta que ese servidor se cae o hay que retirarlo, y la carga queda desbalanceada.',
  shared:
    'Servidores sin estado: la sesión vive en un almacén compartido (Redis, DynamoDB). Cualquier servidor atiende a cualquiera y puedes matar o agregar servidores sin que nadie se entere.',
  jwt:
    'Token firmado (p. ej. JWT): el cliente trae su identidad y el servidor solo verifica la firma. Cero estado en servidor, pero revocar una sesión antes de que expire exige una lista de bloqueo o tokens cortos con refresh.',
}

export function StatelessSessions() {
  const reduced = useReducedMotion()
  const [mode, setMode] = useState<Mode>('memory')
  const [s, setS] = useState<State>(initial)
  const [auto, setAuto] = useState(false)
  const [rand] = useState(() => rng(7))

  const reset = (m: Mode = mode) => {
    setS(initial())
    setMode(m)
  }

  const send = (user: number) => {
    setS((p) => {
      const n: State = { ...p, up: [...p.up], mem: p.mem.map((m) => [...m]), pin: { ...p.pin }, log: [...p.log] }
      const name = USERS[user]
      const alive = [0, 1, 2].filter((i) => n.up[i])
      if (!alive.length) {
        n.log = [{ id: n.seq++, text: `${name} → 503: no hay servidores vivos`, tone: 'bad' as const }, ...n.log].slice(0, 30)
        n.last = null
        return n
      }
      let server: number
      if (mode === 'sticky') {
        server = n.pin[name]
        if (!n.up[server]) {
          server = alive[Math.floor(rand() * alive.length)]
          n.pin[name] = server
        }
      } else {
        let k = n.rr
        while (!n.up[k % 3]) k++
        server = k % 3
        n.rr = (k + 1) % 3
      }
      let ok = true
      if (mode === 'memory' || mode === 'sticky') {
        ok = n.mem[server].includes(name)
        if (!ok) {
          // A new login issues a new session cookie: the old session (on another server) is orphaned.
          n.relogin++
          n.mem = n.mem.map((m) => m.filter((u) => u !== name))
          n.mem[server].push(name)
        }
      } else if (mode === 'shared') {
        ok = n.store.includes(name)
        if (!ok) {
          n.relogin++
          n.store.push(name)
        }
      }
      if (ok) n.ok++
      n.last = { user, server, ok }
      const entry = ok
        ? { id: n.seq++, text: `${name} → S${server + 1}: 200 OK`, tone: 'ok' as const }
        : { id: n.seq++, text: `${name} → S${server + 1}: 401, sesión no encontrada → vuelve a iniciar sesión`, tone: 'bad' as const }
      n.log = [entry, ...n.log].slice(0, 30)
      return n
    })
  }

  const toggleServer = (i: number) => {
    setS((p) => {
      const n: State = { ...p, up: [...p.up], mem: p.mem.map((m) => [...m]), log: [...p.log] }
      if (n.up[i]) {
        n.up[i] = false
        const lost = mode === 'memory' || mode === 'sticky' ? n.mem[i].length : 0
        n.lost += lost
        n.mem[i] = []
        n.log = [
          {
            id: n.seq++,
            text: `S${i + 1} se cae${lost ? `: ${lost} sesiones en RAM perdidas` : '; no tenía estado, nadie lo nota'}`,
            tone: lost ? ('bad' as const) : ('warn' as const),
          },
          ...n.log,
        ].slice(0, 30)
      } else {
        n.up[i] = true
        n.log = [{ id: n.seq++, text: `S${i + 1} vuelve (vacío)`, tone: 'ok' as const }, ...n.log].slice(0, 30)
      }
      if (n.last?.server === i) n.last = null
      return n
    })
  }

  useTicker(() => send(Math.floor(rand() * USERS.length)), 800, auto)

  const showMem = mode === 'memory' || mode === 'sticky'
  const last = s.last
  const pathColor = last ? (last.ok ? 'ok' : 'bad') : ''

  return (
    <WidgetFrame
      caption={
        <>
          Toca un usuario para que haga una petición, o activa el tráfico automático. Toca un servidor para tirarlo o
          revivirlo. Compara cuántas veces los usuarios tienen que volver a iniciar sesión en cada modo.
        </>
      }
      controls={
        <>
          <Segmented
            label="Dónde vive la sesión"
            value={mode}
            onChange={(m) => reset(m)}
            options={[
              { value: 'memory', label: 'RAM' },
              { value: 'sticky', label: 'RAM + sticky' },
              { value: 'shared', label: 'Redis' },
              { value: 'jwt', label: 'Token' },
            ]}
          />
          <div className="ss__btns">
            <button type="button" className="btn" onClick={() => setAuto((a) => !a)} aria-pressed={auto}>
              {auto ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
              {auto ? 'Pausar tráfico' : 'Tráfico automático'}
            </button>
            <button type="button" className="icon-btn" onClick={() => reset()} aria-label="Reiniciar simulación">
              <RotateCcw size={18} aria-hidden="true" />
            </button>
          </div>
        </>
      }
      readout={
        <>
          <p>{MODE_TEXT[mode]}</p>
          <div className="ss__stats">
            <Stat label="Respuestas OK" value={s.ok} tone="ok" />
            <Stat label="Re-logins forzados" value={s.relogin} tone={s.relogin ? 'bad' : undefined} />
            <Stat label="Sesiones perdidas por caídas" value={s.lost} tone={s.lost ? 'bad' : undefined} />
          </div>
          <Log entries={s.log.slice(0, 6)} empty="Toca a un usuario para enviar una petición." />
        </>
      }
    >
      <svg className="ss__svg" viewBox={`0 0 ${W} ${mode === 'shared' ? 372 : 300}`} role="group" aria-label="Usuarios, balanceador y servidores">
        {/* links */}
        {USERS.map((_, i) => (
          <line key={`u${i}`} x1={UX(i)} y1={58} x2={LB.x} y2={LB.y - 18} className={`ss__wire ${last?.user === i ? `is-${pathColor}` : ''}`} />
        ))}
        {SX.map((x, i) => (
          <line key={`s${i}`} x1={LB.x} y1={LB.y + 18} x2={x} y2={196} className={`ss__wire ${last?.server === i ? `is-${pathColor}` : ''} ${s.up[i] ? '' : 'is-down'}`} />
        ))}
        {mode === 'shared' &&
          SX.map((x, i) => <line key={`r${i}`} x1={x} y1={286} x2={x} y2={316} className={`ss__wire ss__wire--thin ${s.up[i] ? '' : 'is-down'}`} />)}

        {/* users */}
        {USERS.map((u, i) => (
          <g
            key={u}
            className={`ss__user ${last?.user === i ? 'is-last' : ''}`}
            role="button"
            tabIndex={0}
            aria-label={`Petición de ${u}`}
            onClick={() => send(i)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                send(i)
              }
            }}
          >
            <circle cx={UX(i)} cy={34} r={22} className="ss__ucircle" />
            <text x={UX(i)} y={39} textAnchor="middle" className="ss__uname">
              {u}
            </text>
            {mode === 'jwt' && (
              <text x={UX(i)} y={72} textAnchor="middle" className="ss__token">
                token
              </text>
            )}
          </g>
        ))}

        {/* load balancer */}
        <rect x={LB.x - 70} y={LB.y - 18} width={140} height={36} rx={18} className="ss__lb" />
        <text x={LB.x} y={LB.y + 5} textAnchor="middle" className="ss__lbtext">
          {mode === 'sticky' ? 'LB (sticky)' : 'LB round robin'}
        </text>

        {/* servers */}
        {SX.map((x, i) => (
          <g
            key={i}
            className={`ss__server ${s.up[i] ? '' : 'is-down'} ${last?.server === i ? `is-hit is-${pathColor}` : ''}`}
            role="button"
            tabIndex={0}
            aria-pressed={!s.up[i]}
            aria-label={`Servidor ${i + 1}: ${s.up[i] ? 'vivo, tocar para tirarlo' : 'caído, tocar para revivirlo'}`}
            onClick={() => toggleServer(i)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault()
                toggleServer(i)
              }
            }}
          >
            <motion.rect
              x={x - 62}
              y={196}
              width={124}
              height={90}
              rx={8}
              className="ss__sbox"
              animate={last?.server === i && !reduced ? { opacity: [0.6, 1] } : { opacity: 1 }}
              transition={{ duration: 0.3, ease: EASE }}
            />
            <text x={x} y={216} textAnchor="middle" className="ss__stitle">
              S{i + 1} {s.up[i] ? '' : '· caído'}
            </text>
            {showMem &&
              s.mem[i].map((u, k) => (
                <text key={u} x={x - 48 + (k % 2) * 56} y={240 + Math.floor(k / 2) * 18} className="ss__chip">
                  {u}
                </text>
              ))}
            {!showMem && s.up[i] && (
              <text x={x} y={252} textAnchor="middle" className="ss__stateless">
                sin estado
              </text>
            )}
          </g>
        ))}

        {mode === 'shared' && (
          <g>
            <rect x={20} y={316} width={380} height={48} rx={8} className="ss__store" />
            <text x={34} y={337} className="ss__stitle">
              Redis · sesiones
            </text>
            <text x={34} y={356} className="ss__chip">
              {s.store.join(' · ')}
            </text>
          </g>
        )}
      </svg>
      <p className="visually-hidden" aria-live="polite">
        {last ? `${USERS[last.user]} atendido por servidor ${last.server + 1}: ${last.ok ? 'OK' : 'sesión no encontrada'}` : ''}
      </p>
    </WidgetFrame>
  )
}
