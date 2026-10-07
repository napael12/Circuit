import { useState } from 'react'
import { ChevronsUpDown } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

export interface SearchableSelectOption {
  value: string
  label: string
}

interface Props {
  value: string
  onValueChange: (value: string) => void
  options: SearchableSelectOption[]
  /** Shown in the trigger when nothing is selected, and as the search box's own placeholder. */
  placeholder?: string
  /** Included as its own selectable entry (value `''`) above the real options -- omit where a selection is always required (nothing else offers a way to clear it anyway). */
  noneLabel?: string
  emptyText?: string
  /** Trigger button classes -- height/text-size/etc, matched to wherever a plain shadcn Select would otherwise sit. */
  className?: string
  disabled?: boolean
}

/**
 * A searchable single-select combobox (reui's own Select is plain, non-
 * filterable -- see ParametersDialog.tsx's SelectorMultiField/
 * SelectorTableField for the same Command/Popover-based pattern already
 * used elsewhere for a large option list). Built for datastore pickers
 * specifically (a panel or a Manager-wide list can both get long) --
 * reusable anywhere else a plain Select's flat list stops being
 * comfortable to scan.
 */
export function SearchableSelect({ value, onValueChange, options, placeholder = 'Select...', noneLabel, emptyText = 'No matches.', className, disabled }: Props) {
  const [open, setOpen] = useState(false)
  const selected = options.find((o) => o.value === value)

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          disabled={disabled}
          className={cn('w-full justify-between font-normal', className)}
        >
          <span className={cn('truncate', !selected && 'text-muted-foreground')}>
            {selected ? selected.label : value || placeholder}
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-(--radix-popover-trigger-width) min-w-[200px] p-0" align="start">
        <Command>
          <CommandInput placeholder={placeholder} />
          <CommandList>
            <CommandEmpty>{emptyText}</CommandEmpty>
            <CommandGroup>
              {noneLabel !== undefined && (
                <CommandItem
                  value={`__none__ ${noneLabel}`}
                  data-checked={!value}
                  onSelect={() => {
                    onValueChange('')
                    setOpen(false)
                  }}
                >
                  <span className="text-muted-foreground">{noneLabel}</span>
                </CommandItem>
              )}
              {options.map((opt) => (
                <CommandItem
                  key={opt.value}
                  value={`${opt.value} ${opt.label}`}
                  data-checked={opt.value === value}
                  onSelect={() => {
                    onValueChange(opt.value)
                    setOpen(false)
                  }}
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
