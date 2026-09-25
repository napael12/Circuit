import { useCallback, useEffect, useState } from 'react'

import { api } from '../api/client'
import type { Datastore, DatastorePreviewResult, PanelDatastoreRef } from '../api/types'
import { discoverAllParams } from '../utils/sqlParams'
import { useDatastoreSocket } from '../ws/useDatastoreSocket'

/**
 * Editor Preview tab only (see `previewMode` below): caps every datastore
 * fetch to this many rows so an in-progress panel stays responsive against
 * large real data while it's being designed. Never applied to the live
 * viewer or a saved dashboard's own data.
 */
const PREVIEW_MAX_ROWS = 100

interface UseDatastoreResult {
  data: unknown[] | unknown
  loading: boolean
  error: string | null
  /**
   * How this datastore is loaded (specs/datasource_enhancements.md's
   * on-demand/scheduled indicator) -- null for local datastores or before
   * a global datastore's own definition has loaded. Local datastores are
   * always on_demand (see api/types.ts's PanelDatastoreRef doc comment).
   */
  refreshMode: 'on_demand' | 'scheduled' | null
  /** refresh_mode=scheduled only: when the server last actually ran this datastore. */
  lastRunAt: string | null
  /**
   * Re-runs this control's own on_demand datastore against its current
   * params, bypassing nothing else on the panel. A no-op for
   * refresh_mode='scheduled' (that data only ever changes via the
   * scheduler's own websocket push -- there's no per-control "run it now").
   */
  refresh: () => void
}

/** Only the entries of `params` whose name is in `names` -- used so a datastore's own effect only re-fires on a param it actually references. */
function pickParams(params: Record<string, string>, names: string[]): Record<string, string> {
  const picked: Record<string, string> = {}
  for (const name of names) {
    if (name in params) picked[name] = params[name]
  }
  return picked
}

/**
 * Fetches data for one panel control from its Datastore, resolving
 * `datastoreRef` (a PanelNode.datastore value) against this panel's own
 * `content.datastores` list by `name`.
 *
 * `params` carries every current panel parameter value (see
 * useReactiveDatastoreParams), but each datastore only actually reacts to
 * the ${name}/:name tokens *its own* SQL/config text references -- narrowing
 * to that subset before it drives the fetch effect means a datastore with no
 * parameters at all (or ones unrelated to whatever just changed) never
 * refetches on an unrelated parameter change.
 *
 * scope='global' entries reference a shared datastore.models.Datastore row
 * (by `name`, which *is* that row's id): on_demand ones are re-run on the
 * server every time a relevant param changes; scheduled ones are never
 * queried directly by the browser -- the server-side scheduler
 * (datastore/scheduler.py) runs them and pushes results over a websocket
 * (datastore/consumers.py), this hook just subscribes to that push.
 *
 * scope='local' entries are normally resolved via `panelId` against the
 * *saved* panel JSON, never the in-progress client-side definition (see
 * panels/views.py::local_datastore) -- except in `previewMode` (the
 * editor's own Preview tab), where the full in-progress entry is run
 * directly through /datastores/preview-config/ instead, so local datastores
 * work in Preview even before the panel has ever been saved.
 */
export function useDatastore(
  datastoreRef: string | undefined,
  panelDatastores: PanelDatastoreRef[],
  params: Record<string, string>,
  panelId?: string,
  previewMode?: boolean,
): UseDatastoreResult {
  const entry = panelDatastores.find((d) => d.name === datastoreRef)
  const [refreshToken, setRefreshToken] = useState(0)
  const refresh = useCallback(() => setRefreshToken((t) => t + 1), [])

  const local = useLocalDatastore(entry?.scope === 'local' ? entry : null, panelId, params, !!previewMode, refreshToken)
  const global = useGlobalDatastore(
    entry?.scope === 'local' ? undefined : datastoreRef,
    params,
    refreshToken,
    !!previewMode,
  )

  return { ...(entry?.scope === 'local' ? local : global), refresh }
}

function useLocalDatastore(
  entry: PanelDatastoreRef | null,
  panelId: string | undefined,
  params: Record<string, string>,
  previewMode: boolean,
  refreshToken: number,
): Omit<UseDatastoreResult, 'refresh'> {
  const [data, setData] = useState<unknown>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const relevantParamNames = entry
    ? discoverAllParams(
        entry.inline_sql, entry.object_key, entry.object_url, entry.body, entry.data_url,
        entry.request_body, entry.file_path, entry.file_expression,
        entry.request_params ? JSON.stringify(entry.request_params) : undefined,
        entry.renderer_config ? JSON.stringify(entry.renderer_config) : undefined,
      )
    : null
  const relevantParams = relevantParamNames ? pickParams(params, relevantParamNames) : params
  const paramsKey = JSON.stringify(relevantParams)

  useEffect(() => {
    if (!entry) return
    if (!previewMode && !panelId) {
      setError('Save the dashboard before local datastores can load data.')
      setLoading(false)
      return
    }
    let cancelled = false
    setLoading(true)
    setError(null)
    const request = previewMode
      ? api
          .post<DatastorePreviewResult>('/datastores/preview-config/', {
            ...entry,
            params: relevantParams,
            limit: entry.row_limit ? Math.min(entry.row_limit, PREVIEW_MAX_ROWS) : PREVIEW_MAX_ROWS,
          })
          .then((res) => {
            if (res.ok) return { data: res.data }
            throw new Error(res.message ?? 'Preview failed')
          })
      : api.post<{ data: unknown }>(`/panels/${panelId}/local-datastore/`, { local_id: entry.id, params: relevantParams })
    request
      .then((res) => !cancelled && setData(res.data))
      .catch((err) => !cancelled && setError(String(err)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // paramsKey captures deep-equality of relevantParams for us.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entry?.id, panelId, paramsKey, previewMode, refreshToken])

  return { data, loading, error, refreshMode: entry ? 'on_demand' : null, lastRunAt: null }
}

function useGlobalDatastore(
  datastoreId: string | undefined,
  params: Record<string, string>,
  refreshToken: number,
  previewMode: boolean,
): Omit<UseDatastoreResult, 'refresh'> {
  const [refreshMode, setRefreshMode] = useState<Datastore['refresh_mode'] | null>(null)
  const [apiMode, setApiMode] = useState<Datastore['api_mode'] | null>(null)
  const [rowLimit, setRowLimit] = useState<number | null>(null)
  // null until the datastore's own referenced param names have loaded (see
  // below) -- until then every current param is used, same as before this
  // narrowing existed, so the very first fetch isn't missing a param.
  const [relevantParamNames, setRelevantParamNames] = useState<string[] | null>(null)
  // The initial GET's last_run_at, shown for a scheduled datastore until its
  // first websocket push arrives (which then takes over, see below).
  const [initialLastRunAt, setInitialLastRunAt] = useState<string | null>(null)
  const [demandData, setDemandData] = useState<unknown>(undefined)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!datastoreId) {
      setLoading(false)
      return
    }
    let cancelled = false
    Promise.all([api.get<Datastore>(`/datastores/${datastoreId}/`), api.get<string[]>(`/datastores/${datastoreId}/params/`)])
      .then(([ds, paramNames]) => {
        if (cancelled) return
        setRefreshMode(ds.refresh_mode)
        setApiMode(ds.api_mode)
        setRowLimit(ds.row_limit)
        setInitialLastRunAt(ds.last_run_at)
        setRelevantParamNames(paramNames)
      })
      .catch((err) => {
        if (!cancelled) {
          setError(String(err))
          setLoading(false)
        }
      })
    return () => {
      cancelled = true
    }
  }, [datastoreId])

  const relevantParams = relevantParamNames ? pickParams(params, relevantParamNames) : params
  const paramsKey = JSON.stringify(relevantParams)

  useEffect(() => {
    if (!datastoreId || refreshMode !== 'on_demand') return
    let cancelled = false
    setLoading(true)
    setError(null)
    // Preview mode (the editor's own Preview tab) hits the same ad-hoc,
    // always-fresh /preview/ endpoint the manager's datastore preview uses,
    // just to pass a row cap -- /data/ (the live viewer's path) has no way
    // to override the datastore's own row_limit for a single call.
    const request = previewMode
      ? api
          .post<DatastorePreviewResult>(`/datastores/${datastoreId}/preview/`, {
            params: relevantParams,
            limit: rowLimit ? Math.min(rowLimit, PREVIEW_MAX_ROWS) : PREVIEW_MAX_ROWS,
          })
          .then((res) => {
            if (res.ok) return { data: res.data }
            throw new Error(res.message ?? 'Preview failed')
          })
      : api.post<{ data: unknown }>(`/datastores/${datastoreId}/data/`, relevantParams)
    request
      .then((res) => !cancelled && setDemandData(res.data))
      .catch((err) => !cancelled && setError(String(err)))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
    // paramsKey captures deep-equality of relevantParams for us.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [datastoreId, refreshMode, paramsKey, refreshToken, previewMode, rowLimit])

  // Push mode (specs/api_datastore.md) broadcasts over the same
  // datastore_<id> websocket group scheduled refreshes use, regardless of
  // refresh_mode -- so this datastore's socket needs to be open whenever
  // either is true. For scheduled, that socket is the *only* source of
  // data (see below); for push (normally refresh_mode=on_demand), the
  // on-demand fetch above still runs too, so a push-enabled datastore has
  // real data to show even before its first push arrives.
  const usesSocket = refreshMode === 'scheduled' || apiMode === 'push'
  const { data: pushedData, lastRunAt: pushedLastRunAt } = useDatastoreSocket(usesSocket ? datastoreId : undefined)

  useEffect(() => {
    if (refreshMode === 'scheduled') setLoading(pushedData === undefined)
  }, [refreshMode, pushedData])

  return {
    data: refreshMode === 'scheduled' ? pushedData : usesSocket && pushedData !== undefined ? pushedData : demandData,
    loading,
    error,
    refreshMode,
    lastRunAt: usesSocket ? (pushedLastRunAt ?? initialLastRunAt) : null,
  }
}
