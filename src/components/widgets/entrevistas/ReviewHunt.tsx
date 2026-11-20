import { type ReactNode, useState } from 'react'
import { AnimatePresence, motion } from 'motion/react'
import { Eye, Flag, RotateCcw } from 'lucide-react'
import { Segmented, Stat, WidgetFrame } from '../kit'
import { pickLang, useCodeLang } from '../../../lib/codeLang'
import './ReviewHunt.css'

/**
 * ReviewHunt: a realistic pull request with planted problems. Tap lines to
 * flag them, then reveal the findings with their severity and the comment a
 * senior reviewer would leave. Nothing is saved.
 */

interface DiffFile {
  id: string
  path: string
  lines: string[]
}

const FILES_TS: DiffFile[] = [
  {
    id: 'src',
    path: 'src/reservas/crear-reserva.ts',
    lines: [
      "import { db } from '../db'",
      "import { pagos } from '../pagos'",
      '',
      'export async function crearReserva(req: Request, res: Response) {',
      '  const { salaId, inicio, fin, invitados } = req.body',
      '  const sala = await db.query(`SELECT * FROM salas WHERE id = ${salaId}`)',
      '',
      '  const choques = await db.query(',
      "    'SELECT id FROM reservas WHERE sala_id = $1 AND inicio < $3 AND fin > $2',",
      '    [salaId, inicio, fin],',
      '  )',
      '  if (choques.rows.length > 0) {',
      "    return res.status(409).json({ error: 'Sala ocupada' })",
      '  }',
      '',
      '  const horas = (Date.parse(fin) - Date.parse(inicio)) / 3600',
      '  const data2 = sala.rows[0].precio_hora * horas',
      '  await pagos.cobrar(req.user.id, data2)',
      '',
      '  const reserva = await db.query(',
      "    'INSERT INTO reservas (sala_id, inicio, fin) VALUES ($1, $2, $3) RETURNING id',",
      '    [salaId, inicio, fin],',
      '  )',
      '  for (const email of invitados) {',
      "    const u = await db.query('SELECT id FROM usuarios WHERE email = $1', [email])",
      "    await db.query('INSERT INTO invitados (reserva_id, usuario_id) VALUES ($1, $2)', [reserva.rows[0].id, u.rows[0].id])",
      '  }',
      '  return res.status(201).json({ id: reserva.rows[0].id })',
      '}',
    ],
  },
  {
    id: 'test',
    path: 'src/reservas/crear-reserva.test.ts',
    lines: [
      "import { crearReserva } from './crear-reserva'",
      '',
      "it('crea una reserva', async () => {",
      '  const res = { status: vi.fn().mockReturnThis(), json: vi.fn() }',
      '  await crearReserva(reqDePrueba, res)',
      '  expect(res.json).toHaveBeenCalled()',
      '})',
    ],
  },
]

const FILES_JAVA: DiffFile[] = [
  {
    id: 'src',
    path: 'src/main/java/reservas/CrearReservaController.java',
    lines: [
      "@RestController",
      "public class CrearReservaController {",
      "    private final JdbcTemplate db;",
      "    private final Pagos pagos;",
      "",
      "    CrearReservaController(JdbcTemplate db, Pagos pagos) {",
      "        this.db = db;",
      "        this.pagos = pagos;",
      "    }",
      "",
      "    @PostMapping(\"/reservas\")",
      "    public ResponseEntity<?> crear(@RequestBody ReservaRequest req, @AuthenticationPrincipal Usuario user) {",
      "        var sala = db.queryForMap(\"SELECT * FROM salas WHERE id = \" + req.salaId());",
      "",
      "        List<Long> choques = db.queryForList(",
      "            \"SELECT id FROM reservas WHERE sala_id = ? AND inicio < ? AND fin > ?\",",
      "            Long.class, req.salaId(), req.fin(), req.inicio());",
      "        if (!choques.isEmpty()) {",
      "            return ResponseEntity.status(409).body(Map.of(\"error\", \"Sala ocupada\"));",
      "        }",
      "",
      "        long horas = Duration.between(req.inicio(), req.fin()).toMillis() / 3600;",
      "        long data2 = ((Number) sala.get(\"precio_hora\")).longValue() * horas;",
      "        pagos.cobrar(user.id(), data2);",
      "",
      "        Long id = db.queryForObject(",
      "            \"INSERT INTO reservas (sala_id, inicio, fin) VALUES (?, ?, ?) RETURNING id\",",
      "            Long.class, req.salaId(), req.inicio(), req.fin());",
      "        for (String email : req.invitados()) {",
      "            Long u = db.queryForObject(\"SELECT id FROM usuarios WHERE email = ?\", Long.class, email);",
      "            db.update(\"INSERT INTO invitados (reserva_id, usuario_id) VALUES (?, ?)\", id, u);",
      "        }",
      "        return ResponseEntity.status(201).body(Map.of(\"id\", id));",
      "    }",
      "}",
    ],
  },
  {
    id: 'test',
    path: 'src/test/java/reservas/CrearReservaControllerTest.java',
    lines: [
      "@ExtendWith(MockitoExtension.class)",
      "class CrearReservaControllerTest {",
      "    @Mock JdbcTemplate db;",
      "    @Mock Pagos pagos;",
      "",
      "    @Test",
      "    void creaUnaReserva() {",
      "        when(db.queryForMap(anyString())).thenReturn(Map.of(\"precio_hora\", 1000L));",
      "        var res = new CrearReservaController(db, pagos).crear(Fixtures.reserva(), Fixtures.usuario());",
      "        assertNotNull(res);",
      "    }",
      "}",
    ],
  },
]

type Lang = 'Java' | 'TypeScript'
const FILES: Record<Lang, DiffFile[]> = { Java: FILES_JAVA, TypeScript: FILES_TS }

type Severity = 'bloqueante' | 'importante' | 'nit'

interface Issue {
  id: string
  title: string
  severity: Severity
  /** "file:line" keys (1-based) that count as finding it, per language */
  lines: Record<Lang, string[]>
  /** the review comment; one per language when the details differ */
  comment: ReactNode
  commentJava?: ReactNode
}

const M = ({ children }: { children: ReactNode }) => <span className="rh-mono">{children}</span>

const ISSUES: Issue[] = [
  {
    id: 'sqli',
    title: 'Inyección SQL',
    severity: 'bloqueante',
    lines: { TypeScript: ['src:6'], Java: ['src:13'] },
    comment: (
      <>
        <b>salaId</b> viene del body y se interpola dentro del SQL: con <i>1 OR 1=1</i>, o algo peor, la consulta hace lo que quiera el atacante. Usa parámetros como en las otras consultas (<M>WHERE id = $1</M>) y valida el body con un schema antes de usarlo. Además, si la sala no existe, <M>sala.rows[0]</M> es undefined y respondemos 500 en vez de 404.
      </>
    ),
    commentJava: (
      <>
        <b>salaId</b> viene del body y se concatena dentro del SQL: con <i>1 OR 1=1</i>, o algo peor, la consulta hace lo que quiera el atacante. Usa un parámetro <M>?</M> como en las otras consultas y valida el request (Bean Validation, <M>@Valid</M>). Además, si la sala no existe, <M>queryForMap</M> lanza una excepción y respondemos 500 en vez de 404.
      </>
    ),
  },
  {
    id: 'ms',
    title: 'Milisegundos tomados como segundos',
    severity: 'bloqueante',
    lines: { TypeScript: ['src:16'], Java: ['src:22'] },
    comment: (
      <>
        <M>Date.parse</M> devuelve milisegundos, así que esto calcula horas × 1000: una reserva de 2 horas cobra 2.000. Divide por 3.600.000 (mejor con una constante <M>MS_POR_HORA</M>) y agrega un test con números concretos: 2 h a $10 la hora cobran $20.
      </>
    ),
    commentJava: (
      <>
        <M>toMillis()</M> devuelve milisegundos, así que esto calcula horas × 1000: una reserva de 2 horas cobra 2.000. Y la división entera trunca: 1 h 59 min contaría como 1 hora. Usa <M>toMinutes()</M> y redondea hacia arriba, y agrega un test con números concretos: 2 h a $10 la hora cobran $20.
      </>
    ),
  },
  {
    id: 'race',
    title: 'Doble reserva por carrera',
    severity: 'bloqueante',
    lines: { TypeScript: ['src:8', 'src:9', 'src:12', 'src:20', 'src:21'], Java: ['src:15', 'src:16', 'src:18', 'src:26', 'src:27'] },
    comment: (
      <>
        Consultar y después insertar no es atómico: dos peticiones simultáneas pasan el SELECT y las dos insertan la misma sala en el mismo horario. Que lo garantice la base: una restricción de exclusión en Postgres sobre <M>(sala_id, rango de tiempo)</M>, o una transacción que bloquee la sala con <M>SELECT … FOR UPDATE</M>.
      </>
    ),
  },
  {
    id: 'idem',
    title: 'Cobro sin idempotencia y antes de guardar',
    severity: 'bloqueante',
    lines: { TypeScript: ['src:18'], Java: ['src:24'] },
    comment: (
      <>
        Si el cliente reintenta (timeout, doble clic), cobramos dos veces. Y como cobramos antes del INSERT, si el INSERT falla el usuario pagó una reserva que no existe. Propuesta: recibir un header <M>Idempotency-Key</M>, crear la reserva como <i>pendiente</i>, cobrar pasando esa misma clave al proveedor y confirmar al final.
      </>
    ),
  },
  {
    id: 'n1',
    title: 'N+1 consultas con los invitados',
    severity: 'importante',
    lines: { TypeScript: ['src:24', 'src:25', 'src:26'], Java: ['src:29', 'src:30', 'src:31'] },
    comment: (
      <>
        Dos consultas por invitado: con 30 invitados son 60 viajes a la base dentro de la misma petición. Una consulta con <M>WHERE email = ANY($1)</M> y un solo INSERT de varias filas. Ojo también: si un email no está registrado, <M>u.rows[0]</M> es undefined y esto explota.
      </>
    ),
    commentJava: (
      <>
        Dos consultas por invitado: con 30 invitados son 60 viajes a la base dentro de la misma petición. Una consulta con <M>WHERE email = ANY(?)</M> y un <M>batchUpdate</M> para los INSERT. Ojo también: si un email no está registrado, <M>queryForObject</M> lanza <M>EmptyResultDataAccessException</M> y respondemos 500.
      </>
    ),
  },
  {
    id: 'name',
    title: 'Nombre que no dice nada',
    severity: 'nit',
    lines: { TypeScript: ['src:17'], Java: ['src:23'] },
    comment: (
      <>
        nit: <M>data2</M> no dice qué es. <M>monto</M> o <M>totalACobrar</M>. Y si es dinero, mejor en centavos enteros que en un número con decimales.
      </>
    ),
    commentJava: (
      <>
        nit: <M>data2</M> no dice qué es. <M>monto</M> o <M>totalACobrar</M>. Y ojo con el cast a <M>Number</M>: si la columna es <M>numeric</M>, llega un <M>BigDecimal</M> y <M>longValue()</M> descarta los decimales sin avisar.
      </>
    ),
  },
  {
    id: 'test',
    title: 'Un test que no prueba nada',
    severity: 'importante',
    lines: { TypeScript: ['test:5', 'test:6'], Java: ['test:9', 'test:10'] },
    comment: (
      <>
        Este test pasa aunque la función responda 409 o 500, porque <M>json</M> se llama en todos los caminos. Verifica el status 201, el monto que se cobró y que la reserva quedó guardada. Y faltan los casos que más importan: sala ocupada, reintento con la misma clave y cálculo del monto.
      </>
    ),
    commentJava: (
      <>
        <M>assertNotNull(res)</M> pasa aunque el endpoint responda 409: siempre devuelve un <M>ResponseEntity</M>. Verifica <M>res.getStatusCode()</M>, el monto con <M>verify(pagos).cobrar(…)</M> y que la reserva quedó guardada. Y faltan los casos que más importan: sala ocupada, reintento con la misma clave y cálculo del monto.
      </>
    ),
  },
]

const LANGS: Lang[] = ['Java', 'TypeScript']

const SEV_LABEL: Record<Severity, string> = { bloqueante: 'Bloqueante', importante: 'Importante', nit: 'Menor (nit)' }

export function ReviewHunt() {
  const [pref, setPref] = useCodeLang()
  const lang = LANGS[pickLang(LANGS, pref)]
  const files = FILES[lang]
  const [marked, setMarked] = useState<Set<string>>(new Set())
  const [revealed, setRevealed] = useState(false)
  const [focus, setFocus] = useState<string | null>(null)
  // the marks belong to one version of the PR: switching language starts over
  const [markedLang, setMarkedLang] = useState<Lang>(lang)
  if (markedLang !== lang) {
    setMarkedLang(lang)
    setMarked(new Set())
    setRevealed(false)
    setFocus(null)
  }

  const issueOf = new Map<string, Issue>()
  ISSUES.forEach((iss) => iss.lines[lang].forEach((l) => issueOf.set(l, iss)))

  const toggle = (key: string) => {
    if (revealed) {
      const iss = issueOf.get(key)
      setFocus(iss ? iss.id : null)
      return
    }
    setMarked((m) => {
      const next = new Set(m)
      if (next.has(key)) next.delete(key)
      else next.add(key)
      return next
    })
  }
  const reset = () => {
    setMarked(new Set())
    setRevealed(false)
    setFocus(null)
  }

  const found = new Set(ISSUES.filter((iss) => iss.lines[lang].some((l) => marked.has(l))).map((iss) => iss.id))
  const falsePos = [...marked].filter((k) => !issueOf.has(k)).length

  return (
    <WidgetFrame
      title="Review"
      caption="Un PR que agrega el endpoint para reservar una sala y cobrarla. Tiene siete problemas plantados. Toca las líneas donde dejarías un comentario y después revela los hallazgos."
      controls={
        <div className="rh-controls">
          <span className="rh-pr">
            <b>#418</b> Agrega POST /reservas
          </span>
          <Segmented label="Lenguaje" value={lang} onChange={(v) => setPref(v)} options={LANGS.map((l) => ({ value: l, label: l }))} />
          <div className="rh-actions">
            <button type="button" className="btn btn--line" onClick={() => setRevealed(true)} disabled={revealed}>
              <Eye size={15} /> Revelar hallazgos
            </button>
            <button type="button" className="btn btn--ghost" onClick={reset} disabled={!revealed && marked.size === 0}>
              <RotateCcw size={15} /> Empezar de nuevo
            </button>
          </div>
        </div>
      }
      readout={
        revealed ? (
          <div className="rh-stats" aria-live="polite">
            <Stat label="problemas encontrados" value={`${found.size} / ${ISSUES.length}`} tone={found.size >= 5 ? 'ok' : found.size >= 3 ? 'warn' : 'bad'} />
            <Stat label="líneas marcadas sin problema" value={falsePos} />
            <p className="rh-stats__hint">Toca un hallazgo, o una línea resaltada, para ver dónde está. Prioriza así: primero lo que rompe (seguridad, dinero, datos), después rendimiento y tests, y al final los nits.</p>
          </div>
        ) : (
          <p aria-live="polite">
            {marked.size === 0 ? 'Lee primero el código entero, como harías en una revisión real. Luego marca líneas.' : `Marcaste ${marked.size} ${marked.size === 1 ? 'línea' : 'líneas'}.`}
          </p>
        )
      }
    >
      <div className="rh">
        {files.map((f) => (
          <div key={f.id} className="rh-file">
            <div className="rh-file__head">
              <span className="rh-mono">{f.path}</span>
              <span className="rh-file__add">+{f.lines.length}</span>
            </div>
            <div className="rh-file__body">
              {f.lines.map((text, k) => {
                const key = `${f.id}:${k + 1}`
                const iss = issueOf.get(key)
                const isMarked = marked.has(key)
                let state = ''
                if (revealed) {
                  if (iss) state = found.has(iss.id) ? 'is-found' : 'is-missed'
                  else if (isMarked) state = 'is-false'
                }
                const focused = revealed && iss && focus === iss.id
                return (
                  <button
                    key={key}
                    type="button"
                    className={`rh-line ${isMarked ? 'is-marked' : ''} ${state} ${focused ? 'is-focus' : ''}`}
                    onClick={() => toggle(key)}
                    aria-pressed={revealed ? undefined : isMarked}
                    aria-label={`${f.path} línea ${k + 1}: ${text.trim() || 'vacía'}${isMarked ? ' (marcada)' : ''}`}
                  >
                    <span className="rh-line__n" aria-hidden="true">
                      {k + 1}
                    </span>
                    <span className="rh-line__flag" aria-hidden="true">
                      {isMarked ? <Flag size={13} /> : '+'}
                    </span>
                    <span className="rh-line__code" aria-hidden="true">
                      {text || ' '}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}

        <AnimatePresence initial={false}>
          {revealed && (
            <motion.ol
              className="rh-issues"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
            >
              {ISSUES.map((iss) => (
                <li key={iss.id}>
                  <button
                    type="button"
                    className={`rh-issue ${found.has(iss.id) ? 'is-found' : 'is-missed'} ${focus === iss.id ? 'is-focus' : ''}`}
                    onClick={() => setFocus((f) => (f === iss.id ? null : iss.id))}
                    aria-pressed={focus === iss.id}
                  >
                    <span className="rh-issue__top">
                      <span className={`rh-sev rh-sev--${iss.severity}`}>{SEV_LABEL[iss.severity]}</span>
                      <span className="rh-issue__title">{iss.title}</span>
                      <span className="rh-issue__where">
                        {found.has(iss.id) ? 'lo encontraste' : 'se te pasó'} · {iss.lines[lang].map((l) => l.replace('src:', 'L').replace('test:', 'test L')).join(', ')}
                      </span>
                    </span>
                    <span className="rh-issue__comment">{lang === 'Java' && iss.commentJava ? iss.commentJava : iss.comment}</span>
                  </button>
                </li>
              ))}
            </motion.ol>
          )}
        </AnimatePresence>
      </div>
    </WidgetFrame>
  )
}
