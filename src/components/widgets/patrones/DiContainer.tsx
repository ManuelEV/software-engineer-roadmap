import { useMemo, useState } from 'react'
import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { TriangleAlert } from 'lucide-react'
import { Segmented, WidgetFrame } from '../kit'
import { CodeBlock } from '../../mdx/CodeBlock'
import './DiContainer.css'

type Env = 'prod' | 'test'
type Lifetime = 'singleton' | 'scoped' | 'transient'
type Service = 'CheckoutController' | 'CheckoutService' | 'PaymentGateway' | 'OrderRepository' | 'DbConnection' | 'Logger'

const impls: Record<Env, Record<Service, string | null>> = {
  prod: {
    CheckoutController: 'CheckoutController',
    CheckoutService: 'CheckoutService',
    PaymentGateway: 'StripeGateway',
    OrderRepository: 'PostgresOrderRepository',
    DbConnection: 'PgConnection',
    Logger: 'JsonLogger',
  },
  test: {
    CheckoutController: 'CheckoutController',
    CheckoutService: 'CheckoutService',
    PaymentGateway: 'FakeGateway',
    OrderRepository: 'InMemoryOrderRepository',
    DbConnection: null,
    Logger: 'SilentLogger',
  },
}

const deps: Record<Env, Record<Service, Service[]>> = {
  prod: {
    CheckoutController: ['CheckoutService'],
    CheckoutService: ['PaymentGateway', 'OrderRepository', 'Logger'],
    PaymentGateway: ['Logger'],
    OrderRepository: ['DbConnection'],
    DbConnection: [],
    Logger: [],
  },
  test: {
    CheckoutController: ['CheckoutService'],
    CheckoutService: ['PaymentGateway', 'OrderRepository', 'Logger'],
    PaymentGateway: ['Logger'],
    OrderRepository: [],
    DbConnection: [],
    Logger: [],
  },
}

const editable: Service[] = ['CheckoutService', 'PaymentGateway', 'OrderRepository', 'DbConnection', 'Logger']

interface Node {
  service: Service
  impl: string
  id: number
  lifetime: Lifetime
  fresh: boolean
  captive: boolean
  children: Node[]
}

interface Instance {
  id: number
  tree: Omit<Node, 'fresh'>
}

function simulate(env: Env, lt: Record<Service, Lifetime>) {
  let counter = 0
  const singletons = new Map<Service, Instance>()
  const captives = new Set<string>()

  const markReused = (n: Omit<Node, 'fresh'>): Node => ({ ...n, fresh: false, children: n.children.map(markReused) })

  const resolve = (svc: Service, scope: Map<Service, Instance>, parentLt: Lifetime | null): Node => {
    const life = lt[svc]
    const captive = parentLt === 'singleton' && life === 'scoped'
    const cache = life === 'singleton' ? singletons : life === 'scoped' ? scope : null
    const hit = cache?.get(svc)
    if (hit) return { ...markReused(hit.tree), captive }
    const children = deps[env][svc].filter((d) => impls[env][d]).map((d) => resolve(d, scope, life === 'singleton' ? 'singleton' : parentLt === 'singleton' ? 'singleton' : life))
    counter += 1
    const tree = { service: svc, impl: impls[env][svc]!, id: counter, lifetime: life, captive, children }
    if (captive) captives.add(svc)
    cache?.set(svc, { id: counter, tree })
    return { ...tree, fresh: true }
  }

  const requests = [1, 2].map(() => resolve('CheckoutController', new Map(), null))
  return { requests, captives: [...captives] }
}

const ltShort: Record<Lifetime, string> = { singleton: 'Singleton', scoped: 'Scoped', transient: 'Transient' }

function Tree({ node, depth = 0 }: { node: Node; depth?: number }) {
  const reduced = useReducedMotion()
  return (
    <li className={`di-node ${node.captive ? 'is-captive' : ''}`} style={{ ['--depth' as string]: depth }}>
      <motion.div
        className={`di-row ${node.fresh ? 'is-fresh' : 'is-reused'}`}
        initial={reduced ? false : { opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.25 }}
      >
        <span className="di-impl">{node.impl}</span>
        <span className={`di-life di-life--${node.lifetime}`}>{ltShort[node.lifetime]}</span>
        <span className="di-id" title={node.fresh ? 'instancia nueva' : 'instancia reutilizada'}>
          #{node.id}
          <span className="di-id__state">{node.fresh ? 'nueva' : 'reusada'}</span>
        </span>
        {node.captive && <TriangleAlert size={16} className="di-warn-icon" aria-label="dependencia cautiva" />}
      </motion.div>
      {node.children.length > 0 && (
        <ul>
          {node.children.map((c, i) => (
            <Tree key={`${c.service}-${i}`} node={c} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

export function DiContainer() {
  const [env, setEnv] = useState<Env>('prod')
  const [lt, setLt] = useState<Record<Service, Lifetime>>({
    CheckoutController: 'transient',
    CheckoutService: 'scoped',
    PaymentGateway: 'singleton',
    OrderRepository: 'scoped',
    DbConnection: 'scoped',
    Logger: 'singleton',
  })

  const sim = useMemo(() => simulate(env, lt), [env, lt])
  const shown = editable.filter((s) => impls[env][s])

  const code = [
    `// composition root (${env === 'prod' ? 'producción' : 'pruebas'})`,
    ...shown.map((s) => `c.${lt[s]}(${s}, ${impls[env][s]})`),
    `c.transient(CheckoutController)`,
    ``,
    `const controller = c.resolve(CheckoutController)`,
  ].join('\n')

  return (
    <WidgetFrame
      caption="Un contenedor resolviendo el grafo de un checkout para dos peticiones HTTP. Cambia el entorno para intercambiar implementaciones y juega con los ciclos de vida: mira qué instancias se crean, cuáles se reutilizan y cuándo aparece una dependencia cautiva."
      controls={
        <Segmented<Env>
          label="Entorno"
          value={env}
          onChange={setEnv}
          options={[
            { value: 'prod', label: 'Producción' },
            { value: 'test', label: 'Pruebas' },
          ]}
        />
      }
      readout={
        <AnimatePresence mode="wait" initial={false}>
          {sim.captives.length ? (
            <motion.p key="warn" className="di-alert" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <TriangleAlert size={16} aria-hidden="true" /> <b>Dependencia cautiva:</b> un singleton retiene{' '}
              {sim.captives.join(', ')} (scoped). Fíjate en la petición 2: reutiliza la instancia creada en la petición 1, con su conexión
              y su estado. ASP.NET Core detecta esto en desarrollo y lanza una excepción al validar el contenedor.
            </motion.p>
          ) : (
            <motion.p key="ok" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <b>Singleton</b>: una instancia para toda la app. <b>Scoped</b>: una por petición (compartida dentro de ella).{' '}
              <b>Transient</b>: una nueva cada vez que alguien la pide. Prueba poner <code>CheckoutService</code> como singleton.
            </motion.p>
          )}
        </AnimatePresence>
      }
    >
      <div className="di-grid">
        <div className="di-config">
          {shown.map((s) => (
            <Segmented<Lifetime>
              key={s}
              label={s}
              value={lt[s]}
              onChange={(v) => setLt((prev) => ({ ...prev, [s]: v }))}
              options={[
                { value: 'singleton', label: 'Singleton' },
                { value: 'scoped', label: 'Scoped' },
                { value: 'transient', label: 'Transient' },
              ]}
            />
          ))}
          <div className="di-code">
            <CodeBlock code={code} lang="ts" bare />
          </div>
        </div>
        <div className="di-requests">
          {sim.requests.map((r, i) => (
            <div key={`${env}-${i}`} className="di-request">
              <div className="di-request__title">Petición {i + 1}</div>
              <ul className="di-tree">
                <Tree node={r} />
              </ul>
            </div>
          ))}
        </div>
      </div>
    </WidgetFrame>
  )
}
