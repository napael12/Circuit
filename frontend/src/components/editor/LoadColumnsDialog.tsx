import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface Props {
  onReplace: () => void
  onAddOnly: () => void
  onClose: () => void
  /** "columns" (default) or "cards" (specs/kpi.md) -- wording only, same replace-vs-add mechanism either way. */
  itemLabel?: string
}

/** specs: "If columns already exist, prompt user to either a. replace all columns or b. only add new columns." */
export function LoadColumnsDialog({ onReplace, onAddOnly, onClose, itemLabel = 'columns' }: Props) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Load {itemLabel}</DialogTitle>
        </DialogHeader>
        <p className="text-[0.85em] text-muted-foreground">
          This control already has {itemLabel}. Replace them all with {itemLabel} loaded from the datastore, or only
          add {itemLabel} for fields that aren't already there?
        </p>
        <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="outline" size="sm" onClick={onAddOnly}>
            Add new only
          </Button>
          <Button size="sm" onClick={onReplace}>
            Replace all
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
