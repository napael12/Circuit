import { useEffect, useMemo, useState } from 'react'
import { useTable, type ColumnDef } from '@tanstack/react-table'
import { Braces, Download, Plus, Play, Trash2 } from 'lucide-react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuTrigger } from '@/components/ui/context-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/Field'

import { dataGridFeatures, type DataGridFeatures } from '../reui/data-grid/data-grid'
import { DataGridColumnHeader } from '../reui/data-grid/data-grid-column-header'
import type { DatastorePreviewResult } from '../../api/types'
import { toRows, type DatatableRow } from '../controls/datatableUtils'
import { downloadCsv, rowsToCsv, sanitizeFilename } from '../../utils/csv'
import { ManagerGrid, managerGridInitialState } from './ManagerGrid'

const DEFAULT_LIMIT = 10

interface Props {
  /** Param names discovered from the query/action so the panel opens pre-populated. */
  initialParams: Record<string, string>
  onRun: (params: Record<string, string>, limit: number) => Promise<DatastorePreviewResult>
  /** Base filename for "Export data (CSV)" -- defaults to "datastore-preview" when omitted. */
  name?: string
}

/**
 * The row-limit/params/run/results body of a datastore preview, with no
 * Dialog chrome of its own -- used both standalone inside
 * DatastorePreviewDialog (local-datastore preview) and embedded directly as
 * a tab inside DatastoreDialog (global datastore edit+preview).
 */
export function DatastorePreviewPanel({ initialParams, onRun, name }: Props) {
  const [limit, setLimit] = useState(DEFAULT_LIMIT)
  const [params, setParams] = useState<Record<string, string>>(initialParams)
  const [newParamName, setNewParamName] = useState('')
  const [running, setRunning] = useState(false)
  const [result, setResult] = useState<DatastorePreviewResult | null>(null)
  const [showJson, setShowJson] = useState(false)

  useEffect(() => setParams(initialParams), [initialParams])

  const run = async () => {
    setRunning(true)
    setResult(null)
    try {
      setResult(await onRun(params, limit))
    } catch (err) {
      setResult({ ok: false, message: String(err) })
    } finally {
      setRunning(false)
    }
  }

  const rows = toRows(result?.data)
  const columns: ColumnDef<DataGridFeatures, DatatableRow>[] = useMemo(
    () =>
      Object.keys(rows[0] ?? {})
        .filter((key) => key !== 'id')
        .map((key) => ({
          id: key,
          accessorKey: key,
          header: ({ column }) => <DataGridColumnHeader column={column} title={key} />,
          cell: ({ getValue }) => String(getValue() ?? ''),
        })),
    [rows],
  )
  const table = useTable({
    features: dataGridFeatures,
    columns,
    data: rows,
    getRowId: (row) => String(row.id),
    initialState: managerGridInitialState,
  })
  const isTabular = Array.isArray(result?.data)
  const handleExport = () => downloadCsv(sanitizeFilename(name || 'datastore-preview'), rowsToCsv(rows))

  return (
    <div className="flex h-full min-h-0 min-w-0 flex-col gap-4 overflow-y-auto py-1">
      <div className="flex items-end gap-4">
        <Field label="Row limit" className="w-[140px]">
          <Input
            type="number"
            value={limit}
            onChange={(e) => setLimit(Number(e.target.value) || DEFAULT_LIMIT)}
            className="h-8 text-[0.85em]"
          />
        </Field>
        <Button size="sm" onClick={run} disabled={running}>
          <Play />
          Run preview
        </Button>
      </div>

      <div>
        <div className="mb-1 text-[0.75em] text-muted-foreground">Parameters</div>
        <div className="flex flex-col gap-2">
          {Object.entries(params).map(([paramName, value]) => (
            <div key={paramName} className="flex items-center gap-2">
              <Input value={paramName} disabled className="h-8 w-[160px] text-[0.85em]" />
              <Input
                value={value}
                onChange={(e) => setParams((p) => ({ ...p, [paramName]: e.target.value }))}
                className="h-8 flex-1 text-[0.85em]"
              />
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setParams((p) => Object.fromEntries(Object.entries(p).filter(([n]) => n !== paramName)))}
              >
                <Trash2 />
              </Button>
            </div>
          ))}
          <div className="flex items-center gap-2">
            <Input
              placeholder="New param name"
              value={newParamName}
              onChange={(e) => setNewParamName(e.target.value)}
              className="h-8 w-[160px] text-[0.85em]"
            />
            <Button
              variant="ghost"
              size="icon-sm"
              disabled={!newParamName || newParamName in params}
              onClick={() => {
                setParams((p) => ({ ...p, [newParamName]: '' }))
                setNewParamName('')
              }}
            >
              <Plus />
            </Button>
          </div>
        </div>
      </div>

      {result && !result.ok && (
        <Alert variant="destructive">
          <AlertDescription>{result.message}</AlertDescription>
        </Alert>
      )}
      {result?.ok && (
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div className="min-h-[240px] min-w-0 flex-1">
              {isTabular ? (
                <ManagerGrid className="h-full" table={table} recordCount={rows.length} tableLayout={{ dense: true, width: 'auto' }} />
              ) : (
                <pre className="max-h-[320px] overflow-auto rounded-lg border border-border p-2 text-xs">
                  {JSON.stringify(result.data, null, 2)}
                </pre>
              )}
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            <ContextMenuItem disabled={!isTabular || rows.length === 0} onClick={handleExport}>
              <Download />
              Export to CSV
            </ContextMenuItem>
            <ContextMenuItem onClick={() => setShowJson(true)}>
              <Braces />
              View JSON
            </ContextMenuItem>
          </ContextMenuContent>
        </ContextMenu>
      )}

      {showJson && (
        <Dialog open onOpenChange={(open) => !open && setShowJson(false)}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>Preview JSON</DialogTitle>
            </DialogHeader>
            <pre className="max-h-[60vh] overflow-auto rounded-lg border border-border p-2 text-xs">
              {JSON.stringify(result?.data, null, 2)}
            </pre>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}
