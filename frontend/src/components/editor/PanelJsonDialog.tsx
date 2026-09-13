import { useState } from 'react'
import { ClipboardPaste, Copy, TriangleAlert } from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

import type { PanelContent } from '../../api/types'
import { isPanelContent } from './panelTree'

interface Props {
  content: PanelContent
  onApply: (content: PanelContent) => void
  onClose: () => void
}

/**
 * Raw-JSON view of a dashboard's *entire* content -- parameters, datastores,
 * and the component tree together -- as opposed to ViewSourceDialog, which
 * is read-only and scoped to one tree node. Editable and pasteable so a
 * dashboard (or pieces of it) can be copied between dashboards wholesale by
 * round-tripping through the clipboard.
 *
 * Applying only replaces the in-editor `content` state, same as any other
 * edit here -- it still goes through the normal dirty/Save flow rather than
 * writing straight to the backend, so a bad paste can be undone by
 * navigating away without saving.
 */
export function PanelJsonDialog({ content, onApply, onClose }: Props) {
  const [text, setText] = useState(() => JSON.stringify(content, null, 2))
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
    if (!isPanelContent(parsed)) {
      setError("Doesn't look like dashboard content -- expected \"parameters\", \"datastores\", and a single-root \"content\" array.")
      return
    }
    onApply(parsed)
    toast.success('Applied -- click Save to persist.')
    onClose()
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Dashboard JSON</DialogTitle>
        </DialogHeader>
        <Alert variant="destructive">
          <TriangleAlert />
          <AlertDescription>
            This edits parameters, datastores, and the component tree directly, bypassing the visual editor's own checks. Invalid
            JSON is rejected, but a technically valid change can still break the dashboard -- review before applying.
          </AlertDescription>
        </Alert>
        <Textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setError(null)
          }}
          spellCheck={false}
          className="min-h-[50vh] flex-1 resize-none font-mono text-xs"
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
