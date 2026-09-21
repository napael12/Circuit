import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from 'react'
import { useTable, type ColumnDef } from '@tanstack/react-table'
import { Check, Download, MoreHorizontal, Network, Pencil, Play, Plus, Trash2, Upload, X } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { dataGridFeatures, type DataGridFeatures } from '../reui/data-grid/data-grid'
import { DataGridColumnHeader } from '../reui/data-grid/data-grid-column-header'
import { SelectorColumnFilter, TextColumnFilter } from '../reui/data-grid/data-grid-header-filters'
import { api } from '../../api/client'
import type { ConnectionTestResult } from '../../api/types'
import type { FormField } from './formFields'
import { RecordDialog } from './RecordDialog'
import { ManagerGrid, managerGridInitialState } from './ManagerGrid'

export interface CrudColumn {
  field: string
  headerName: string
  width?: number
  flex?: number
  cellClassName?: string
  type?: 'boolean'
  valueGetter?: (value: unknown, row: Record<string, unknown>) => unknown
  /** 'text' -- free-text substring match. 'selector' -- checkbox list of the column's distinct values, OR'd together. Omit for no filter. */
  filter?: 'text' | 'selector'
}

interface Props {
  title: string
  resource: string // e.g. "/connections/"
  idField?: string
  columns: CrudColumn[]
  fields: FormField[]
  /**
   * When provided, adds a "Test" row action that tests the connection as
   * currently *saved* (e.g. using its real stored password, which the
   * client never otherwise sees).
   */
  onTestRow?: (record: Record<string, unknown>) => Promise<ConnectionTestResult>
  /**
   * When provided, adds a "Test connection" button in the edit dialog that
   * tests the *in-progress, unsaved* field values -- useful while filling
   * in a new connection or troubleshooting one before hitting Save.
   */
  onTestDraft?: (record: Record<string, unknown>) => Promise<ConnectionTestResult>
  /** When provided, adds a "Preview" row action -- the caller owns showing the actual preview UI. */
  onPreviewRow?: (record: Record<string, unknown>) => void
  /** When provided, adds a "Preview" button in the edit dialog for the in-progress field values. */
  onPreviewDraft?: (record: Record<string, unknown>) => void
  /** Extra buttons rendered in the toolbar, before "New". */
  headerActions?: ReactNode
  /**
   * When provided, adds a per-row "Export" action that downloads that one
   * record as JSON (specs/connection.md / specs/datasource_enhancements.md:
   * import/export scoped to an individual item, not the whole table).
   */
  onExportRow?: (record: Record<string, unknown>) => void
  /**
   * When provided, adds a per-row "Import" action: pick a JSON file
   * (previously produced by Export) to replace that one record. The
   * callback owns reading/validating the file and posting the update.
   */
  onImportRow?: (record: Record<string, unknown>, file: File) => Promise<void>
  /** Overrides the edit dialog's default width (sm:max-w-md) for forms with more fields. */
  dialogClassName?: string
}

export function CrudTable({
  title,
  resource,
  idField = 'id',
  columns,
  fields,
  onTestRow,
  onTestDraft,
  onPreviewRow,
  onPreviewDraft,
  headerActions,
  onExportRow,
  onImportRow,
  dialogClassName,
}: Props) {
  const [rows, setRows] = useState<Record<string, unknown>[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<Record<string, unknown> | null | undefined>(undefined) // undefined = closed
  const [importTarget, setImportTarget] = useState<Record<string, unknown> | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    setLoading(true)
    api
      .get<Record<string, unknown>[]>(resource)
      .then(setRows)
      .catch((err) => toast.error(String(err)))
      .finally(() => setLoading(false))
  }, [resource])

  useEffect(load, [load])

  const handleSave = async (record: Record<string, unknown>) => {
    const isEdit = editing != null
    if (isEdit) {
      await api.patch(`${resource}${record[idField]}/`, record)
    } else {
      await api.post(resource, record)
    }
    toast.success('Saved.')
    load()
  }

  const handleDelete = async (id: unknown) => {
    try {
      await api.delete(`${resource}${id}/`)
      toast.success('Deleted.')
      load()
    } catch (err) {
      toast.error(String(err))
    }
  }

  const handleTestRow = async (record: Record<string, unknown>) => {
    if (!onTestRow) return
    const result = await onTestRow(record)
    if (result.ok) toast.success(result.message)
    else toast.error(result.message)
  }

  const handleImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file || !importTarget || !onImportRow) return
    try {
      await onImportRow(importTarget, file)
      toast.success('Imported.')
      load()
    } catch (err) {
      toast.error(String(err))
    } finally {
      setImportTarget(null)
    }
  }

  const gridColumns = useMemo<ColumnDef<DataGridFeatures, Record<string, unknown>>[]>(
    () => [
      ...columns.map((c): ColumnDef<DataGridFeatures, Record<string, unknown>> => ({
        id: c.field,
        accessorFn: (row: Record<string, unknown>) => (c.valueGetter ? c.valueGetter(row[c.field], row) : row[c.field]),
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title={c.headerName}
            filter={
              c.filter === 'text' ? (
                <TextColumnFilter column={column} placeholder={`Filter ${c.headerName.toLowerCase()}`} />
              ) : c.filter === 'selector' ? (
                <SelectorColumnFilter column={column} formatOption={c.type === 'boolean' ? (v) => (v ? 'True' : 'False') : undefined} />
              ) : undefined
            }
          />
        ),
        cell: ({ getValue }) => {
          const value = getValue()
          if (c.type === 'boolean') {
            return value ? <Check className="size-4 text-success" /> : <X className="size-4 text-muted-foreground" />
          }
          return <span className={c.cellClassName}>{String(value ?? '')}</span>
        },
        enableColumnFilter: !!c.filter,
        filterFn: c.filter === 'text' ? 'includesString' : c.filter === 'selector' ? 'selectorMatch' : undefined,
        size: c.width ?? (c.flex ? 220 : 140),
      })),
      {
        id: '__actions',
        header: '',
        size: 60,
        cell: ({ row }) => (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon-xs" aria-label="More actions">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-[180px]">
              {onPreviewRow && (
                <DropdownMenuItem onClick={() => onPreviewRow(row.original)}>
                  <Play />
                  Preview
                </DropdownMenuItem>
              )}
              {onTestRow && (
                <DropdownMenuItem onClick={() => handleTestRow(row.original)}>
                  <Network />
                  Test connection
                </DropdownMenuItem>
              )}
              <DropdownMenuItem onClick={() => setEditing(row.original)}>
                <Pencil />
                Edit
              </DropdownMenuItem>
              {(onExportRow || onImportRow) && <DropdownMenuSeparator />}
              {onExportRow && (
                <DropdownMenuItem onClick={() => onExportRow(row.original)}>
                  <Download />
                  Export JSON
                </DropdownMenuItem>
              )}
              {onImportRow && (
                <DropdownMenuItem
                  onClick={() => {
                    setImportTarget(row.original)
                    importInputRef.current?.click()
                  }}
                >
                  <Upload />
                  Import JSON
                </DropdownMenuItem>
              )}
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => handleDelete(row.original[idField])}>
                <Trash2 />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [columns, onTestRow, onPreviewRow, onExportRow, onImportRow, idField],
  )

  const table = useTable({
    features: dataGridFeatures,
    columns: gridColumns,
    data: rows,
    getRowId: (row) => String(row[idField]),
    initialState: managerGridInitialState,
  })

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center gap-2">
        <div className="grow" />
        {headerActions}
        <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
          <Plus />
          New
        </Button>
      </div>
      <ManagerGrid table={table} recordCount={rows.length} isLoading={loading} />
      {onImportRow && (
        <input ref={importInputRef} type="file" accept="application/json" className="hidden" onChange={handleImportFile} />
      )}
      {editing !== undefined && (
        <RecordDialog
          title={editing ? `Edit ${title}` : `New ${title}`}
          fields={fields}
          initial={editing}
          onClose={() => setEditing(undefined)}
          onSave={handleSave}
          onTest={onTestDraft}
          onPreview={onPreviewDraft}
          dialogClassName={dialogClassName}
        />
      )}
    </div>
  )
}
