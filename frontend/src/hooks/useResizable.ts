import { useCallback, useEffect, useState, type MouseEvent as ReactMouseEvent } from 'react'

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value))
}

interface Options {
  min?: number
  max?: number
  /** 'horizontal' = dragging left/right resizes a width; 'vertical' = dragging up/down resizes a height. */
  direction: 'horizontal' | 'vertical'
}

/**
 * A single draggable pixel dimension (width or height), persisted to
 * localStorage under `storageKey` so it survives reloads -- used by the
 * panel editor's tree/properties/canvas splits.
 */
export function useResizable(
  storageKey: string,
  defaultSize: number,
  { min = 120, max = 800, direction }: Options,
): [number, (e: ReactMouseEvent) => void] {
  const [size, setSize] = useState<number>(() => {
    try {
      const stored = Number(localStorage.getItem(storageKey))
      return Number.isFinite(stored) && stored > 0 ? clamp(stored, min, max) : defaultSize
    } catch {
      return defaultSize
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(storageKey, String(size))
    } catch {
      // localStorage unavailable (private browsing, etc.) -- size just won't persist.
    }
  }, [storageKey, size])

  const startDrag = useCallback(
    (e: ReactMouseEvent) => {
      e.preventDefault()
      const startPos = direction === 'horizontal' ? e.clientX : e.clientY
      const startSize = size

      const onMove = (ev: globalThis.MouseEvent) => {
        const pos = direction === 'horizontal' ? ev.clientX : ev.clientY
        setSize(clamp(startSize + (pos - startPos), min, max))
      }
      const onUp = () => {
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
      }
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    [direction, size, min, max],
  )

  return [size, startDrag]
}
