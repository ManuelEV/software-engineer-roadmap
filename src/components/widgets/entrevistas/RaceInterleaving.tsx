import { useMemo, useState } from 'react'
import { Lock, LockOpen, RotateCcw, Undo2 } from 'lucide-react'
import { Segmented, WidgetFrame } from '../kit'
import { pickLang, useCodeLang } from '../../../lib/codeLang'
import { StepControls, StepNote } from './algo-kit'
import { useStepPlayer } from './useStepPlayer'
import './RaceInterleaving.css'

/**
 * RaceInterleaving: two threads run `contador += 1`, split into read / add /
 * write, over a shared counter. The reader picks the interleaving (by hand or
 * with presets); every frame comes from simulating that exact schedule. With
 * the lock on, a thread that finds the lock taken blocks and loses its turn.
 */

type T = 'A' | 'B'
type Op = 'acquire' | 'read' | 'add' | 'write' | 'release'

const START = 100
const PROG_PLAIN: Op[] = ['read', 'add', 'write']
const PROG_LOCK: Op[] = ['acquire', 'read', 'add', 'write', 'release']

type Lang = 'Java' | 'Python'
const LANGS: Lang[] = ['Java', 'Python']

/** The same steps in each language; the Java version compiles as a method of a class with `int contador` and a `ReentrantLock lock`. */
const LINES: Record<Lang, Record<Op, string>> = {
  Java: {
    acquire: 'lock.lock();',
    read: 'int tmp = contador;',
    add: 'tmp = tmp + 1;',
    write: 'contador = tmp;',
    release: 'lock.unlock();',
  },
  Python: {
    acquire: 'lock.acquire()',
    read: 'tmp = contador',
    add: 'tmp = tmp + 1',
    write: 'contador = tmp',
    release: 'lock.release()',
  },
}

interface State {
  pc: Record<T, number>
  tmp: Record<T, number | null>
  mem: number
  owner: T | null
}

interface Frame {
  s: State
  /** who acted in this frame, if anyone */
  who?: T
  op?: Op
  blocked?: boolean
  note: string
  tone?: 'ok' | 'warn' | 'bad'
  /** compact history of executed steps */
  trail: { t: T; text: string; blocked?: boolean }[]
}

const other = (t: T): T => (t === 'A' ? 'B' : 'A')

function simulate(schedule: T[], withLock: boolean, complete: boolean): Frame[] {
  const prog = withLock ? PROG_LOCK : PROG_PLAIN
  const s: State = { pc: { A: 0, B: 0 }, tmp: { A: null, B: null }, mem: START, owner: null }
  const trail: Frame['trail'] = []
  const snap = (): State => ({ pc: { ...s.pc }, tmp: { ...s.tmp }, mem: s.mem, owner: s.owner })
  const frames: Frame[] = [
    {
      s: snap(),
      trail: [],
      note: `contador vale ${START}. Cada hilo va a ejecutar contador += 1, que por dentro son tres pasos: leer, sumar y escribir.${withLock ? ' Ahora los tres pasos están dentro de un lock.' : ''}`,
    },
  ]
  const done = (t: T) => s.pc[t] >= prog.length
  const blockedNow = (t: T) => prog[s.pc[t]] === 'acquire' && s.owner !== null && s.owner !== t

  const step = (want: T) => {
    let t = want
    if (done(t)) t = other(t)
    if (done(t)) return
    const op = prog[s.pc[t]]
    if (op === 'acquire' && blockedNow(t)) {
      trail.push({ t, text: 'espera', blocked: true })
      frames.push({ s: snap(), who: t, op, blocked: true, trail: [...trail], tone: 'warn', note: `${t} intenta tomar el lock, pero lo tiene ${s.owner}. ${t} se bloquea y el planificador le pasa la CPU a otro hilo.` })
      return
    }
    let note = ''
    let text = ''
    switch (op) {
      case 'acquire':
        s.owner = t
        text = 'lock'
        note = `${t} toma el lock. Nadie más puede entrar a la sección crítica hasta que lo suelte.`
        break
      case 'read':
        s.tmp[t] = s.mem
        text = `lee ${s.mem}`
        note = `${t} lee contador (${s.mem}) y lo copia a su variable local tmp.${s.tmp[other(t)] !== null && !withLock && s.pc[other(t)] < prog.length ? ` Ojo: ${other(t)} ya tenía su propia copia, que puede quedar vieja.` : ''}`
        break
      case 'add':
        s.tmp[t] = (s.tmp[t] ?? 0) + 1
        text = `tmp=${s.tmp[t]}`
        note = `${t} suma 1 en su copia local: tmp = ${s.tmp[t]}. contador en memoria sigue en ${s.mem}.`
        break
      case 'write': {
        const before = s.mem
        s.mem = s.tmp[t]!
        text = `escribe ${s.mem}`
        note =
          before === s.mem
            ? `${t} escribe ${s.mem}, pero contador ya valía ${before}: la suma del otro hilo se pisó. Esta es la actualización perdida.`
            : `${t} escribe ${s.mem} en contador.`
        break
      }
      case 'release':
        s.owner = null
        text = 'unlock'
        note = `${t} suelta el lock. Si otro hilo estaba esperando, ahora puede entrar.`
        break
    }
    s.pc[t]++
    trail.push({ t, text })
    const lost = op === 'write' && note.includes('pisó')
    frames.push({ s: snap(), who: t, op, trail: [...trail], note, tone: lost ? 'bad' : undefined })
  }

  for (const t of schedule) step(t)
  if (complete) {
    let guard = 0
    while ((!done('A') || !done('B')) && guard++ < 40) step(!done('A') && !blockedNow('A') ? 'A' : 'B')
  }
  if (done('A') && done('B')) {
    const ok = s.mem === START + 2
    frames.push({
      s: snap(),
      trail: [...trail],
      tone: ok ? 'ok' : 'bad',
      note: ok
        ? `Terminaron los dos: contador = ${s.mem}, lo esperado.${withLock ? ' El lock obligó a que leer-sumar-escribir de un hilo no se mezclara con el del otro.' : ' Esta vez salió bien, pero solo porque el intercalado fue afortunado.'}`
        : `Terminaron los dos y contador = ${s.mem}, no ${START + 2}. Se perdió una actualización: ambos leyeron el mismo valor antes de que el otro escribiera.`,
    })
  }
  return frames
}

type Mode = 'manual' | 'serial' | 'alt' | 'late'

function presetSchedule(mode: Exclude<Mode, 'manual'>, len: number): T[] {
  const A = Array<T>(len).fill('A')
  const B = Array<T>(len).fill('B')
  if (mode === 'serial') return [...A, ...B]
  if (mode === 'alt') return A.flatMap((a) => [a, 'B' as T])
  return [...Array<T>(len - 1).fill('A'), ...B, 'A']
}

export function RaceInterleaving() {
  const [mode, setMode] = useState<Mode>('alt')
  const [lock, setLock] = useState<'off' | 'on'>('off')
  const [pref, setPref] = useCodeLang()
  const lang = LANGS[pickLang(LANGS, pref)]
  const [manual, setManual] = useState<T[]>([])
  const withLock = lock === 'on'
  const prog = withLock ? PROG_LOCK : PROG_PLAIN

  const frames = useMemo(
    () => (mode === 'manual' ? simulate(manual, withLock, false) : simulate(presetSchedule(mode, prog.length), withLock, true)),
    [mode, manual, withLock, prog.length],
  )
  const player = useStepPlayer(frames.length, { resetKey: `${mode}-${lock}`, interval: 1000 })
  const f = mode === 'manual' ? frames[frames.length - 1] : frames[player.i]
  const s = f.s

  const isDone = (t: T) => s.pc[t] >= prog.length
  const isBlocked = (t: T) => prog[s.pc[t]] === 'acquire' && s.owner !== null && s.owner !== t

  const thread = (t: T) => (
    <section className={`ri-thread ri-thread--${t} ${f.who === t ? 'is-acting' : ''}`} aria-label={`Hilo ${t}`}>
      <header className="ri-thread__head">
        <span className="ri-badge">Hilo {t}</span>
        <span className={`ri-status ${isDone(t) ? 'is-done' : isBlocked(t) ? 'is-wait' : ''}`}>{isDone(t) ? 'terminó' : isBlocked(t) ? 'esperando' : 'listo'}</span>
      </header>
      <ol className="ri-code">
        {prog.map((op, k) => (
          <li key={op} className={`${k < s.pc[t] ? 'is-past' : ''} ${k === s.pc[t] ? 'is-next' : ''} ${f.who === t && k === s.pc[t] - (f.blocked ? 0 : 1) ? 'is-now' : ''}`}>
            <code>{LINES[lang][op]}</code>
          </li>
        ))}
      </ol>
      <div className="ri-tmp">
        tmp <b>{s.tmp[t] ?? '—'}</b>
      </div>
      {mode === 'manual' && (
        <button
          type="button"
          className="btn btn--line ri-run"
          disabled={isDone(t) || isBlocked(t)}
          onClick={() => setManual((m) => [...m, t])}
        >
          {isDone(t) ? 'Terminó' : isBlocked(t) ? `${t} espera el lock` : `Ejecutar paso de ${t}`}
        </button>
      )}
    </section>
  )

  return (
    <WidgetFrame
      caption="Dos hilos incrementan el mismo contador. Elige quién avanza en cada paso (o usa un intercalado predefinido) y activa el lock para ver cómo se evita la actualización perdida."
      controls={
        <>
          <Segmented
            label="Intercalado"
            value={mode}
            onChange={(v) => {
              setMode(v)
              setManual([])
            }}
            options={[
              { value: 'alt', label: 'Alternado' },
              { value: 'late', label: 'B se cuela' },
              { value: 'serial', label: 'A y luego B' },
              { value: 'manual', label: 'Tú eliges' },
            ]}
          />
          <Segmented
            label="Sección crítica"
            value={lock}
            onChange={(v) => {
              setLock(v)
              setManual([])
            }}
            options={[
              { value: 'off', label: 'Sin lock' },
              { value: 'on', label: 'Con lock' },
            ]}
          />
          <Segmented<Lang> label="Código" value={lang} onChange={(v) => setPref(v)} options={LANGS.map((l) => ({ value: l, label: l }))} />
        </>
      }
      readout={<StepNote tone={f.tone}>{f.note}</StepNote>}
    >
      <div className="ri">
        <div className="ri-mem">
          <div className={`ri-cell ${f.op === 'write' ? 'is-written' : ''} ${f.tone === 'bad' && f.op === 'write' ? 'is-lost' : ''}`}>
            <span className="ri-cell__k">contador</span>
            <span className="ri-cell__v">{s.mem}</span>
          </div>
          <div className="ri-expect">
            esperado al final: <b>{START + 2}</b>
          </div>
          {withLock && (
            <div className={`ri-lock ${s.owner ? 'is-held' : ''}`}>
              {s.owner ? <Lock size={16} aria-hidden="true" /> : <LockOpen size={16} aria-hidden="true" />}
              {s.owner ? `lock tomado por ${s.owner}` : 'lock libre'}
            </div>
          )}
        </div>
        <div className="ri-threads">
          {thread('A')}
          {thread('B')}
        </div>
        <ol className="ri-trail" aria-label="Historial de pasos ejecutados">
          {f.trail.length === 0 && <li className="ri-trail__empty">Todavía no se ejecutó ningún paso.</li>}
          {f.trail.map((e, k) => (
            <li key={k} className={`ri-step ri-step--${e.t} ${e.blocked ? 'is-blocked' : ''}`}>
              <b>{e.t}</b> {e.text}
            </li>
          ))}
        </ol>
      </div>
      {mode === 'manual' ? (
        <div className="ri-manual">
          <button type="button" className="btn" onClick={() => setManual((m) => m.slice(0, -1))} disabled={manual.length === 0}>
            <Undo2 size={16} aria-hidden="true" /> Deshacer
          </button>
          <button type="button" className="btn btn--ghost" onClick={() => setManual([])} disabled={manual.length === 0}>
            <RotateCcw size={16} aria-hidden="true" /> Reiniciar
          </button>
        </div>
      ) : (
        <StepControls player={player} />
      )}
    </WidgetFrame>
  )
}
