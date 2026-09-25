import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useTable, type ColumnDef } from '@tanstack/react-table'
import { Activity, Copy, Download, ExternalLink, Eye, Link2, MoreHorizontal, Pencil, Plus, Trash2, Upload } from 'lucide-react'
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
import { TextColumnFilter } from '../reui/data-grid/data-grid-header-filters'
import { CloneDialog } from './CloneDialog'
import { PanelUsageDialog } from './PanelUsageDialog'
import { api } from '../../api/client'
import type { Panel } from '../../api/types'
import { downloadUrl } from '../../utils/importExport'
import { openInNewWindow } from '../../utils/newWindow'
import { ManagerGrid, managerGridInitialState } from './ManagerGrid'

const PRIMARY_CELL_CLASS = 'text-blue-600 dark:text-blue-500 font-medium'

/**
 * Listing + open/preview/import/export/delete for saved dashboards
 * (panels.models.Panel). Bespoke rather than CrudTable: a dashboard's real
 * editor is the full Editor page (layout/parameters/components), not a
 * generic field-list dialog -- Manager's job here is just "which dashboards
 * exist," with a jump-off point into that editor, not editing dashboard
 * content itself.
 *
 * Import/export is scoped to one dashboard at a time (specs/main.md's
 * "dashboards are shared as JSON files", matching the per-item behavior
 * added for Connections/Datastores) -- it reuses PanelViewSet's existing
 * download/upload actions, which already operate on a single panel.
 */
export function DashboardsPanel() {
  const navigate = useNavigate()
  const [rows, setRows] = useState<Panel[]>([])
  const [loading, setLoading] = useState(true)
  const [usageTarget, setUsageTarget] = useState<Panel | null>(null)
  const [cloneTarget, setCloneTarget] = useState<Panel | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    setLoading(true)
    api
      .get<Panel[]>('/panels/')
      .then(setRows)
      .catch((err) => toast.error(String(err)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  const copyPanelLink = async (panel: Panel) => {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/panel/${panel.slug || panel.id}`)
      toast.success('Panel link copied.')
    } catch {
      toast.error('Clipboard access was denied.')
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/panels/${id}/`)
      toast.success('Deleted.')
      load()
    } catch (err) {
      toast.error(String(err))
    }
  }

  const handleImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    // Derive an id/name from the filename, like the editor's own Upload JSON.
    const base = file.name.replace(/\.json$/, '')
    const formData = new FormData()
    formData.append('file', file)
    formData.append('id', base)
    formData.append('name', base)
    try {
      await api.upload<Panel>('/panels/upload/', formData)
      toast.success('Imported.')
      load() // stay on the Dashboards list -- just refresh it, no jump into the editor
    } catch (err) {
      toast.error(String(err))
    }
  }

  const columns = useMemo<ColumnDef<DataGridFeatures, Panel>[]>(
    () => [
      {
        id: 'id',
        accessorFn: (row) => row.slug || row.id,
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="ID/slug" filter={<TextColumnFilter column={column} placeholder="Filter id/slug" />} />
        ),
        cell: ({ getValue }) => String(getValue()),
        enableColumnFilter: true,
        filterFn: 'includesString',
        size: 160,
      },
      {
        id: 'name',
        accessorKey: 'name',
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="Name" filter={<TextColumnFilter column={column} placeholder="Filter name" />} />
        ),
        cell: ({ row, getValue }) => (
          <button
            type="button"
            title={row.original.description || undefined}
            className={PRIMARY_CELL_CLASS}
            onClick={() => navigate(`/editor/${row.original.id}`)}
          >
            {String(getValue() ?? row.original.id)}
          </button>
        ),
        enableColumnFilter: true,
        filterFn: 'includesString',
        size: 220,
      },
      {
        id: 'category',
        accessorFn: (row) => row.category || '',
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="Category" filter={<TextColumnFilter column={column} placeholder="Filter category" />} />
        ),
        cell: ({ getValue }) => String(getValue() ?? ''),
        enableColumnFilter: true,
        filterFn: 'includesString',
        size: 130,
      },
      {
        id: 'subcategory',
        accessorFn: (row) => row.subcategory || '',
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="Subcategory" filter={<TextColumnFilter column={column} placeholder="Filter subcategory" />} />
        ),
        cell: ({ getValue }) => String(getValue() ?? ''),
        enableColumnFilter: true,
        filterFn: 'includesString',
        size: 130,
      },
      {
        id: 'updated_at',
        accessorFn: (row) => (row.updated_at ? new Date(row.updated_at).toLocaleString() : ''),
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="Updated" filter={<TextColumnFilter column={column} placeholder="Filter updated" />} />
        ),
        cell: ({ getValue }) => String(getValue() ?? ''),
        enableColumnFilter: true,
        filterFn: 'includesString',
        size: 190,
      },
      {
        id: 'updated_by_username',
        accessorFn: (row) => row.updated_by_username ?? '',
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Updated By"
            filter={<TextColumnFilter column={column} placeholder="Filter updated by" />}
          />
        ),
        cell: ({ getValue }) => String(getValue() ?? ''),
        enableColumnFilter: true,
        filterFn: 'includesString',
        size: 160,
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
              <DropdownMenuItem onClick={() => navigate(`/panel/${row.original.id}`)}>
                <Eye />
                View
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openInNewWindow(`/panel/${row.original.slug || row.original.id}`)}>
                <ExternalLink />
                View in New Window
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => copyPanelLink(row.original)}>
                <Link2 />
                Copy Panel Link
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => navigate(`/editor/${row.original.id}`)}>
                <Pencil />
                Edit
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setUsageTarget(row.original)}>
                <Activity />
                View usage
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setCloneTarget(row.original)}>
                <Copy />
                Clone
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => downloadUrl(`/api/panels/${row.original.id}/download/`)}>
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
    [navigate],
  )

  const table = useTable({ features: dataGridFeatures, columns, data: rows, getRowId: (row) => row.id, initialState: managerGridInitialState })

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center gap-2">
        <div className="grow" />
        <Button
          variant="outline"
          size="sm"
          onClick={() => importInputRef.current?.click()}
        >
          <Upload />
          Import
        </Button>
        <Button variant="outline" size="sm" onClick={() => navigate('/editor/new')}>
          <Plus />
          New
        </Button>
      </div>
      <ManagerGrid table={table} recordCount={rows.length} isLoading={loading} />
      <input ref={importInputRef} type="file" accept="application/json" className="hidden" onChange={handleImportFile} />
      {usageTarget && <PanelUsageDialog panel={usageTarget} onClose={() => setUsageTarget(null)} />}
      {cloneTarget && (
        <CloneDialog
          title="Clone dashboard"
          label="Name"
          suggestedName={`${cloneTarget.name}-copy`}
          onClone={async (name) => {
            await api.post(`/panels/${cloneTarget.id}/duplicate/`, { name })
            toast.success('Cloned.')
            load()
          }}
          onClose={() => setCloneTarget(null)}
        />
      )}
    </div>
  )
}
