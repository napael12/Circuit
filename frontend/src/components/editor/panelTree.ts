import type { NodeType, PanelContent, PanelDatastoreRef, PanelDrilldown, PanelLink, PanelNode, PanelParameter } from '../../api/types'

/** What's currently selected in the editor's tree -- drives which schema/record PropertyPanel renders. */
export type Selection =
  | { kind: 'parameter'; name: string }
  | { kind: 'datastore'; id: string }
  | { kind: 'node'; id: string }
  | { kind: 'drilldown'; id: string }
  | { kind: 'link'; id: string }
  | null

export function isSameSelection(a: Selection, b: Selection): boolean {
  if (!a || !b || a.kind !== b.kind) return false
  if (a.kind === 'parameter' && b.kind === 'parameter') return a.name === b.name
  if (a.kind === 'datastore' && b.kind === 'datastore') return a.id === b.id
  if (a.kind === 'node' && b.kind === 'node') return a.id === b.id
  if (a.kind === 'drilldown' && b.kind === 'drilldown') return a.id === b.id
  if (a.kind === 'link' && b.kind === 'link') return a.id === b.id
  return false
}

let counter = 0
export function newId(type: string): string {
  counter += 1
  return `${type}_${Date.now().toString(36)}${counter}`
}

const COLUMN_CHILD_TYPES: NodeType[] = ['datatable', 'chart', 'pivot']

/** layout/tab nest other nodes under `components`; datatable/chart/pivot nest their columns under `columns`. */
export function childrenOf(node: PanelNode): PanelNode[] {
  return COLUMN_CHILD_TYPES.includes(node.type) ? (node.columns ?? []) : (node.components ?? [])
}

function withChildren(node: PanelNode, children: PanelNode[]): PanelNode {
  return COLUMN_CHILD_TYPES.includes(node.type) ? { ...node, columns: children } : { ...node, components: children }
}

/** Which child types a node's "+" menu offers -- also doubles as "is this a container node". */
export function childTypesFor(type: NodeType): NodeType[] {
  switch (type) {
    case 'layout':
      return ['layout', 'tab', 'datatable', 'chart', 'pivot']
    case 'tab':
      return ['layout', 'datatable', 'chart', 'pivot']
    case 'datatable':
      return ['datatable-column']
    case 'chart':
      return ['chart-column']
    case 'pivot':
      return ['pivot-column']
    default:
      return []
  }
}

export function findNode(root: PanelNode, id: string): PanelNode | null {
  if (root.id === id) return root
  for (const child of childrenOf(root)) {
    const found = findNode(child, id)
    if (found) return found
  }
  return null
}

export function findParent(root: PanelNode, id: string): PanelNode | null {
  for (const child of childrenOf(root)) {
    if (child.id === id) return root
    const found = findParent(child, id)
    if (found) return found
  }
  return null
}

/** Returns a new tree with `updater` applied to the node matching `id`. */
export function updateNode(root: PanelNode, id: string, updater: (node: PanelNode) => PanelNode): PanelNode {
  if (root.id === id) return updater(root)
  const children = childrenOf(root)
  if (children.length === 0) return root
  return withChildren(
    root,
    children.map((child) => updateNode(child, id, updater)),
  )
}

export function addChild(root: PanelNode, parentId: string, child: PanelNode): PanelNode {
  return updateNode(root, parentId, (node) => withChildren(node, [...childrenOf(node), child]))
}

/** Removes a node; returns [newTree, idOfNewlySelectedNode]. */
export function removeNode(root: PanelNode, id: string): [PanelNode, string] {
  const parent = findParent(root, id)
  if (!parent) return [root, root.id] // can't remove the root
  const newTree = updateNode(root, parent.id, (node) => withChildren(node, childrenOf(node).filter((c) => c.id !== id)))
  return [newTree, parent.id]
}

/** Inserts `sibling` right after the node matching `afterId`, in that node's own parent. No-op if `afterId` is the root (it has no parent to insert into). */
export function insertAfter(root: PanelNode, afterId: string, sibling: PanelNode): PanelNode {
  const parent = findParent(root, afterId)
  if (!parent) return root
  return updateNode(root, parent.id, (node) => {
    const children = childrenOf(node)
    const index = children.findIndex((c) => c.id === afterId)
    const next = children.slice()
    next.splice(index + 1, 0, sibling)
    return withChildren(node, next)
  })
}

/** Reorders a node among its siblings: to the front/back, or one step up/down (specs: "move to top|bottom", "move up|down"). No-op for the root, and no-op at an end it's already moving toward. */
export function moveNode(root: PanelNode, id: string, edge: 'top' | 'bottom' | 'up' | 'down'): PanelNode {
  const parent = findParent(root, id)
  if (!parent) return root
  return updateNode(root, parent.id, (node) => {
    const children = childrenOf(node).slice()
    const index = children.findIndex((c) => c.id === id)
    if (index === -1) return node
    if (edge === 'top' || edge === 'bottom') {
      const [item] = children.splice(index, 1)
      return withChildren(node, edge === 'top' ? [item, ...children] : [...children, item])
    }
    const target = edge === 'up' ? index - 1 : index + 1
    if (target < 0 || target >= children.length) return node
    ;[children[index], children[target]] = [children[target], children[index]]
    return withChildren(node, children)
  })
}

/** Deep-clones a node with fresh ids throughout -- required before inserting a pasted (copy/paste) node so it never collides with an existing one. */
export function regenerateIds(node: PanelNode): PanelNode {
  return withChildren({ ...node, id: newId(node.type) }, childrenOf(node).map(regenerateIds))
}

/**
 * Every independently-addressable node tree in a panel: the single content
 * root plus each drilldown's own root (specs/drilldown.md -- "same types of
 * controls as content"). `newId` is a single global counter, so a node id is
 * unique across every one of these roots -- callers needing to act on a
 * node by id alone (the editor's generalized add/update/delete/move/copy
 * handlers) can search all of them without first knowing which tree it's in.
 */
export function allRoots(content: PanelContent): PanelNode[] {
  return [content.content[0], ...(content.drilldowns ?? []).map((d) => d.root)]
}

/** Which of `allRoots(content)` contains `nodeId`, or null if none do. */
export function findRootContaining(content: PanelContent, nodeId: string): PanelNode | null {
  for (const root of allRoots(content)) {
    if (root && findNode(root, nodeId)) return root
  }
  return null
}

/** Swaps in `newRoot` wherever a root with `rootId` currently lives -- the content root, or a drilldown's. No-op if neither matches. */
export function replaceRoot(content: PanelContent, rootId: string, newRoot: PanelNode): PanelContent {
  if (content.content[0]?.id === rootId) return { ...content, content: [newRoot] }
  if ((content.drilldowns ?? []).some((d) => d.root.id === rootId)) {
    return { ...content, drilldowns: content.drilldowns!.map((d) => (d.root.id === rootId ? { ...d, root: newRoot } : d)) }
  }
  return content
}

/** A fresh drilldown: an empty 'layout' root, same shape as a brand-new panel's own content root. */
export function defaultDrilldownFor(id: string, name: string): PanelDrilldown {
  return { id, name, root: { id: newId('layout'), type: 'layout', direction: 'horizontal', weight: 1, components: [] } }
}

/** A fresh link (specs/link.md): opens in a new tab by default until the user picks otherwise. */
export function defaultLinkFor(id: string, name: string): PanelLink {
  return { id, name, url: '', target: 'tab' }
}

const NODE_TYPES: NodeType[] = [
  'layout',
  'tab',
  'datatable',
  'chart',
  'datatable-column',
  'chart-column',
  'pivot',
  'pivot-column',
]

/** Type guard for clipboard/pasted JSON -- see EditorPage.tsx's paste handler. */
export function isPanelNode(value: unknown): value is PanelNode {
  if (!value || typeof value !== 'object') return false
  const node = value as Partial<PanelNode>
  return typeof node.id === 'string' && typeof node.type === 'string' && (NODE_TYPES as string[]).includes(node.type)
}

/**
 * Type guard for a whole dashboard's JSON (parameters + datastores + content
 * tree) -- see PanelJsonDialog, the raw-JSON editor for a dashboard's full
 * content rather than a single tree node. Deliberately shallow: it checks
 * the three top-level arrays are present and that content[0] is a real
 * layout root (specs/panel_design.md's "exactly one 'layout' root"), but
 * doesn't recursively validate every node/parameter/datastore -- malformed
 * entries deeper in the tree will surface as errors from the editor itself
 * once applied, same as a hand-edited node would.
 */
export function isPanelContent(value: unknown): value is PanelContent {
  if (!value || typeof value !== 'object') return false
  const content = value as Partial<PanelContent>
  return (
    Array.isArray(content.parameters) &&
    Array.isArray(content.datastores) &&
    Array.isArray(content.content) &&
    content.content.length === 1 &&
    isPanelNode(content.content[0]) &&
    content.content[0].type === 'layout'
  )
}

/** Type guard for clipboard/pasted JSON -- see EditorPage.tsx's paste-parameter handler. */
export function isPanelParameter(value: unknown): value is PanelParameter {
  if (!value || typeof value !== 'object') return false
  const p = value as Partial<PanelParameter>
  return typeof p.name === 'string' && typeof p.label === 'string' && typeof p.dataType === 'string'
}

/** Type guard for clipboard/pasted JSON -- see EditorPage.tsx's paste-datastore handler. */
export function isPanelDatastoreRef(value: unknown): value is PanelDatastoreRef {
  if (!value || typeof value !== 'object') return false
  const d = value as Partial<PanelDatastoreRef>
  return typeof d.id === 'string' && typeof d.name === 'string' && (d.scope === 'global' || d.scope === 'local')
}

/** Type guard for clipboard/pasted JSON -- see EditorPage.tsx's paste-link handler. */
export function isPanelLink(value: unknown): value is PanelLink {
  if (!value || typeof value !== 'object') return false
  const l = value as Partial<PanelLink>
  return typeof l.id === 'string' && typeof l.name === 'string' && typeof l.url === 'string' && (l.target === 'tab' || l.target === 'window')
}

/** Appends "-2", "-3", ... until `name` no longer collides with any of `existing` -- used when pasting a parameter/datastore whose own name would otherwise duplicate one already in the list (PanelParameter.name / PanelDatastoreRef.name are both the key other things reference them by, so two entries can't share one). */
export function uniqueName(name: string, existing: string[]): string {
  if (!existing.includes(name)) return name
  let i = 2
  while (existing.includes(`${name}-${i}`)) i++
  return `${name}-${i}`
}

export function defaultNodeFor(type: NodeType, id: string): PanelNode {
  switch (type) {
    case 'layout':
      return { id, type, direction: 'horizontal', weight: 1, components: [] }
    case 'tab':
      return { id, type, title: id, weight: 1, position: 'top', components: [] }
    case 'datatable':
      // Paginated by default -- an unpaginated table renders every row into
      // the DOM at once (reui's DataGrid isn't virtualized), which can hang
      // the browser against a datastore with thousands of rows.
      return { id, type, title: id, weight: 1, pagination: 10, columns: [] }
    case 'chart':
      return { id, type, title: id, weight: 1, chartType: 'bar', columns: [] }
    case 'pivot':
      return { id, type, title: id, weight: 1, columns: [] }
    case 'datatable-column':
    case 'chart-column':
      return { id, type, field: '', fieldDisplay: id, dataType: 'str' }
    case 'pivot-column':
      return { id, type, field: '', fieldDisplay: id, dataType: 'str', role: 'value', aggrFunction: 'sum', sort: 'none' }
  }
}
