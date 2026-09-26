import Plotly from 'plotly.js/lib/core'
import bar from 'plotly.js/lib/bar'
import box from 'plotly.js/lib/box'
import candlestick from 'plotly.js/lib/candlestick'
import heatmap from 'plotly.js/lib/heatmap'
import histogram from 'plotly.js/lib/histogram'
import pie from 'plotly.js/lib/pie'
import scatter from 'plotly.js/lib/scatter'
import surface from 'plotly.js/lib/surface'
import type { Data, Layout } from 'plotly.js'
import createPlotlyComponent from 'react-plotly.js/factory'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'

import type { PanelNode } from '../../api/types'
import { useDatastore } from '../../hooks/useDatastore'
import { useTitleText } from '../../hooks/useTitleText'
import { downloadCsv, rowsToCsv, sanitizeFilename } from '../../utils/csv'
import { getFieldValue } from '../../utils/panelFormat'
import { substituteParams } from '../../utils/panelTemplating'
import { usePanelId } from '../layout/ParameterContext'
import { useReactiveDatastoreParams } from '../layout/useComponentParams'
import { ControlContextMenu } from './ControlContextMenu'
import { DatastoreStatusBadge } from './DatastoreStatusBadge'
import type { ControlProps } from './types'

// A custom bundle (plotly.js core + just these trace families) rather than plotly.js-basic-dist,
// which has neither heatmap nor the finance types. Registered once at module load.
;(Plotly as unknown as { register: (modules: unknown[]) => void }).register([bar, box, candlestick, heatmap, histogram, pie, scatter, surface])

const Plot = createPlotlyComponent(Plotly)

// Same rationale/value as ChartControl's own MAX_CHART_ROWS -- Plotly's SVG
// (non-WebGL) traces aren't virtualized either, so an unfiltered result of
// thousands of rows can hang the browser. CSV export still uses the full,
// uncapped row set. Kept as a separate local constant rather than importing
// from ChartControl.tsx, which this control shares no code with by design.
const MAX_CHART_ROWS = 1000

// Only these trace families are registered above -- an unrecognized or misspelled
// `type` on a plotly-trace degrades to 'scatter' rather than crashing Plotly at render.
const ALLOWED_TRACE_TYPES = new Set(['bar', 'box', 'candlestick', 'heatmap', 'histogram', 'pie', 'scatter', 'surface'])
/** heatmap/surface: their `z` must be a genuine 2D grid (rows of `y`, columns of `x`), not one flat value per row -- see gridify. */
const GRID_TRACE_TYPES = new Set(['heatmap', 'surface'])

/** Heatmap default: low = green -> high = red (override via traceConfig.colorscale). */
const HEATMAP_COLORSCALE = [
  [0, '#1a9850'],
  [0.5, '#ffffbf'],
  [1, '#d73027'],
]

/** Datastore column a trace's `series` value is matched against, when the trace sets no seriesField. */
const DEFAULT_SERIES_FIELD = 'series'

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

/** Plain-object recursive merge -- `override` wins on conflicting keys; arrays are replaced wholesale, not concatenated. Both arguments are always either literal object trees built by this component or JSON.parse() output (see the safety note on buildTrace below), so this can never merge in a function. */
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

// Matches a string value that is *only* a single #columnName# token (nothing
// else) -- resolves to a per-row array of the column's raw value (numbers
// stay numbers). A dotted path is allowed, same as every other field-path
// lookup in this app (getFieldValue).
const WHOLE_COLUMN_RE = /^#([\w.]+)#$/
// Matches every #columnName# occurrence within a larger string -- used for
// the "template" case (a string with other text around the token(s)).
const COLUMN_TOKEN_RE = /#([\w.]+)#/g

/** ${param}-only substitution, recursively through an object/array tree -- used for `plotlyConfig.layout`, which isn't row-scoped so `#column#` doesn't apply there. */
function substituteParamsDeep(value: unknown, params: Record<string, string>): unknown {
  if (typeof value === 'string') return substituteParams(value, params)
  if (Array.isArray(value)) return value.map((v) => substituteParamsDeep(v, params))
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, substituteParamsDeep(v, params)]))
  return value
}

/**
 * Recursively resolves a parsed traceConfig (or plotlyConfig.traces[i]
 * override) tree against this trace's own rows and the panel's current
 * parameter values:
 *
 * - A string that is *exactly* "#column#" (see WHOLE_COLUMN_RE) becomes a
 *   per-row array of that column's raw value -- what every axis/array-valued
 *   Plotly property uses (x, y, z, open/high/low/close, labels, values,
 *   marker.size, marker.color, ...).
 * - A string containing "#column#" tokens *plus other text* first gets
 *   ${param} substitution, then becomes a per-row array of strings, each
 *   row's copy of the template with its own token(s) filled in -- for
 *   text/hovertext-style properties wanting a formatted per-point label.
 * - Any other string gets ${param} substitution only and stays a scalar
 *   (type, mode, name, a literal color, ...). Unknown ${name} is left as-is.
 * - Numbers/booleans/null pass through unchanged; objects/arrays recurse.
 */
function resolveTraceValue(value: unknown, rows: Record<string, unknown>[], params: Record<string, string>): unknown {
  if (typeof value === 'string') {
    const whole = value.match(WHOLE_COLUMN_RE)
    if (whole) return rows.map((r) => getFieldValue(r, whole[1]))
    const withParams = substituteParams(value, params)
    COLUMN_TOKEN_RE.lastIndex = 0
    if (COLUMN_TOKEN_RE.test(withParams)) {
      return rows.map((r) => {
        COLUMN_TOKEN_RE.lastIndex = 0
        return withParams.replace(COLUMN_TOKEN_RE, (_match, name: string) => {
          const v = getFieldValue(r, name)
          return v == null ? '' : String(v)
        })
      })
    }
    return withParams
  }
  if (Array.isArray(value)) return value.map((v) => resolveTraceValue(v, rows, params))
  if (isPlainObject(value)) return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, resolveTraceValue(v, rows, params)]))
  return value
}

/**
 * Synthesizes an equivalent traceConfig from the pre-JSON-config form fields
 * a plotly-trace node used to have (xField, yField, traceType, ...) --
 * used only when a node has no traceConfig of its own, so a dashboard saved
 * before trace config JSON existed keeps rendering without anyone having to
 * open and resave it. Computed fresh at render time (see buildTrace), never
 * written back to the saved panel. The old wide/pivoted heatmap mode and
 * non-heatmap xColumns pivot have no #column# equivalent and aren't carried
 * over -- a trace that relied on either renders best-effort (whatever x/y it
 * still resolves to) until its Trace config JSON is rewritten by hand.
 */
function legacyTraceConfig(node: PanelNode): Record<string, unknown> | undefined {
  const hasLegacy =
    node.traceType || node.xField || node.yField || node.colorField || node.sizeField ||
    node.textField || node.series || node.seriesField || node.lineColor || node.lineWidth != null || node.traceMode
  if (!hasLegacy) return undefined

  const cfg: Record<string, unknown> = { type: node.traceType || 'scatter' }
  if (node.traceMode) cfg.mode = node.traceMode
  if (node.series) cfg.series = node.series
  if (node.seriesField) cfg.seriesField = node.seriesField

  if (node.traceType === 'heatmap') {
    if (node.xField) cfg.x = `#${node.xField}#`
    if (node.yField) cfg.y = `#${node.yField}#`
    const zField = node.xColumns?.trim() && node.xColumns.trim() !== '*' ? node.xColumns.trim() : undefined
    if (zField) cfg.z = `#${zField}#`
    cfg.colorscale = HEATMAP_COLORSCALE
  } else if (node.traceType === 'pie') {
    if (node.xField) cfg.labels = `#${node.xField}#`
    if (node.yField) cfg.values = `#${node.yField}#`
  } else {
    if (node.xField) cfg.x = `#${node.xField}#`
    if (node.yField) cfg.y = `#${node.yField}#`
  }
  if (node.textField) cfg.text = `#${node.textField}#`
  if (node.colorField || node.sizeField) {
    cfg.marker = {
      ...(node.colorField ? { color: `#${node.colorField}#` } : {}),
      ...(node.sizeField ? { size: `#${node.sizeField}#` } : {}),
    }
  }
  if (node.lineColor || node.lineWidth != null) {
    cfg.line = {
      ...(node.lineColor ? { color: node.lineColor } : {}),
      ...(node.lineWidth != null ? { width: node.lineWidth } : {}),
    }
  }
  return cfg
}

/**
 * heatmap/surface need `z` as a genuine 2D grid (z[row][col], with `x`/`y`
 * as the *distinct* column/row coordinate labels, `x.length === z[0].length`
 * and `y.length === z.length`) -- not one x/y/z triple per row the way every
 * other trace type's #column# resolution naturally produces (tidy/long
 * data: one row per (x, y) cell). Reshapes exactly that tidy shape -- flat,
 * equal-length x/y/z arrays -- into the grid Plotly actually wants;
 * otherwise (no z, or z already a 2D array -- a hand-authored literal
 * matrix) leaves the trace alone. Distinct (x, y) pairs keep first-seen
 * order, so a grid built from an already-sorted query reads left-to-right/
 * top-to-bottom as authored.
 */
function gridifyTrace(trace: Record<string, unknown>): Record<string, unknown> {
  const { x, y, z } = trace
  if (!Array.isArray(x) || !Array.isArray(y) || !Array.isArray(z) || Array.isArray(z[0])) return trace
  if (x.length !== z.length || y.length !== z.length) return trace

  const xOrder: unknown[] = []
  const xIndex = new Map<string, number>()
  const yOrder: unknown[] = []
  const yIndex = new Map<string, number>()
  for (const v of x) {
    const k = String(v)
    if (!xIndex.has(k)) {
      xIndex.set(k, xOrder.length)
      xOrder.push(v)
    }
  }
  for (const v of y) {
    const k = String(v)
    if (!yIndex.has(k)) {
      yIndex.set(k, yOrder.length)
      yOrder.push(v)
    }
  }
  const grid: unknown[][] = yOrder.map(() => xOrder.map(() => null))
  for (let i = 0; i < z.length; i++) {
    grid[yIndex.get(String(y[i]))!][xIndex.get(String(x[i]))!] = z[i]
  }
  return { ...trace, x: xOrder, y: yOrder, z: grid }
}

/**
 * Builds one Plotly trace object from a plotly-trace node's traceConfig (or
 * its legacyTraceConfig fallback): `series`/`seriesField`, if present, first
 * filter `allRows` down to the rows this trace actually plots (compared as
 * strings, so a numeric series column still matches a typed-in "1"; blank
 * `series`/no key plots the entire dataset) and are then stripped -- they're
 * never passed through to Plotly itself. Everything else in the object is
 * resolved via resolveTraceValue and handed to Plotly close to verbatim.
 *
 * traceConfig/plotlyConfig are declarative only: the only things that ever
 * flow into Plotly's layout/trace objects are values this component computes
 * itself, plus the result of JSON.parse() on these two fields (parsed once,
 * upstream, by PropertyPanel.tsx's JsonControl on blur). JSON.parse can only
 * ever produce plain objects/arrays/strings/numbers/booleans/null -- never a
 * function or anything executable -- so resolving/deep-merging that output
 * into layout/trace props can never inject code. No eval, no `new Function`,
 * no dangerouslySetInnerHTML anywhere in this file.
 */
function buildTrace(
  node: PanelNode,
  allRows: Record<string, unknown>[],
  params: Record<string, string>,
  override: Record<string, unknown>,
): Record<string, unknown> {
  const raw = isPlainObject(node.traceConfig) && Object.keys(node.traceConfig).length > 0 ? node.traceConfig : (legacyTraceConfig(node) ?? {})
  const series = typeof raw.series === 'string' ? substituteParams(raw.series, params) : undefined
  const seriesField = typeof raw.seriesField === 'string' ? raw.seriesField : DEFAULT_SERIES_FIELD
  const rows = series ? allRows.filter((r) => String(getFieldValue(r, seriesField)) === series) : allRows
  const { series: _series, seriesField: _seriesField, ...rest } = raw

  const resolved = resolveTraceValue(rest, rows, params) as Record<string, unknown>
  const type = ALLOWED_TRACE_TYPES.has(String(resolved.type ?? '')) ? String(resolved.type) : 'scatter'
  let trace: Record<string, unknown> = { ...resolved, type }
  if (!trace.name) trace.name = node.fieldDisplay || undefined
  if (GRID_TRACE_TYPES.has(type)) trace = gridifyTrace(trace)
  if (type === 'heatmap' && trace.colorscale === undefined) trace.colorscale = HEATMAP_COLORSCALE

  return deepMerge(trace, override)
}

/**
 * Plotly-based chart control (a separate control from the Recharts-based
 * `chart`/ChartControl.tsx -- see the plan this was built from).
 *
 * plotly-trace child nodes drive the plot -- each one's `traceConfig` JSON
 * *is* the Plotly trace object (any property, for any registered trace
 * type), with `#column#`/`${param}` templating (see resolveTraceValue) so it
 * can still be data- and parameter-driven; only Name (fieldDisplay) and
 * Hidden stay as form fields, everything else is authored as JSON.
 *
 * `plotlyConfig` (on the plotly-chart node itself): JSON merged into
 * Plotly's layout and, via `traces[i]`, deep-merged on top of each built
 * trace above as a final override, e.g. {"layout": {"title": {...}}}.
 * `layout` gets ${param} substitution (not #column# -- layout isn't
 * row-scoped).
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
  const traceNodes = (component.columns ?? []).filter((c) => c.type === 'plotly-trace' && !c.hidden)
  const config = (component.plotlyConfig && typeof component.plotlyConfig === 'object' ? component.plotlyConfig : {}) as {
    layout?: Record<string, unknown>
    traces?: Record<string, unknown>[]
  }

  const builtTraces = traceNodes.map((node, i) => buildTrace(node, plottedRows, params, config.traces?.[i] ?? {}))
  const layout = deepMerge(
    // component.hideTitle also hides this in-canvas Plotly title (fed from the same `title`),
    // so the two never show the same text redundantly -- see LeafNode's own header in PanelLayout.tsx.
    { title: { text: component.hideTitle ? '' : title }, autosize: true, margin: { t: 32, r: 16, b: 40, l: 48 }, font: { size: 11 } },
    substituteParamsDeep(config.layout ?? {}, params) as Record<string, unknown>,
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
        {traceNodes.length === 0 ? (
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
