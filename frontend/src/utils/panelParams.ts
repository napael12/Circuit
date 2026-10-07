import { format as formatDate } from 'date-fns'

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

/** Of the visible parameters (see visibleParameters), the ones marked PanelParameter.addToHeader -- rendered directly in the dashboard viewer's header toolbar (see PanelViewerPage.tsx). */
export function headerParameters(parameters: PanelParameter[], content: PanelNode[]): PanelParameter[] {
  return visibleParameters(parameters, content).filter((p) => p.addToHeader)
}

/** Whether any node under `roots` is a type='parameters' inline control (ParametersControl.tsx) -- walks the whole tree since one can nest anywhere (tabs/layouts), same as hiddenLinkedParameterNames. Used to hide the viewer toolbar's own "Parameters" button once a dashboard already surfaces its parameters this way (see ParameterContext.tsx). */
export function hasInlineParametersControl(roots: PanelNode[]): boolean {
  const visit = (node: PanelNode): boolean => node.type === 'parameters' || childrenOf(node).some(visit)
  return roots.some(visit)
}

const DATE_EXPR_RE = /^today\s*(?:([+-])\s*(\d+)\s*(day|business day)s?)?$/i

/**
 * PanelParameter.calendarDefaultExpr's grammar: "today", "today+N day",
 * "today-N business day" -- see resolveParameterDefault, the one caller.
 * Business-day arithmetic steps one calendar day at a time, skipping
 * Sat/Sun, until N business days are consumed. Returns undefined for
 * anything that doesn't match (caller falls back to the literal
 * `defaultValue`), not a thrown error -- a typo here shouldn't break a
 * dashboard's load.
 */
export function resolveDateExpr(expr: string): Date | undefined {
  const match = DATE_EXPR_RE.exec(expr.trim())
  if (!match) return undefined
  const date = new Date()
  const [, sign, countStr, unit] = match
  if (!sign) return date // bare "today"
  const step = sign === '-' ? -1 : 1
  const count = Number(countStr)
  if (unit.startsWith('business')) {
    let remaining = count
    while (remaining > 0) {
      date.setDate(date.getDate() + step)
      const day = date.getDay()
      if (day !== 0 && day !== 6) remaining--
    }
  } else {
    date.setDate(date.getDate() + step * count)
  }
  return date
}

/**
 * A parameter's effective default value when its store first initializes
 * (see ParameterContext.tsx's createParameterStore call, computed once per
 * mounted panel) -- a calendar parameter with a non-blank
 * calendarDefaultExpr resolves and formats it (calendarFormat, default
 * "yyyy-MM-dd") instead of using the literal, frozen-at-save-time
 * `defaultValue`. An expression that fails to parse is treated the same as
 * blank -- falls back to `defaultValue`.
 */
export function resolveParameterDefault(p: PanelParameter): string {
  if (p.inputType === 'calendar' && p.calendarDefaultExpr?.trim()) {
    const date = resolveDateExpr(p.calendarDefaultExpr)
    if (date) return formatDate(date, p.calendarFormat || 'yyyy-MM-dd')
  }
  return p.defaultValue ?? ''
}
