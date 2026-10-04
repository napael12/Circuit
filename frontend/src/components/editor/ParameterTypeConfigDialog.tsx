import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

import type { PanelParameter } from '../../api/types'
import { PropertyPanel } from './PropertyPanel'
import { PARAMETER_TYPE_CONFIG_SCHEMAS } from './propertySchemas'

/** Matches PARAMETER_TYPE_CONFIG_SCHEMAS' keys -- the dialog's own title per Parameter type. */
const TYPE_LABELS: Record<NonNullable<PanelParameter['inputType']>, string> = {
  calendar: 'Calendar',
  range: 'Range Inputs',
  'selector-single': 'Selector (single)',
  'selector-multi': 'Selector (multi)',
  toggle: 'Toggle',
}

interface Props {
  parameter: PanelParameter
  datastoreOptions: string[]
  onApply: (patch: Record<string, unknown>) => void
  onClose: () => void
}

/**
 * specs/parameters3.md: the settings specific to one PanelParameter.inputType
 * (range bounds, toggle values, selector datastore/delimiter, calendar
 * format/default expression, ...) -- opened from a "Configure <Type>..."
 * button next to PARAMETER_SCHEMA's own flat field list (EditorPage.tsx's
 * SelectionProperties), rather than every type's fields always sitting in
 * that list regardless of which type is actually picked.
 *
 * Draft-then-Apply, same shape as ParametersDialog's own form -- reuses
 * PropertyPanel/FieldSchema for the fields themselves instead of a bespoke
 * form, picking whichever schema matches `parameter.inputType`.
 */
export function ParameterTypeConfigDialog({ parameter, datastoreOptions, onApply, onClose }: Props) {
  const [draft, setDraft] = useState<Record<string, unknown>>(parameter as unknown as Record<string, unknown>)

  // Shouldn't normally be reachable -- the "Configure" button that opens
  // this only renders once a Parameter type is picked -- but guards anyway
  // rather than rendering an empty dialog if it somehow is.
  if (!parameter.inputType) return null
  const schema = PARAMETER_TYPE_CONFIG_SCHEMAS[parameter.inputType]
  if (!schema) return null

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Configure: {TYPE_LABELS[parameter.inputType]}</DialogTitle>
        </DialogHeader>
        <PropertyPanel
          title={parameter.label || parameter.name}
          record={draft}
          schema={schema}
          datastoreOptions={datastoreOptions}
          onChange={(patch) => setDraft((d) => ({ ...d, ...patch }))}
        />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={() => {
              onApply(draft)
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
