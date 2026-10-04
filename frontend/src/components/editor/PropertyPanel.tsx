import { useEffect, useState } from 'react'
import { ArrowDown, ArrowUp, X } from 'lucide-react'

import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { InfoPopover } from '@/components/InfoPopover'

import type { FieldSchema } from './propertySchemas'

/** Radix Select's own value can't be the empty string, so the "clear this field" option needs a distinct sentinel. */
const NONE_VALUE = '__none__'

interface Props {
  title: string
  record: Record<string, unknown>
  schema: FieldSchema[]
  datastoreOptions: string[]
  /** specs/drilldown.md: the panel's own drilldowns, for a type=multiselect field's checkbox-list options. */
  drilldownOptions?: { id: string; name: string }[]
  /** specs/link.md: the panel's own links, for a type=multiselect field's checkbox-list options. */
  linkOptions?: { id: string; name: string }[]
  /** specs/parameters2.md: the panel's own parameters (id = PanelParameter.name), for a type=multiselect field's checkbox-list/reorderable-list options. */
  parameterOptions?: { id: string; name: string }[]
  onChange: (patch: Record<string, unknown>) => void
}

/** A vertical name/value property table (specs/ui_editor/control_properties.png) driven by a FieldSchema. */
export function PropertyPanel({
  title,
  record,
  schema,
  datastoreOptions,
  drilldownOptions = [],
  linkOptions = [],
  parameterOptions = [],
  onChange,
}: Props) {
  return (
    <div className="flex flex-col">
      <div className="px-3 pt-3 pb-2 text-[0.7em] font-semibold tracking-wide text-muted-foreground uppercase">{title}</div>
      {schema.length === 0 ? (
        <p className="px-3 pb-3 text-[0.78em] text-muted-foreground">No properties.</p>
      ) : (
        <div className="mx-3 mb-3 divide-y divide-border overflow-hidden rounded-lg border border-border">
          {schema.map((field) => (
            <Row
              key={field.key}
              field={field}
              record={record}
              datastoreOptions={datastoreOptions}
              drilldownOptions={drilldownOptions}
              linkOptions={linkOptions}
              parameterOptions={parameterOptions}
              onChange={onChange}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function Row({
  field,
  record,
  datastoreOptions,
  drilldownOptions,
  linkOptions,
  parameterOptions,
  onChange,
}: {
  field: FieldSchema
  record: Record<string, unknown>
  datastoreOptions: string[]
  drilldownOptions: { id: string; name: string }[]
  linkOptions: { id: string; name: string }[]
  parameterOptions: { id: string; name: string }[]
  onChange: (patch: Record<string, unknown>) => void
}) {
  const value = record[field.key]
  const set = (v: unknown) => onChange({ [field.key]: v })

  return (
    <div className="grid grid-cols-[100px_1fr] items-stretch bg-card text-[0.82em]">
      <div className="flex items-center border-r border-border bg-muted/40 px-2.5 py-2 text-muted-foreground">{field.label}</div>
      <div className="flex items-center gap-1.5 px-2.5 py-1.5">
        <div className="min-w-0 flex-1">
          <FieldControl
            field={field}
            value={value}
            datastoreOptions={datastoreOptions}
            drilldownOptions={drilldownOptions}
            linkOptions={linkOptions}
            parameterOptions={parameterOptions}
            onChange={set}
          />
        </div>
        {/* Help used to render as its own wrapped line under the control --
            replaced with an icon that opens a Popover (see InfoPopover) so
            every row stays a single line and the help text is reachable in
            every browser, not just ones that show a native title tooltip. */}
        {field.help && <InfoPopover>{field.help}</InfoPopover>}
      </div>
    </div>
  )
}

function FieldControl({
  field,
  value,
  datastoreOptions,
  drilldownOptions,
  linkOptions,
  parameterOptions,
  onChange,
}: {
  field: FieldSchema
  value: unknown
  datastoreOptions: string[]
  drilldownOptions: { id: string; name: string }[]
  linkOptions: { id: string; name: string }[]
  parameterOptions: { id: string; name: string }[]
  onChange: (v: unknown) => void
}) {
  if (field.type === 'checkbox') {
    const checked = value === undefined ? !!field.defaultChecked : !!value
    return <Checkbox checked={checked} onCheckedChange={(checked) => onChange(!!checked)} />
  }

  if (field.type === 'select') {
    const options = field.dynamicOptions === 'datastores' ? datastoreOptions : (field.options ?? [])
    // Radix Select reserves the empty string for "no selection" internally,
    // so the clear option needs its own sentinel value -- translated back to
    // undefined on the way out. Without this, a select field could be set
    // but never cleared back to unset once a real option was chosen.
    return (
      <Select value={(value as string) || NONE_VALUE} onValueChange={(v) => onChange(v === NONE_VALUE ? undefined : v)}>
        <SelectTrigger className="h-7 w-full text-[0.82em]">
          <SelectValue placeholder="none" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE_VALUE}>{field.noneLabel ?? 'None'}</SelectItem>
          {options.map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (field.type === 'multiselect') {
    const options = field.dynamicOptions === 'links' ? linkOptions : field.dynamicOptions === 'parameters' ? parameterOptions : drilldownOptions
    const selected = Array.isArray(value) ? (value as string[]) : []

    if (field.orderable) {
      return <OrderedMultiselectField options={options} selected={selected} onChange={onChange} />
    }

    const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((v) => v !== id) : [...selected, id])
    return (
      <div className="flex max-h-28 flex-col gap-0.5 overflow-y-auto rounded-md border border-input p-1.5">
        {options.length === 0 && <span className="px-1 text-[0.85em] text-muted-foreground">None defined.</span>}
        {options.map((opt) => (
          <label key={opt.id} className="flex cursor-pointer items-center gap-1.5 rounded px-1 py-0.5 text-[0.85em] hover:bg-muted">
            <Checkbox checked={selected.includes(opt.id)} onCheckedChange={() => toggle(opt.id)} />
            <span className="truncate">{opt.name}</span>
          </label>
        ))}
      </div>
    )
  }

  if (field.type === 'pagination') {
    // Tolerates the pre-dropdown boolean shape (true/false) still present in already-saved panels.
    const current = value === true ? '10' : value ? String(value) : 'none'
    return (
      <Select value={current} onValueChange={(v) => onChange(v === 'none' ? undefined : Number(v))}>
        <SelectTrigger className="h-7 w-full text-[0.82em]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="none">No Pagination</SelectItem>
          {(field.options ?? []).map((opt) => (
            <SelectItem key={opt} value={opt}>
              {opt}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  }

  if (field.type === 'number') {
    return (
      <Input
        type="number"
        value={(value as number) ?? ''}
        onChange={(e) => onChange(e.target.value === '' ? undefined : Number(e.target.value))}
        className="h-7 text-[0.82em]"
      />
    )
  }

  if (field.type === 'multiline') {
    return <Textarea rows={3} value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} className="text-[0.82em]" />
  }

  if (field.type === 'csv') {
    return (
      <Input
        value={((value as string[]) ?? []).join(', ')}
        onChange={(e) =>
          onChange(
            e.target.value
              .split(',')
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
        className="h-7 text-[0.82em]"
      />
    )
  }

  if (field.type === 'json') {
    return <JsonControl value={value} onChange={onChange} />
  }

  return <Input value={(value as string) ?? ''} onChange={(e) => onChange(e.target.value)} className="h-7 text-[0.82em]" />
}

/**
 * type=multiselect + orderable=true (currently just PARAMETERS.parameterNames,
 * specs/parameters2.md #2) -- unlike the plain checkbox-list multiselect
 * rendering above, here the array's own order *is* the value a consumer
 * reads (ParametersControl.tsx renders them in this order), so selection
 * is a reorderable list (same up/down convention ComponentTree.tsx already
 * uses for panel-wide parameter reordering) instead of a checkbox grid.
 */
function OrderedMultiselectField({
  options,
  selected,
  onChange,
}: {
  options: { id: string; name: string }[]
  selected: string[]
  onChange: (next: string[]) => void
}) {
  const remaining = options.filter((o) => !selected.includes(o.id))
  const move = (index: number, dir: -1 | 1) => {
    const target = index + dir
    if (target < 0 || target >= selected.length) return
    const next = [...selected]
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }

  return (
    <div className="flex flex-col gap-1.5">
      {selected.length === 0 ? (
        <span className="text-[0.85em] text-muted-foreground">All parameters, in panel order</span>
      ) : (
        <div className="flex flex-col gap-0.5">
          {selected.map((id, i) => (
            <div key={id} className="flex items-center gap-1 rounded-md border border-input px-1.5 py-1 text-[0.82em]">
              <span className="min-w-0 flex-1 truncate">{options.find((o) => o.id === id)?.name ?? id}</span>
              <button
                type="button"
                disabled={i === 0}
                onClick={() => move(i, -1)}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                aria-label="Move up"
              >
                <ArrowUp className="size-3.5" />
              </button>
              <button
                type="button"
                disabled={i === selected.length - 1}
                onClick={() => move(i, 1)}
                className="text-muted-foreground hover:text-foreground disabled:opacity-30"
                aria-label="Move down"
              >
                <ArrowDown className="size-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onChange(selected.filter((n) => n !== id))}
                className="text-muted-foreground hover:text-destructive"
                aria-label="Remove"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
      {remaining.length > 0 && (
        <Select value={undefined} onValueChange={(id) => onChange([...selected, id])}>
          <SelectTrigger className="h-7 w-full text-[0.82em]">
            <SelectValue placeholder="Add parameter..." />
          </SelectTrigger>
          <SelectContent>
            {remaining.map((opt) => (
              <SelectItem key={opt.id} value={opt.id}>
                {opt.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  )
}

function JsonControl({ value, onChange }: { value: unknown; onChange: (v: unknown) => void }) {
  const [text, setText] = useState(() => JSON.stringify(value ?? {}, null, 2))
  const [error, setError] = useState(false)

  useEffect(() => setText(JSON.stringify(value ?? {}, null, 2)), [value])

  return (
    <>
      <Textarea
        rows={2}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          try {
            onChange(JSON.parse(text))
            setError(false)
          } catch {
            setError(true)
          }
        }}
        className="text-[0.82em]"
      />
      {error && <span className="text-[0.85em] text-destructive">Invalid JSON -- not saved</span>}
    </>
  )
}
