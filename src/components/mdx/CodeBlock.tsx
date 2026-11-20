import { type ReactElement, type ReactNode, isValidElement, useState } from 'react'
import { Highlight, Prism, type PrismTheme } from 'prism-react-renderer'
import { Check, Copy } from 'lucide-react'

// Small grammars not bundled by prism-react-renderer
Prism.languages.bash = {
  comment: { pattern: /(^|[^"{\\$])#.*/, lookbehind: true },
  string: { pattern: /(["'])(?:\\[\s\S]|\$\([^)]+\)|(?!\1)[^\\])*\1/, greedy: true },
  variable: /\$\{?[\w*@#?$!-]+\}?/,
  function: {
    pattern: /(^|[\s;|&]|[<>]\()(?:git|npm|npx|pnpm|node|curl|docker|kubectl|claude|cd|ls|cat|echo|export|mkdir|rm|cp|mv|grep|sed|python|pip|uv|redis-cli|psql|wrangler|gh|make)(?=$|[\s;|&)])/,
    lookbehind: true,
  },
  keyword: {
    pattern: /(^|[\s;|&]|[<>]\()(?:if|then|else|elif|fi|for|while|in|do|done|case|esac|function|return|until)(?=$|[\s;|&)])/,
    lookbehind: true,
  },
  operator: /&&|\|\||[|&;<>]/,
  number: /\b\d+\b/,
}
Prism.languages.sh = Prism.languages.bash
Prism.languages.shell = Prism.languages.bash
Prism.languages.java = Prism.languages.extend('clike', {
  keyword:
    /\b(?:abstract|assert|boolean|break|byte|case|catch|char|class|const|continue|default|do|double|else|enum|extends|final|finally|float|for|goto|if|implements|import|instanceof|int|interface|long|native|new|package|private|protected|public|record|return|sealed|short|static|super|switch|synchronized|this|throw|throws|transient|try|var|void|volatile|while|yield|permits)\b/,
  'class-name': /\b[A-Z]\w*\b/,
  number: /\b0b[01_]+\b|\b0x[\da-f_]+\b|(?:\b\d[\d_]*\.?[\d_]*|\B\.\d[\d_]*)(?:e[+-]?\d[\d_]*)?[dfl]?/i,
  annotation: { pattern: /@\w+/, alias: 'punctuation' },
})
Prism.languages.http = {
  'request-line': { pattern: /^(?:GET|POST|PUT|PATCH|DELETE|HEAD|OPTIONS)\s\S+(?:\sHTTP\/[\d.]+)?/m, alias: 'keyword' },
  'status-line': { pattern: /^HTTP\/[\d.]+\s\d+.*/m, alias: 'keyword' },
  'header-name': { pattern: /^[\w-]+:(?=.)/m, alias: 'function' },
  string: /"(?:\\.|[^"\\])*"/,
  number: /\b\d+\b/,
}

const theme: PrismTheme = {
  plain: { color: 'var(--code-ink)', backgroundColor: 'transparent' },
  styles: [
    { types: ['comment', 'prolog', 'doctype', 'cdata'], style: { color: 'var(--code-comment)', fontStyle: 'italic' } },
    { types: ['keyword', 'selector', 'important', 'atrule', 'request-line', 'status-line'], style: { color: 'var(--code-keyword)' } },
    { types: ['string', 'char', 'attr-value', 'regex', 'inserted'], style: { color: 'var(--code-string)' } },
    { types: ['function', 'header-name'], style: { color: 'var(--code-fn)' } },
    { types: ['number', 'boolean', 'constant', 'symbol'], style: { color: 'var(--code-number)' } },
    { types: ['class-name', 'builtin', 'tag', 'property', 'attr-name', 'variable'], style: { color: 'var(--code-type)' } },
    { types: ['punctuation', 'operator'], style: { color: 'var(--code-comment)' } },
    { types: ['deleted'], style: { color: 'var(--bad)' } },
  ],
}

export function parseMeta(meta?: string) {
  const title = meta?.match(/title="([^"]+)"/)?.[1]
  const hlRaw = meta?.match(/\{([\d,\s-]+)\}/)?.[1]
  const hl = new Set<number>()
  hlRaw?.split(',').forEach((part) => {
    const [a, b] = part.trim().split('-').map(Number)
    if (!Number.isNaN(a)) for (let i = a; i <= (b || a); i++) hl.add(i)
  })
  return { title, hl }
}

const langLabel: Record<string, string> = {
  ts: 'TypeScript',
  typescript: 'TypeScript',
  tsx: 'TSX',
  js: 'JavaScript',
  javascript: 'JavaScript',
  py: 'Python',
  python: 'Python',
  java: 'Java',
  go: 'Go',
  rust: 'Rust',
  sql: 'SQL',
  bash: 'Terminal',
  sh: 'Terminal',
  shell: 'Terminal',
  json: 'JSON',
  yaml: 'YAML',
  yml: 'YAML',
  md: 'Markdown',
  markdown: 'Markdown',
  http: 'HTTP',
  kotlin: 'Kotlin',
  graphql: 'GraphQL',
  text: 'Texto',
}

export function extractCode(children: ReactNode) {
  // MDX gives <pre><code className="language-ts" metastring="...">...</code></pre>
  const codeEl = isValidElement(children) ? (children as ReactElement<{ className?: string; children?: ReactNode; metastring?: string }>) : null
  const className = codeEl?.props.className ?? ''
  const lang = className.replace(/^language-/, '') || 'text'
  const raw = typeof codeEl?.props.children === 'string' ? codeEl.props.children : String(codeEl?.props.children ?? '')
  return { lang, code: raw.replace(/\n$/, ''), meta: codeEl?.props.metastring }
}

export function CodeBlock({ code, lang, meta, bare }: { code: string; lang: string; meta?: string; bare?: boolean }) {
  const { title, hl } = parseMeta(meta)
  const [copied, setCopied] = useState(false)
  const language = Prism.languages[lang] ? lang : 'text'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    } catch {
      /* clipboard blocked */
    }
  }

  return (
    <div className={`code ${bare ? 'code--bare' : ''}`}>
      {!bare && (
        <div className="code__head">
          <span className="code__title">{title ?? langLabel[lang] ?? lang}</span>
          {title && <span className="code__lang">{langLabel[lang] ?? lang}</span>}
          <button type="button" className="code__copy" onClick={copy} aria-label="Copiar código">
            {copied ? <Check size={15} /> : <Copy size={15} />}
            <span>{copied ? 'Copiado' : 'Copiar'}</span>
          </button>
        </div>
      )}
      <Highlight code={code} language={language} theme={theme}>
        {({ tokens, getLineProps, getTokenProps }) => (
          <pre className="code__pre" tabIndex={0}>
            <code>
              {tokens.map((line, i) => {
                const lineProps = getLineProps({ line })
                return (
                  <span key={i} {...lineProps} className={`code__line ${hl.has(i + 1) ? 'is-hl' : ''}`}>
                    {line.map((token, k) => (
                      <span key={k} {...getTokenProps({ token })} />
                    ))}
                    {'\n'}
                  </span>
                )
              })}
            </code>
          </pre>
        )}
      </Highlight>
    </div>
  )
}

/** MDX `pre` override */
export function Pre({ children }: { children?: ReactNode }) {
  const { lang, code, meta } = extractCode(children)
  return <CodeBlock code={code} lang={lang} meta={meta} />
}
