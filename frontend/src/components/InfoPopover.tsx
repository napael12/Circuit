import type { ReactNode } from 'react'
import { Info } from 'lucide-react'

import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { cn } from '@/lib/utils'

interface Props {
  children: ReactNode
  /** Icon size classes -- callers' two current icon sizes differ (PropertyPanel's dense rows vs. the viewer toolbar's title). */
  iconClassName?: string
  className?: string
}

/**
 * An (i) icon that opens a Popover (to its right) showing `children` --
 * replaces a plain `title` attribute's native hover tooltip, which doesn't
 * reliably appear in every browser (touch devices never show it at all, and
 * some desktop browsers/extensions suppress it outright) and isn't something
 * CSS/JS can force open more reliably, since that behavior is the browser's
 * own, not ours to adjust. Click-triggered instead of hover-triggered, so
 * this is plain React-rendered UI rather than depending on the browser.
 */
export function InfoPopover({ children, iconClassName, className }: Props) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          aria-label="More info"
          className={cn('inline-flex shrink-0 items-center text-muted-foreground hover:text-foreground', className)}
        >
          <Info className={cn('h-3.5 w-3.5', iconClassName)} />
        </button>
      </PopoverTrigger>
      <PopoverContent side="right" align="start" className="w-72 text-[0.8em] text-popover-foreground" onClick={(e) => e.stopPropagation()}>
        {children}
      </PopoverContent>
    </Popover>
  )
}
