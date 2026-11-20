// Compiles MDX files to catch syntax errors and unknown components early.
// Usage: node scripts/check-mdx.mjs [dir-or-file ...]   (default: src/content)
import { compile } from '@mdx-js/mdx'
import fs from 'node:fs'
import path from 'node:path'
import remarkGfm from 'remark-gfm'

const GLOBAL = new Set([
  'Callout', 'CodeTabs', 'Compare', 'Details', 'Figure', 'FlowDiagram', 'Option',
  'ProsCons', 'Quiz', 'Sidenote', 'Sketch', 'Step', 'Steps', 'Takeaways', 'Term',
])

const targets = process.argv.slice(2)
const roots = targets.length ? targets : ['src/content']
const files = []
const walk = (p) => {
  const st = fs.statSync(p)
  if (st.isDirectory()) fs.readdirSync(p).forEach((f) => walk(path.join(p, f)))
  else if (p.endsWith('.mdx')) files.push(p)
}
roots.forEach(walk)

let failed = 0
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8')
  try {
    await compile(src, { remarkPlugins: [remarkGfm] })
    // Components used but neither global nor imported
    const imported = new Set(
      [...src.matchAll(/^import\s+(?:\{([^}]+)\}|(\w+))/gm)].flatMap((m) =>
        (m[1] ?? m[2]).split(',').map((s) => s.trim().split(/\s+as\s+/).pop()),
      ),
    )
    const stripped = src
      .replace(/```[\s\S]*?```/g, '')
      .replace(/`[^`\n]*`/g, '')
      .replace(/'(?:\\.|[^'\\\n])*'/g, "''")
      .replace(/"(?:\\.|[^"\\\n])*"/g, '""')
    const used = new Set([...stripped.matchAll(/<([A-Z]\w*)/g)].map((m) => m[1]))
    const unknown = [...used].filter((c) => !GLOBAL.has(c) && !imported.has(c))
    if (unknown.length) {
      failed++
      console.log(`✗ ${f}: componentes no definidos: ${unknown.join(', ')}`)
    } else if (/^#\s/m.test(src.replace(/```[\s\S]*?```/g, ''))) {
      failed++
      console.log(`✗ ${f}: no uses H1 (#); el título viene de topics.ts`)
    }
  } catch (e) {
    failed++
    console.log(`✗ ${f}: ${e.message}`)
  }
}
console.log(`${files.length - failed}/${files.length} MDX OK`)
process.exit(failed ? 1 : 0)
