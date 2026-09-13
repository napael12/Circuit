import type { MouseEvent } from 'react'

import { cn } from '@/lib/utils'

interface Props {
  direction: 'horizontal' | 'vertical'
  onMouseDown: (e: MouseEvent) => void
}

/** A thin draggable divider between two resizable panes -- see hooks/useResizable.ts. */
export function ResizeHandle({ direction, onMouseDown }: Props) {
  return (
    <div
      onMouseDown={onMouseDown}
      className={cn(
        'relative flex-none touch-none bg-border transition-colors hover:bg-accent/60 active:bg-accent/80',
        direction === 'horizontal'
          ? 'w-px cursor-col-resize before:absolute before:inset-y-0 before:-left-1.5 before:-right-1.5 before:content-[""]'
          : 'h-px cursor-row-resize before:absolute before:inset-x-0 before:-top-1.5 before:-bottom-1.5 before:content-[""]',
      )}
    />
  )
}
