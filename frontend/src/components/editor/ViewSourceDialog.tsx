import type { ReactNode } from 'react'
import { Copy } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'

interface Props {
  title: ReactNode
  value: unknown
  onClose: () => void
}

/** Read-only JSON view of a single tree node, parameter, or datastore -- specs: "display dialog with control json code (view source)". */
export function ViewSourceDialog({ title, value, onClose }: Props) {
  const json = JSON.stringify(value, null, 2)

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[80vh] flex-col sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        <pre className="min-h-0 flex-1 overflow-auto rounded-lg border border-border bg-muted/30 p-3 text-xs">{json}</pre>
        <DialogFooter className="items-center sm:justify-between">
          <Button
            variant="ghost"
            size="sm"
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(json)
                toast.success('Copied.')
              } catch {
                toast.error('Clipboard access was denied.')
              }
            }}
          >
            <Copy />
            Copy
          </Button>
          <Button variant="outline" size="sm" onClick={onClose}>
            Close
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
