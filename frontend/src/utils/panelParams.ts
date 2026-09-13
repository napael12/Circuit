import type { PanelNode, PanelParameter } from '../api/types'

function childrenOf(node: PanelNode): PanelNode[] {
  return [...(node.components ?? []), ...(node.columns ?? [])]
}

/**
 * Names of parameters only settable by clicking a hidden datatable-column's
 * row (see DatatableControl's hiddenLinkedColumns) -- those columns have no
 * on-screen cell of their own, and the value driving them is often a large,
 * raw blob straight from that field, so surfacing it in the footer or
 * offering manual entry in the Parameters dialog would just be noise. Walks
 * every node under `roots`, not just the top level, since a datatable can
 * sit anywhere in the layout/tab tree.
 */
export function hiddenLinkedParameterNames(roots: PanelNode[]): Set<string> {
  const names = new Set<string>()
  const visit = (node: PanelNode) => {
    if (node.hidden && node.parameter) names.add(node.parameter)
    childrenOf(node).forEach(visit)
  }
  roots.forEach(visit)
  return names
}

/**
 * Parameters worth surfacing to an end user -- excludes both explicitly
 * hidden parameters (PanelParameter.hidden) and ones only reachable through
 * a hidden column's click-to-select (see hiddenLinkedParameterNames). Used
 * by both the footer summary and the Parameters dialog so the two stay
 * consistent about what counts as "hidden".
 */
export function visibleParameters(parameters: PanelParameter[], content: PanelNode[]): PanelParameter[] {
  const hiddenLinked = hiddenLinkedParameterNames(content)
  return parameters.filter((p) => !p.hidden && !hiddenLinked.has(p.name))
}
