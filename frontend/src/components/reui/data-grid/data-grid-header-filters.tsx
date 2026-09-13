import type { Column } from '@tanstack/react-table'

import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'

import type { DataGridFeatures } from './data-grid'

/**
 * Free-text substring filter for a column's own header (see
 * DataGridColumnHeader's `filter` prop) -- pairs with the `includesString`
 * filterFn already registered on dataGridFeatures.
 */
export function TextColumnFilter<TData extends object>({
  column,
  placeholder,
}: {
  column: Column<DataGridFeatures, TData, unknown>
  placeholder?: string
}) {
  return (
    <Input
      placeholder={placeholder}
      value={(column.getFilterValue() as string) ?? ''}
      onChange={(e) => column.setFilterValue(e.target.value || undefined)}
      onKeyDown={(e) => e.stopPropagation()}
      className="h-7 w-full text-[0.8em]"
    />
  )
}

/**
 * Inline checkbox-list filter for a column's own header -- selecting
 * multiple values ORs them together. Options come from TanStack's own
 * faceted-unique-values feature (dataGridFeatures already registers
 * columnFacetingFeature + createFacetedUniqueValues()), not a manual row
 * scan. Pairs with the `selectorMatch` filterFn, which stringifies the row
 * value before comparing -- so the checkbox key is always `String(rawValue)`
 * (matching what that filterFn's resolveDataValue produces), independent of
 * whatever `formatOption` renders as the human-readable label.
 */
export function SelectorColumnFilter<TData extends object>({
  column,
  formatOption,
}: {
  column: Column<DataGridFeatures, TData, unknown>
  /** Renders a raw facet value as a checkbox label, e.g. booleans -> "True"/"False". Defaults to String(value). */
  formatOption?: (value: unknown) => string
}) {
  const facets = column.getFacetedUniqueValues()
  const options = Array.from(facets.keys())
    .filter((v) => v !== null && v !== undefined && v !== '')
    .map((v) => ({ key: String(v), label: formatOption ? formatOption(v) : String(v) }))
    .sort((a, b) => a.label.localeCompare(b.label))

  const filterValue = column.getFilterValue()
  const selected = new Set(Array.isArray(filterValue) ? (filterValue as string[]) : [])
  const toggle = (key: string) => {
    const next = new Set(selected)
    if (next.has(key)) next.delete(key)
    else next.add(key)
    column.setFilterValue(next.size ? Array.from(next) : undefined)
  }

  return (
    <div className="flex w-full flex-col gap-0.5">
      <div className="flex max-h-52 flex-col gap-0.5 overflow-y-auto">
        {options.map((opt) => (
          <label
            key={opt.key}
            className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-1 text-[0.8em] font-normal hover:bg-muted"
            onClick={(e) => e.stopPropagation()}
          >
            <Checkbox checked={selected.has(opt.key)} onCheckedChange={() => toggle(opt.key)} />
            <span className="truncate">{opt.label}</span>
          </label>
        ))}
        {options.length === 0 && <div className="px-1 py-1 text-[0.78em] text-muted-foreground">No values.</div>}
      </div>
      {selected.size > 0 && (
        <button
          type="button"
          className="mt-0.5 px-1 text-left text-[0.78em] text-muted-foreground hover:text-foreground"
          onClick={(e) => {
            e.stopPropagation()
            column.setFilterValue(undefined)
          }}
        >
          Clear filter
        </button>
      )}
    </div>
  )
}
