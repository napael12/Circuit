import { useEffect, useMemo, useState } from 'react'
import { useTable, type ColumnDef } from '@tanstack/react-table'
import { Download } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { dataGridFeatures } from '../reui/data-grid/data-grid'
import { DataGridColumnHeader } from '../reui/data-grid/data-grid-column-header'
import { api } from '../../api/client'
import type { Panel, PanelNode, PanelUpdateRow, PanelUsageRow, PanelUsageSummary, PanelUsageTopUser } from '../../api/types'
import { downloadCsv, rowsToCsv, sanitizeFilename } from '../../utils/csv'
import { ManagerGrid, managerGridInitialState } from './ManagerGrid'

interface Props {
  panel: Panel
  onClose: () => void
}

/** Shared shape HistoryTable renders -- both PanelUsageRow (accessed_at) and PanelUpdateRow (updated_at) map down to this. */
type HistoryRow = {
  id: number
  date: string
  user_name: string
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—'
}

/** specs/panel_tracking.md: usage-tracking dialog -- Key Indicators (visit KPIs + top 5 users), Visits (full, filterable, exportable visit history), and Updates (same, for save history). */
export function PanelUsageDialog({ panel, onClose }: Props) {
  const [summary, setSummary] = useState<PanelUsageSummary | null>(null)
  const [visitRows, setVisitRows] = useState<PanelUsageRow[]>([])
  const [updateRows, setUpdateRows] = useState<PanelUpdateRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.get<PanelUsageSummary>(`/panels/${panel.id}/usage-summary/`),
      api.get<PanelUsageRow[]>(`/panels/${panel.id}/usage/`),
      api.get<PanelUpdateRow[]>(`/panels/${panel.id}/updates/`),
    ])
      .then(([s, visits, updates]) => {
        setSummary(s)
        setVisitRows(visits)
        setUpdateRows(updates)
      })
      .catch((err) => toast.error(String(err)))
      .finally(() => setLoading(false))
  }, [panel.id])

  const visitHistory = useMemo<HistoryRow[]>(
    () => visitRows.map((r) => ({ id: r.id, date: r.accessed_at, user_name: r.user_name })),
    [visitRows],
  )
  const updateHistory = useMemo<HistoryRow[]>(
    () => updateRows.map((r) => ({ id: r.id, date: r.updated_at, user_name: r.user_name })),
    [updateRows],
  )

  const exportHistory = (rows: HistoryRow[], suffix: string) => {
    const columns: PanelNode[] = [
      { id: 'date', type: 'datatable-column', field: 'date', fieldDisplay: 'Date/Time' },
      { id: 'user_name', type: 'datatable-column', field: 'user_name', fieldDisplay: 'User' },
    ]
    downloadCsv(sanitizeFilename(`${panel.name} ${suffix}`), rowsToCsv(rows, columns))
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Usage: {panel.name}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="indicators" className="flex min-h-0 flex-1 flex-col gap-3">
          <TabsList variant="line" className="flex-none">
            <TabsTrigger value="indicators">Key Indicators</TabsTrigger>
            <TabsTrigger value="visits">Visits</TabsTrigger>
            <TabsTrigger value="updates">Updates</TabsTrigger>
          </TabsList>

          <TabsContent value="indicators" className="min-h-0 flex-1 overflow-y-auto">
            {loading || !summary ? (
              <div className="flex h-32 items-center justify-center">
                <Spinner className="size-6" />
              </div>
            ) : (
              <KeyIndicators summary={summary} />
            )}
          </TabsContent>

          <TabsContent value="visits" className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex flex-none justify-end">
              <Button variant="outline" size="sm" onClick={() => exportHistory(visitHistory, 'usage')} disabled={visitHistory.length === 0}>
                <Download />
                Export CSV
              </Button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
              <HistoryTable rows={visitHistory} loading={loading} />
            </div>
          </TabsContent>

          <TabsContent value="updates" className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex flex-none justify-end">
              <Button
                variant="outline"
                size="sm"
                onClick={() => exportHistory(updateHistory, 'updates')}
                disabled={updateHistory.length === 0}
              >
                <Download />
                Export CSV
              </Button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
              <HistoryTable rows={updateHistory} loading={loading} />
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function KeyIndicators({ summary }: { summary: PanelUsageSummary }) {
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <StatCard label="Total Visits" value={String(summary.total_visits)} />
        <StatCard label="Total Unique Users" value={String(summary.total_unique_users)} />
        <StatCard label="First Visit" value={formatDate(summary.first_visit)} />
        <StatCard label="Last Visit" value={formatDate(summary.last_visit)} />
      </div>
      <div>
        <div className="mb-1.5 text-[0.82em] font-semibold">Top 5 Users</div>
        <TopUsersTable users={summary.top_users} />
      </div>
    </div>
  )
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="text-[0.72em] font-medium tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className="mt-1 text-[1.15em] font-semibold">{value}</div>
    </div>
  )
}

function TopUsersTable({ users }: { users: PanelUsageTopUser[] }) {
  if (users.length === 0) return <p className="text-[0.82em] text-muted-foreground">No visits yet.</p>
  return (
    <div className="overflow-hidden rounded-lg border border-border">
      <table className="w-full text-[0.82em]">
        <thead className="bg-muted/40 text-muted-foreground">
          <tr>
            <th className="px-3 py-1.5 text-left font-medium">User</th>
            <th className="px-3 py-1.5 text-right font-medium">Visits</th>
            <th className="px-3 py-1.5 text-right font-medium">Last Visit</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {users.map((u) => (
            <tr key={u.user_id ?? u.name}>
              <td className="px-3 py-1.5">{u.name}</td>
              <td className="px-3 py-1.5 text-right">{u.visits}</td>
              <td className="px-3 py-1.5 text-right">{formatDate(u.last_visit)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

/** Shared table for both the Visits and Updates tabs -- see HistoryRow. */
function HistoryTable({ rows, loading }: { rows: HistoryRow[]; loading: boolean }) {
  const columns = useMemo<ColumnDef<typeof dataGridFeatures, HistoryRow>[]>(
    () => [
      {
        id: 'date',
        accessorFn: (row) => row.date,
        header: ({ column }) => <DataGridColumnHeader column={column} title="Date/Time" />,
        cell: ({ getValue }) => formatDate(getValue() as string),
        size: 200,
      },
      {
        id: 'user_name',
        accessorFn: (row) => row.user_name,
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="User"
            filter={
              <Input
                placeholder="Filter User"
                value={(column.getFilterValue() as string) ?? ''}
                onChange={(e) => column.setFilterValue(e.target.value || undefined)}
                onKeyDown={(e) => e.stopPropagation()}
                className="h-7 w-full text-[0.8em]"
              />
            }
          />
        ),
        filterFn: 'includesString',
      },
    ],
    [],
  )

  const table = useTable({
    features: dataGridFeatures,
    columns,
    data: rows,
    getRowId: (row) => String(row.id),
    // reui's DataGrid isn't virtualized -- up to USAGE_HISTORY_LIMIT rows
    // rendered straight into the DOM at once can hang the browser (the same
    // issue DatatableControl's own pageSize cap exists for).
    initialState: managerGridInitialState,
  })

  return (
    <ManagerGrid bare table={table} recordCount={rows.length} isLoading={loading} />
  )
}
