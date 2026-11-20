# Apuntes de ingeniería de software

Guía de estudio interactiva en español sobre **arquitectura de software**, **system design**, **entrevistas técnicas** (live coding con algoritmos animados, preguntas conceptuales, casos de system design, conductual y oferta), **patrones de diseño** y **desarrollo con IA**. Está organizada como un cuaderno de clase: cinco **unidades** con **temas** numerados (1.1, 1.2…), diagramas animados paso a paso, simuladores y preguntas de repaso. No guarda progreso: está pensada para explorar y consultar desde cualquier dispositivo.

## Stack

- React 19 + TypeScript 7 + Vite 8
- MDX 3 para el contenido (`src/content/<unidad>/<slug>.mdx`)
- React Router 8 (SPA)
- Motion 14 para animaciones, lucide-react para íconos, prism-react-renderer para código
- Fuentes autoalojadas con Fontsource: Source Serif 4 (títulos y lectura), Barlow Semi Condensed (UI y etiquetas), Kalam (anotaciones a mano), JetBrains Mono (código)

## Desarrollo

```bash
npm install
npm run dev          # http://localhost:5173
npm run check:mdx    # compila todos los MDX y detecta componentes no definidos
npm run build        # type-check + build de producción en dist/
npm run preview      # sirve dist/ localmente
```

## Deploy en Cloudflare Pages

### Opción A: conectando el repositorio (recomendada)

1. Sube el repo a GitHub o GitLab.
2. En Cloudflare: **Workers & Pages → Create → Pages → Connect to Git**.
3. Configuración de build:
   - Framework preset: **None** (o Vite)
   - Build command: `npm run build`
   - Build output directory: `dist`
   - Variable de entorno: `NODE_VERSION = 22` (Vite 8 necesita Node ≥ 22.12; el repo incluye `.nvmrc`)
4. Deploy. Cada push a `main` publica producción y cada rama genera un preview.

### Opción B: desde tu máquina con Wrangler

```bash
npx wrangler login
npm run deploy       # build + wrangler pages deploy dist --project-name apuntes-ingenieria-software
```

### Notas

- Es una SPA: como `dist/` no tiene `404.html`, Cloudflare Pages sirve `index.html` para cualquier ruta (por ejemplo `/casos/twitter`), y React Router resuelve el resto.
- `public/_headers` define caché inmutable para `/assets/*` y cabeceras de seguridad básicas.
- `wrangler.toml` declara `pages_build_output_dir = "dist"`.

## Agregar o editar contenido

Lee [`docs/CONTENT_GUIDE.md`](docs/CONTENT_GUIDE.md): voz, estructura de un tema, componentes MDX disponibles (`FlowDiagram`, `Quiz`, `Callout`, `Sidenote`, `CodeTabs`, `Steps`, `Compare`…) y reglas para widgets interactivos.

Resumen:

1. Agrega una entrada en `src/content/<unidad>/topics.ts` (slug, título, resumen, minutos, grupo, loader).
2. Crea `src/content/<unidad>/<slug>.mdx` (sin `# H1`; el título viene del índice).
3. `npm run check:mdx` y `npm run dev`.

## Diseño

El sistema visual es un cuaderno universitario de apuntes: papel cuadriculado en las portadas, la línea roja de margen que separa el índice de las notas, un separador de color por unidad (ese color es también su destacador), títulos de sección resaltados como en tus propios apuntes, temas numerados como en un libro de texto, ticks hechos a mano para lo que ya dominas y notas al margen en pantallas anchas. Los tokens viven en `src/styles/tokens.css` (claro/oscuro con `prefers-color-scheme` y selector manual). En el código, `--line` y `[data-line]` significan "color de la unidad actual".
