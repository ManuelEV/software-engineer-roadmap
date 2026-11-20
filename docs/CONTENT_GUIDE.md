# Guía de contenido — Apuntes

Estos son apuntes de ingeniería de software en español, organizados como un cuaderno de clase: cada **unidad** (Arquitectura, System Design…) tiene **temas** numerados (2.4 es el cuarto tema de la unidad 2). Esta guía define cómo se escribe un tema.

## Dónde vive cada cosa

```
src/content/<unidad>/topics.ts     ← índice de la unidad (slug, título, resumen, minutos, grupo, loader)
src/content/<unidad>/<slug>.mdx    ← el contenido de cada tema
src/components/widgets/<unidad>/   ← widgets interactivos propios de esa unidad (TSX + CSS)
```

Unidades (en `src/content/units.ts`): `arquitectura` (1), `system-design` (2), `casos` (3, "Entrevistas técnicas"), `patrones` (4), `ia` (5).

La unidad 3 conserva el id `casos` para no romper URLs, pero cubre todo el proceso de entrevistas. Su índice está partido en varios archivos que `casos/topics.ts` concatena en este orden: `topics-c.ts` (la entrevista y live coding), `topics-d.ts` (preguntas conceptuales), `topics-a.ts` + `topics-b.ts` (casos de system design, todos con el grupo "System design") y `topics-e.ts` (conductual y cierre). Sus widgets van en `src/components/widgets/entrevistas/` (los de los casos de system design siguen en `casos-a/` y `casos-b/`). Los planes de estudio que mezclan unidades están en `src/content/plans.ts`.

- El **título** de la página sale de `topics.ts`. El MDX **no** lleva `# H1`; empieza con el párrafo de apertura.
- Puedes cambiar títulos, resúmenes, minutos, orden o agregar/quitar temas en el `topics.ts` de tu unidad (cada entrada necesita su `.mdx`).

## Voz y estilo

- Español neutro latinoamericano, tuteo ("tú"), directo, como un buen profesor senior explicando en una pizarra.
- Términos técnicos estándar en inglés cuando así se usan en la industria (*load balancer*, *sharding*, *bounded context*, *prompt*), en cursiva la primera vez o explicados con `<Term>`.
- Frases cortas. Cada párrafo responde una pregunta. Nada de relleno ("En el mundo actual…"), nada de marketing.
- Siempre el **por qué** y el **trade-off**, no solo el qué. Muestra cuándo NO usar algo.
- Ejemplos concretos con nombres reales del dominio (pedidos, pagos, envíos, usuarios), no `foo/bar`.
- No inventes cifras, citas ni benchmarks. Si das un número, que sea verificable o claramente un supuesto ("supongamos 100 M de usuarios activos diarios").

## Estructura de un tema

1. **Apertura** (1–3 párrafos): qué problema resuelve esto y por qué te importa.
2. **4 a 8 secciones `##`** (con `###` dentro si hace falta). Cada `##` sale resaltado (como en tus propios apuntes) y aparece en el índice lateral, así que úsalo para cortes reales.
3. **Al menos un elemento interactivo** por página (un `FlowDiagram` con `steps` o un widget propio). Los temas centrales merecen 2–4.
4. **Código** donde aporte: TypeScript por defecto; `CodeTabs` con TypeScript + Python/Java cuando comparar ayuda (patrones).
5. **2–3 `<Quiz>`** repartidos (no todos al final), con explicación en cada opción.
6. **`<Takeaways>`** al final con 4–7 bullets.
7. **`## Fuentes y lecturas`** después de Takeaways: lista de enlaces reales y verificados (libros, artículos, docs oficiales, blogs de ingeniería).

Extensión orientativa: 1.800–3.500 palabras por tema (los casos de system design pueden llegar a 4.500).

## Componentes disponibles sin importar

### `<Callout type="idea|warn|interview|example|note|tip" title="opcional">`
Markdown adentro (deja líneas en blanco alrededor del contenido).

### `<Sidenote>`
Nota al margen (estilo Tufte), **inline**, dentro de un párrafo: `texto<Sidenote>aclaración breve.</Sidenote> sigue el texto`. En pantallas anchas va al margen; en móvil se despliega al tocar el número. Úsala para matices, historia, datos curiosos.

### `<Term def="definición corta">palabra</Term>`
Glosario inline con tooltip.

### `<Figure caption="..." wide>` … `</Figure>`
Para envolver una imagen/SVG propio. Los widgets ya traen su propio marco.

### `<Quiz question="..." options={[{ text: '...', correct: true, why: '...' }, { text: '...', why: '...' }]} />`
Una sola respuesta correcta. `why` en todas las opciones.

### Bloques de código
````
```ts title="src/domain/order.ts" {3,5-7}
// title opcional; {líneas} resaltadas opcional
```
````
Lenguajes: ts, tsx, js, python, java, go, rust, sql, bash, json, yaml, http, graphql, kotlin, text.

### `<CodeTabs>` con varios bloques de código dentro (cada uno con `title="TypeScript"` etc.)

### `<Steps>` + `<Step title="...">markdown</Step>`
Procedimientos numerados, dibujados como pasos conectados.

### `<Details summary="Profundizar: ...">markdown</Details>`
Contenido opcional plegado.

### `<Compare>` + `<Option title="..." verdict="opcional">markdown</Option>`
Columnas comparativas (2–4).

### `<ProsCons pros={['...', '...']} cons={['...']} />`

### `<Takeaways>` con una lista markdown dentro.

### `<Sketch />` — un dibujo a mano que se traza frente al lector

Para la intuición de un tema: un dibujo sencillo, como el que harías en una pizarra, que se dibuja trazo a trazo con la letra manuscrita cuando entra en pantalla (hay un botón para volver a dibujarlo). No reemplaza a los widgets: el dibujo da la idea y el widget deja recorrerla paso a paso.

```tsx
<Sketch
  width={640}
  height={300}
  caption="Qué muestra el dibujo, en una frase."
  items={[
    { type: 'text', x: 24, y: 30, text: 'antes: dos ciclos', size: 22, tone: 'pencil' },
    { type: 'cells', x: 40, y: 92, values: [2, 7, 11, 15], size: 44, states: [null, 'line', null, null], index: true },
    { type: 'arrow', from: [62, 90], to: [150, 90], bend: -46, tone: 'bad', label: 'compara' },
    { type: 'box', x: 400, y: 190, w: 170, h: 56, label: '{ 2: 0 }', font: 'code', fill: true },
    { type: 'circle', x: 520, y: 80, r: 26, label: '5' },
    { type: 'highlight', x: 336, y: 262, w: 58, h: 26, tone: 'ok' },
    { type: 'text', x: 340, y: 282, text: 'O(n)', size: 22, font: 'code', tone: 'ok', with: true },
    { type: 'line', points: [[300, 24], [300, 280]], dashed: true, tone: 'muted' },
    { type: 'check', x: 598, y: 216 },
  ]}
/>
```

- Los elementos se dibujan **en el orden del arreglo**, uno tras otro: ese orden es la historia que cuentas. `with: true` hace que un elemento empiece junto con el anterior; `delay` agrega una pausa en ms; `{ type: 'pause', ms: 400 }` también.
- Tipos: `text` (`text` puede ser un arreglo de líneas; **nunca uses `
` en un string de MDX**), `box` (`label`, `sub`, `fill`), `circle` (`r` o `rx`/`ry`, `label`), `arrow` (`from`, `to`, `bend` curva el trazo: con la flecha de izquierda a derecha, positivo curva hacia abajo y negativo hacia arriba; `label`, `labelAt`, `dashed`, `head: 'end'|'both'|'none'`), `line` (`points`, `dashed`, `arrow`), `cells` (fila de casillas: `values`, `size`, `index`, `states`, `label`), `underline`, `highlight` (destacador, siempre detrás del texto), `check`, `cross`, `brace` (`x`, `y1`, `y2`, `dir`, `label`) y `path` (`d` SVG libre).
- `tone`: `ink` (por defecto), `pencil` (gris de lápiz, para anotaciones), `line` (color de la unidad, lo importante), `ok`, `bad`, `warn`, `muted`. `font` en texto, `box`, `circle` y `cells`: `hand` (por defecto), `code`, `sign`, `serif`.
- Tamaño: `width` de 640 o menos y textos de 20 o más (18 para notas menores) para que se lean en un teléfono. Unos 10 a 18 elementos; el dibujo completo debería tomar 6 segundos o menos (el atributo `data-duration` de `.sketch__paper` dice cuánto dura).

### `<FlowDiagram />` — el diagrama de arquitectura interactivo

```tsx
<FlowDiagram
  caption="Qué pasa cuando un usuario abre un link corto."
  nodes={[
    { id: 'u', label: 'Navegador', kind: 'client', x: 0, y: 1 },
    { id: 'lb', label: 'Load balancer', kind: 'lb', x: 1, y: 1 },
    { id: 'api', label: 'Servicio', kind: 'service', x: 2, y: 1, sub: 'stateless', desc: 'Texto que aparece al tocar el nodo.' },
    { id: 'c', label: 'Redis', kind: 'cache', x: 3, y: 0 },
    { id: 'db', label: 'Postgres', kind: 'db', x: 3, y: 2 },
  ]}
  edges={[
    { from: 'u', to: 'lb', label: 'GET /aZ3' },
    { from: 'lb', to: 'api' },
    { from: 'api', to: 'c' },
    { from: 'api', to: 'db', dashed: true },
  ]}
  groups={[{ label: 'Región us-east', x1: 1, y1: 0, x2: 3, y2: 2 }]}
  steps={[
    { title: 'Llega la petición', body: 'El navegador pide /aZ3…', active: ['u', 'lb'], flow: ['u-lb'] },
    { title: 'Cache hit', body: <>Busca en Redis con <code>GET aZ3</code>.</>, active: ['api', 'c'], flow: ['lb-api', 'api-c'] },
  ]}
/>
```

- Coordenadas en **celdas de grilla** (`x` columna, `y` fila; se aceptan decimales). Cada celda ≈ 172×104 px. Ideal: **máximo 5 columnas** (0–4) para que se lea en móvil; usa más filas antes que más columnas.
- Opcional `mx`/`my` por nodo: posición alternativa en pantallas < 560 px (útil para reacomodar un diagrama ancho en vertical).
- `kind` (ícono): client, mobile, user, users, service, server, db, cache, queue, stream, lb, gateway, cdn, storage, archive, worker, external, llm, agent, brain, tool, terminal, file, search, timer, decision, network, auth, shield, layers, workflow, notify, mail, geo, core, monitor, check, payment, video, image, chat, limiter.
- `tone`: `line` (resaltado con el color de la unidad), `muted` (borde punteado), `warn`, `ok`.
- Edge `id` por defecto: `from-to`. `route`: auto (tramos horizontales + diagonales a 45°), straight, hv, vh. `dashed`, `bidir`, `label`.
- `steps`: recorrido guiado; `active` resalta nodos, `flow` anima un "paquete" por las aristas indicadas. `body` acepta texto o JSX (`<>…<code>x</code>…</>`).
- Sin `steps`, los nodos con `desc` se pueden tocar para ver su explicación.
- Etiquetas cortas (≤ 16 caracteres en `label`, ≤ 22 en `sub`).

## Widgets propios (interactivos a medida)

Cuando un concepto se entiende mejor **manipulándolo** (simuladores, visualizadores), crea un widget en `src/components/widgets/<unidad>/NombreWidget.tsx` e impórtalo en el MDX:

```mdx
import { TokenBucket } from '../../components/widgets/system-design/TokenBucket'

<TokenBucket />
```

Reglas:

- Envuelve todo en `WidgetFrame` de `src/components/widgets/kit.tsx` (`caption`, `controls`, `readout`). Usa también `Segmented`, `Slider`, `Stat`, `Log` del kit, y las clases `.btn`, `.btn--line`, `.btn--ghost`, `.icon-btn`, `.line-badge` (chip genérico), `.unit-tab` (separador de unidad), `.mark` (destacador), `.hand` (anotación a mano) (ver `src/styles/base.css`).
- Animación: `motion/react` (`motion`, `AnimatePresence`, `useReducedMotion`, `animate`). Respeta `useReducedMotion()`: sin desplazamientos, solo cambios de opacidad/color. Duraciones 150–400 ms, easing `[0.16, 1, 0.3, 1]`. Nada de rebotes.
- Íconos: `lucide-react` (o `kindIcons` de `src/components/diagrams/icons.tsx`). Nunca emojis como íconos.
- **Solo tokens CSS**, nada de colores hex sueltos: `--paper`, `--paper-2`, `--paper-3`, `--card`, `--rule`, `--rule-strong`, `--ink`, `--ink-2`, `--ink-3`, `--line` (color de la unidad actual), `--line-ink` (versión legible para texto), `--line-tint`, `--line-tint-2`, `--line-on` (texto sobre fondo `--line`), `--ok`, `--warn`, `--bad`, y `--l1`…`--l5` si necesitas colores categóricos. También `--hl` / `--hl-soft` (destacador de la unidad), `--grid` (cuadriculado) y `--margin-rule` (línea de margen). Fuentes: `--font-display` (títulos), `--font-read` (texto), `--font-sign` (UI, etiquetas, SVG), `--font-hand` (anotaciones breves, nunca texto largo), `--font-code`. Para mezclar colores usa `color-mix(in oklab, …)`: en OKLCH el ámbar mezclado con el fondo oscuro gira hacia el rosado.
- Lenguaje visual = apuntes de clase: papel, trazos limpios de 1,5–2 px, el color de la unidad como destacador (`--hl`) o como relleno de lo seleccionado, celdas de cuadriculado para estados discretos, etiquetas en `--font-sign`. Elementos inactivos en `--rule-strong`. Nada de metáforas de transporte (líneas de metro, estaciones).
- SVG con `viewBox` y `width: 100%`; texto ≥ 13 unidades. Debe funcionar desde **340 px de ancho** hasta escritorio. Objetivos táctiles ≥ 40 px. Todo operable con teclado; `aria-label` en controles sin texto.
- CSS en un archivo propio al lado del widget, con clases prefijadas por el nombre del widget (`.tb-…`). Nada de estilos globales.
- No agregues dependencias npm.
- Prohibido: texto con degradé, glassmorphism decorativo, tarjetas con barra de color en un solo lado, sombras duras desplazadas, etiquetas "eyebrow" sobre los títulos, emojis como íconos.

### Widgets de la unidad de entrevistas

- **Algoritmos animados**: usa el kit `src/components/widgets/entrevistas/algo-kit.tsx` (`StepControls`, `StepNote`, `ArrayView`, `VarPanel`, `CodeTrace`, `AlgoLayout`) junto con el hook `useStepPlayer` de `useStepPlayer.ts`. Los frames se precalculan corriendo el algoritmo real sobre la entrada; el reproductor solo mueve un índice. El ejemplo de referencia es `TwoSumHash.tsx`.
- **Práctica de preguntas**: `QuestionDeck.tsx` (tarjetas con respuesta modelo, señales que suman y restan, y repreguntas). No guarda nada.
- Las soluciones de live coding van en `<CodeTabs>` con tres bloques titulados exactamente `Java`, `Python` y `TypeScript`, en ese orden. La pestaña elegida se recuerda por su nombre y se comparte en vivo con todas las `CodeTabs` y los widgets de la página; si el lector no eligió nada, se muestra Java.
- `CodeTrace` recibe el código base (Python) y, en `variants`, el mismo algoritmo en otros lenguajes con un `map` de líneas: `map[k]` es la línea (o líneas, o `null`) de la variante que corresponde a la línea `k` del código base. Los frames siguen apuntando a líneas del código base. Ejemplo: `TwoSumHash.tsx`.

## Errores comunes de MDX

- `{` y `<` en el texto se interpretan como JSX: escribe `\{`, `&lt;` o ponlo en `código`. "<5 ms" → "menos de 5 ms".
- Comentarios: `{/* así */}`, nunca `<!-- -->`.
- Markdown dentro de un componente necesita líneas en blanco: `<Callout>\n\nTexto **md**\n\n</Callout>`.
- Arrays/objetos en props van entre llaves: `options={[...]}`. Dentro de strings de props, usa comillas simples o escápalas.
- Los `import` van al inicio del archivo.

## Verificación

```bash
node scripts/check-mdx.mjs src/content/<unidad>    # compila los MDX de tu unidad
npx tsc -p tsconfig.app.json --noEmit             # tipos de los widgets
```
