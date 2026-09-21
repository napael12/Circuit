import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Field } from '@/components/Field'

import type { DataConnection, Datastore, PanelDatastoreRef } from '../../api/types'
import { DatastoreDialog } from '../manager/DatastoreDialog'
import { newId } from './panelTree'

interface Props {
  /** null = adding a new reference. */
  initial: PanelDatastoreRef | null
  globalDatastoreIds: string[]
  connections: DataConnection[]
  onClose: () => void
  onSave: (ref: PanelDatastoreRef) => void
}

/**
 * Adapts a scope=local PanelDatastoreRef into the Datastore shape
 * manager.DatastoreDialog edits -- the global-only fields (api_mode,
 * refresh_mode, allowed_roles, ...) get fixed placeholder values since
 * DatastoreDialog hides those sections entirely under scope='local'.
 */
function refToDatastore(ref: PanelDatastoreRef): Datastore {
  return {
    id: ref.name,
    source_type: ref.source_type ?? 'query',
    access_type: ref.access_type ?? '',
    connection: ref.connection ?? null,
    sql_def: null,
    inline_sql: ref.inline_sql ?? '',
    row_limit: ref.row_limit ?? null,
    cache_seconds: null,
    object_key: ref.object_key ?? '',
    object_url: ref.object_url ?? '',
    body: ref.body ?? '',
    data_url: ref.data_url ?? '',
    request_method: ref.request_method ?? 'GET',
    request_params: ref.request_params ?? {},
    request_body: ref.request_body ?? '',
    file_path: ref.file_path ?? '',
    file_expression: ref.file_expression ?? '',
    renderer_type: ref.renderer_type ?? 'none',
    renderer_config: ref.renderer_config ?? {},
    default_params: ref.default_params ?? {},
    api_mode: 'none',
    refresh_mode: 'on_demand',
    cron_schedule: '',
    idle_timeout_seconds: null,
    is_active: null,
    last_run_at: null,
    last_error: '',
    created_at: '',
    updated_at: '',
    allowed_roles: [],
  }
}

/**
 * Adding (or editing) one of this panel's datastore references
 * (specs/panel_design.md: "present a dialog to either select existing
 * datastores or create 'Local' Datastore"). Existing = a shared global
 * Datastore, referenced by id -- a small picker below. Local = the exact
 * same dialog the Manager uses to edit global datastores
 * (manager.DatastoreDialog, scope='local'), embedded directly in this
 * panel's own JSON instead of saved via the API -- always on-demand, no
 * Access roles/API mode (see PanelDatastoreRef's own doc comment).
 */
export function DatastoreRefDialog({ initial, globalDatastoreIds, connections, onClose, onSave }: Props) {
  const [mode, setMode] = useState<'existing' | 'local'>(initial?.scope === 'local' ? 'local' : 'existing')
  const [globalName, setGlobalName] = useState(initial?.scope === 'global' ? initial.name : '')

  if (mode === 'local') {
    return (
      <DatastoreDialog
        scope="local"
        initial={initial?.scope === 'local' ? refToDatastore(initial) : null}
        localId={initial?.id}
        connections={connections}
        onClose={onClose}
        onSaveLocal={onSave}
      />
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{initial ? 'Edit datastore' : 'Add datastore'}</DialogTitle>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as 'existing' | 'local')}>
          <TabsList className="w-full">
            <TabsTrigger value="existing" className="flex-1">
              Select existing
            </TabsTrigger>
            <TabsTrigger value="local" className="flex-1">
              Create local
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <Field label="Global datastore">
          <Select value={globalName} onValueChange={setGlobalName}>
            <SelectTrigger className="h-8 w-full text-[0.85em]">
              <SelectValue placeholder="none" />
            </SelectTrigger>
            <SelectContent>
              {globalDatastoreIds.map((id) => (
                <SelectItem key={id} value={id}>
                  {id}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button
            size="sm"
            disabled={!globalName}
            onClick={() => onSave({ id: initial?.id ?? newId('ds'), name: globalName, scope: 'global' })}
          >
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
