import { useMemo, useState } from 'react'
import { Link as RouterLink, useNavigate } from 'react-router-dom'
import { useTable, type ColumnDef } from '@tanstack/react-table'
import { Activity, Download, Eye, MoreHorizontal, Pencil, Search, Star } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'

import { dataGridFeatures, type DataGridFeatures } from '../reui/data-grid/data-grid'
import { DataGridColumnHeader } from '../reui/data-grid/data-grid-column-header'
import { TextColumnFilter } from '../reui/data-grid/data-grid-header-filters'
import { PanelUsageDialog } from '../manager/PanelUsageDialog'
import type { Panel } from '../../api/types'
import { useSessionStore } from '../../store/session'
import { ManagerGrid, managerGridInitialState } from '../manager/ManagerGrid'

const PRIMARY_CELL_CLASS = 'text-blue-600 dark:text-blue-500 font-medium'

function formatDate(iso: string | null | undefined): string {
  return iso ? new Date(iso).toLocaleString() : ''
}

interface Props {
  rows: Panel[]
  loading: boolean
  favoriteIds: Set<string>
  onToggleFavorite: (panel: Panel, next: boolean) => void
}

/**
 * specs/homepage.md: the dashboard listing shared by Home, a Category view,
 * and Favorites -- a search box over a data grid (filters + per-row context
 * menu: open, edit, view KPIs, favorite toggle, download JSON). Which rows
 * it's given (all panels, one category's, or just favorites) is entirely up
 * to the caller (HomePage); this component only searches/renders/acts on
 * whatever `rows` it's handed.
 */
export function DashboardsGrid({ rows, loading, favoriteIds, onToggleFavorite }: Props) {
  const navigate = useNavigate()
  const isAdmin = useSessionStore((s) => s.session?.is_admin)
  const [query, setQuery] = useState('')
  const [usageTarget, setUsageTarget] = useState<Panel | null>(null)

  const filteredRows = query ? rows.filter((p) => p.name.toLowerCase().includes(query.toLowerCase())) : rows

  const columns = useMemo<ColumnDef<DataGridFeatures, Panel>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="Name" filter={<TextColumnFilter column={column} placeholder="Filter name" />} />
        ),
        cell: ({ row, getValue }) => (
          <RouterLink to={`/panel/${row.original.id}`} title={row.original.description || undefined} className={PRIMARY_CELL_CLASS}>
            {String(getValue() ?? row.original.id)}
          </RouterLink>
        ),
        enableColumnFilter: true,
        filterFn: 'includesString',
        size: 220,
      },
      {
        id: 'updated_at',
        accessorFn: (row) => formatDate(row.updated_at),
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="Updated" filter={<TextColumnFilter column={column} placeholder="Filter updated" />} />
        ),
        cell: ({ getValue }) => String(getValue() ?? ''),
        enableColumnFilter: true,
        filterFn: 'includesString',
        size: 170,
      },
      {
        id: 'last_accessed_by_username',
        accessorFn: (row) => row.last_accessed_by_username ?? '',
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Last Accessed By"
            filter={<TextColumnFilter column={column} placeholder="Filter user" />}
          />
        ),
        cell: ({ getValue }) => String(getValue() ?? ''),
        enableColumnFilter: true,
        filterFn: 'includesString',
        size: 150,
      },
      {
        id: 'created_at',
        accessorFn: (row) => formatDate(row.created_at),
        header: ({ column }) => (
          <DataGridColumnHeader column={column} title="Created" filter={<TextColumnFilter column={column} placeholder="Filter created" />} />
        ),
        cell: ({ getValue }) => String(getValue() ?? ''),
        enableColumnFilter: true,
        filterFn: 'includesString',
        size: 170,
      },
      {
        id: 'created_by_username',
        accessorFn: (row) => row.created_by_username ?? '',
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Created By"
            filter={<TextColumnFilter column={column} placeholder="Filter user" />}
          />
        ),
        cell: ({ getValue }) => String(getValue() ?? ''),
        enableColumnFilter: true,
        filterFn: 'includesString',
        size: 150,
      },
      {
        id: '__actions',
        header: '',
        size: 60,
        cell: ({ row }) => {
          const panel = row.original
          const isFavorite = favoriteIds.has(panel.id)
          return (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-xs" aria-label="More actions">
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-[200px]">
                <DropdownMenuItem onClick={() => navigate(`/panel/${panel.id}`)}>
                  <Eye />
                  Open
                </DropdownMenuItem>
                {isAdmin && (
                  <DropdownMenuItem onClick={() => navigate(`/editor/${panel.id}`)}>
                    <Pencil />
                    Edit
                  </DropdownMenuItem>
                )}
                {isAdmin && (
                  <DropdownMenuItem onClick={() => setUsageTarget(panel)}>
                    <Activity />
                    View KPIs
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={() => onToggleFavorite(panel, !isFavorite)}>
                  <Star className={isFavorite ? 'fill-current' : undefined} />
                  {isFavorite ? 'Remove from Favorites' : 'Add to Favorites'}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem asChild>
                  <a href={`/api/panels/${panel.id}/download/`}>
                    <Download />
                    Download JSON
                  </a>
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )
        },
      },
    ],
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [navigate, isAdmin, favoriteIds, onToggleFavorite],
  )

  const table = useTable({ features: dataGridFeatures, columns, data: filteredRows, getRowId: (row) => row.id, initialState: managerGridInitialState })

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Search dashboards…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-8 pl-8 text-[0.85em]"
        />
      </div>
      <ManagerGrid table={table} recordCount={filteredRows.length} isLoading={loading} />
      {usageTarget && <PanelUsageDialog panel={usageTarget} onClose={() => setUsageTarget(null)} />}
    </div>
  )
}
