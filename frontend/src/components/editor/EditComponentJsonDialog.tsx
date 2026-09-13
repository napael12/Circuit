import { useState } from 'react'
import { ClipboardPaste, Copy, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

import type { PanelNode } from '../../api/types'
import { isPanelNode } from './panelTree'

interface Props {
  node: PanelNode
  onApply: (node: PanelNode) => void
  onClose: () => void
}

/**
 * Raw-JSON editor for a single component (tree node) -- like PanelJsonDialog
 * but scoped to one node instead of the whole dashboard. `id`/`type` must
 * stay unchanged (the tree finds and nests this node by them); anything else
 * -- title, columns, datastore, etc. -- can be edited freely.
 *
 * Applying only replaces this node in the in-editor tree, same as any other
 * edit here -- it still goes through the normal dirty/Save flow rather than
 * writing straight to the backend, so a bad edit can be undone by navigating
 * away without saving.
 */
export function EditComponentJsonDialog({ node, onApply, onClose }: Props) {
  const [text, setText] = useState(() => JSON.stringify(node, null, 2))
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
    if (!isPanelNode(parsed)) {
      setError('Doesn\'t look like a component -- expected an "id" and a valid "type".')
      return
    }
    if (parsed.id !== node.id || parsed.type !== node.type) {
      setError(`"id" and "type" can't be changed here -- expected id "${node.id}" and type "${node.type}".`)
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
            Edit JSON: {node.title || node.fieldDisplay || node.field || node.id}{' '}
            <span className="text-muted-foreground">({node.type})</span>
          </DialogTitle>
        </DialogHeader>
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>
            This edits the component directly, bypassing the visual editor's own checks. Invalid JSON is rejected, but a
            technically valid change -- an unknown field, a broken datastore/parameter reference -- can still break the dashboard.
            Review before applying, and Save to persist.
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
