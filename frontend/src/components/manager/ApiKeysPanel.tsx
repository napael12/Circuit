import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTable, type ColumnDef } from '@tanstack/react-table'
import { Activity, MoreHorizontal, Plus, Power, PowerOff, Trash2 } from 'lucide-react'
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
import { TextColumnFilter } from '../reui/data-grid/data-grid-header-filters'
import { ApiKeyUsageDialog } from './ApiKeyUsageDialog'
import { CreateApiKeyDialog } from './CreateApiKeyDialog'
import { api } from '../../api/client'
import type { ApiKey, AppUser } from '../../api/types'
import { ManagerGrid, managerGridInitialState } from './ManagerGrid'

interface Props {
  users: AppUser[]
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : ''
}

/**
 * Portal Management > API Keys (specs/api_datastore.md). Bespoke rather
 * than CrudTable, same reasoning as DashboardsPanel: creating a key needs a
 * one-time secret-reveal step CrudTable's generic RecordDialog has no
 * concept of, and each row needs a "View Usage" action (ApiKeyUsageDialog,
 * cloned from PanelUsageDialog).
 */
export function ApiKeysPanel({ users }: Props) {
  const [rows, setRows] = useState<ApiKey[]>([])
  const [loading, setLoading] = useState(true)
  const [createOpen, setCreateOpen] = useState(false)
  const [usageTarget, setUsageTarget] = useState<ApiKey | null>(null)

  const load = useCallback(() => {
    setLoading(true)
    api
      .get<ApiKey[]>('/api-keys/')
      .then(setRows)
      .catch((err) => toast.error(String(err)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(load, [load])

  const handleToggleActive = async (key: ApiKey) => {
    try {
      await api.patch(`/api-keys/${key.id}/`, { is_active: !key.is_active })
      toast.success(key.is_active ? 'Deactivated.' : 'Activated.')
      load()
    } catch (err) {
      toast.error(String(err))
    }
  }

  const handleDelete = async (id: string) => {
    try {
      await api.delete(`/api-keys/${id}/`)
      toast.success('Deleted.')
      load()
    } catch (err) {
      toast.error(String(err))
    }
  }

  const columns = useMemo<ColumnDef<DataGridFeatures, ApiKey>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="Name" filter={<TextColumnFilter column={column} placeholder="Filter name" />} />
        ),
        cell: ({ getValue }) => <span className="font-medium">{String(getValue())}</span>,
        enableColumnFilter: true,
        filterFn: 'includesString',
        size: 200,
      },
      {
        id: 'key_prefix',
        accessorKey: 'key_prefix',
        header: ({ column }) => <DataGridColumnHeader column={column} title="Key" />,
        cell: ({ getValue }) => <span className="font-mono text-muted-foreground">{String(getValue())}…</span>,
        size: 140,
      },
      {
        id: 'user_username',
        accessorFn: (row) => row.user_username ?? '',
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="User" filter={<TextColumnFilter column={column} placeholder="Filter user" />} />
        ),
        cell: ({ getValue }) => String(getValue() ?? ''),
        enableColumnFilter: true,
        filterFn: 'includesString',
        size: 140,
      },
      {
        id: 'is_active',
        accessorFn: (row) => row.is_active,
        header: ({ column }) => <DataGridColumnHeader column={column} title="Status" />,
        cell: ({ getValue }) => (
          <Badge variant={getValue() ? 'secondary' : 'outline'}>{getValue() ? 'Active' : 'Inactive'}</Badge>
        ),
        size: 100,
      },
      {
        id: 'created_at',
        accessorFn: (row) => formatDate(row.created_at),
        header: ({ column }) => <DataGridColumnHeader column={column} title="Created" />,
        cell: ({ getValue }) => String(getValue() ?? ''),
        size: 180,
      },
      {
        id: 'last_used_at',
        accessorFn: (row) => formatDate(row.last_used_at),
        header: ({ column }) => <DataGridColumnHeader column={column} title="Last Used" />,
        cell: ({ getValue }) => String(getValue() || '—'),
        size: 180,
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
              <DropdownMenuItem onClick={() => setUsageTarget(row.original)}>
                <Activity />
                View usage
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => handleToggleActive(row.original)}>
                {row.original.is_active ? <PowerOff /> : <Power />}
                {row.original.is_active ? 'Deactivate' : 'Activate'}
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
        <Button variant="outline" size="sm" onClick={() => setCreateOpen(true)}>
          <Plus />
          New
        </Button>
      </div>
      <ManagerGrid table={table} recordCount={rows.length} isLoading={loading} />
      {createOpen && <CreateApiKeyDialog users={users} onClose={() => setCreateOpen(false)} onCreated={load} />}
      {usageTarget && <ApiKeyUsageDialog apiKey={usageTarget} onClose={() => setUsageTarget(null)} />}
    </div>
  )
}
