import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useTable, type ColumnDef } from '@tanstack/react-table'
import { Copy, Download, MoreHorizontal, Network, Pencil, Plus, Trash2, Upload } from 'lucide-react'
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
import type { ConnectionTestResult, DataConnection, Role } from '../../api/types'
import { downloadJson, readSingleItemJson } from '../../utils/importExport'
import { CloneDialog } from './CloneDialog'
import { CONNECTION_TYPE_ICONS, ConnectionDialog } from './ConnectionDialog'
import { ManagerGrid, managerGridInitialState } from './ManagerGrid'

const PRIMARY_CELL_CLASS = 'text-blue-600 dark:text-blue-500 font-medium'

const TYPE_LABELS: Record<DataConnection['type'], string> = {
  sql: 'SQL',
  s3: 'S3',
  http: 'HTTP',
}

/** A short human summary of what this connection actually points at. */
function targetSummary(row: DataConnection): string {
  switch (row.type) {
    case 'sql':
      return row.url || [row.host, row.database].filter(Boolean).join(' / ') || row.dialect
    case 's3':
      return [row.config?.bucket, row.config?.region].filter(Boolean).join(' · ')
    case 'http':
      return row.url
    default:
      return ''
  }
}

/**
 * Bespoke listing + edit UI for connections.models.DataConnection rows --
 * distinct from CrudTable because the edit dialog is bespoke (see
 * ConnectionDialog: a type-specific layout per specs/ui_connections/*.png
 * instead of one flat field list).
 */
export function ConnectionsPanel({ roles }: { roles: Role[] }) {
  const [rows, setRows] = useState<DataConnection[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<DataConnection | null | undefined>(undefined) // undefined = closed
  const [cloneTarget, setCloneTarget] = useState<DataConnection | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    setLoading(true)
    api
      .get<DataConnection[]>('/connections/')
      .then(setRows)
      .catch((err) => toast.error(String(err)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/connections/${id}/`)
      toast.success('Deleted.')
      load()
    } catch (err) {
      toast.error(String(err))
    }
  }

  const handleTest = async (row: DataConnection) => {
    try {
      const result = await api.post<ConnectionTestResult>(`/connections/${row.id}/test/`)
      if (result.ok) toast.success(result.message)
      else toast.error(result.message)
    } catch (err) {
      toast.error(String(err))
    }
  }

  const handleImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const item = await readSingleItemJson(file)
      await api.post('/connections/import/', [item])
      toast.success('Imported.')
      load()
    } catch (err) {
      toast.error(String(err))
    }
  }

  const columns = useMemo<ColumnDef<DataGridFeatures, DataConnection>[]>(
    () => [
      {
        id: 'id',
        accessorKey: 'id',
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="Name" filter={<TextColumnFilter column={column} placeholder="Filter name" />} />
        ),
        cell: ({ getValue }) => <span className={PRIMARY_CELL_CLASS}>{String(getValue())}</span>,
        enableColumnFilter: true,
        filterFn: 'includesString',
        size: 150,
      },
      {
        id: 'type',
        accessorFn: (row) => TYPE_LABELS[row.type],
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="Type" filter={<SelectorColumnFilter column={column} />} />
        ),
        cell: ({ row }) => {
          const Icon = CONNECTION_TYPE_ICONS[row.original.type]
          return (
            <span className="flex items-center gap-1.5">
              <Icon className="size-3.5 text-muted-foreground" />
              {TYPE_LABELS[row.original.type]}
            </span>
          )
        },
        enableColumnFilter: true,
        filterFn: 'selectorMatch',
        size: 90,
      },
      {
        id: 'target',
        accessorFn: (row) => targetSummary(row),
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="Target" filter={<TextColumnFilter column={column} placeholder="Filter target" />} />
        ),
        cell: ({ getValue }) => (
          <span className="block truncate font-mono text-[0.85em]" title={String(getValue() ?? '')}>
            {String(getValue() ?? '')}
          </span>
        ),
        enableColumnFilter: true,
        filterFn: 'includesString',
        size: 240,
      },
      {
        id: 'description',
        accessorKey: 'description',
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="Description" filter={<TextColumnFilter column={column} placeholder="Filter description" />} />
        ),
        cell: ({ getValue }) => String(getValue() ?? ''),
        enableColumnFilter: true,
        filterFn: 'includesString',
      },
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
              <DropdownMenuItem onClick={() => handleTest(row.original)}>
                <Network />
                Test connection
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setEditing(row.original)}>
                <Pencil />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCloneTarget(row.original)}>
                <Copy />
                Clone
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => downloadJson([row.original], `connection-${row.original.id}.json`)}>
                <Download />
                Export JSON
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => handleDelete(row.original.id)}>
                <Trash2 />
                Delete
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        ),
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )

  const table = useTable({ features: dataGridFeatures, columns, data: rows, getRowId: (row) => row.id, initialState: managerGridInitialState })

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center gap-2">
        <div className="grow" />
        <Button variant="outline" size="sm" onClick={() => importInputRef.current?.click()}>
          <Upload />
          Import
        </Button>
        <Button variant="outline" size="sm" onClick={() => setEditing(null)}>
          <Plus />
          New
        </Button>
      </div>
      <ManagerGrid table={table} recordCount={rows.length} isLoading={loading} />
      <input ref={importInputRef} type="file" accept="application/json" className="hidden" onChange={handleImportFile} />
      {editing !== undefined && (
        <ConnectionDialog
          initial={editing}
          roles={roles}
          onClose={() => setEditing(undefined)}
          onSaved={() => {
            setEditing(undefined)
            load()
          }}
        />
      )}
      {cloneTarget && (
        <CloneDialog
          title="Clone connection"
          label="Name"
          suggestedName={`${cloneTarget.id}-copy`}
          onClone={async (name) => {
            await api.post(`/connections/${cloneTarget.id}/duplicate/`, { name })
            toast.success('Cloned.')
            load()
          }}
          onClose={() => setCloneTarget(null)}
        />
      )}
    </div>
  )
}
