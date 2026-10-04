import type { PanelDatastoreRef } from '../api/types'

/**
 * `{name: ref}` for every panel-local datastore in `refs` -- the
 * `local_datastores` request field every "preview an in-progress local
 * datastore" call site sends alongside its own definition, so the backend
 * can resolve an access_type=datastore + source_datastore_scope='local'
 * reference to a *local sibling*, which (being itself unsaved/in-progress)
 * has no saved row to look up otherwise -- see
 * datastore.views.DatastoreViewSet.preview_config and
 * datastore.services.datastore_from_dict on the backend.
 *
 * Only needed for a *preview* of an unsaved definition: the live/saved path
 * (PanelViewSet.local_datastore) re-reads the whole saved panel itself and
 * needs nothing from the client.
 */
export function localDatastoresPayload(refs: PanelDatastoreRef[]): Record<string, PanelDatastoreRef> {
  return Object.fromEntries(refs.filter((r) => r.scope === 'local' && r.name).map((r) => [r.name, r]))
}
