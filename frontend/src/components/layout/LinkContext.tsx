import { createContext, useContext, useMemo, type ReactNode } from 'react'

import type { PanelLink } from '../../api/types'
import { substituteParams } from '../../utils/panelTemplating'
import { useAllParameterValues } from './ParameterContext'

interface LinkMenuItem {
  id: string
  name: string
}

interface LinkContextValue {
  links: PanelLink[]
  open: (id: string) => void
}

const LinkCtx = createContext<LinkContextValue | null>(null)

/**
 * specs/link.md: hosts every link a panel defines. A control never builds
 * the URL itself -- its right-click menu calls `open(id)` (via useLinkMenu
 * below), the same centralized shape DrilldownProvider uses for its popup
 * dialog, except opening a link just substitutes the panel's current
 * parameter values into the URL (see utils/panelTemplating.ts's ${param}
 * substitution -- same convention as title/datastore text) and hands it to
 * window.open instead of rendering anything inline. Must be nested inside
 * the panel's own ParameterProvider to read those values.
 */
export function LinkProvider({ links, children }: { links: PanelLink[]; children: ReactNode }) {
  const values = useAllParameterValues()

  const value = useMemo<LinkContextValue>(
    () => ({
      links,
      open: (id) => {
        const link = links.find((l) => l.id === id)
        if (!link) return
        const url = substituteParams(link.url, values)
        // window.open's third argument is otherwise ignored for a plain new
        // tab -- adding a window-feature hint (here, "popup") is the
        // standard cross-browser trick to make it open as a separate
        // window instead, which is the only way `target` actually changes
        // behavior (there's no dedicated "open as window" browser API).
        const features = link.target === 'window' ? 'noopener,noreferrer,popup' : 'noopener,noreferrer'
        window.open(url, '_blank', features)
      },
    }),
    [links, values],
  )

  return <LinkCtx.Provider value={value}>{children}</LinkCtx.Provider>
}

/** A control's own subset of the panel's links (its own PanelNode.linkIds) plus the shared opener -- what ControlContextMenu renders/calls. Empty `ids` (nothing configured) returns an empty item list rather than erroring. */
export function useLinkMenu(ids: string[] | undefined): { items: LinkMenuItem[]; open: (id: string) => void } {
  const ctx = useContext(LinkCtx)
  if (!ctx) throw new Error('useLinkMenu must be used within a LinkProvider')
  const items = (ids ?? [])
    .map((id) => ctx.links.find((l) => l.id === id))
    .filter((l): l is PanelLink => !!l)
    .map((l) => ({ id: l.id, name: l.name }))
  return { items, open: ctx.open }
}
