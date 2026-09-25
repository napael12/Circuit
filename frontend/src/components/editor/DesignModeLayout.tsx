import { cn } from '@/lib/utils'

import type { PanelNode } from '../../api/types'

interface Props {
  node: PanelNode
}

const TYPE_LABEL: Record<string, string> = { layout: 'Layout', tab: 'Tab', datatable: 'Datatable', chart: 'Chart', pivot: 'Pivot' }

/**
 * Design mode's canvas: walks the same node tree as the real PanelLayout,
 * but only renders positioning/mockup boxes -- no ParameterProvider, no
 * datastore fetch (specs/panel_design.md: "Design mode will display
 * mockup/positioning of the elements"). Preview mode uses the real
 * PanelLayout instead, see EditorPage.tsx.
 */
export function DesignModeLayout({ node }: Props) {
  if (node.type === 'layout') {
    const direction = node.direction ?? 'horizontal'
    const children = node.components ?? []
    return (
      <div className="flex h-full w-full flex-col gap-2">
        {node.title && <div className="flex-none text-[0.9em] font-semibold text-muted-foreground">{node.title}</div>}
        <div className={cn('min-h-0 flex-1 gap-3.5', direction === 'vertical' ? 'flex flex-col' : 'flex flex-row')}>
          {children.length === 0 ? (
            <EmptyBox label="Empty layout" />
          ) : (
            children.map((child) => (
              <div key={child.id} className="min-h-0 min-w-0" style={{ flexGrow: child.weight ?? 1, flexBasis: 0 }}>
                <DesignModeLayout node={child} />
              </div>
            ))
          )}
        </div>
      </div>
    )
  }

  if (node.type === 'tab') {
    const tabs = node.components ?? []
    return (
      <div className="flex h-full w-full flex-col rounded-[10px] border border-dashed border-border">
        <div className="flex flex-none gap-1 border-b border-dashed border-border p-1.5">
          {tabs.length === 0 ? (
            <span className="px-2 py-1 text-[0.78em] text-muted-foreground">No tabs</span>
          ) : (
            tabs.map((t) => (
              <span key={t.id} className="rounded-md bg-muted px-2 py-1 text-[0.78em]">
                {t.title ?? t.id}
              </span>
            ))
          )}
        </div>
        <div className="min-h-0 flex-1 p-2">{tabs[0] ? <DesignModeLayout node={tabs[0]} /> : <EmptyBox label="Empty tab" />}</div>
      </div>
    )
  }

  // leaf: datatable / chart
  const columns = node.columns ?? []
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-[10px] border border-dashed border-border bg-muted/20">
      {node.title && !node.hideTitle && (
        <div className="border-b border-dashed border-border px-3.5 py-2.5 text-[0.9em] font-semibold">{node.title}</div>
      )}
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-1 p-3 text-center text-muted-foreground">
        <span className="text-[0.78em] font-medium tracking-wide uppercase">{TYPE_LABEL[node.type] ?? node.type}</span>
        <span className="text-[0.72em]">{node.datastore ? `datastore: ${node.datastore}` : 'no datastore'}</span>
        {columns.length > 0 && <span className="text-[0.72em]">{columns.map((c) => c.fieldDisplay || c.field).join(', ')}</span>}
      </div>
    </div>
  )
}

function EmptyBox({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-[10px] border border-dashed border-border text-[0.78em] text-muted-foreground">
      {label}
    </div>
  )
}
