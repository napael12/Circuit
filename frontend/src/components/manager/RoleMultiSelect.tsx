import { ChevronRight } from 'lucide-react'

import { Checkbox } from '@/components/ui/checkbox'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Field } from '@/components/Field'

import type { Role } from '../../api/types'

interface Props {
  roles: Role[]
  value: number[]
  onChange: (ids: number[]) => void
  disabled?: boolean
  helperText?: string
  label?: string
  /** Renders behind a disclosure toggle instead of always-open -- collapsed by default unless roles are already assigned. */
  collapsible?: boolean
}

function summarize(value: number[]): string {
  return value.length === 0 ? 'Everyone' : `${value.length} role${value.length === 1 ? '' : 's'}`
}

/**
 * specs/permissions.md: which roles may view/use this object -- empty means
 * everyone. Same checkbox-list shape as RecordDialog's inline `multiselect`
 * field type (used today for Users -> Roles), extracted here so the
 * bespoke Connection/Datastore/Dashboard editors can share it.
 */
export function RoleMultiSelect({
  roles,
  value,
  onChange,
  disabled,
  helperText,
  label = 'Access roles',
  collapsible,
}: Props) {
  const defaultHelperText = 'Leave empty to allow everyone. Otherwise, viewers need at least one of the selected roles.'

  const list = (
    // Fixed to ~4 rows regardless of how many roles exist, rather than
    // shrinking to fit -- scrolls internally past that (h-, not max-h-).
    <div className="flex h-32 flex-col gap-1 overflow-y-auto rounded-lg border border-input p-2">
      {roles.length === 0 && <span className="text-[0.8em] text-muted-foreground">No roles defined yet.</span>}
      {roles.map((role) => (
        <label key={role.id} className="flex items-center gap-2 text-[0.85em]">
          <Checkbox
            checked={value.includes(role.id)}
            disabled={disabled}
            onCheckedChange={(checked) => onChange(checked ? [...value, role.id] : value.filter((id) => id !== role.id))}
          />
          {role.name}
        </label>
      ))}
    </div>
  )

  if (!collapsible) {
    return (
      <Field label={label} helperText={helperText ?? defaultHelperText}>
        {list}
      </Field>
    )
  }

  return (
    <Collapsible defaultOpen={value.length > 0}>
      <CollapsibleTrigger className="flex w-full items-center gap-1.5 text-[0.78em] font-normal text-muted-foreground [&[data-state=open]>svg]:rotate-90">
        <ChevronRight className="size-3.5 shrink-0 transition-transform" />
        {label}
        <span className="ml-auto text-[0.78em] text-muted-foreground/70">{summarize(value)}</span>
      </CollapsibleTrigger>
      <CollapsibleContent className="flex flex-col gap-1 pt-1.5">
        {list}
        <span className="text-[0.72em] text-muted-foreground">{helperText ?? defaultHelperText}</span>
      </CollapsibleContent>
    </Collapsible>
  )
}
