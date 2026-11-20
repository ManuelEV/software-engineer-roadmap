// Copies the fenced-code "meta" string (```ts title="app.ts") onto the <code>
// element as a `metastring` prop so the CodeBlock component can read it.
type Node = {
  type: string
  tagName?: string
  data?: { meta?: string }
  properties?: Record<string, unknown>
  children?: Node[]
}

export function rehypeCodeMeta() {
  return (tree: Node) => {
    const walk = (node: Node) => {
      if (node.type === 'element' && node.tagName === 'code' && node.data?.meta) {
        node.properties = { ...node.properties, metastring: node.data.meta }
      }
      node.children?.forEach(walk)
    }
    walk(tree)
  }
}
