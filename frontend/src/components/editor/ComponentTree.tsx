import { useState, type ReactNode } from 'react'
import { ChevronDown, ChevronRight, ClipboardPaste, Plus } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

import type { NodeType, PanelDatastoreRef, PanelDrilldown, PanelLink, PanelNode, PanelParameter } from '../../api/types'
import { childrenOf, childTypesFor, isSameSelection, type Selection } from './panelTree'

interface Props {
  parameters: PanelParameter[]
  datastores: PanelDatastoreRef[]
  root: PanelNode
  drilldowns: PanelDrilldown[]
  links: PanelLink[]
  selection: Selection
  onSelect: (selection: Selection) => void
  onAddParameter: () => void
  onDeleteParameter: (name: string) => void
  onCopyParameter: (name: string) => void
  onPasteParameter: () => void
  onViewJsonParameter: (name: string) => void
  onAddDatastore: () => void
  onDeleteDatastore: (id: string) => void
  onCopyDatastore: (id: string) => void
  onPasteDatastore: () => void
  onViewJsonDatastore: (id: string) => void
  onAddDrilldown: () => void
  onDeleteDrilldown: (id: string) => void
  onAddLink: () => void
  onDeleteLink: (id: string) => void
  onCopyLink: (id: string) => void
  onPasteLink: () => void
  onViewJsonLink: (id: string) => void
  onAddChild: (parentId: string, type: NodeType) => void
  onDeleteNode: (id: string) => void
  onCopyNode: (id: string) => void
  onPasteNode: (targetId: string) => void
  onMoveNode: (id: string, edge: 'top' | 'bottom' | 'up' | 'down') => void
  onViewSource: (id: string) => void
  onLoadColumns: (id: string) => void
  onLoadColumnsFromJson: (id: string) => void
}

/**
 * The editor's side-panel tree: three fixed top-level sections in the order
 * specs/panel_design.md's "Json design rules" require -- Parameters,
 * Datastores, Content. Content is the recursive layout/tab/datatable/chart
 * tree (rooted at the panel's single required Layout root), where every
 * node also carries a right-click menu for add/delete/copy/paste/reorder/
 * view-source.
 */
export function ComponentTree({
  parameters,
  datastores,
  root,
  drilldowns,
  links,
  selection,
  onSelect,
  onAddParameter,
  onDeleteParameter,
  onCopyParameter,
  onPasteParameter,
  onViewJsonParameter,
  onAddDatastore,
  onDeleteDatastore,
  onCopyDatastore,
  onPasteDatastore,
  onViewJsonDatastore,
  onAddDrilldown,
  onDeleteDrilldown,
  onAddLink,
  onDeleteLink,
  onCopyLink,
  onPasteLink,
  onViewJsonLink,
  onAddChild,
  onDeleteNode,
  onCopyNode,
  onPasteNode,
  onMoveNode,
  onViewSource,
  onLoadColumns,
  onLoadColumnsFromJson,
}: Props) {
  const [open, setOpen] = useState<Record<string, boolean>>({
    parameters: true,
    datastores: true,
    links: true,
    content: true,
    drilldowns: true,
  })
  const toggle = (key: string) => setOpen((o) => ({ ...o, [key]: o[key] === false }))

  return (
    <div className="flex-1 overflow-y-auto py-1">
      <Section label="Parameters" isOpen={open.parameters} onToggle={() => toggle('parameters')} onAdd={onAddParameter} onPaste={onPasteParameter}>
        {parameters.map((p) => (
          <LeafRow
            key={p.name}
            label={p.label || p.name}
            isSelected={isSameSelection(selection, { kind: 'parameter', name: p.name })}
            onSelect={() => onSelect({ kind: 'parameter', name: p.name })}
            onDelete={() => onDeleteParameter(p.name)}
            onCopy={() => onCopyParameter(p.name)}
            onPaste={onPasteParameter}
            onViewJson={() => onViewJsonParameter(p.name)}
            viewJsonLabel="Edit JSON"
          />
        ))}
        {parameters.length === 0 && <Empty />}
      </Section>

      <Section label="Datastores" isOpen={open.datastores} onToggle={() => toggle('datastores')} onAdd={onAddDatastore} onPaste={onPasteDatastore}>
        {datastores.map((d) => (
          <LeafRow
            key={d.id}
            label={`${d.name} (${d.scope})`}
            isSelected={isSameSelection(selection, { kind: 'datastore', id: d.id })}
            onSelect={() => onSelect({ kind: 'datastore', id: d.id })}
            onDelete={() => onDeleteDatastore(d.id)}
            onCopy={() => onCopyDatastore(d.id)}
            onPaste={onPasteDatastore}
            onViewJson={() => onViewJsonDatastore(d.id)}
          />
        ))}
        {datastores.length === 0 && <Empty />}
      </Section>

      <Section label="Links" isOpen={open.links} onToggle={() => toggle('links')} onAdd={onAddLink} onPaste={onPasteLink}>
        {links.map((l) => (
          <LeafRow
            key={l.id}
            label={`${l.name} (${l.target})`}
            isSelected={isSameSelection(selection, { kind: 'link', id: l.id })}
            onSelect={() => onSelect({ kind: 'link', id: l.id })}
            onDelete={() => onDeleteLink(l.id)}
            onCopy={() => onCopyLink(l.id)}
            onPaste={onPasteLink}
            onViewJson={() => onViewJsonLink(l.id)}
          />
        ))}
        {links.length === 0 && <Empty />}
      </Section>

      <Section label="Content" isOpen={open.content} onToggle={() => toggle('content')}>
        <NodeRow
          node={root}
          depth={0}
          isRoot
          selection={selection}
          expanded={open}
          onToggleExpand={toggle}
          onSelect={onSelect}
          onAddChild={onAddChild}
          onDelete={onDeleteNode}
          onCopy={onCopyNode}
          onPaste={onPasteNode}
          onMove={onMoveNode}
          onViewSource={onViewSource}
          onLoadColumns={onLoadColumns}
          onLoadColumnsFromJson={onLoadColumnsFromJson}
        />
      </Section>

      <Section label="Drilldowns" isOpen={open.drilldowns} onToggle={() => toggle('drilldowns')} onAdd={onAddDrilldown}>
        {drilldowns.map((d) => (
          <DrilldownBlock
            key={d.id}
            drilldown={d}
            selection={selection}
            expanded={open}
            onToggleExpand={toggle}
            onSelect={onSelect}
            onDelete={onDeleteDrilldown}
            onAddChild={onAddChild}
            onDeleteNode={onDeleteNode}
            onCopyNode={onCopyNode}
            onPasteNode={onPasteNode}
            onMoveNode={onMoveNode}
            onViewSource={onViewSource}
            onLoadColumns={onLoadColumns}
            onLoadColumnsFromJson={onLoadColumnsFromJson}
          />
        ))}
        {drilldowns.length === 0 && <Empty />}
      </Section>
    </div>
  )
}

/**
 * specs/drilldown.md: one entry under the Drilldowns section -- a header row
 * (click to select+rename its `name` via PropertyPanel, right-click to
 * delete the whole drilldown) followed by its own root layout node's full
 * subtree, rendered with the same NodeRow used for the panel's main Content
 * tree -- a drilldown is "the same types of controls as content", so it
 * gets the exact same add/delete/copy/paste/reorder/view-source affordances.
 */
function DrilldownBlock({
  drilldown,
  selection,
  expanded,
  onToggleExpand,
  onSelect,
  onDelete,
  onAddChild,
  onDeleteNode,
  onCopyNode,
  onPasteNode,
  onMoveNode,
  onViewSource,
  onLoadColumns,
  onLoadColumnsFromJson,
}: {
  drilldown: PanelDrilldown
  selection: Selection
  expanded: Record<string, boolean>
  onToggleExpand: (id: string) => void
  onSelect: (selection: Selection) => void
  onDelete: (id: string) => void
  onAddChild: (parentId: string, type: NodeType) => void
  onDeleteNode: (id: string) => void
  onCopyNode: (id: string) => void
  onPasteNode: (targetId: string) => void
  onMoveNode: (id: string, edge: 'top' | 'bottom' | 'up' | 'down') => void
  onViewSource: (id: string) => void
  onLoadColumns: (id: string) => void
  onLoadColumnsFromJson: (id: string) => void
}) {
  const expandKey = `drilldown:${drilldown.id}`
  const isOpen = expanded[expandKey] !== false
  const isSelected = isSameSelection(selection, { kind: 'drilldown', id: drilldown.id })

  const row = (
    <div
      onClick={() => onSelect({ kind: 'drilldown', id: drilldown.id })}
      className={cn('flex items-center gap-1 rounded-md py-0.5 pr-1 text-[0.85em]', isSelected ? 'bg-muted' : 'hover:bg-muted/50')}
      style={{ paddingLeft: 4 }}
    >
      <button
        onClick={(e) => {
          e.stopPropagation()
          onToggleExpand(expandKey)
        }}
        className="inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground"
      >
        {isOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
      </button>
      <span className="grow truncate py-0.5 font-medium">{drilldown.name}</span>
    </div>
  )

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
        <ContextMenuContent>
          <ContextMenuItem variant="destructive" onClick={() => onDelete(drilldown.id)}>
            Delete
          </ContextMenuItem>
        </ContextMenuContent>
      </ContextMenu>
      {isOpen && (
        <NodeRow
          node={drilldown.root}
          depth={1}
          isRoot
          selection={selection}
          expanded={expanded}
          onToggleExpand={onToggleExpand}
          onSelect={onSelect}
          onAddChild={onAddChild}
          onDelete={onDeleteNode}
          onCopy={onCopyNode}
          onPaste={onPasteNode}
          onMove={onMoveNode}
          onViewSource={onViewSource}
          onLoadColumns={onLoadColumns}
          onLoadColumnsFromJson={onLoadColumnsFromJson}
        />
      )}
    </div>
  )
}

function Section({
  label,
  isOpen,
  onToggle,
  onAdd,
  onPaste,
  children,
}: {
  label: string
  isOpen: boolean
  onToggle: () => void
  onAdd?: () => void
  /** Pastes a copied record from the clipboard -- works even when the section is empty (row context menus only exist once a row does). */
  onPaste?: () => void
  children: ReactNode
}) {
  return (
    <div className="mb-1">
      <div className="flex items-center gap-1 px-1 py-1 text-[0.78em] font-semibold tracking-wide text-muted-foreground uppercase">
        <button onClick={onToggle} className="inline-flex size-4 items-center justify-center">
          {isOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
        </button>
        <span className="grow">{label}</span>
        {onPaste && (
          <Button variant="ghost" size="icon-xs" title="Paste" onClick={onPaste}>
            <ClipboardPaste />
          </Button>
        )}
        {onAdd && (
          <Button variant="ghost" size="icon-xs" title="Add" onClick={onAdd}>
            <Plus />
          </Button>
        )}
      </div>
      {isOpen && <div>{children}</div>}
    </div>
  )
}

function Empty() {
  return <div className="px-6 py-1 text-[0.78em] text-muted-foreground">None</div>
}

function LeafRow({
  label,
  isSelected,
  onSelect,
  onDelete,
  onCopy,
  onPaste,
  onViewJson,
  viewJsonLabel = 'View JSON',
}: {
  label: string
  isSelected: boolean
  onSelect: () => void
  onDelete: () => void
  onCopy: () => void
  onPaste: () => void
  onViewJson: () => void
  viewJsonLabel?: string
}) {
  const row = (
    <div
      onClick={onSelect}
      className={cn(
        'flex items-center gap-1 rounded-md py-1 pr-1 pl-6 text-[0.85em]',
        isSelected ? 'bg-muted' : 'hover:bg-muted/50',
      )}
    >
      <span className="grow truncate">{label}</span>
    </div>
  )

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
      <ContextMenuContent>
        <ContextMenuItem onClick={onCopy}>Copy</ContextMenuItem>
        <ContextMenuItem onClick={onPaste}>Paste</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem onClick={onViewJson}>{viewJsonLabel}</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem variant="destructive" onClick={onDelete}>
          Delete
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}

function NodeRow({
  node,
  depth,
  isRoot,
  selection,
  expanded,
  onToggleExpand,
  onSelect,
  onAddChild,
  onDelete,
  onCopy,
  onPaste,
  onMove,
  onViewSource,
  onLoadColumns,
  onLoadColumnsFromJson,
}: {
  node: PanelNode
  depth: number
  isRoot?: boolean
  selection: Selection
  expanded: Record<string, boolean>
  onToggleExpand: (id: string) => void
  onSelect: (selection: Selection) => void
  onAddChild: (parentId: string, type: NodeType) => void
  onDelete: (id: string) => void
  onCopy: (id: string) => void
  onPaste: (targetId: string) => void
  onMove: (id: string, edge: 'top' | 'bottom' | 'up' | 'down') => void
  onViewSource: (id: string) => void
  onLoadColumns: (id: string) => void
  onLoadColumnsFromJson: (id: string) => void
}) {
  const children = childrenOf(node)
  const addableTypes = childTypesFor(node.type)
  const isOpen = expanded[node.id] !== false
  const isSelected = isSameSelection(selection, { kind: 'node', id: node.id })
  const canLoadColumns = node.type === 'datatable' || node.type === 'chart' || node.type === 'pivot' || node.type === 'kpi'
  // specs/kpi.md calls this action "Generate Cards" -- same buildColumnsFromSample mechanism as
  // every other control's "Load Columns", just user-facing wording that matches what a kpi's
  // children actually are.
  const loadColumnsLabel = node.type === 'kpi' ? 'Generate Cards' : 'Load Columns'

  const row = (
    <div
      onClick={() => onSelect({ kind: 'node', id: node.id })}
      className={cn(
        'flex items-center gap-1 rounded-md py-0.5 pr-1 text-[0.85em]',
        isSelected ? 'bg-muted' : 'hover:bg-muted/50',
      )}
      style={{ paddingLeft: 4 + depth * 16 }}
    >
      <button
        onClick={(e) => {
          e.stopPropagation()
          if (children.length) onToggleExpand(node.id)
        }}
        className="inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground"
      >
        {children.length > 0 && (isOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />)}
      </button>
      <span className="grow truncate py-0.5">
        {node.title || node.fieldDisplay || node.field || node.id} <span className="text-muted-foreground">({node.type})</span>
      </span>
      {addableTypes.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" onClick={(e) => e.stopPropagation()}>
              <Plus />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {addableTypes.map((type) => (
              <DropdownMenuItem key={type} onClick={() => onAddChild(node.id, type)}>
                {type}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </div>
  )

  return (
    <div>
      <ContextMenu>
        <ContextMenuTrigger asChild>{row}</ContextMenuTrigger>
        <ContextMenuContent>
          {addableTypes.length > 0 && (
            <ContextMenuSub>
              <ContextMenuSubTrigger>Add</ContextMenuSubTrigger>
              <ContextMenuSubContent>
                {addableTypes.map((type) => (
                  <ContextMenuItem key={type} onClick={() => onAddChild(node.id, type)}>
                    {type}
                  </ContextMenuItem>
                ))}
              </ContextMenuSubContent>
            </ContextMenuSub>
          )}
          {canLoadColumns && (
            <ContextMenuItem onClick={() => onLoadColumns(node.id)}>{loadColumnsLabel} from Datastore</ContextMenuItem>
          )}
          {canLoadColumns && (
            <ContextMenuItem onClick={() => onLoadColumnsFromJson(node.id)}>{loadColumnsLabel} from JSON</ContextMenuItem>
          )}
          <ContextMenuItem onClick={() => onCopy(node.id)}>Copy</ContextMenuItem>
          <ContextMenuItem onClick={() => onPaste(node.id)}>Paste</ContextMenuItem>
          {!isRoot && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem onClick={() => onMove(node.id, 'top')}>Move to top</ContextMenuItem>
              <ContextMenuItem onClick={() => onMove(node.id, 'up')}>Move up</ContextMenuItem>
              <ContextMenuItem onClick={() => onMove(node.id, 'down')}>Move down</ContextMenuItem>
              <ContextMenuItem onClick={() => onMove(node.id, 'bottom')}>Move to bottom</ContextMenuItem>
            </>
          )}
          <ContextMenuSeparator />
          <ContextMenuItem onClick={() => onViewSource(node.id)}>Edit JSON</ContextMenuItem>
          {!isRoot && (
            <>
              <ContextMenuSeparator />
              <ContextMenuItem variant="destructive" onClick={() => onDelete(node.id)}>
                Delete
              </ContextMenuItem>
            </>
          )}
        </ContextMenuContent>
      </ContextMenu>
      {isOpen &&
        children.map((child) => (
          <NodeRow
            key={child.id}
            node={child}
            depth={depth + 1}
            selection={selection}
            expanded={expanded}
            onToggleExpand={onToggleExpand}
            onSelect={onSelect}
            onAddChild={onAddChild}
            onDelete={onDelete}
            onCopy={onCopy}
            onPaste={onPaste}
            onMove={onMove}
            onViewSource={onViewSource}
            onLoadColumns={onLoadColumns}
            onLoadColumnsFromJson={onLoadColumnsFromJson}
          />
        ))}
    </div>
  )
}
