import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

import type { DatastorePreviewResult } from '../../api/types'
import { DatastorePreviewPanel } from './DatastorePreviewPanel'

interface Props {
  title: string
  /** Param names discovered from the query/action so the dialog opens pre-populated. */
  initialParams: Record<string, string>
  onClose: () => void
  onRun: (params: Record<string, string>, limit: number) => Promise<DatastorePreviewResult>
}

export function DatastorePreviewDialog({ title, initialParams, onClose, onRun }: Props) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Preview: {title}</DialogTitle>
        </DialogHeader>
        <DatastorePreviewPanel initialParams={initialParams} onRun={onRun} name={title} />
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
