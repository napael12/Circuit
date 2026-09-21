import Plotly from 'plotly.js-basic-dist'
import type { Data, Layout } from 'plotly.js'
import createPlotlyComponent from 'react-plotly.js/factory'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'

import type { PanelNode } from '../../api/types'
import { useDatastore } from '../../hooks/useDatastore'
import { useTitleText } from '../../hooks/useTitleText'
import { downloadCsv, rowsToCsv, sanitizeFilename } from '../../utils/csv'
import { getFieldValue } from '../../utils/panelFormat'
import { usePanelId } from '../layout/ParameterContext'
import { useReactiveDatastoreParams } from '../layout/useComponentParams'
import { ControlContextMenu } from './ControlContextMenu'
import { DatastoreStatusBadge } from './DatastoreStatusBadge'
import type { ControlProps } from './types'

const Plot = createPlotlyComponent(Plotly)

// Same rationale/value as ChartControl's own MAX_CHART_ROWS -- Plotly's SVG
// (non-WebGL) traces aren't virtualized either, so an unfiltered result of
// thousands of rows can hang the browser. CSV export still uses the full,
// uncapped row set. Kept as a separate local constant rather than importing
// from ChartControl.tsx, which this control shares no code with by design.
const MAX_CHART_ROWS = 1000

// plotly.js-basic-dist only bundles these trace families -- an unrecognized
// or misspelled `type` on a plotly-trace degrades to 'scatter' rather than
// crashing Plotly at render.
const ALLOWED_TRACE_TYPES = new Set(['bar', 'scatter', 'pie'])

interface TraceMapping {
  type?: string
  mode?: string
  x?: string
  y?: string
  color?: string
  size?: string
  text?: string
  name?: string
  /** plotly-trace nodes only -- matched against each row's seriesField (default 'series'); blank = every row. */
  series?: string
  seriesField?: string
  lineColor?: string
  lineWidth?: number
  /** Trace-node-level declarative override, deep-merged after the built trace (before plotlyConfig.traces[i]). */
  override?: Record<string, unknown>
}

/** Datastore column a trace's `series` value is matched against, when the trace sets no seriesField. */
const DEFAULT_SERIES_FIELD = 'series'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** A plotly-trace child node -> a TraceMapping. */
function nodeToMapping(node: PanelNode): TraceMapping {
  return {
    type: node.traceType,
    mode: node.traceMode,
    x: node.xField,
    y: node.yField,
    color: node.colorField,
    size: node.sizeField,
    text: node.textField,
    name: node.fieldDisplay || node.series,
    series: node.series,
    seriesField: node.seriesField,
    lineColor: node.lineColor,
    lineWidth: node.lineWidth,
    override: isPlainObject(node.traceConfig) ? node.traceConfig : undefined,
  }
}

/** Plain-object recursive merge -- `override` wins on conflicting keys; arrays are replaced wholesale, not concatenated. Both arguments are always either literal object trees built by this component or JSON.parse() output (see the safety note on buildTraces below), so this can never merge in a function. */
function deepMerge(base: Record<string, unknown>, override: Record<string, unknown>): Record<string, unknown> {
  const result: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(override)) {
    const baseValue = result[key]
    if (value && typeof value === 'object' && !Array.isArray(value) && baseValue && typeof baseValue === 'object' && !Array.isArray(baseValue)) {
      result[key] = deepMerge(baseValue as Record<string, unknown>, value as Record<string, unknown>)
    } else {
      result[key] = value
    }
  }
  return result
}

function buildTrace(mapping: TraceMapping, allRows: Record<string, unknown>[], override: Record<string, unknown>): Record<string, unknown> {
  // A non-blank series keeps only the rows whose `series` value matches (compared as strings, so a
  // numeric series column still matches a typed-in "1"); blank plots the entire dataset.
  const rows = mapping.series ? allRows.filter((r) => String(getFieldValue(r, mapping.seriesField || DEFAULT_SERIES_FIELD)) === mapping.series) : allRows
  const type = ALLOWED_TRACE_TYPES.has(mapping.type ?? '') ? mapping.type : 'scatter'
  const trace: Record<string, unknown> = {
    type,
    mode: mapping.mode,
    name: mapping.name || mapping.series || mapping.y || mapping.x,
    x: mapping.x ? rows.map((r) => getFieldValue(r, mapping.x!)) : [],
    y: mapping.y ? rows.map((r) => getFieldValue(r, mapping.y!)) : [],
  }
  if (mapping.text) trace.text = rows.map((r) => getFieldValue(r, mapping.text!))
  if (mapping.color || mapping.size) {
    trace.marker = {
      ...(mapping.color ? { color: rows.map((r) => getFieldValue(r, mapping.color!)) } : {}),
      ...(mapping.size ? { size: rows.map((r) => getFieldValue(r, mapping.size!)) } : {}),
    }
  }
  if (mapping.lineColor || mapping.lineWidth != null) {
    trace.line = {
      ...(mapping.lineColor ? { color: mapping.lineColor } : {}),
      ...(mapping.lineWidth != null ? { width: mapping.lineWidth } : {}),
    }
  }
  // Plotly pie traces use labels/values, not x/y.
  if (type === 'pie') {
    trace.labels = trace.x
    trace.values = trace.y
    delete trace.x
    delete trace.y
  }
  return deepMerge(deepMerge(trace, mapping.override ?? {}), override)
}

/**
 * Plotly-based chart control (a separate control from the Recharts-based
 * `chart`/ChartControl.tsx -- see the plan this was built from).
 * plotly-trace child nodes (one per trace: series filter, x/y fields, type,
 * style) drive the plot, plus one JSON blob on the node:
 *
 * `plotlyConfig`: JSON merged into Plotly's layout and, via `traces[i]`,
 *   into each built trace above, e.g. {"layout": {"title": {...}}}
 *
 * Trace nodes' `traceConfig` and `plotlyConfig` are declarative only: the only things that ever flow into Plotly's
 * layout/trace objects are values this component computes itself, plus the
 * result of JSON.parse() on these two fields (parsed once, upstream, by
 * PropertyPanel.tsx's JsonControl on blur). JSON.parse can only ever
 * produce plain objects/arrays/strings/numbers/booleans/null -- never a
 * function or anything executable -- so deepMerge-ing that output into
 * layout/trace props can never inject code. No eval, no `new Function`, no
 * dangerouslySetInnerHTML anywhere in this file.
 */
export function PlotlyChartControl({ component, datastores, previewMode }: ControlProps) {
  const params = useReactiveDatastoreParams(component.id)
  const panelId = usePanelId()
  const { data, loading, error, refreshMode, lastRunAt, refresh } = useDatastore(
    component.datastore,
    datastores,
    params,
    panelId,
    previewMode,
  )
  const title = useTitleText(component.title)
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : []
  const handleExport = () => downloadCsv(sanitizeFilename(title || component.id), rowsToCsv(rows))

  if (error) {
    return (
      <ControlContextMenu
        onRefresh={refresh}
        canRefresh={refreshMode === 'on_demand'}
        onExport={handleExport}
        canExport={false}
        drilldownIds={component.drilldownIds}
        linkIds={component.linkIds}
      >
        <div className="h-full w-full">
          <Alert variant="destructive" className="m-2">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        </div>
      </ControlContextMenu>
    )
  }
  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spinner className="size-6" />
      </div>
    )
  }

  const plottedRows = rows.length > MAX_CHART_ROWS ? rows.slice(0, MAX_CHART_ROWS) : rows
  const traceMappings = (component.columns ?? []).filter((c) => c.type === 'plotly-trace' && !c.hidden).map(nodeToMapping)
  const config = (component.plotlyConfig && typeof component.plotlyConfig === 'object' ? component.plotlyConfig : {}) as {
    layout?: Record<string, unknown>
    traces?: Record<string, unknown>[]
  }

  const builtTraces = traceMappings.map((mapping, i) => buildTrace(mapping, plottedRows, config.traces?.[i] ?? {}))
  const layout = deepMerge(
    { title: { text: title }, autosize: true, margin: { t: 32, r: 16, b: 40, l: 48 }, font: { size: 11 } },
    config.layout ?? {},
  )

  return (
    <ControlContextMenu
      onRefresh={refresh}
      canRefresh={refreshMode === 'on_demand'}
      onExport={handleExport}
      canExport={rows.length > 0}
      drilldownIds={component.drilldownIds}
      linkIds={component.linkIds}
    >
      <div className="relative h-full w-full p-2">
        <DatastoreStatusBadge refreshMode={refreshMode} lastRunAt={lastRunAt} />
        {traceMappings.length === 0 ? (
          <div className="flex h-full items-center justify-center text-[0.85em] text-muted-foreground">
            Add a plotly-trace child to this chart in the component tree
          </div>
        ) : (
          <Plot
            data={builtTraces as unknown as Data[]}
            layout={layout as unknown as Partial<Layout>}
            config={{ displayModeBar: false, responsive: true }}
            style={{ width: '100%', height: '100%' }}
            useResizeHandler
          />
        )}
      </div>
    </ControlContextMenu>
  )
}
