import { cn } from '@/lib/utils'

import { ParamField } from '../layout/ParametersDialog'
import { useAllParameterValues, usePanelParameters, useSetParameter } from '../layout/ParameterContext'
import { ControlContextMenu } from './ControlContextMenu'
import type { ControlProps } from './types'

const noop = () => {}

/**
 * An inline, always-visible form for every non-hidden panel parameter --
 * the same list and the same per-parameter field (plain input, single-
 * column select, or multi-column lookup table -- see ParamField) as the
 * dashboard-level Parameters dialog (ParametersDialog.tsx), but embedded as
 * a regular content control instead of opened on demand. Unlike that
 * dialog's own draft-then-Apply form, a change here is applied immediately
 * -- there's no separate "close" step for an always-visible control to hang
 * an Apply button off of, and every other control that sets a parameter
 * itself (e.g. DatatableControl's click-to-select column) already applies
 * on interaction the same way.
 *
 * No datastore of its own (the parameter list comes from the panel's own
 * parameters, not a control-level `component.datastore`), so refresh/export
 * are both no-ops here, same as HtmlControl.
 */
export function ParametersControl({ component, datastores, previewMode }: ControlProps) {
  const parameters = usePanelParameters()
  const values = useAllParameterValues()
  const setParameter = useSetParameter()
  const horizontal = component.direction === 'horizontal'

  return (
    <ControlContextMenu
      onRefresh={noop}
      canRefresh={false}
      onExport={noop}
      canExport={false}
      drilldownIds={component.drilldownIds}
      linkIds={component.linkIds}
    >
      {parameters.length === 0 ? (
        <div className="flex h-full items-center justify-center text-[0.85em] text-muted-foreground">No parameters to show</div>
      ) : (
        <div className={cn('h-full w-full overflow-auto p-2.5', horizontal ? 'flex flex-row flex-wrap gap-x-4 gap-y-2.5' : 'flex flex-col gap-2.5')}>
          {parameters.map((param) => (
            <div key={param.name} className={horizontal ? 'w-[180px] shrink-0' : ''}>
              <label className="mb-1 block truncate text-[0.78em] text-muted-foreground">{param.label}</label>
              <ParamField
                param={param}
                datastores={datastores}
                previewMode={previewMode}
                value={values[param.name] ?? ''}
                onChange={(v) => setParameter(param.name, v, component.id)}
              />
            </div>
          ))}
        </div>
      )}
    </ControlContextMenu>
  )
}
