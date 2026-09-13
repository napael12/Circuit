import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Spinner } from '@/components/ui/spinner'

import type { PanelNode } from '../../api/types'
import { useDatastore } from '../../hooks/useDatastore'
import { useTitleText } from '../../hooks/useTitleText'
import { downloadCsv, rowsToCsv, sanitizeFilename } from '../../utils/csv'
import { formatValue, getFieldValue } from '../../utils/panelFormat'
import { usePanelId } from '../layout/ParameterContext'
import { useReactiveDatastoreParams } from '../layout/useComponentParams'
import { ControlContextMenu } from './ControlContextMenu'
import { DatastoreStatusBadge } from './DatastoreStatusBadge'
import type { ControlProps } from './types'

const SERIES_COLORS = ['var(--accent)', 'var(--success)', 'var(--warning)', 'var(--destructive)', 'var(--info)']

// Recharts renders every point as inline SVG with no virtualization, so
// plotting an unfiltered datastore result of thousands of rows can hang the
// browser for tens of seconds (mirrors DatatableControl's own row cap for
// the same reason). CSV export still uses the full, uncapped row set.
const MAX_CHART_ROWS = 1000

/** Renders the chart component type (specs/control_attributes.md): first chart-column is the X axis, the rest are numeric Y series. */
export function ChartControl({ component, datastores, previewMode }: ControlProps) {
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
  const handleExport = () => downloadCsv(sanitizeFilename(title || component.id), rowsToCsv(rows, component.columns))

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
  const columns = component.columns ?? []
  const xColumn = columns[0]
  const yColumns = columns.slice(1)
  const xField = xColumn?.fieldPath || xColumn?.field || Object.keys(rows[0] ?? {})[0] || 'x'
  const xLabel = xColumn?.fieldDisplay || xField
  const seriesColumns: PanelNode[] = yColumns.length
    ? yColumns
    : Object.keys(rows[0] ?? {})
        .filter((k) => k !== xField)
        .map((field) => ({ id: field, type: 'chart-column', field }))

  const chartData = plottedRows.map((r) => {
    const point: Record<string, unknown> = {
      [xField]: xColumn ? formatValue(getFieldValue(r, xField), xColumn.dataType, xColumn.dataFormat) : r[xField],
    }
    seriesColumns.forEach((col) => {
      const path = col.fieldPath || col.field || ''
      point[path] = Number(getFieldValue(r, path)) || 0
    })
    return point
  })

  const chartType = component.chartType ?? 'bar'

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
        <ResponsiveContainer width="100%" height="100%">
          {chartType === 'line' ? (
            <LineChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey={xField} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" name={xLabel} />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <Tooltip contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {seriesColumns.map((col, i) => {
                const path = col.fieldPath || col.field || ''
                return (
                  <Line
                    key={path}
                    type="monotone"
                    dataKey={path}
                    name={col.fieldDisplay || path}
                    stroke={SERIES_COLORS[i % SERIES_COLORS.length]}
                    dot={false}
                  />
                )
              })}
            </LineChart>
          ) : chartType === 'pie' ? (
            <PieChart>
              <Tooltip contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <Pie
                data={chartData}
                dataKey={seriesColumns[0]?.fieldPath || seriesColumns[0]?.field || 'value'}
                nameKey={xField}
                outerRadius="80%"
                label
              >
                {chartData.map((_, i) => (
                  <Cell key={i} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
                ))}
              </Pie>
            </PieChart>
          ) : (
            <BarChart data={chartData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey={xField} tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" name={xLabel} />
              <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
              <Tooltip contentStyle={{ background: 'var(--popover)', border: '1px solid var(--border)', fontSize: 12 }} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              {seriesColumns.map((col, i) => {
                const path = col.fieldPath || col.field || ''
                return (
                  <Bar key={path} dataKey={path} name={col.fieldDisplay || path} fill={SERIES_COLORS[i % SERIES_COLORS.length]} />
                )
              })}
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </ControlContextMenu>
  )
}
