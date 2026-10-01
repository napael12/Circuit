import { Search } from 'lucide-react'
import { Subscribe } from '@tanstack/react-table'
import type { Table } from '@tanstack/react-table'

import { Input } from '@/components/ui/input'
import type { DataGridFeatures } from '../reui/data-grid/data-grid'

interface Props<TData extends object> {
  table: Table<DataGridFeatures, TData>
  placeholder?: string
}

/**
 * Free-text search box for a Manager grid, wired to TanStack's own global
 * filter (dataGridFeatures already registers it; it defaults to a
 * case-insensitive substring match -- filterFn_includesString -- scanned
 * across every column that has an accessor, i.e. every real data column,
 * never the "" / "__actions" ones). The query itself is just `globalFilter`
 * in the table's state, so it's covered for free by
 * useManagerGridState's sort/filter persistence -- this component only
 * renders the input and reads/writes that one state slice.
 */
export function ManagerSearchBox<TData extends object>({ table, placeholder = 'Search…' }: Props<TData>) {
  return (
    <Subscribe source={table.store} selector={(state) => state.globalFilter as string | undefined}>
      {(globalFilter) => (
        <div className="relative max-w-xs">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder={placeholder}
            value={globalFilter ?? ''}
            onChange={(e) => table.setGlobalFilter(e.target.value)}
            className="h-8 pl-8 text-[0.85em]"
          />
        </div>
      )}
    </Subscribe>
  )
}
