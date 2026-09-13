import { useEffect, useState } from 'react'
import { Info } from 'lucide-react'

import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'

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
  onChange: (patch: Record<string, unknown>) => void
}

/** A vertical name/value property table (specs/ui_editor/control_properties.png) driven by a FieldSchema. */
export function PropertyPanel({ title, record, schema, datastoreOptions, drilldownOptions = [], linkOptions = [], onChange }: Props) {
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
  onChange,
}: {
  field: FieldSchema
  record: Record<string, unknown>
  datastoreOptions: string[]
  drilldownOptions: { id: string; name: string }[]
  linkOptions: { id: string; name: string }[]
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
            onChange={set}
          />
        </div>
        {/* Help used to render as its own wrapped line under the control --
            replaced with a hover-only icon (native `title`, no separate
            Tooltip component) so every row stays a single line. */}
        {field.help && (
          <span title={field.help} className="shrink-0 text-muted-foreground">
            <Info className="h-3.5 w-3.5" />
          </span>
        )}
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
  onChange,
}: {
  field: FieldSchema
  value: unknown
  datastoreOptions: string[]
  drilldownOptions: { id: string; name: string }[]
  linkOptions: { id: string; name: string }[]
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
    const options = field.dynamicOptions === 'links' ? linkOptions : drilldownOptions
    const selected = Array.isArray(value) ? (value as string[]) : []
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
