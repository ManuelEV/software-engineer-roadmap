/**
 * Binary-tree helpers shared by TreeTraversal and ValidateBst: build a tree from
 * LeetCode's level-order notation ([3, 9, 20, null, null, 15, 7]) and lay it
 * out with x = in-order rank and y = depth, which never overlaps.
 */

export interface TNode {
  id: number
  val: number
  left: number | null
  right: number | null
  depth: number
  /** in-order rank, used as the x coordinate */
  rank: number
}

export interface Tree {
  nodes: TNode[]
  root: number | null
  height: number
}

export function buildTree(level: (number | null)[]): Tree {
  const nodes: TNode[] = []
  if (!level.length || level[0] === null) return { nodes, root: null, height: 0 }
  const make = (val: number, depth: number) => {
    nodes.push({ id: nodes.length, val, left: null, right: null, depth, rank: 0 })
    return nodes.length - 1
  }
  const root = make(level[0], 0)
  const queue = [root]
  let i = 1
  while (queue.length && i < level.length) {
    const p = queue.shift()!
    const l = level[i++]
    if (l !== null && l !== undefined) {
      nodes[p].left = make(l, nodes[p].depth + 1)
      queue.push(nodes[p].left!)
    }
    const r = i < level.length ? level[i++] : null
    if (r !== null && r !== undefined) {
      nodes[p].right = make(r, nodes[p].depth + 1)
      queue.push(nodes[p].right!)
    }
  }
  let rank = 0
  const walk = (id: number | null) => {
    if (id === null) return
    walk(nodes[id].left)
    nodes[id].rank = rank++
    walk(nodes[id].right)
  }
  walk(root)
  return { nodes, root, height: Math.max(...nodes.map((n) => n.depth)) + 1 }
}

export interface TreeGeometry {
  W: number
  H: number
  x: (id: number) => number
  y: (id: number) => number
}

export function treeGeometry(tree: Tree, { dx = 50, dy = 62, pad = 26, top = 26, bottom = 26, minW = 0 } = {}): TreeGeometry {
  const n = Math.max(1, tree.nodes.length)
  const content = (n - 1) * dx
  const W = Math.max(minW, content + 2 * pad)
  const off = (W - content) / 2
  return {
    W,
    H: top + (tree.height - 1) * dy + bottom,
    x: (id) => off + tree.nodes[id].rank * dx,
    y: (id) => top + tree.nodes[id].depth * dy,
  }
}
