import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

import type { PanelDatastoreRef, PanelDrilldown } from '../../api/types'
import { PanelLayout } from './PanelLayout'

interface DrilldownMenuItem {
  id: string
  name: string
}

interface DrilldownContextValue {
  drilldowns: PanelDrilldown[]
  open: (id: string) => void
}

const DrilldownCtx = createContext<DrilldownContextValue | null>(null)

/**
 * specs/drilldown.md: hosts every drilldown a panel defines, plus the popup
 * dialog that renders whichever one is currently open. A control never talks
 * to the dialog directly -- its right-click menu calls `open(id)` (via
 * useDrilldownMenu below), the same centralized-dialog shape
 * ParameterProvider already uses for the shared Parameters dialog. Must be
 * nested inside the panel's own ParameterProvider: a drilldown's controls
 * render through this same PanelLayout, and need that same parameter store
 * and datastores (drilldowns don't carry their own -- see PanelDrilldown's
 * doc comment) to actually load data.
 */
export function DrilldownProvider({
  drilldowns,
  datastores,
  previewMode,
  children,
}: {
  drilldowns: PanelDrilldown[]
  /** The panel's own datastore manifest -- shared with content, not per-drilldown. */
  datastores: PanelDatastoreRef[]
  /** Editor's Preview tab only -- see components/controls/types.ts. */
  previewMode?: boolean
  children: ReactNode
}) {
  const [openId, setOpenId] = useState<string | null>(null)
  const active = drilldowns.find((d) => d.id === openId) ?? null
  const value = useMemo<DrilldownContextValue>(() => ({ drilldowns, open: setOpenId }), [drilldowns])

  return (
    <DrilldownCtx.Provider value={value}>
      {children}
      <Dialog open={!!active} onOpenChange={(o) => !o && setOpenId(null)}>
        <DialogContent className="flex h-[85vh] max-w-[1100px] flex-col sm:max-w-[1100px]">
          <DialogHeader>
            <DialogTitle>{active?.name}</DialogTitle>
          </DialogHeader>
          <div className="min-h-0 flex-1 overflow-auto">
            {active && <PanelLayout node={active.root} datastores={datastores} previewMode={previewMode} />}
          </div>
        </DialogContent>
      </Dialog>
    </DrilldownCtx.Provider>
  )
}

/** A control's own subset of the panel's drilldowns (its own PanelNode.drilldownIds) plus the shared opener -- what ControlContextMenu renders/calls. Empty `ids` (nothing configured) returns an empty item list rather than erroring. */
export function useDrilldownMenu(ids: string[] | undefined): { items: DrilldownMenuItem[]; open: (id: string) => void } {
  const ctx = useContext(DrilldownCtx)
  if (!ctx) throw new Error('useDrilldownMenu must be used within a DrilldownProvider')
  const items = (ids ?? [])
    .map((id) => ctx.drilldowns.find((d) => d.id === id))
    .filter((d): d is PanelDrilldown => !!d)
    .map((d) => ({ id: d.id, name: d.name }))
  return { items, open: ctx.open }
}
