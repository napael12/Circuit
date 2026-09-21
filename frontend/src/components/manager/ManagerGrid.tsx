import type { ComponentProps } from 'react'
import type { Table, TableFeatures } from '@tanstack/react-table'

import { cn } from '@/lib/utils'

import { DataGrid } from '../reui/data-grid/data-grid'
import { DataGridPagination } from '../reui/data-grid/data-grid-pagination'
import { DataGridScrollArea } from '../reui/data-grid/data-grid-scroll-area'
import { DataGridTable } from '../reui/data-grid/data-grid-table'

/** Default rows per page for every Manager grid (TanStack's own default is 10). */
export const MANAGER_PAGE_SIZE = 20
/** Pass as useTable's `initialState` so the grid starts at MANAGER_PAGE_SIZE rows per page. */
export const managerGridInitialState = { pagination: { pageIndex: 0, pageSize: MANAGER_PAGE_SIZE } }
const PAGE_SIZES = [10, MANAGER_PAGE_SIZE, 50, 100, 200]

interface Props<TFeatures extends TableFeatures, TData extends object> {
  table: Table<TFeatures, TData>
  recordCount: number
  isLoading?: boolean
  tableLayout?: ComponentProps<typeof DataGrid>['tableLayout']
  /** Drop the bordered/rounded box -- for a grid already sitting inside a bordered container (the usage dialogs). */
  bare?: boolean
  className?: string
}

/**
 * The Manager's standard data grid body: a scroll area (vertical + horizontal,
 * so every row on the current page is reachable) above a pagination footer
 * (rows-per-page selector, default MANAGER_PAGE_SIZE). The table it renders
 * must be created with `initialState: managerGridInitialState`.
 */
export function ManagerGrid<TFeatures extends TableFeatures, TData extends object>({
  table,
  recordCount,
  isLoading,
  tableLayout,
  bare,
  className,
}: Props<TFeatures, TData>) {
  return (
    <div
      className={cn(
        'flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden',
        !bare && 'rounded-lg border border-border',
        className,
      )}
    >
      <DataGrid table={table} recordCount={recordCount} isLoading={isLoading} tableLayout={tableLayout ?? { dense: true }}>
        {/* This wrapper must itself be a flex container: DataGridScrollArea's own root has no
            explicit height, so it needs a flex parent to stretch it and make it clip/scroll
            rather than grow to the table's full height. min-w-0 is the same fix on the width axis. */}
        <div className="flex min-h-0 min-w-0 flex-1">
          <DataGridScrollArea orientation="both" className="h-full">
            <DataGridTable />
          </DataGridScrollArea>
        </div>
        <div className="flex-none border-t border-border p-1.5">
          <DataGridPagination sizes={PAGE_SIZES} />
        </div>
      </DataGrid>
    </div>
  )
}
