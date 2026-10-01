import { useEffect, useMemo } from 'react'
import type { ColumnFiltersState, SortingState, Table } from '@tanstack/react-table'

import type { DataGridFeatures } from '../components/reui/data-grid/data-grid'

const STORAGE_PREFIX = 'manager-grid-state:'

interface StoredGridState {
  sorting?: SortingState
  columnFilters?: ColumnFiltersState
  // TanStack types this slice as `any` itself (see globalFilteringFeature's
  // TableState_GlobalFiltering) -- a search box only ever stores a string
  // here, but nothing enforces that at the type level upstream either.
  globalFilter?: unknown
}

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function saveJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // localStorage unavailable (private browsing, etc.) -- state just won't persist.
  }
}

/**
 * Each Manager section (Dashboards, Connections, Datastores, API Keys,
 * Users, Roles, Settings) remembers its own sort/column-filter/search-box
 * state across tab switches and reloads, keyed by `section` (e.g.
 * "dashboards" -- matches ManagerPage's TABS id, or CrudTable's lowercased
 * title for Users/Roles/Settings). Spread the result into useTable's
 * `initialState` (alongside managerGridInitialState) so the grid opens
 * already sorted/filtered the way the user last left it, instead of
 * flashing unsorted for a tick -- then call usePersistManagerGridState with
 * the resulting table to keep localStorage in sync as the user changes them.
 */
export function useManagerGridInitialState(section: string): StoredGridState {
  // Only ever consulted once -- useTable captures initialState at table
  // creation and ignores later changes to this object, so there's nothing
  // to keep reactive here.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  return useMemo(() => loadJSON<StoredGridState>(STORAGE_PREFIX + section, {}), [])
}

/** Pair with useManagerGridInitialState(section) -- same section, same table. */
export function usePersistManagerGridState<TData extends object>(table: Table<DataGridFeatures, TData>, section: string) {
  useEffect(() => {
    const key = STORAGE_PREFIX + section
    const subscription = table.store.subscribe((state) => {
      saveJSON(key, {
        sorting: state.sorting,
        columnFilters: state.columnFilters,
        globalFilter: state.globalFilter,
      })
    })
    return () => subscription.unsubscribe()
  }, [table, section])
}
