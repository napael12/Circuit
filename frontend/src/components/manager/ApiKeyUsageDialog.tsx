import { useEffect, useMemo, useState } from 'react'
import { useTable, type ColumnDef } from '@tanstack/react-table'
import { Download } from 'lucide-react'
import { toast } from 'sonner'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'

import { DataGrid, dataGridFeatures } from '../reui/data-grid/data-grid'
import { DataGridColumnHeader } from '../reui/data-grid/data-grid-column-header'
import { DataGridPagination } from '../reui/data-grid/data-grid-pagination'
import { DataGridScrollArea } from '../reui/data-grid/data-grid-scroll-area'
import { DataGridTable } from '../reui/data-grid/data-grid-table'
import { api } from '../../api/client'
import type { ApiKey, ApiKeyUsageRow, ApiKeyUsageSummary } from '../../api/types'
import { downloadCsv, rowsToCsv, sanitizeFilename } from '../../utils/csv'

interface Props {
  apiKey: ApiKey
  onClose: () => void
}

function formatDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : '—'
}

/** specs/api_datastore.md: "API key requests should be logged, with similar 'Usage' display as dashboards" -- cloned from PanelUsageDialog. */
export function ApiKeyUsageDialog({ apiKey, onClose }: Props) {
  const [summary, setSummary] = useState<ApiKeyUsageSummary | null>(null)
  const [rows, setRows] = useState<ApiKeyUsageRow[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    setLoading(true)
    Promise.all([
      api.get<ApiKeyUsageSummary>(`/api-keys/${apiKey.id}/usage-summary/`),
      api.get<ApiKeyUsageRow[]>(`/api-keys/${apiKey.id}/usage/`),
    ])
      .then(([s, r]) => {
        setSummary(s)
        setRows(r)
      })
      .catch((err) => toast.error(String(err)))
      .finally(() => setLoading(false))
  }, [apiKey.id])

  const handleExport = () => {
    downloadCsv(sanitizeFilename(`${apiKey.name} usage`), rowsToCsv(rows as unknown as Record<string, unknown>[]))
  }

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Usage: {apiKey.name}</DialogTitle>
        </DialogHeader>
        <Tabs defaultValue="indicators" className="flex min-h-0 flex-1 flex-col gap-3">
          <TabsList variant="line" className="flex-none">
            <TabsTrigger value="indicators">Key Indicators</TabsTrigger>
            <TabsTrigger value="details">Details</TabsTrigger>
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

          <TabsContent value="details" className="flex min-h-0 flex-1 flex-col gap-2">
            <div className="flex flex-none justify-end">
              <Button variant="outline" size="sm" onClick={handleExport} disabled={rows.length === 0}>
                <Download />
                Export CSV
              </Button>
            </div>
            <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-lg border border-border">
              <DetailsTable rows={rows} loading={loading} />
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  )
}

function KeyIndicators({ summary }: { summary: ApiKeyUsageSummary }) {
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      <StatCard label="Total Calls" value={String(summary.total_calls)} />
      <StatCard label="Pull Calls" value={String(summary.pull_calls)} />
      <StatCard label="Push Calls" value={String(summary.push_calls)} />
      <StatCard label="First Call" value={formatDate(summary.first_call)} />
      <StatCard label="Last Call" value={formatDate(summary.last_call)} />
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

function DetailsTable({ rows, loading }: { rows: ApiKeyUsageRow[]; loading: boolean }) {
  const columns = useMemo<ColumnDef<typeof dataGridFeatures, ApiKeyUsageRow>[]>(
    () => [
      {
        id: 'accessed_at',
        accessorFn: (row) => row.accessed_at,
        header: ({ column }) => <DataGridColumnHeader column={column} title="Date/Time" />,
        cell: ({ getValue }) => formatDate(getValue() as string),
        size: 200,
      },
      {
        id: 'mode',
        accessorFn: (row) => row.mode,
        header: ({ column }) => <DataGridColumnHeader column={column} title="Mode" />,
        cell: ({ getValue }) => <Badge variant="secondary">{String(getValue())}</Badge>,
        size: 90,
      },
      {
        id: 'datastore_id',
        accessorFn: (row) => row.datastore_id,
        header: ({ column }) => (
          <DataGridColumnHeader
            column={column}
            title="Datastore"
            filter={
              <Input
                placeholder="Filter datastore"
                value={(column.getFilterValue() as string) ?? ''}
                onChange={(e) => column.setFilterValue(e.target.value || undefined)}
                onKeyDown={(e) => e.stopPropagation()}
                className="h-7 w-full text-[0.8em]"
              />
            }
          />
        ),
        filterFn: 'includesString',
        size: 160,
      },
      {
        id: 'ip_address',
        accessorFn: (row) => row.ip_address ?? '',
        header: ({ column }) => <DataGridColumnHeader column={column} title="IP" />,
        cell: ({ getValue }) => String(getValue() || '—'),
        size: 140,
      },
      {
        id: 'ok',
        accessorFn: (row) => row.ok,
        header: ({ column }) => <DataGridColumnHeader column={column} title="OK" />,
        cell: ({ getValue }) => (getValue() ? 'Yes' : 'No'),
        size: 70,
      },
      {
        id: 'detail',
        accessorFn: (row) => row.detail,
        header: ({ column }) => <DataGridColumnHeader column={column} title="Detail" />,
        cell: ({ getValue }) => String(getValue() ?? ''),
        meta: { autoSize: true },
      },
    ],
    [],
  )

  const table = useTable({
    features: dataGridFeatures,
    columns,
    data: rows,
    getRowId: (row) => String(row.id),
    initialState: { pagination: { pageIndex: 0, pageSize: 25 } },
  })

  return (
    <DataGrid table={table} recordCount={rows.length} isLoading={loading} tableLayout={{ dense: true }}>
      <div className="flex min-h-0 min-w-0 flex-1">
        <DataGridScrollArea orientation="both" className="h-full">
          <DataGridTable />
        </DataGridScrollArea>
      </div>
      <div className="flex-none border-t border-border p-1.5">
        <DataGridPagination />
      </div>
    </DataGrid>
  )
}
