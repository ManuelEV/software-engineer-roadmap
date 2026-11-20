import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { WidgetFrame } from '../kit'
import { AlgoLayout, CodeTrace, StepControls, StepNote } from './algo-kit'
import { useStepPlayer } from './useStepPlayer'
import './LruCache.css'

/**
 * LRU cache = hash map (key -> node) + doubly linked list ordered by recency,
 * with sentinels at both ends. Each get/put is split into the O(1) pointer
 * operations it performs; frames come from running the operations.
 */

const CODE = [
  'def get(self, key):',
  '    if key not in self.map:',
  '        return -1',
  '    node = self.map[key]',
  '    self._remove(node)',
  '    self._add_front(node)',
  '    return node.val',
  '',
  'def put(self, key, val):',
  '    if key in self.map:',
  '        self._remove(self.map[key])',
  '    node = Node(key, val)',
  '    self.map[key] = node',
  '    self._add_front(node)',
  '    if len(self.map) > self.cap:',
  '        lru = self.tail.prev',
  '        self._remove(lru)',
  '        del self.map[lru.key]',
]

type Op = { kind: 'get'; key: number } | { kind: 'put'; key: number; val: string }

const JAVA = [
  'public int get(int key) {',
  '    Node node = map.get(key);',
  '    if (node == null)',
  '        return -1;',
  '    remove(node);',
  '    addFront(node);',
  '    return node.val;',
  '}',
  '',
  'public void put(int key, int val) {',
  '    Node old = map.get(key);',
  '    if (old != null)',
  '        remove(old);',
  '    Node node = new Node(key, val);',
  '    map.put(key, node);',
  '    addFront(node);',
  '    if (map.size() > cap) {',
  '        Node lru = tail.prev;',
  '        remove(lru);',
  '        map.remove(lru.key);',
  '    }',
  '}',
]
const JAVA_MAP = [0, [1, 2], 3, 1, 4, 5, 6, null, 9, [10, 11], 12, 13, 14, 15, 16, 17, 18, 19]

interface Frame {
  line: number | number[]
  op: number
  /** keys from most to least recently used */
  order: number[]
  vals: Record<number, string>
  inMap: number[]
  hot?: number
  /** node detached from the list but still alive */
  floating?: number
  evicted?: number
  result?: string
  note: string
  tone?: 'ok' | 'bad'
}

const opText = (o: Op) => (o.kind === 'get' ? `get(${o.key})` : `put(${o.key}, ${o.val})`)

function buildFrames(cap: number, ops: Op[]): Frame[] {
  let order: number[] = []
  const vals: Record<number, string> = {}
  const frames: Frame[] = []
  const push = (f: Omit<Frame, 'order' | 'vals' | 'inMap'>) => frames.push({ ...f, order: [...order], vals: { ...vals }, inMap: [...order].sort((a, b) => a - b) })
  push({ line: -1, op: -1, note: `Caché vacía con capacidad ${cap}. A la izquierda (junto a head) va lo usado más recientemente; a la derecha (junto a tail), lo que se va a desalojar.` })
  ops.forEach((o, i) => {
    if (o.kind === 'get') {
      if (!order.includes(o.key)) {
        push({ line: [1, 2], op: i, result: '-1', tone: 'bad', note: `${opText(o)}: la clave ${o.key} no está en el mapa. Devolvemos −1 sin tocar la lista. O(1).` })
        return
      }
      push({ line: 3, op: i, hot: o.key, note: `${opText(o)}: el mapa nos da el nodo de ${o.key} en O(1). Sin el mapa habría que recorrer la lista: O(n).` })
      order = order.filter((k) => k !== o.key)
      push({ line: 4, op: i, hot: o.key, floating: o.key, note: `_remove: sus vecinos se apuntan entre sí (prev.next = node.next, next.prev = node.prev). Cuatro punteros, O(1), gracias a que la lista es doble.` })
      order = [o.key, ...order]
      push({ line: 5, op: i, hot: o.key, note: `_add_front: lo insertamos entre head y el primero. Ahora ${o.key} es lo más reciente.` })
      push({ line: 6, op: i, hot: o.key, result: vals[o.key], tone: 'ok', note: `Devolvemos ${vals[o.key]}. Leer también cuenta como "usar": por eso get mueve el nodo.` })
      return
    }
    if (order.includes(o.key)) {
      order = order.filter((k) => k !== o.key)
      push({ line: [9, 10], op: i, floating: o.key, note: `${opText(o)}: la clave ya existe. Sacamos el nodo viejo de la lista; lo vamos a reemplazar.` })
    }
    vals[o.key] = o.val
    push({ line: [11, 12], op: i, hot: o.key, floating: o.key, note: `Creamos el nodo (${o.key}, ${o.val}) y lo registramos en el mapa.` })
    order = [o.key, ...order]
    push({ line: 13, op: i, hot: o.key, note: `_add_front: (${o.key}, ${o.val}) queda como lo más reciente. Tamaño: ${order.length} de ${cap}.` })
    if (order.length > cap) {
      const lru = order[order.length - 1]
      push({ line: [14, 15], op: i, hot: lru, note: `Nos pasamos de la capacidad. El menos usado es tail.prev: la clave ${lru}. No hay que buscarlo, siempre está al final.` })
      order = order.slice(0, -1)
      delete vals[lru]
      push({ line: [16, 17], op: i, evicted: lru, tone: 'bad', note: `Lo sacamos de la lista y del mapa. Por eso el nodo guarda su clave: para poder borrarla del mapa al desalojarlo.` })
    }
  })
  push({ line: -1, op: ops.length, tone: 'ok', note: 'Fin de las operaciones. Cada get y cada put tocó un número fijo de punteros y una entrada del mapa: O(1).' })
  return frames
}

const PRESETS: { label: string; cap: number; ops: Op[] }[] = [
  {
    label: 'Capacidad 2 (ejemplo de LeetCode)',
    cap: 2,
    ops: [
      { kind: 'put', key: 1, val: 'A' },
      { kind: 'put', key: 2, val: 'B' },
      { kind: 'get', key: 1 },
      { kind: 'put', key: 3, val: 'C' },
      { kind: 'get', key: 2 },
      { kind: 'put', key: 4, val: 'D' },
      { kind: 'get', key: 1 },
      { kind: 'get', key: 3 },
    ],
  },
  {
    label: 'Capacidad 3, con actualización',
    cap: 3,
    ops: [
      { kind: 'put', key: 7, val: 'pedido' },
      { kind: 'put', key: 3, val: 'envío' },
      { kind: 'put', key: 9, val: 'pago' },
      { kind: 'get', key: 7 },
      { kind: 'put', key: 3, val: 'envío*' },
      { kind: 'put', key: 5, val: 'factura' },
      { kind: 'get', key: 9 },
    ],
  },
]

export function LruCache() {
  const reduced = useReducedMotion()
  const [preset, setPreset] = useState(0)
  const { cap, ops } = PRESETS[preset]
  const frames = useMemo(() => buildFrames(cap, ops), [cap, ops])
  const player = useStepPlayer(frames.length, { resetKey: String(preset), interval: 1100 })
  const f = frames[player.i]
  const t = { duration: reduced ? 0 : 0.32, ease: [0.16, 1, 0.3, 1] as const }

  return (
    <WidgetFrame
      caption="Caché LRU por dentro: el mapa encuentra el nodo en O(1) y la lista doble lo mueve al frente o lo desaloja en O(1). Lo más reciente queda junto a head; lo que se va, junto a tail."
      controls={
        <label className="lru-pick">
          <span className="seg__label">Secuencia</span>
          <select value={preset} onChange={(e) => setPreset(Number(e.target.value))}>
            {PRESETS.map((p, k) => (
              <option key={p.label} value={k}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
      }
      readout={<StepNote tone={f.tone}>{f.note}</StepNote>}
    >
      <AlgoLayout
        visual={
          <>
            <ol className="lru-ops" aria-label="Operaciones">
              {ops.map((o, k) => (
                <li key={k} className={k === f.op ? 'is-on' : k < f.op ? 'is-done' : ''} aria-current={k === f.op ? 'step' : undefined}>
                  {opText(o)}
                  {k === f.op && f.result !== undefined && <b className={f.result === '-1' ? 'is-miss' : 'is-hit'}> → {f.result}</b>}
                </li>
              ))}
            </ol>

            <div className="lru-block">
              <div className="lru-block__title">map (clave → nodo)</div>
              <div className="lru-map">
                {f.inMap.length === 0 && <span className="lru-empty">vacío</span>}
                {f.inMap.map((k) => (
                  <span key={k} className={`lru-map__pair ${k === f.hot ? 'is-hot' : ''}`}>
                    <b>{k}</b> → nodo
                  </span>
                ))}
                {f.evicted !== undefined && (
                  <span className="lru-map__pair is-gone">
                    <b>{f.evicted}</b> → borrado
                  </span>
                )}
              </div>
            </div>

            <div className="lru-block">
              <div className="lru-block__title">lista doble (más reciente → menos reciente)</div>
              <div className="lru-list" role="img" aria-label={`Orden de uso: ${f.order.join(', ') || 'vacío'}`}>
                <span className="lru-sent">head</span>
                <AnimatePresence initial={false}>
                  {f.order.map((k) => (
                    <motion.span key={k} layout={!reduced} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={t} className={`lru-node ${k === f.hot ? 'is-hot' : ''}`}>
                      <span className="lru-link" aria-hidden="true">
                        ⇄
                      </span>
                      <span className="lru-node__box">
                        <b>{k}</b>
                        <small>{f.vals[k]}</small>
                      </span>
                    </motion.span>
                  ))}
                </AnimatePresence>
                <span className="lru-link" aria-hidden="true">
                  ⇄
                </span>
                <span className="lru-sent">tail</span>
              </div>
              <div className="lru-side">
                {f.floating !== undefined && (
                  <span className="lru-node__box is-floating">
                    <b>{f.floating}</b>
                    <small>{f.vals[f.floating]}</small>
                    <em>fuera de la lista</em>
                  </span>
                )}
                {f.evicted !== undefined && (
                  <span className="lru-node__box is-evicted">
                    <b>{f.evicted}</b>
                    <em>desalojado</em>
                  </span>
                )}
              </div>
            </div>
          </>
        }
        code={<CodeTrace title="Python" lines={CODE} active={f.line} variants={[{ label: 'Java', lines: JAVA, map: JAVA_MAP }]} />}
      />
      <StepControls player={player} />
    </WidgetFrame>
  )
}
