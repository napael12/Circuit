import { Fragment, useEffect, useRef, useState, type MouseEvent as ReactMouseEvent } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react'

import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { cn } from '@/lib/utils'

import type { PanelDatastoreRef, PanelNode } from '../../api/types'
import { useTitleText } from '../../hooks/useTitleText'
import { CONTROL_REGISTRY } from '../controls'
import { ResizeHandle } from './ResizeHandle'

interface PanelLayoutProps {
  node: PanelNode
  datastores: PanelDatastoreRef[]
  /** Editor canvas only: id of the selected leaf, and a click handler to select one. Omit for the plain viewer. */
  selectedId?: string
  onSelect?: (id: string) => void
  /** Editor's Preview tab -- see components/controls/types.ts. */
  previewMode?: boolean
}

/** Width/height (px) of the always-present collapse-toggle strip -- also what a collapsed child shrinks to. */
const COLLAPSE_STRIP_SIZE = 20
/** Floor (px) a resizable pane can be dragged down to, so it never gets squeezed to nothing. */
const MIN_PANE_SIZE = 40

function loadJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    return raw ? (JSON.parse(raw) as T) : fallback
  } catch {
    return fallback
  }
}

function saveJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    // localStorage unavailable (private browsing, etc.) -- state just won't persist.
  }
}

export function PanelLayout(props: PanelLayoutProps) {
  if (props.node.type === 'layout') return <LayoutNode {...props} />
  if (props.node.type === 'tab') return <TabNode {...props} />
  return <LeafNode {...props} />
}

/**
 * A layout's children render along `direction`, optionally with two
 * independent, per-instance-persisted behaviors:
 *  - `resizable`: a drag handle between every pair of currently-visible
 *    children, adjusting their relative flex weight (specs: currently a
 *    dead "Resizable" checkbox -- this is what actually wires it up).
 *  - `collapsible`: each child gets its own collapse/expand toggle,
 *    shrinking it to a thin strip and freeing its space to its siblings.
 * Both are keyed by the layout node's own id in localStorage, matching the
 * editor's own sidebar/tree resize persistence (hooks/useResizable.ts).
 */
function LayoutNode({ node, datastores, selectedId, onSelect, previewMode }: PanelLayoutProps) {
  const direction = node.direction ?? 'horizontal'
  const children = node.components ?? []
  const title = useTitleText(node.title)
  const resizable = !!node.resizable
  const collapsible = !!node.collapsible
  const containerRef = useRef<HTMLDivElement>(null)

  const weightsKey = `panel-layout-weights:${node.id}`
  const [weightOverrides, setWeightOverrides] = useState<Record<string, number>>(() => (resizable ? loadJSON(weightsKey, {}) : {}))
  useEffect(() => {
    if (resizable) saveJSON(weightsKey, weightOverrides)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weightOverrides])

  const collapsedKey = `panel-layout-collapsed:${node.id}`
  const [collapsedIds, setCollapsedIds] = useState<Record<string, boolean>>(() => (collapsible ? loadJSON(collapsedKey, {}) : {}))
  useEffect(() => {
    if (collapsible) saveJSON(collapsedKey, collapsedIds)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsedIds])

  const weightOf = (child: PanelNode) => weightOverrides[child.id] ?? child.weight ?? 1

  const startResize = (e: ReactMouseEvent, a: PanelNode, b: PanelNode, visibleWeightTotal: number) => {
    e.preventDefault()
    const containerEl = containerRef.current
    if (!containerEl) return
    // Every child reserves a fixed-size toggle strip when collapsible; a
    // collapsed child's whole footprint IS that strip (its content is 0), so
    // only the strips need subtracting here, not collapsed children again.
    const stripTotal = collapsible ? children.length * COLLAPSE_STRIP_SIZE : 0
    const rect = containerEl.getBoundingClientRect()
    const flexibleSize = (direction === 'vertical' ? rect.height : rect.width) - stripTotal
    const pxPerWeight = flexibleSize / visibleWeightTotal
    const minWeight = MIN_PANE_SIZE / pxPerWeight
    const startPos = direction === 'vertical' ? e.clientY : e.clientX
    const startA = weightOf(a)
    const startB = weightOf(b)

    const onMove = (ev: globalThis.MouseEvent) => {
      const pos = direction === 'vertical' ? ev.clientY : ev.clientX
      const delta = (pos - startPos) / pxPerWeight
      let newA = startA + delta
      let newB = startB - delta
      if (newA < minWeight) {
        newB -= minWeight - newA
        newA = minWeight
      } else if (newB < minWeight) {
        newA -= minWeight - newB
        newB = minWeight
      }
      setWeightOverrides((w) => ({ ...w, [a.id]: newA, [b.id]: newB }))
    }
    const onUp = () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  const visibleWeightTotal = children.filter((c) => !collapsedIds[c.id]).reduce((sum, c) => sum + weightOf(c), 0)

  return (
    <div className="flex h-full w-full flex-col gap-2">
      {title && node.displayTitle !== false && <div className="flex-none text-[0.9em] font-semibold">{title}</div>}
      <div
        ref={containerRef}
        className={cn('min-h-0 flex-1', direction === 'vertical' ? 'flex flex-col' : 'flex flex-row', !resizable && 'gap-3.5')}
      >
        {children.map((child, i) => {
          const isCollapsed = !!collapsedIds[child.id]
          const next = children[i + 1]
          const showHandle = resizable && !isCollapsed && !!next && !collapsedIds[next.id]
          const vertical = direction === 'vertical'
          const CollapseIcon = vertical ? (isCollapsed ? ChevronDown : ChevronUp) : isCollapsed ? ChevronRight : ChevronLeft

          return (
            <Fragment key={child.id}>
              <div
                className={cn('flex min-h-0 min-w-0', vertical ? 'flex-col' : 'flex-row')}
                style={isCollapsed ? { flex: '0 0 auto' } : { flexGrow: weightOf(child), flexBasis: 0 }}
              >
                {collapsible && (
                  <button
                    type="button"
                    onClick={() => setCollapsedIds((c) => ({ ...c, [child.id]: !c[child.id] }))}
                    aria-label={isCollapsed ? 'Expand' : 'Collapse'}
                    className={cn(
                      'flex flex-none items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground',
                      vertical ? 'h-5 w-full' : 'h-full w-5',
                    )}
                  >
                    <CollapseIcon className="size-3" />
                  </button>
                )}
                {!isCollapsed && (
                  <div className="min-h-0 min-w-0 flex-1">
                    <PanelLayout node={child} datastores={datastores} selectedId={selectedId} onSelect={onSelect} previewMode={previewMode} />
                  </div>
                )}
              </div>
              {showHandle && (
                <ResizeHandle
                  direction={direction === 'vertical' ? 'vertical' : 'horizontal'}
                  onMouseDown={(e) => startResize(e, child, next, visibleWeightTotal)}
                />
              )}
            </Fragment>
          )
        })}
      </div>
    </div>
  )
}

function TabNode({ node, datastores, selectedId, onSelect, previewMode }: PanelLayoutProps) {
  const tabs = node.components ?? []
  const [active, setActive] = useState(tabs[0]?.id ?? '')
  const activeTab = tabs.find((t) => t.id === active) ?? tabs[0]
  const position = node.position ?? 'top'
  const orientation = position === 'left' || position === 'right' ? 'vertical' : 'horizontal'
  const listFirst = position === 'top' || position === 'left'

  const list = (
    // 'basic' (TabsList's "default" variant -- a muted track with the
    // active tab on a raised bg-background pill) reads as selected at a
    // glance; 'line' (a thin underline) is the more understated look some
    // dashboards want instead -- see PanelNode.tabStyle.
    <TabsList className="flex-none" variant={node.tabStyle === 'line' ? 'line' : 'default'}>
      {tabs.map((tab) => (
        <TabsTrigger key={tab.id} value={tab.id}>
          {tab.title ?? tab.id}
        </TabsTrigger>
      ))}
    </TabsList>
  )

  return (
    <Tabs value={active || tabs[0]?.id} onValueChange={setActive} orientation={orientation} className="h-full w-full">
      {listFirst && list}
      <div className="min-h-0 min-w-0 flex-1">
        {activeTab && (
          // Keyed by the active tab's own node id so switching tabs mounts a
          // fresh subtree instead of reusing the previous tab's component
          // instance with a new `node` prop -- otherwise a control's own
          // state (e.g. DatatableControl's useDatastore `data`) carries over
          // from whichever *other* tab last occupied this position, and
          // renders under the new tab's columns until its own fetch resolves.
          <PanelLayout
            key={activeTab.id}
            node={activeTab}
            datastores={datastores}
            selectedId={selectedId}
            onSelect={onSelect}
            previewMode={previewMode}
          />
        )}
      </div>
      {!listFirst && list}
    </Tabs>
  )
}

function LeafNode({ node, datastores, selectedId, onSelect, previewMode }: PanelLayoutProps) {
  const Control = CONTROL_REGISTRY[node.type]
  const title = useTitleText(node.title)
  const isSelectable = !!onSelect
  const isSelected = selectedId === node.id

  return (
    <div
      onClick={isSelectable ? () => onSelect!(node.id) : undefined}
      className={cn(
        'flex h-full w-full flex-col overflow-hidden rounded-[10px] border bg-card shadow-[0_1px_2px_rgba(0,0,0,.04)]',
        isSelectable ? 'cursor-pointer border-2' : 'border-border',
        isSelectable && (isSelected ? 'border-solid border-accent' : 'border-dashed border-border'),
      )}
    >
      {title && <div className="border-b border-border px-3.5 py-2.5 text-[0.9em] font-semibold">{title}</div>}
      <div className="min-h-0 min-w-0 flex-1">
        {Control ? (
          <Control component={node} datastores={datastores} previewMode={previewMode} />
        ) : (
          <div className="text-destructive">Unknown control: {node.type}</div>
        )}
      </div>
    </div>
  )
}
