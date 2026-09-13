import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

import type { PanelDatastoreRef, PanelParameter } from '../../api/types'
import { useDatastore } from '../../hooks/useDatastore'
import { useAllParameterValues, usePanelId, useSetParameter } from './ParameterContext'

interface Props {
  open: boolean
  onClose: () => void
  /** Pre-filtered via visibleParameters (see ParameterProvider). */
  parameters: PanelParameter[]
  datastores: PanelDatastoreRef[]
}

/**
 * The dashboard-level "set a parameter by hand" form -- a Dialog rather than
 * a Popover so it can be opened from anywhere a parameter's origin control
 * might be deeply nested (the viewer toolbar's own button, or any control's
 * right-click menu via useOpenParametersDialog), not just a fixed anchor.
 */
export function ParametersDialog({ open, onClose, parameters, datastores }: Props) {
  const values = useAllParameterValues()
  const setValue = useSetParameter()
  const [draft, setDraft] = useState<Record<string, string>>(values)

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (next) setDraft(values) // fresh snapshot each time it's (re)opened
        else onClose()
      }}
    >
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Parameters</DialogTitle>
        </DialogHeader>
        {parameters.map((param) => (
          <div key={param.name} className="mb-2.5">
            <label className="mb-1 block text-[0.78em] text-muted-foreground">{param.label}</label>
            <ParamField
              param={param}
              datastores={datastores}
              value={draft[param.name] ?? ''}
              onChange={(v) => setDraft((d) => ({ ...d, [param.name]: v }))}
            />
          </div>
        ))}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              Object.entries(draft).forEach(([name, value]) => setValue(name, value))
              onClose()
            }}
          >
            Apply
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function ParamField({
  param,
  datastores,
  value,
  onChange,
}: {
  param: PanelParameter
  datastores: PanelDatastoreRef[]
  value: string
  onChange: (value: string) => void
}) {
  const panelId = usePanelId()
  const { data } = useDatastore(param.datastore, datastores, {}, panelId)

  if (param.datastore) {
    const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : []
    const columns = Object.keys(rows[0] ?? {})
    const valueColumn = param.selectorColumn || columns[0]

    // A single-column datastore is still just a plain value list -- the
    // lookup table only earns its keep once there's other columns to give
    // each option context (see PanelParameter.selectorColumn).
    if (columns.length > 1) {
      return <SelectorTableField rows={rows} columns={columns} valueColumn={valueColumn} value={value} onChange={onChange} />
    }

    const options = Array.from(new Set(rows.map((row) => String(row[valueColumn] ?? '')))).filter(Boolean)
    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-[0.85em] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <option value="" />
        {options.map((opt) => (
          <option key={opt} value={opt}>
            {opt}
          </option>
        ))}
      </select>
    )
  }

  return (
    <Input
      type={param.dataType === 'date' ? 'date' : param.dataType === 'number' ? 'number' : 'text'}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="text-[0.85em]"
    />
  )
}

/** This popover isn't virtualized -- rendering every row of a large options datastore straight into the DOM can hang the browser (same reasoning as DatatableControl/PivotControl's own row caps). */
const MAX_SELECTOR_ROWS = 200

/** A multi-column options datastore's picker (PanelParameter.selectorColumn): a button showing the current value, opening a popover lookup table of every row/column so the other columns can disambiguate options that look alike in `valueColumn` alone. Clicking a row sets the parameter to that row's `valueColumn` value. A search box filters by substring across every column, since the table itself is capped at MAX_SELECTOR_ROWS. */
function SelectorTableField({
  rows,
  columns,
  valueColumn,
  value,
  onChange,
}: {
  rows: Record<string, unknown>[]
  columns: string[]
  valueColumn: string
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')

  const filtered = search.trim()
    ? rows.filter((row) => columns.some((col) => String(row[col] ?? '').toLowerCase().includes(search.trim().toLowerCase())))
    : rows
  const visibleRows = filtered.slice(0, MAX_SELECTOR_ROWS)

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setSearch('')
      }}
    >
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          className="h-8 w-full justify-start truncate px-2.5 text-[0.85em] font-normal"
        >
          {value || <span className="text-muted-foreground">Select...</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[420px] p-0" align="start">
        <div className="border-b border-border p-1.5">
          <Input
            autoFocus
            placeholder="Search..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="h-7 text-[0.8em]"
          />
        </div>
        <div className="max-h-64 overflow-auto">
          <table className="w-full border-collapse text-left text-[0.8em]">
            <thead className="sticky top-0 bg-popover">
              <tr>
                {columns.map((col) => (
                  <th key={col} className="border-b border-border px-2 py-1.5 font-semibold whitespace-nowrap">
                    {col}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleRows.map((row, i) => {
                const rowValue = String(row[valueColumn] ?? '')
                return (
                  <tr
                    key={i}
                    onClick={() => {
                      onChange(rowValue)
                      setOpen(false)
                      setSearch('')
                    }}
                    className={cn('cursor-pointer hover:bg-muted', rowValue === value && 'bg-muted/60')}
                  >
                    {columns.map((col) => (
                      <td key={col} className="border-b border-border px-2 py-1.5 whitespace-nowrap">
                        {String(row[col] ?? '')}
                      </td>
                    ))}
                  </tr>
                )
              })}
              {visibleRows.length === 0 && (
                <tr>
                  <td colSpan={columns.length} className="px-2 py-3 text-center text-muted-foreground">
                    No matches.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {filtered.length > MAX_SELECTOR_ROWS && (
          <div className="border-t border-border px-2 py-1 text-[0.75em] text-muted-foreground">
            Showing {MAX_SELECTOR_ROWS} of {filtered.length} -- narrow your search to see more.
          </div>
        )}
      </PopoverContent>
    </Popover>
  )
}
