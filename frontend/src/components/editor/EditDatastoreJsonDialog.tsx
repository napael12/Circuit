import { useState } from 'react'
import { ClipboardPaste, Copy, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

import type { PanelDatastoreRef } from '../../api/types'
import { isPanelDatastoreRef } from './panelTree'

interface Props {
  datastore: PanelDatastoreRef
  onApply: (datastore: PanelDatastoreRef) => void
  onClose: () => void
}

/**
 * Raw-JSON editor for a single local datastore -- same pattern as
 * EditParameterJsonDialog/EditComponentJsonDialog, scoped to one
 * PanelDatastoreRef. Local only: a global-scope entry here is just
 * {id,name,scope}, a pointer to the Manager's own shared Datastore row with
 * no definition of its own to edit (ComponentTree already restricts this
 * dialog, and Copy, to scope='local' for the same reason -- see its own
 * comment). `id`/`name`/`scope` must stay unchanged -- `name` is what
 * components on this panel reference it by (component.datastore), `id` is
 * this entry's own key in content.datastores, and changing `scope` here
 * would silently turn a full local definition into a dangling global
 * pointer or vice versa; anything else -- source_type, access_type, the
 * query/body/renderer config, default_params, etc. -- can be edited freely.
 *
 * Applying only replaces this entry in the in-editor content.datastores
 * array, same as any other edit here -- it still goes through the normal
 * dirty/Save flow rather than writing straight to the backend.
 */
export function EditDatastoreJsonDialog({ datastore, onApply, onClose }: Props) {
  const [text, setText] = useState(() => JSON.stringify(datastore, null, 2))
  const [error, setError] = useState<string | null>(null)

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

  const handleApply = () => {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (err) {
      setError(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`)
      return
    }
    if (!isPanelDatastoreRef(parsed)) {
      setError('Doesn\'t look like a datastore -- expected an "id", a "name", and "scope" of "global" or "local".')
      return
    }
    if (parsed.id !== datastore.id || parsed.name !== datastore.name || parsed.scope !== datastore.scope) {
      setError(`"id", "name" and "scope" can't be changed here -- expected id "${datastore.id}", name "${datastore.name}", scope "${datastore.scope}".`)
      return
    }
    onApply(parsed)
    toast.success('Applied -- click Save to persist.')
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>
            Edit JSON: {datastore.name} <span className="text-muted-foreground">({datastore.scope})</span>
          </DialogTitle>
        </DialogHeader>
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>
            This edits the datastore directly, bypassing the visual editor's own checks. Invalid JSON is rejected, but a
            technically valid change -- an unknown field, a broken connection/parameter reference -- can still break the
            dashboard. Review before applying, and Save to persist.
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
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleApply}>
              Apply
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
