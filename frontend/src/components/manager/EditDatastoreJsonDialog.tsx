import { useState } from 'react'
import { ClipboardPaste, Copy, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

import { api } from '../../api/client'
import type { Datastore } from '../../api/types'

interface Props {
  datastore: Datastore
  onSaved: () => void
  onClose: () => void
}

/**
 * Fields DatastoreViewSet computes/manages itself -- shown for context (same
 * "shows everything, edits what's real" idea as the editor's own
 * EditComponentJsonDialog) but stripped before the PATCH is sent, since the
 * backend owns them and would ignore or reject an edited value anyway.
 */
const READONLY_FIELDS = ['is_active', 'last_run_at', 'last_error', 'created_at', 'updated_at'] as const

/**
 * Raw-JSON editor for a single global datastore (Manager > Datastores) --
 * same "Edit JSON" pattern as the editor's own EditComponentJsonDialog/
 * EditParameterJsonDialog/EditDatastoreJsonDialog, but for a saved
 * datastores.models.Datastore row rather than in-editor panel state: a
 * Manager row has no separate dirty/Save step (it's already persisted), so
 * Apply here PATCHes straight to the backend -- the same endpoint
 * DatastoreDialog's own Save button uses -- instead of just handing the
 * parsed value back to a parent to stage.
 *
 * `id` must stay unchanged (renaming a saved datastore isn't supported here,
 * same as DatastoreDialog's own disabled Name field while editing).
 */
export function EditDatastoreJsonDialog({ datastore, onSaved, onClose }: Props) {
  const [text, setText] = useState(() => JSON.stringify(datastore, null, 2))
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      toast.success('Copied.')
    } catch {
      toast.error('Clipboard access was denied.')
    }
  }

  const handlePaste = async () => {
    try {
      const clip = await navigator.clipboard.readText()
      setText(clip)
      setError(null)
    } catch {
      toast.error('Clipboard access was denied.')
    }
  }

  const handleApply = async () => {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (err) {
      setError(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`)
      return
    }
    if (!parsed || typeof parsed !== 'object' || typeof (parsed as Partial<Datastore>).id !== 'string') {
      setError('Doesn\'t look like a datastore -- expected an "id".')
      return
    }
    const next = parsed as Record<string, unknown>
    if (next.id !== datastore.id) {
      setError(`"id" can't be changed here -- expected "${datastore.id}".`)
      return
    }
    const payload = { ...next }
    for (const field of READONLY_FIELDS) delete payload[field]

    setSaving(true)
    setError(null)
    try {
      await api.patch(`/datastores/${datastore.id}/`, payload)
      toast.success('Saved.')
      onSaved()
      onClose()
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && !saving && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Edit JSON: {datastore.id}</DialogTitle>
        </DialogHeader>
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>
            This edits the datastore directly, bypassing the Configuration tab's own type-aware fields. Invalid JSON is
            rejected, but a technically valid change -- an unknown field, a broken connection/parameter reference -- can
            still break every dashboard using it. Apply saves immediately; there's no separate Save step here.
          </AlertDescription>
        </Alert>
        <Textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setError(null)
          }}
          spellCheck={false}
          className="min-h-[45vh] flex-1 resize-none font-mono text-xs"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <DialogFooter className="items-center sm:justify-between">
          <div className="flex gap-2">
            <Button variant="ghost" size="sm" onClick={handleCopy}>
              <Copy />
              Copy
            </Button>
            <Button variant="ghost" size="sm" onClick={handlePaste}>
              <ClipboardPaste />
              Paste
            </Button>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleApply} disabled={saving}>
              Apply
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
