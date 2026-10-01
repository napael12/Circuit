import { useEffect } from 'react'

import type { PanelDatastoreRef } from '../../api/types'
import { useDatastore } from '../../hooks/useDatastore'
import { usePanelId, useSetParameter } from './ParameterContext'
import { useReactiveDatastoreParams } from './useComponentParams'

interface Props {
  datastores: PanelDatastoreRef[]
  previewMode?: boolean
}

/**
 * "Set Parameter" (Datastore.set_parameter_name): the headless half of the
 * feature -- mounted once by ParameterProvider for *every* datastore the
 * panel declares, local or global, regardless of whether any control
 * actually displays it. Each one independently fetches via the same
 * useDatastore() hook every real control uses (so it reacts to ${param}
 * changes, respects on_demand/scheduled, preview mode, etc. for free), and
 * -- only once useDatastore reports a configured target parameter -- writes
 * the already-computed set_parameter_value (the entire fetch, serialized;
 * see services._run_uncached) into it whenever fresh data arrives.
 *
 * Mounting one per PanelDatastoreRef unconditionally (rather than only for
 * ones known to be configured) is the cost of supporting this for *any*
 * global datastore headlessly: a global ref's set_parameter_name lives on
 * the shared Datastore row, not in the panel's own JSON, so there's no way
 * to know without asking the server -- same metadata GET useDatastore's own
 * global path already issues for refresh_mode/row_limit/etc. A datastore
 * that's *also* bound to a visible control ends up fetched twice (once via
 * that control's own useDatastore call, once here); accepted as a
 * reasonable v1 simplification rather than deduping across the two.
 */
export function ParameterSourceDatastores({ datastores, previewMode }: Props) {
  return (
    <>
      {datastores.map((ref) => (
        <ParameterSourceDatastore key={ref.id} reference={ref} datastores={datastores} previewMode={previewMode} />
      ))}
    </>
  )
}

function ParameterSourceDatastore({
  reference,
  datastores,
  previewMode,
}: {
  reference: PanelDatastoreRef
  datastores: PanelDatastoreRef[]
  previewMode?: boolean
}) {
  const panelId = usePanelId()
  const setParameter = useSetParameter()
  // Same componentId-shaped origin convention every real control already uses (e.g.
  // DatatableControl's click-to-set-parameter) -- lets this datastore skip reacting
  // to a parameter change it just caused itself, same self-loop guard every other
  // datastore-param interaction gets from useReactiveDatastoreParams.
  const originId = `datastore:${reference.id}`
  const params = useReactiveDatastoreParams(originId)
  const { setParameterName, setParameterValue } = useDatastore(reference.name, datastores, params, panelId, previewMode)

  useEffect(() => {
    if (!setParameterName || setParameterValue == null) return
    setParameter(setParameterName, setParameterValue, originId)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [setParameterName, setParameterValue])

  return null
}
