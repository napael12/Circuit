import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useTable, type ColumnDef } from '@tanstack/react-table'
import { ClipboardPaste, Copy, Download, Eraser, MoreHorizontal, Pencil, Play, Plus, Trash2, Upload } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
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
import type { DataConnection, Datastore, Role } from '../../api/types'
import { downloadJson, readSingleItemJson } from '../../utils/importExport'
import {
  clipboardToGlobalPayload,
  datastoreToClipboard,
  readDatastoreClipboard,
  type DatastoreClipboardEntry,
} from '../../utils/datastoreClipboard'
import { uniqueName } from '../editor/panelTree'
import { useManagerGridInitialState, usePersistManagerGridState } from '../../hooks/useManagerGridState'
import { CloneDialog } from './CloneDialog'
import { DatastoreDialog } from './DatastoreDialog'
import { ManagerGrid, managerGridInitialState } from './ManagerGrid'
import { ManagerSearchBox } from './ManagerSearchBox'

const PRIMARY_CELL_CLASS = 'text-blue-600 dark:text-blue-500 font-medium'

const SOURCE_TYPE_LABELS: Record<string, string> = { query: 'SQL', serialized: 'Serialized' }

function pad2(n: number): string {
  return String(n).padStart(2, '0')
}

/** "yyyy-MM-dd HH:mm:ss", local time -- portal management's fixed display format for a scheduled datastore's last load (see datastore.activity). */
function formatLastLoad(iso: string | null): string {
  if (!iso) return ''
  const d = new Date(iso)
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`
}

interface EditingState {
  datastore: Datastore | null // null = creating
  tab: 'edit' | 'preview'
}

interface Props {
  /** Full connection list, so the dialog can offer type-matching connections per source_type. */
  connections: DataConnection[]
  roles: Role[]
}

/**
 * Bespoke listing + edit/preview UI for global datastores.models.Datastore
 * rows (the "Datasource" of specs/datasource_enhancements.md) -- distinct
 * from CrudTable because the edit dialog itself is bespoke (type-aware
 * fields, tabbed edit+preview, a data-grid of derived default params; see
 * DatastoreDialog).
 */
export function DatastoresPanel({ connections, roles }: Props) {
  const [rows, setRows] = useState<Datastore[]>([])
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState<EditingState | null>(null)
  // A datastore copied to the clipboard (from here or the editor's own local
  // datastores -- see utils/datastoreClipboard.ts), parsed and validated but
  // not yet created -- pasteDatastore opens this instead of posting it
  // straight away, so a colliding id is a deliberate choice, not a silent
  // "-2" suffix (same pattern as EditorPage.tsx's own paste-datastore flow).
  const [pasteDraft, setPasteDraft] = useState<DatastoreClipboardEntry | null>(null)
  const importInputRef = useRef<HTMLInputElement>(null)

  const load = useCallback(() => {
    setLoading(true)
    api
      .get<Datastore[]>('/datastores/')
      .then(setRows)
      .catch((err) => toast.error(String(err)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/datastores/${id}/`)
      toast.success('Deleted.')
      load()
    } catch (err) {
      toast.error(String(err))
    }
  }

  const copyDatastore = async (ds: Datastore) => {
    try {
      await navigator.clipboard.writeText(JSON.stringify(datastoreToClipboard(ds), null, 2))
      toast.success('Copied.')
    } catch {
      toast.error('Clipboard access was denied.')
    }
  }

  const pasteDatastore = async () => {
    try {
      setPasteDraft(await readDatastoreClipboard())
    } catch (err) {
      toast.error(String(err))
    }
  }

  const confirmPasteDatastore = async (id: string) => {
    if (!pasteDraft) return
    await api.post('/datastores/', clipboardToGlobalPayload(pasteDraft, id))
    toast.success('Pasted.')
    load()
  }

  const handleImportFile = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    try {
      const item = await readSingleItemJson(file)
      const result = await api.post<{ created: string[]; updated: string[]; errors: { id?: string; error?: string }[] }>(
        '/datastores/import/',
        [item],
      )
      if (result.errors.length > 0) {
        toast.error(result.errors.map((e) => e.error ?? `${e.id}: invalid`).join('; '))
      } else {
        toast.success('Imported.')
        load()
      }
    } catch (err) {
      toast.error(String(err))
    }
  }

  const columns = useMemo<ColumnDef<DataGridFeatures, Datastore>[]>(
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
        size: 160,
      },
      {
        id: 'source_type',
        accessorFn: (row) => SOURCE_TYPE_LABELS[row.source_type] ?? row.source_type,
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="Type" filter={<SelectorColumnFilter column={column} />} />
        ),
        cell: ({ getValue }) => String(getValue()),
        enableColumnFilter: true,
        filterFn: 'selectorMatch',
        size: 90,
      },
      {
        id: 'refresh_mode',
        accessorFn: (row) => (row.refresh_mode === 'scheduled' ? 'Scheduled' : 'On demand'),
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="Refresh" filter={<SelectorColumnFilter column={column} />} />
        ),
        cell: ({ getValue }) => String(getValue()),
        enableColumnFilter: true,
        filterFn: 'selectorMatch',
        size: 110,
      },
      {
        id: 'cron_schedule',
        accessorKey: 'cron_schedule',
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="Cron" filter={<TextColumnFilter column={column} placeholder="Filter cron" />} />
        ),
        cell: ({ getValue }) => String(getValue() ?? ''),
        enableColumnFilter: true,
        filterFn: 'includesString',
        size: 140,
      },
      {
        id: 'is_active',
        accessorFn: (row) => (row.is_active === null ? '' : row.is_active ? 'Active' : 'Inactive'),
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="Status" filter={<SelectorColumnFilter column={column} />} />
        ),
        cell: ({ getValue }) => {
          const value = String(getValue())
          if (!value) return <span className="text-muted-foreground">—</span>
          return (
            <Badge
              variant="outline"
              className={
                value === 'Active'
                  ? 'border-green-600/30 text-green-600 dark:border-green-500/30 dark:text-green-500'
                  : 'text-muted-foreground'
              }
            >
              {value}
            </Badge>
          )
        },
        enableColumnFilter: true,
        filterFn: 'selectorMatch',
        size: 100,
      },
      {
        id: 'last_run_at',
        accessorFn: (row) => formatLastLoad(row.last_run_at),
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="Last Load" filter={<TextColumnFilter column={column} placeholder="Filter last load" />} />
        ),
        cell: ({ getValue }) => String(getValue() ?? ''),
        enableColumnFilter: true,
        filterFn: 'includesString',
        size: 160,
      },
      {
        id: '__actions',
        header: '',
        size: 84,
        cell: ({ row }) => (
          <div className="flex items-center justify-end gap-0.5">
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label="Edit"
              title="Edit"
              onClick={() => setEditing({ datastore: row.original, tab: 'edit' })}
            >
              <Pencil />
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-xs" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[180px]">
                <DropdownMenuItem onClick={() => setEditing({ datastore: row.original, tab: 'preview' })}>
                  <Play />
                  Preview
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setEditing({ datastore: row.original, tab: 'edit' })}>
                  <Pencil />
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => copyDatastore(row.original)}>
                  <Copy />
                  Copy
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() =>
                    api
                      .post(`/datastores/${row.original.id}/clear-cache/`)
                      .then(() => toast.success('Cache cleared.'))
                      .catch((err) => toast.error(String(err)))
                  }
                >
                  <Eraser />
                  Clear cache
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => downloadJson([row.original], `datastore-${row.original.id}.json`)}>
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
          </div>
        ),
      },
    ],
    [],
  )

  const initialState = useManagerGridInitialState('datastores')
  const table = useTable({
    features: dataGridFeatures,
    columns,
    data: rows,
    getRowId: (row) => row.id,
    initialState: { ...managerGridInitialState, ...initialState },
  })
  usePersistManagerGridState(table, 'datastores')

  return (
    <div className="flex h-full flex-col">
      <div className="mb-2 flex items-center gap-2">
        <ManagerSearchBox table={table} placeholder="Search datastores…" />
        <div className="grow" />
        <Button variant="outline" size="sm" onClick={() => importInputRef.current?.click()}>
          <Upload />
          Import
        </Button>
        <Button variant="outline" size="sm" onClick={pasteDatastore}>
          <ClipboardPaste />
          Paste
        </Button>
        <Button variant="outline" size="sm" onClick={() => setEditing({ datastore: null, tab: 'edit' })}>
          <Plus />
          New
        </Button>
      </div>
      <ManagerGrid table={table} recordCount={rows.length} isLoading={loading} />
      <input ref={importInputRef} type="file" accept="application/json" className="hidden" onChange={handleImportFile} />
      {editing && (
        <DatastoreDialog
          initial={editing.datastore}
          initialTab={editing.tab}
          connections={connections}
          roles={roles}
          availableDatastoreRefs={rows
            .filter((r) => r.id !== editing.datastore?.id)
            .map((r) => ({ name: r.id, scope: 'global' as const }))}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null)
            load()
          }}
        />
      )}
      {pasteDraft && (
        <CloneDialog
          title="Paste datastore"
          label="Name"
          suggestedName={uniqueName(pasteDraft.name, rows.map((r) => r.id))}
          submitLabel="Paste"
          onClone={confirmPasteDatastore}
          onClose={() => setPasteDraft(null)}
        />
      )}
    </div>
  )
}
