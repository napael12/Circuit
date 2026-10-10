import { useState } from 'react'
import { format as formatDate, isValid as isValidDate, parse as parseDate } from 'date-fns'
import { CalendarIcon, XIcon } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Calendar } from '@/components/ui/calendar'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { Switch } from '@/components/ui/switch'
import { SearchableSelect } from '@/components/SearchableSelect'
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

function parseFormatted(value: string, fmt: string): Date | undefined {
  if (!value) return undefined
  const date = parseDate(value, fmt, new Date())
  return isValidDate(date) ? date : undefined
}

/**
 * PanelParameter.inputType='range' -- a two-thumb Slider
 * (PanelParameter.rangeMin/rangeMax/rangeStep, defaulting to 0/100/1). A
 * value outside [min,max] (e.g. a still-default "" before the user has
 * touched it) clamps to that end rather than producing a thumb off the
 * visible track. displayTicks adds a tick mark at every step -- capped at
 * 50 marks so a tiny step over a huge range doesn't paint hundreds of them.
 */
function RangeSliderField({ param, value, onChange }: { param: PanelParameter; value: string; onChange: (value: string) => void }) {
  const min = param.rangeMin ?? 0
  const max = param.rangeMax ?? 100
  const step = param.rangeStep ?? 1
  const [fromRaw, toRaw] = value.split(',')
  const clamp = (n: number) => Math.min(max, Math.max(min, n))
  const from = fromRaw !== undefined && fromRaw !== '' && Number.isFinite(Number(fromRaw)) ? clamp(Number(fromRaw)) : min
  const to = toRaw !== undefined && toRaw !== '' && Number.isFinite(Number(toRaw)) ? clamp(Number(toRaw)) : max
  const tickCount = step > 0 && max > min ? Math.round((max - min) / step) : 0
  const ticks = param.displayTicks && tickCount > 0 && tickCount <= 50 ? Array.from({ length: tickCount + 1 }, (_, i) => (i / tickCount) * 100) : []

  return (
    <div className="flex flex-col gap-2 px-0.5 py-1">
      <div className="flex items-center justify-between text-[0.78em] text-muted-foreground">
        <span>{from}</span>
        <span>{to}</span>
      </div>
      <Slider value={[from, to]} min={min} max={max} step={step} onValueChange={([nextFrom, nextTo]) => onChange(`${nextFrom},${nextTo}`)} />
      {ticks.length > 0 && (
        <div className="relative h-1.5">
          {ticks.map((pct) => (
            <span key={pct} className="absolute top-0 h-1.5 w-px bg-border" style={{ left: `${pct}%` }} />
          ))}
        </div>
      )}
    </div>
  )
}

/** PanelParameter.inputType='calendar' -- a popover date picker, in the parameter's own calendarFormat (date-fns pattern, default "yyyy-MM-dd"). */
function CalendarField({ value, format: fmt, onChange }: { value: string; format: string; onChange: (value: string) => void }) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="h-8 w-full justify-start gap-1.5 px-2.5 text-[0.85em] font-normal">
          <CalendarIcon className="size-3.5 text-muted-foreground" />
          {value || <span className="text-muted-foreground">Pick a date...</span>}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar
          mode="single"
          captionLayout="dropdown"
          selected={parseFormatted(value, fmt)}
          onSelect={(date) => {
            onChange(date ? formatDate(date, fmt) : '')
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** PanelParameter.selectorDelimiter/selectorEnclosure -- e.g. 'AAPL','MSFT' with the defaults (",", "'"). Wraps every value when an enclosure is set, so a value containing the delimiter itself still round-trips through decodeMultiValues below. */
function encodeMultiValues(values: string[], delimiter: string, enclosure: string): string {
  return values.map((v) => (enclosure ? `${enclosure}${v}${enclosure}` : v)).join(delimiter)
}

/** Inverse of encodeMultiValues -- with an enclosure set, matches complete enclosure...enclosure segments (tolerant of a delimiter appearing inside one, since it only ever has to parse what the encoder itself produced) rather than a naive split; falls back to a plain split if that finds nothing (e.g. a value saved before an enclosure was configured). */
function decodeMultiValues(raw: string, delimiter: string, enclosure: string): string[] {
  if (!raw) return []
  if (!enclosure) return raw.split(delimiter)
  const re = new RegExp(`${escapeRegExp(enclosure)}(.*?)${escapeRegExp(enclosure)}`, 'g')
  const matches = [...raw.matchAll(re)].map((m) => m[1])
  return matches.length > 0 ? matches : raw.split(delimiter)
}

/** One row's own value/display pair for a selector-single/selector-multi options datastore -- see PanelParameter.selectorColumn/displayColumn. */
interface SelectorOption {
  value: string
  label: string
}

/**
 * PanelParameter.inputType='selector-multi' -- the same searchable-combobox
 * pattern reui's own Select docs point to for multi-select (reui's actual
 * Select component is single-select only -- see
 * https://reui.io/components/select -- so this is built from its lower-level
 * Command/Popover/Badge primitives instead of a single drop-in component).
 * Selected options show as removable chips in the trigger; `value` stays one
 * flattened string, delimiter-joined and optionally enclosure-wrapped (see
 * encodeMultiValues/decodeMultiValues) -- never an array.
 */
function SelectorMultiField({
  options,
  delimiter,
  enclosure,
  value,
  onChange,
}: {
  options: SelectorOption[]
  delimiter: string
  enclosure: string
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const selected = decodeMultiValues(value, delimiter, enclosure)
  const labelFor = (v: string) => options.find((o) => o.value === v)?.label ?? v
  const toggle = (opt: string) =>
    onChange(encodeMultiValues(selected.includes(opt) ? selected.filter((v) => v !== opt) : [...selected, opt], delimiter, enclosure))

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button type="button" variant="outline" className="h-auto min-h-8 w-full justify-start px-2 py-1 text-[0.85em] font-normal">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1">
            {selected.length === 0 ? (
              <span className="px-0.5 text-muted-foreground">Select...</span>
            ) : (
              selected.map((opt) => (
                <Badge key={opt} variant="secondary" className="gap-1 text-[0.8em]">
                  <span className="max-w-32 truncate">{labelFor(opt)}</span>
                  {/* span, not a nested <button> -- this already sits inside the trigger's own <button>. stopPropagation keeps the click from also toggling the popover via the trigger's own handler. */}
                  <span
                    role="button"
                    tabIndex={-1}
                    onClick={(e) => {
                      e.stopPropagation()
                      toggle(opt)
                    }}
                    className="rounded-full hover:bg-muted-foreground/20"
                  >
                    <XIcon className="size-3" />
                  </span>
                </Badge>
              ))
            )}
          </div>
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[260px] p-0" align="start">
        <Command>
          <CommandInput placeholder="Search..." />
          <CommandList>
            <CommandEmpty>No options.</CommandEmpty>
            <CommandGroup>
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={`${opt.value} ${opt.label}`}
                  data-checked={selected.includes(opt.value)}
                  onSelect={() => toggle(opt.value)}
                >
                  {opt.label}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

/** PanelParameter.toggleValues ("<on>|<off>", e.g. "yes|no") -- defaults to ['true','false'] when unset/blank, or either half is missing (a trailing "|" with nothing after it, etc.). */
function toggleValuePair(param: PanelParameter): [on: string, off: string] {
  const raw = param.toggleValues?.trim()
  if (!raw) return ['true', 'false']
  const [on, off] = raw.split('|')
  return [on || 'true', off || 'false']
}

/** Exported for ParametersControl.tsx (an inline, always-applied alternative to this dialog's own draft+Apply form) -- same field-type-per-parameter logic reused rather than duplicated. inputType branches (calendar/range/selector-single/selector-multi/toggle -- PanelParameter.inputType) come first; an unset inputType falls through to the original plain input / datastore-driven select / lookup-table logic, unchanged. */
export function ParamField({
  param,
  datastores,
  previewMode,
  value,
  onChange,
}: {
  param: PanelParameter
  datastores: PanelDatastoreRef[]
  /** Editor's Preview tab for an in-progress (possibly unsaved) panel -- see ControlProps. Unset/false everywhere this dialog itself renders, which isn't yet preview-mode-aware. */
  previewMode?: boolean
  value: string
  onChange: (value: string) => void
}) {
  const panelId = usePanelId()
  const { data } = useDatastore(param.datastore, datastores, {}, panelId, previewMode)
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : []
  const columns = Object.keys(rows[0] ?? {})
  const valueColumn = param.selectorColumn || columns[0]
  // selector-single/selector-multi only -- displayColumn unset (including
  // every legacy no-inputType parameter below, which has no UI to set it)
  // makes label === value, same as before displayColumn existed.
  const displayColumn = param.displayColumn || valueColumn
  const options = (() => {
    const seen = new Set<string>()
    const result: SelectorOption[] = []
    for (const row of rows) {
      const v = String(row[valueColumn] ?? '')
      if (!v || seen.has(v)) continue
      seen.add(v)
      result.push({ value: v, label: String(row[displayColumn] ?? '') || v })
    }
    return result
  })()

  if (param.inputType === 'toggle') {
    const [onValue, offValue] = toggleValuePair(param)
    return <Switch checked={value === onValue} onCheckedChange={(checked) => onChange(checked ? onValue : offValue)} />
  }

  if (param.inputType === 'range') {
    return <RangeSliderField param={param} value={value} onChange={onChange} />
  }

  if (param.inputType === 'calendar') {
    return <CalendarField value={value} format={param.calendarFormat || 'yyyy-MM-dd'} onChange={onChange} />
  }

  if (param.inputType === 'selector-multi' && param.datastore) {
    return (
      <SelectorMultiField
        options={options}
        delimiter={param.selectorDelimiter || ','}
        enclosure={param.selectorEnclosure ?? "'"}
        value={value}
        onChange={onChange}
      />
    )
  }

  if (param.inputType === 'selector-single' && param.datastore) {
    // SearchableSelect (not reui's own plain, non-filterable Select) so a
    // long options datastore -- the same case selector-multi's own
    // Command/Popover combobox below already handles -- gets a search box
    // here too, instead of a flat list with no way to filter it.
    return <SearchableSelect value={value} onValueChange={onChange} options={options} placeholder="Select..." className="h-8 text-[0.85em]" />
  }

  if (param.datastore) {
    // No Parameter type picked, but `datastore` is set anyway -- the
    // pre-parameters2.md fallback, kept only for backward compatibility
    // with already-saved parameters like that (e.g. the demo dashboard's
    // "stock" parameter). A single-column datastore is still just a plain
    // value list -- the lookup table only earns its keep once there's
    // other columns to give each option context (see
    // PanelParameter.selectorColumn).
    if (columns.length > 1) {
      return <SelectorTableField rows={rows} columns={columns} valueColumn={valueColumn} value={value} onChange={onChange} />
    }

    return (
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 w-full rounded-lg border border-input bg-transparent px-2.5 text-[0.85em] outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <option value="" />
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    )
  }

  return (
    <Input
      type="text"
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
