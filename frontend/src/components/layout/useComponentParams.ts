import { useRef } from 'react'

import { useAllParameterValues, useParameterOrigins } from './ParameterContext'

/**
 * Every current panel parameter value, keyed by its own name -- passed as-is
 * to every control's datastore call (the backend only substitutes the
 * ${name}/:name tokens a given datastore's own SQL/config text actually
 * references, see datastore/services.py::run_datastore, so broadcasting the
 * full set is harmless and needs no per-component mapping table).
 *
 * Returns a **stable object reference** across renders where every changed
 * parameter's most recent origin is `componentId` itself -- so a control
 * whose own row click just set a parameter doesn't refetch/re-render off
 * that change (specs/panel_rendering.md's Control Interaction use-case:
 * "Render data on display controls, EXCEPT control originating the event").
 * A change from any other source (the Parameters dialog, another control,
 * on-load) always produces a new reference.
 */
export function useReactiveDatastoreParams(componentId?: string): Record<string, string> {
  const values = useAllParameterValues()
  const origins = useParameterOrigins(Object.keys(values))
  const stableRef = useRef(values)

  const changed = Object.keys(values).filter((name) => stableRef.current[name] !== values[name])
  if (changed.length > 0) {
    const allSelfCaused = !!componentId && changed.every((name) => origins[name] === componentId)
    if (!allSelfCaused) stableRef.current = values
  }

  return stableRef.current
}
