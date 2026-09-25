import { useMemo } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card'
import { Spinner } from '@/components/ui/spinner'

import type { PanelNode } from '../../api/types'
import { useDatastore } from '../../hooks/useDatastore'
import { useTitleText } from '../../hooks/useTitleText'
import { downloadCsv, rowsToCsv, sanitizeFilename } from '../../utils/csv'
import { formatValue, parseCssText } from '../../utils/panelFormat'
import { substituteParams } from '../../utils/panelTemplating'
import { discoverTemplateVars } from '../../utils/sqlParams'
import { usePanelId, useParameterValues } from '../layout/ParameterContext'
import { useReactiveDatastoreParams } from '../layout/useComponentParams'
import { ControlContextMenu } from './ControlContextMenu'
import { DatastoreStatusBadge } from './DatastoreStatusBadge'
import type { ControlProps } from './types'

/** specs/kpi.md: a kpi's datastore result is either a single JSON object, or a table -- this control only ever renders that table's first row. */
function firstRow(data: unknown): Record<string, unknown> | null {
  if (Array.isArray(data)) {
    const first = data[0]
    return first && typeof first === 'object' ? (first as Record<string, unknown>) : null
  }
  return data && typeof data === 'object' ? (data as Record<string, unknown>) : null
}

/**
 * Resolves a kpi-column's headerValue/bodyValue/footerValue/*Style text
 * (specs/kpi.md: "use either a. available datastore column or b. parameter")
 * -- an exact match against a key of the kpi's current row reads that
 * value; anything else is literal text with ${param} substitution.
 */
function resolveExpression(expr: string | undefined, row: Record<string, unknown> | null, params: Record<string, string>): string {
  if (!expr) return ''
  if (row && Object.prototype.hasOwnProperty.call(row, expr)) {
    const value = row[expr]
    return value == null ? '' : String(value)
  }
  return substituteParams(expr, params)
}

function KpiCard({ card, row, params }: { card: PanelNode; row: Record<string, unknown> | null; params: Record<string, string> }) {
  const header = resolveExpression(card.headerValue, row, params)
  const bodyRaw = resolveExpression(card.bodyValue, row, params)
  // Format the value only when it was read from the row -- literal/${param} text stays as typed.
  const bodyIsField = !!card.bodyValue && !!row && Object.prototype.hasOwnProperty.call(row, card.bodyValue)
  const body = bodyIsField ? formatValue(row[card.bodyValue as string], card.dataType, card.dataFormat, card.humanReadable) : bodyRaw
  const footer = resolveExpression(card.footerValue, row, params)

  return (
    <Card size="sm" className="min-w-40 flex-1">
      <CardHeader>
        <CardTitle
          className="text-xs font-normal text-muted-foreground"
          style={parseCssText(resolveExpression(card.headerStyle, row, params))}
        >
          {header}
        </CardTitle>
      </CardHeader>
      <CardContent className="text-2xl font-bold" style={parseCssText(resolveExpression(card.bodyStyle, row, params))}>
        {body}
      </CardContent>
      {footer && (
        <CardFooter
          className="text-xs text-muted-foreground"
          style={parseCssText(resolveExpression(card.footerStyle, row, params))}
        >
          {footer}
        </CardFooter>
      )}
    </Card>
  )
}

/** Renders the kpi component type (specs/kpi.md): one REUI Card per kpi-column child, each showing a header/body/footer value read from the kpi's datastore result (a single object, or a table's first row). */
export function KpiControl({ component, datastores, previewMode }: ControlProps) {
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
  const row = useMemo(() => firstRow(data), [data])
  const cards = useMemo(() => component.columns ?? [], [component.columns])

  const paramNames = useMemo(
    () =>
      Array.from(
        new Set(
          cards.flatMap((c) => [
            ...discoverTemplateVars(c.headerValue),
            ...discoverTemplateVars(c.headerStyle),
            ...discoverTemplateVars(c.bodyValue),
            ...discoverTemplateVars(c.bodyStyle),
            ...discoverTemplateVars(c.footerValue),
            ...discoverTemplateVars(c.footerStyle),
          ]),
        ),
      ),
    [cards],
  )
  const paramValues = useParameterValues(paramNames)

  const handleExport = () => downloadCsv(sanitizeFilename(title || component.id), rowsToCsv(row ? [row] : [], component.columns))

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

  return (
    <ControlContextMenu
      onRefresh={refresh}
      canRefresh={refreshMode === 'on_demand'}
      onExport={handleExport}
      canExport={!!row}
      drilldownIds={component.drilldownIds}
      linkIds={component.linkIds}
    >
      <div className="relative flex h-full w-full flex-wrap gap-3 overflow-auto p-2">
        <DatastoreStatusBadge refreshMode={refreshMode} lastRunAt={lastRunAt} />
        {cards.length === 0 ? (
          <div className="flex h-full w-full items-center justify-center text-[0.85em] text-muted-foreground">
            Generate cards from the assigned datastore or from pasted JSON
          </div>
        ) : (
          cards.map((card) => <KpiCard key={card.id} card={card} row={row} params={paramValues} />)
        )}
      </div>
    </ControlContextMenu>
  )
}
