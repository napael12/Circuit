import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'

interface Props {
  onSubmit: (rows: unknown[]) => void
  onClose: () => void
}

/**
 * "Load Columns from JSON" -- infers columns the same way as Load Columns
 * from Datastore (buildColumnsFromSample), but from a pasted example record
 * instead of a live datastore's sample rows. Useful for a datastore that
 * isn't wired up yet, or columns that don't exactly match what the
 * datastore currently returns.
 */
export function LoadColumnsFromJsonDialog({ onSubmit, onClose }: Props) {
  const [text, setText] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = () => {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (err) {
      setError(`Invalid JSON: ${err instanceof Error ? err.message : String(err)}`)
      return
    }
    const rows = Array.isArray(parsed) ? parsed : [parsed]
    if (rows.length === 0 || !rows.every((r) => r && typeof r === 'object' && !Array.isArray(r))) {
      setError('Expected a single JSON object, or an array of objects.')
      return
    }
    onSubmit(rows)
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Load columns from JSON</DialogTitle>
        </DialogHeader>
        <p className="text-[0.85em] text-muted-foreground">
          Paste one example record (or an array of a few) -- columns are inferred the same way as loading from a
          datastore's sample rows.
        </p>
        <Textarea
          value={text}
          onChange={(e) => {
            setText(e.target.value)
            setError(null)
          }}
          placeholder={'{\n  "field": "value"\n}'}
          spellCheck={false}
          className="min-h-[40vh] flex-1 resize-none font-mono text-xs"
        />
        {error && <p className="text-xs text-destructive">{error}</p>}
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSubmit}>
            Load
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
