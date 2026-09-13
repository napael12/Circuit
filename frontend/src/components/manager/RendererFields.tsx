import { Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field } from '@/components/Field'

import type { RendererColumn, RendererField, RendererType } from '../../api/types'

const RENDERER_OPTIONS: { value: RendererType; label: string }[] = [
  { value: 'none', label: 'None (raw content)' },
  { value: 'json', label: 'JSON (JsonPath columns)' },
  { value: 'xml', label: 'XML (XPath columns)' },
  { value: 'delimited', label: 'Delimited text' },
  { value: 'fixed_width', label: 'Fixed width' },
]

interface Props {
  rendererType: RendererType
  config: Record<string, unknown>
  onChange: (rendererType: RendererType, config: Record<string, unknown>) => void
  /** Smaller control heights for the panel-embedded local-datastore card. */
  compact?: boolean
}

/**
 * The Renderer interface's config UI (specs/datasource_enhancements.md):
 * turns REST/S3/File raw content into rows/columns. Shared between the
 * manager's global DatastoreDialog and the editor's LocalDatastoresPanel so
 * the JsonPath/XPath/delimiter/fixed-width editors aren't duplicated.
 */
export function RendererFields({ rendererType, config, onChange, compact }: Props) {
  const h = compact ? 'h-7' : 'h-8'
  const textSize = 'text-[0.85em]'

  const columns = (config.columns as RendererColumn[] | undefined) ?? []
  const setColumns = (next: RendererColumn[]) => onChange(rendererType, { ...config, columns: next })

  const fields = (config.fields as RendererField[] | undefined) ?? []
  const setFields = (next: RendererField[]) => onChange(rendererType, { ...config, fields: next })

  return (
    <div className="flex flex-col gap-2">
      <Field label="Renderer">
        <Select value={rendererType} onValueChange={(v) => onChange(v as RendererType, config)}>
          <SelectTrigger className={`${h} w-full ${textSize}`}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {RENDERER_OPTIONS.map((opt) => (
              <SelectItem key={opt.value} value={opt.value}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </Field>

      {(rendererType === 'json' || rendererType === 'xml') && (
        <>
          <Field label="Root path" helperText={rendererType === 'json' ? 'JsonPath selecting the row nodes, e.g. $.items[*]' : 'XPath selecting the row elements, e.g. //row'}>
            <Input
              value={(config.root_path as string) ?? ''}
              onChange={(e) => onChange(rendererType, { ...config, root_path: e.target.value })}
              className={`${h} font-mono ${textSize}`}
            />
          </Field>
          <div>
            <div className="mb-1 text-[0.78em] text-muted-foreground">
              Columns {rendererType === 'json' ? '(JsonPath per column, relative to each row)' : '(XPath per column, relative to each row)'}
            </div>
            <div className="flex flex-col gap-1">
              {columns.map((col, i) => (
                <div key={i} className="flex items-center gap-2">
                  <Input
                    placeholder="Column name"
                    value={col.name}
                    onChange={(e) => setColumns(columns.map((c, idx) => (idx === i ? { ...c, name: e.target.value } : c)))}
                    className={`${h} w-[160px] ${textSize}`}
                  />
                  <Input
                    placeholder={rendererType === 'json' ? 'JsonPath, e.g. info.name' : 'XPath, e.g. name/text()'}
                    value={col.path}
                    onChange={(e) => setColumns(columns.map((c, idx) => (idx === i ? { ...c, path: e.target.value } : c)))}
                    className={`${h} flex-1 font-mono ${textSize}`}
                  />
                  <Button variant="ghost" size="icon-sm" onClick={() => setColumns(columns.filter((_, idx) => idx !== i))}>
                    <Trash2 />
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" className="w-fit" onClick={() => setColumns([...columns, { name: '', path: '' }])}>
                <Plus />
                Add column
              </Button>
            </div>
          </div>
        </>
      )}

      {rendererType === 'delimited' && (
        <>
          <Field label="Delimiter">
            <Input
              value={(config.delimiter as string) ?? ','}
              onChange={(e) => onChange(rendererType, { ...config, delimiter: e.target.value })}
              className={`${h} w-[80px] font-mono ${textSize}`}
            />
          </Field>
          <label className="flex items-center gap-2 text-[0.85em]">
            <Checkbox
              checked={(config.has_header as boolean) ?? true}
              onCheckedChange={(checked) => onChange(rendererType, { ...config, has_header: !!checked })}
            />
            First row is a header
          </label>
          <Field label="Column names" helperText="Comma-separated. Optional if the first row is a header.">
            <Input
              value={((config.columns as string[] | undefined) ?? []).join(', ')}
              onChange={(e) =>
                onChange(rendererType, {
                  ...config,
                  columns: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                })
              }
              className={`${h} ${textSize}`}
            />
          </Field>
        </>
      )}

      {rendererType === 'fixed_width' && (
        <div>
          <div className="mb-1 text-[0.78em] text-muted-foreground">Fields (left to right)</div>
          <div className="flex flex-col gap-1">
            {fields.map((f, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  placeholder="Field name"
                  value={f.name}
                  onChange={(e) => setFields(fields.map((x, idx) => (idx === i ? { ...x, name: e.target.value } : x)))}
                  className={`${h} flex-1 ${textSize}`}
                />
                <Input
                  type="number"
                  placeholder="Width"
                  value={f.width ?? ''}
                  onChange={(e) => setFields(fields.map((x, idx) => (idx === i ? { ...x, width: Number(e.target.value) } : x)))}
                  className={`${h} w-[90px] ${textSize}`}
                />
                <Button variant="ghost" size="icon-sm" onClick={() => setFields(fields.filter((_, idx) => idx !== i))}>
                  <Trash2 />
                </Button>
              </div>
            ))}
            <Button variant="outline" size="sm" className="w-fit" onClick={() => setFields([...fields, { name: '', width: 10 }])}>
              <Plus />
              Add field
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}
