import type { ReactNode } from 'react'
import { ChevronsDown, Download, ExternalLink, FilterX, RefreshCw, SlidersHorizontal } from 'lucide-react'

import { ContextMenu, ContextMenuContent, ContextMenuItem, ContextMenuSeparator, ContextMenuTrigger } from '@/components/ui/context-menu'

import { useDrilldownMenu } from '../layout/DrilldownContext'
import { useLinkMenu } from '../layout/LinkContext'
import { useOpenParametersDialog } from '../layout/ParameterContext'

interface Props {
  onRefresh: () => void
  canRefresh: boolean
  onExport: () => void
  canExport: boolean
  /** Datatable only -- clears every active column filter. Omitted entirely (no menu item) by controls with no filters, e.g. ChartControl. */
  onRemoveFilters?: () => void
  canRemoveFilters?: boolean
  /** specs/drilldown.md: this control's own PanelNode.drilldownIds -- resolved to name/opener via useDrilldownMenu. */
  drilldownIds?: string[]
  /** specs/link.md: this control's own PanelNode.linkIds -- resolved to name/opener via useLinkMenu. */
  linkIds?: string[]
  children: ReactNode
}

/**
 * Right-click menu on a rendered datatable/chart/pivot control: refresh just
 * this control against its current parameter values, export its
 * currently-loaded data to CSV, (datatable only) clear all active column
 * filters, open any drilldowns configured on it (specs/drilldown.md -- each
 * one pops the shared drilldown dialog, see DrilldownProvider), open any
 * links configured on it (specs/link.md -- each one opens a new tab/window
 * via LinkProvider), or open the dashboard's shared Parameters dialog (same
 * one as the viewer toolbar's own button -- see useOpenParametersDialog)
 * without needing to reach for the toolbar.
 */
export function ControlContextMenu({
  onRefresh,
  canRefresh,
  onExport,
  canExport,
  onRemoveFilters,
  canRemoveFilters,
  drilldownIds,
  linkIds,
  children,
}: Props) {
  const { show: showParameters, hasParameters } = useOpenParametersDialog()
  const { items: drilldownItems, open: openDrilldown } = useDrilldownMenu(drilldownIds)
  const { items: linkItems, open: openLink } = useLinkMenu(linkIds)

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem disabled={!canRefresh} onClick={onRefresh}>
          <RefreshCw />
          Refresh
        </ContextMenuItem>
        <ContextMenuItem disabled={!canExport} onClick={onExport}>
          <Download />
          Export data (CSV)
        </ContextMenuItem>
        {onRemoveFilters && (
          <ContextMenuItem disabled={!canRemoveFilters} onClick={onRemoveFilters}>
            <FilterX />
            Remove filters
          </ContextMenuItem>
        )}
        {drilldownItems.length > 0 && (
          <>
            <ContextMenuSeparator />
            {drilldownItems.map((item) => (
              <ContextMenuItem key={item.id} onClick={() => openDrilldown(item.id)}>
                <ChevronsDown />
                {item.name}
              </ContextMenuItem>
            ))}
          </>
        )}
        {linkItems.length > 0 && (
          <>
            <ContextMenuSeparator />
            {linkItems.map((item) => (
              <ContextMenuItem key={item.id} onClick={() => openLink(item.id)}>
                <ExternalLink />
                {item.name}
              </ContextMenuItem>
            ))}
          </>
        )}
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!hasParameters} onClick={showParameters}>
          <SlidersHorizontal />
          Parameters
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
