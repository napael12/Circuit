import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { ChevronRight, Copy, Download, Eye, ExternalLink, FileJson, Info, MoreHorizontal, Save } from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Field } from '@/components/Field'
import { Input } from '@/components/ui/input'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'

import { api } from '../api/client'
import type {
  ActionDef,
  DataConnection,
  Datastore,
  DatastorePreviewResult,
  NodeType,
  Panel,
  PanelContent,
  PanelDatastoreRef,
  PanelDrilldown,
  PanelLink,
  PanelNode,
  PanelParameter,
  Role,
} from '../api/types'
import { DrilldownProvider } from '../components/layout/DrilldownContext'
import { LinkProvider } from '../components/layout/LinkContext'
import { ParameterProvider } from '../components/layout/ParameterContext'
import { PanelLayout } from '../components/layout/PanelLayout'
import { ResizeHandle } from '../components/layout/ResizeHandle'
import { StatusBar } from '../components/layout/StatusBar'
import { ComponentTree } from '../components/editor/ComponentTree'
import { DatastoreRefDialog } from '../components/editor/DatastoreRefDialog'
import { DesignModeLayout } from '../components/editor/DesignModeLayout'
import { EditComponentJsonDialog } from '../components/editor/EditComponentJsonDialog'
import { EditParameterJsonDialog } from '../components/editor/EditParameterJsonDialog'
import { buildColumnsFromSample } from '../components/editor/loadColumns'
import { LoadColumnsDialog } from '../components/editor/LoadColumnsDialog'
import { LoadColumnsFromJsonDialog } from '../components/editor/LoadColumnsFromJsonDialog'
import { OpenPanelDialog } from '../components/editor/OpenPanelDialog'
import { PanelJsonDialog } from '../components/editor/PanelJsonDialog'
import { RoleMultiSelect } from '../components/manager/RoleMultiSelect'
import {
  addChild,
  allRoots,
  childTypesFor,
  defaultDrilldownFor,
  defaultLinkFor,
  defaultNodeFor,
  findNode,
  findRootContaining,
  insertAfter,
  isPanelDatastoreRef,
  isPanelLink,
  isPanelNode,
  isPanelParameter,
  moveNode,
  newId,
  regenerateIds,
  removeNode,
  replaceRoot,
  uniqueName,
  updateNode,
  type Selection,
} from '../components/editor/panelTree'
import { PropertyPanel } from '../components/editor/PropertyPanel'
import { LINK_SCHEMA, PARAMETER_SCHEMA, schemaFor, type FieldSchema } from '../components/editor/propertySchemas'
import { ViewSourceDialog } from '../components/editor/ViewSourceDialog'
import { useResizable } from '../hooks/useResizable'
import { openInNewWindow } from '../utils/newWindow'

const BLANK_CONTENT: PanelContent = {
  parameters: [],
  datastores: [],
  content: [{ id: 'root', type: 'layout', direction: 'horizontal', weight: 1, components: [] }],
  drilldowns: [],
  links: [],
}

/** Renaming a drilldown (specs/drilldown.md) -- selecting one in the tree shows just this. */
const DRILLDOWN_META_SCHEMA: FieldSchema[] = [{ key: 'name', label: 'Name', type: 'text' }]

/** A node's id is unique across every root (see panelTree's allRoots), so a lookup by id alone -- used once a node's containing tree (content vs. a specific drilldown) no longer matters -- can search all of them without knowing which one upfront. */
function findNodeInContent(content: PanelContent, nodeId: string): PanelNode | null {
  for (const root of allRoots(content)) {
    const found = findNode(root, nodeId)
    if (found) return found
  }
  return null
}

/** Dashboard ids are never typed by hand (specs: shown "only as a label") -- short and unique enough to not collide, well under the model's 30-char SlugField cap. */
function generatePanelId(): string {
  return `panel-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`
}

/** Shared clipboard-read step for every "Paste" action (tree node, parameter, datastore) -- toasts and returns null on denied access or invalid JSON, leaving the caller to validate the parsed shape itself. */
async function readClipboardJson(): Promise<unknown | null> {
  let text: string
  try {
    text = await navigator.clipboard.readText()
  } catch {
    toast.error('Clipboard access was denied.')
    return null
  }
  try {
    return JSON.parse(text)
  } catch {
    toast.error("Clipboard doesn't contain valid JSON.")
    return null
  }
}

/**
 * Panel designer (specs/panel_design.md): a single left column (tree over a
 * vertical property table for whatever's selected) and a main canvas that
 * toggles Design (a cheap positioning-only mockup, DesignModeLayout) vs
 * Preview (the exact PanelLayout the live viewer uses, against this
 * in-progress content).
 */
export function EditorPage() {
  const { id } = useParams<{ id: string }>()
  const isNew = id === 'new'
  const navigate = useNavigate()

  const [panelId, setPanelId] = useState('')
  const [name, setName] = useState('')
  const [slug, setSlug] = useState('')
  const [slugError, setSlugError] = useState<string | null>(null)
  const [category, setCategory] = useState('')
  const [subcategory, setSubcategory] = useState('')
  const [description, setDescription] = useState('')
  const [content, setContent] = useState<PanelContent>(BLANK_CONTENT)
  const [selection, setSelection] = useState<Selection>({ kind: 'node', id: 'root' })
  const [mode, setMode] = useState<'design' | 'preview'>('design')
  const [globalDatastoreIds, setGlobalDatastoreIds] = useState<string[]>([])
  const [connections, setConnections] = useState<DataConnection[]>([])
  const [actions, setActions] = useState<ActionDef[]>([])
  const [roles, setRoles] = useState<Role[]>([])
  const [allowedRoles, setAllowedRoles] = useState<number[]>([])
  const [saveAsOpen, setSaveAsOpen] = useState(false)
  const [openDialogOpen, setOpenDialogOpen] = useState(false)
  const [datastoreDialog, setDatastoreDialog] = useState<{ initial: PanelDatastoreRef | null } | null>(null)
  const [pendingNav, setPendingNav] = useState<(() => void) | null>(null)
  const savedSnapshot = useRef(
    JSON.stringify({ name: '', slug: '', category: '', subcategory: '', description: '', content: BLANK_CONTENT, allowedRoles: [] as number[] }),
  )

  const [sidebarWidth, sidebarDrag] = useResizable('editor.sidebarWidth', 280, { min: 200, max: 560, direction: 'horizontal' })
  const [treeHeight, treeDrag] = useResizable('editor.treeHeight', 320, { min: 100, max: 900, direction: 'vertical' })

  useEffect(() => {
    api.get<Datastore[]>('/datastores/').then((list) => setGlobalDatastoreIds(list.map((d) => d.id)))
    api.get<DataConnection[]>('/connections/').then(setConnections)
    api.get<ActionDef[]>('/actions/').then(setActions)
    api.get<Role[]>('/roles/').then(setRoles)
  }, [])

  const actionOptions = useMemo(() => actions.map((a) => ({ value: a.id, label: a.id })), [actions])
  const datastoreOptions = useMemo(() => content.datastores.map((d) => d.name), [content.datastores])
  const drilldownOptions = useMemo(
    () => (content.drilldowns ?? []).map((d: PanelDrilldown) => ({ id: d.id, name: d.name })),
    [content.drilldowns],
  )
  const linkOptions = useMemo(() => (content.links ?? []).map((l: PanelLink) => ({ id: l.id, name: l.name })), [content.links])

  // Runs on every navigation between dashboards (New, Open, or a direct URL
  // change) -- EditorPage stays mounted across those since the route has no
  // remount key, so state must be reset here rather than via useState
  // initializers, which only run once.
  useEffect(() => {
    if (isNew) {
      const freshId = generatePanelId()
      setPanelId(freshId)
      setName('')
      setSlug('')
      setSlugError(null)
      setCategory('')
      setSubcategory('')
      setDescription('')
      setContent(BLANK_CONTENT)
      setAllowedRoles([])
      setSelection({ kind: 'node', id: BLANK_CONTENT.content[0].id })
      savedSnapshot.current = JSON.stringify({
        name: '',
        slug: '',
        category: '',
        subcategory: '',
        description: '',
        content: BLANK_CONTENT,
        allowedRoles: [],
      })
      return
    }
    if (!id) return
    api.get<Panel>(`/panels/${id}/`).then((panel) => {
      setPanelId(panel.id)
      setName(panel.name)
      setSlug(panel.slug ?? '')
      setSlugError(null)
      setCategory(panel.category ?? '')
      setSubcategory(panel.subcategory ?? '')
      setDescription(panel.description ?? '')
      setContent(panel.content)
      setAllowedRoles(panel.allowed_roles ?? [])
      setSelection({ kind: 'node', id: panel.content.content[0]?.id ?? 'root' })
      savedSnapshot.current = JSON.stringify({
        name: panel.name,
        slug: panel.slug ?? '',
        category: panel.category ?? '',
        subcategory: panel.subcategory ?? '',
        description: panel.description ?? '',
        content: panel.content,
        allowedRoles: panel.allowed_roles ?? [],
      })
    })
  }, [id, isNew])

  const root = content.content[0] ?? BLANK_CONTENT.content[0]
  const dirty = savedSnapshot.current !== JSON.stringify({ name, slug, category, subcategory, description, content, allowedRoles })

  useEffect(() => {
    if (!dirty) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [dirty])

  /** specs/panel_design.md: "Always prompt user to save panel, before exiting editor." */
  const guardedNavigate = (action: () => void) => {
    if (dirty) setPendingNav(() => action)
    else action()
  }

  /** specs/slug.md: "on entry in slug text box, validate that the name is unique; do not store if not unique." */
  const checkSlug = async (value: string) => {
    const trimmed = value.trim()
    if (!trimmed) {
      setSlugError(null)
      return
    }
    try {
      const res = await api.get<{ available: boolean }>(
        `/panels/check-slug/?slug=${encodeURIComponent(trimmed)}&exclude=${encodeURIComponent(panelId)}`,
      )
      setSlugError(res.available ? null : 'This slug is already in use.')
    } catch (err) {
      setSlugError(String(err))
    }
  }

  const copySlugUrl = async () => {
    if (!slug.trim()) return
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/panel/${slug.trim()}`)
      toast.success('Slug URL copied.')
    } catch {
      toast.error('Clipboard access was denied.')
    }
  }

  const save = async (): Promise<boolean> => {
    if (!panelId) {
      toast.error('Set a dashboard id before saving.')
      return false
    }
    if (slugError) {
      toast.error('Fix the slug before saving.')
      return false
    }
    try {
      const body = { id: panelId, name, slug: slug.trim() || null, category, subcategory, description, content, allowed_roles: allowedRoles }
      if (isNew) {
        await api.post<Panel>('/panels/', body)
        navigate(`/editor/${panelId}`, { replace: true })
      } else {
        await api.put<Panel>(`/panels/${panelId}/`, body)
      }
      savedSnapshot.current = JSON.stringify({ name, slug, category, subcategory, description, content, allowedRoles })
      toast.success('Saved.')
      return true
    } catch (err) {
      toast.error(String(err))
      return false
    }
  }

  const saveAs = async (newPanelId: string) => {
    if (slugError) {
      toast.error('Fix the slug before saving.')
      return
    }
    try {
      await api.post<Panel>('/panels/', {
        id: newPanelId,
        name,
        slug: slug.trim() || null,
        category,
        subcategory,
        description,
        content,
        allowed_roles: allowedRoles,
      })
      savedSnapshot.current = JSON.stringify({ name, slug, category, subcategory, description, content, allowedRoles })
      setSaveAsOpen(false)
      navigate(`/editor/${newPanelId}`)
    } catch (err) {
      toast.error(String(err))
    }
  }

  // --- Parameters ---
  const addParameter = () => {
    const paramName = `param${content.parameters.length + 1}`
    setContent((c) => ({ ...c, parameters: [...c.parameters, { name: paramName, label: paramName, dataType: 'str' }] }))
    setSelection({ kind: 'parameter', name: paramName })
  }
  const updateParameter = (paramName: string, patch: Record<string, unknown>) => {
    setContent((c) => ({ ...c, parameters: c.parameters.map((p) => (p.name === paramName ? { ...p, ...patch } : p)) }))
    if (typeof patch.name === 'string' && patch.name !== paramName) setSelection({ kind: 'parameter', name: patch.name })
  }
  const deleteParameter = (paramName: string) => {
    setContent((c) => ({ ...c, parameters: c.parameters.filter((p) => p.name !== paramName) }))
    if (selection?.kind === 'parameter' && selection.name === paramName) setSelection(null)
  }
  const copyParameter = async (paramName: string) => {
    const param = content.parameters.find((p) => p.name === paramName)
    if (!param) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(param, null, 2))
      toast.success('Copied.')
    } catch {
      toast.error('Clipboard access was denied.')
    }
  }
  const pasteParameter = async () => {
    const parsed = await readClipboardJson()
    if (parsed === null) return
    if (!isPanelParameter(parsed)) {
      toast.error("Clipboard doesn't contain a parameter.")
      return
    }
    const name = uniqueName(parsed.name, content.parameters.map((p) => p.name))
    const fresh = { ...parsed, name }
    setContent((c) => ({ ...c, parameters: [...c.parameters, fresh] }))
    setSelection({ kind: 'parameter', name })
    toast.success('Pasted.')
  }

  // --- Datastores ---
  const saveDatastoreRef = (ref: PanelDatastoreRef) => {
    setContent((c) => {
      const exists = c.datastores.some((d) => d.id === ref.id)
      return { ...c, datastores: exists ? c.datastores.map((d) => (d.id === ref.id ? ref : d)) : [...c.datastores, ref] }
    })
    setSelection({ kind: 'datastore', id: ref.id })
    setDatastoreDialog(null)
  }
  const deleteDatastore = (dsId: string) => {
    setContent((c) => ({ ...c, datastores: c.datastores.filter((d) => d.id !== dsId) }))
    if (selection?.kind === 'datastore' && selection.id === dsId) setSelection(null)
  }
  const copyDatastore = async (dsId: string) => {
    const ds = content.datastores.find((d) => d.id === dsId)
    if (!ds) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(ds, null, 2))
      toast.success('Copied.')
    } catch {
      toast.error('Clipboard access was denied.')
    }
  }
  const pasteDatastore = async () => {
    const parsed = await readClipboardJson()
    if (parsed === null) return
    if (!isPanelDatastoreRef(parsed)) {
      toast.error("Clipboard doesn't contain a datastore.")
      return
    }
    const name = uniqueName(parsed.name, content.datastores.map((d) => d.name))
    const fresh = { ...parsed, id: newId('ds'), name }
    setContent((c) => ({ ...c, datastores: [...c.datastores, fresh] }))
    setSelection({ kind: 'datastore', id: fresh.id })
    toast.success('Pasted.')
  }

  // --- Content tree --- (generalized across every root -- content's own plus each drilldown's, see panelTree's allRoots/findRootContaining/replaceRoot -- so the exact same handlers work for a node anywhere in a drilldown's tree too)
  const updateContentNode = (nodeId: string, patch: Record<string, unknown>) => {
    setContent((c) => {
      const nodeRoot = findRootContaining(c, nodeId)
      return nodeRoot ? replaceRoot(c, nodeRoot.id, updateNode(nodeRoot, nodeId, (n) => ({ ...n, ...patch }))) : c
    })
  }
  const handleAddChild = (parentId: string, type: NodeType) => {
    const child = defaultNodeFor(type, newId(type))
    setContent((c) => {
      const nodeRoot = findRootContaining(c, parentId)
      return nodeRoot ? replaceRoot(c, nodeRoot.id, addChild(nodeRoot, parentId, child)) : c
    })
    setSelection({ kind: 'node', id: child.id })
  }
  const deleteContentNode = (nodeId: string) => {
    setContent((c) => {
      const nodeRoot = findRootContaining(c, nodeId)
      if (!nodeRoot) return c
      const [newRoot, nextId] = removeNode(nodeRoot, nodeId)
      setSelection({ kind: 'node', id: nextId })
      return replaceRoot(c, nodeRoot.id, newRoot)
    })
  }
  const moveContentNode = (nodeId: string, edge: 'top' | 'bottom' | 'up' | 'down') => {
    setContent((c) => {
      const nodeRoot = findRootContaining(c, nodeId)
      return nodeRoot ? replaceRoot(c, nodeRoot.id, moveNode(nodeRoot, nodeId, edge)) : c
    })
  }
  const copyContentNode = async (nodeId: string) => {
    const node = findNodeInContent(content, nodeId)
    if (!node) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(node, null, 2))
      toast.success('Copied.')
    } catch {
      toast.error('Clipboard access was denied.')
    }
  }
  const pasteContentNode = async (targetId: string) => {
    const parsed = await readClipboardJson()
    if (parsed === null) return
    if (!isPanelNode(parsed)) {
      toast.error("Clipboard doesn't contain a panel control.")
      return
    }
    const targetRoot = findRootContaining(content, targetId)
    const target = targetRoot ? findNode(targetRoot, targetId) : null
    if (!target || !targetRoot) return
    const fresh = regenerateIds(parsed)
    const asChild = childTypesFor(target.type).includes(fresh.type)
    if (!asChild && target.id === targetRoot.id) {
      toast.error(`Can't paste a ${fresh.type} at the top level.`)
      return
    }
    setContent((c) => {
      const nodeRoot = findRootContaining(c, targetId)
      if (!nodeRoot) return c
      return replaceRoot(c, nodeRoot.id, asChild ? addChild(nodeRoot, targetId, fresh) : insertAfter(nodeRoot, targetId, fresh))
    })
    setSelection({ kind: 'node', id: fresh.id })
    toast.success('Pasted.')
  }
  // --- Drilldowns --- (flat CRUD on content.drilldowns itself; the node tree inside each one's own `root` goes through the same generalized content-tree handlers above)
  const addDrilldown = () => {
    const dd = defaultDrilldownFor(newId('drilldown'), `Drilldown ${(content.drilldowns?.length ?? 0) + 1}`)
    setContent((c) => ({ ...c, drilldowns: [...(c.drilldowns ?? []), dd] }))
    setSelection({ kind: 'drilldown', id: dd.id })
  }
  const updateDrilldown = (drilldownId: string, patch: Record<string, unknown>) => {
    setContent((c) => ({ ...c, drilldowns: (c.drilldowns ?? []).map((d) => (d.id === drilldownId ? { ...d, ...patch } : d)) }))
  }
  const deleteDrilldown = (drilldownId: string) => {
    setContent((c) => ({ ...c, drilldowns: (c.drilldowns ?? []).filter((d) => d.id !== drilldownId) }))
    if (selection?.kind === 'drilldown' && selection.id === drilldownId) setSelection(null)
  }

  // --- Links --- (flat records like parameters/datastores -- specs/link.md: opening one is just window.open, no nested control tree)
  const addLink = () => {
    const link = defaultLinkFor(newId('link'), `Link ${(content.links?.length ?? 0) + 1}`)
    setContent((c) => ({ ...c, links: [...(c.links ?? []), link] }))
    setSelection({ kind: 'link', id: link.id })
  }
  const updateLink = (linkId: string, patch: Record<string, unknown>) => {
    setContent((c) => ({ ...c, links: (c.links ?? []).map((l) => (l.id === linkId ? { ...l, ...patch } : l)) }))
  }
  const deleteLink = (linkId: string) => {
    setContent((c) => ({ ...c, links: (c.links ?? []).filter((l) => l.id !== linkId) }))
    if (selection?.kind === 'link' && selection.id === linkId) setSelection(null)
  }
  const copyLink = async (linkId: string) => {
    const link = content.links?.find((l) => l.id === linkId)
    if (!link) return
    try {
      await navigator.clipboard.writeText(JSON.stringify(link, null, 2))
      toast.success('Copied.')
    } catch {
      toast.error('Clipboard access was denied.')
    }
  }
  const pasteLink = async () => {
    const parsed = await readClipboardJson()
    if (parsed === null) return
    if (!isPanelLink(parsed)) {
      toast.error("Clipboard doesn't contain a link.")
      return
    }
    const fresh = { ...parsed, id: newId('link') }
    setContent((c) => ({ ...c, links: [...(c.links ?? []), fresh] }))
    setSelection({ kind: 'link', id: fresh.id })
    toast.success('Pasted.')
  }

  const [viewSourceId, setViewSourceId] = useState<string | null>(null)
  const viewSourceNode = viewSourceId ? findNodeInContent(content, viewSourceId) : null
  const [viewJsonParamName, setViewJsonParamName] = useState<string | null>(null)
  const viewJsonParam = viewJsonParamName ? content.parameters.find((p) => p.name === viewJsonParamName) : null
  const [viewJsonDatastoreId, setViewJsonDatastoreId] = useState<string | null>(null)
  const viewJsonDatastore = viewJsonDatastoreId ? content.datastores.find((d) => d.id === viewJsonDatastoreId) : null
  const [viewJsonLinkId, setViewJsonLinkId] = useState<string | null>(null)
  const viewJsonLink = viewJsonLinkId ? content.links?.find((l) => l.id === viewJsonLinkId) : null
  const [jsonDialogOpen, setJsonDialogOpen] = useState(false)
  const applyJsonContent = (next: PanelContent) => {
    setContent(next)
    setSelection({ kind: 'node', id: next.content[0]?.id ?? 'root' })
  }
  const applyNodeJson = (nodeId: string, next: PanelNode) => {
    setContent((c) => {
      const nodeRoot = findRootContaining(c, nodeId)
      return nodeRoot ? replaceRoot(c, nodeRoot.id, updateNode(nodeRoot, nodeId, () => next)) : c
    })
  }
  const applyParameterJson = (paramName: string, next: PanelParameter) => {
    setContent((c) => ({ ...c, parameters: c.parameters.map((p) => (p.name === paramName ? next : p)) }))
  }

  // --- Load columns (datatable/chart): populate columns from a 1-2 row datastore sample ---
  const [loadColumnsPrompt, setLoadColumnsPrompt] = useState<{ nodeId: string; columns: PanelNode[] } | null>(null)

  const applyLoadedColumns = (nodeId: string, columns: PanelNode[], mode: 'replace' | 'add') => {
    setContent((c) => {
      const nodeRoot = findRootContaining(c, nodeId)
      if (!nodeRoot) return c
      return replaceRoot(
        c,
        nodeRoot.id,
        updateNode(nodeRoot, nodeId, (n) => {
          const existing = n.columns ?? []
          const merged =
            mode === 'replace' ? columns : [...existing, ...columns.filter((col) => !existing.some((e) => e.field === col.field))]
          return { ...n, columns: merged }
        }),
      )
    })
    toast.success('Columns loaded.')
  }

  /** Shared tail for both "Load Columns from Datastore" and "...from JSON": infer columns from sample rows, then either apply directly or prompt replace-vs-add if the node already has columns. */
  const finishLoadColumns = (nodeId: string, rows: unknown[]) => {
    const node = findNodeInContent(content, nodeId)
    if (!node) return
    const columnType = node.type === 'chart' ? 'chart-column' : node.type === 'pivot' ? 'pivot-column' : 'datatable-column'
    const columns = buildColumnsFromSample(rows, columnType)
    if ((node.columns ?? []).length > 0) {
      setLoadColumnsPrompt({ nodeId, columns })
    } else {
      applyLoadedColumns(nodeId, columns, 'replace')
    }
  }

  const handleLoadColumns = async (nodeId: string) => {
    const node = findNodeInContent(content, nodeId)
    if (!node) return
    if (!node.datastore) {
      toast.error('Set a datastore first.')
      return
    }
    const entry = content.datastores.find((d) => d.name === node.datastore)
    if (!entry) {
      toast.error('Datastore not found.')
      return
    }
    let result: DatastorePreviewResult
    try {
      result =
        entry.scope === 'local'
          ? await api.post<DatastorePreviewResult>('/datastores/preview-config/', { ...entry, params: {}, limit: 2 })
          : await api.post<DatastorePreviewResult>(`/datastores/${entry.name}/preview/`, { params: {}, limit: 2 })
    } catch (err) {
      toast.error(String(err))
      return
    }
    if (!result.ok) {
      toast.error(result.message ?? 'Failed to load sample data.')
      return
    }
    const rows = Array.isArray(result.data) ? result.data : []
    if (rows.length === 0) {
      toast.error('Datastore returned no rows to infer columns from.')
      return
    }
    finishLoadColumns(nodeId, rows)
  }

  const [jsonColumnsNodeId, setJsonColumnsNodeId] = useState<string | null>(null)

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex flex-none flex-wrap items-center gap-2 border-b border-border px-[18px] py-2.5">
        <div className="flex items-center gap-2 text-[1.05em] font-bold">Editor{dirty ? ' *' : ''}</div>
        <div className="flex-1" />

        <Button variant="outline" size="sm" onClick={() => guardedNavigate(() => navigate('/editor/new'))}>
          New
        </Button>
        <Button variant="outline" size="sm" onClick={() => setOpenDialogOpen(true)}>
          Open
        </Button>
        <div className="h-5 w-px bg-border" />
        <Button size="sm" onClick={save}>
          <Save />
          Save
        </Button>
        <Button variant="outline" size="sm" onClick={() => setSaveAsOpen(true)}>
          Save As…
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="icon-sm" aria-label="More actions">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[200px]">
            {!isNew && (
              <>
                <DropdownMenuItem onClick={() => guardedNavigate(() => navigate(`/panel/${panelId}`))}>
                  <Eye />
                  View
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => openInNewWindow(`/panel/${panelId}`)}>
                  <ExternalLink />
                  View in New Window
                </DropdownMenuItem>
                <DropdownMenuSeparator />
              </>
            )}
            <DropdownMenuItem onClick={() => setJsonDialogOpen(true)}>
              <FileJson />
              Edit JSON
            </DropdownMenuItem>
            {!isNew && (
              <DropdownMenuItem asChild>
                <a href={`/api/panels/${panelId}/download/`}>
                  <Download />
                  Download JSON
                </a>
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="flex min-h-0 flex-1">
        <div
          className="flex flex-none flex-col overflow-hidden border-r border-sidebar-border bg-sidebar"
          style={{ width: sidebarWidth }}
        >
          <div className="flex flex-none flex-col gap-2 p-2">
            <div className="text-[0.78em] text-muted-foreground">Dashboard Id {panelId}</div>
            <div className="flex gap-2">
              <Field label="Name" className="flex-1">
                <Input value={name} onChange={(e) => setName(e.target.value)} className="h-7 text-[0.85em]" />
              </Field>
              <Field label="Slug" className="flex-1" error={!!slugError} helperText={slugError ?? undefined}>
                <div className="flex items-center gap-1">
                  <Input
                    value={slug}
                    onChange={(e) => {
                      setSlug(e.target.value)
                      setSlugError(null)
                    }}
                    onBlur={() => checkSlug(slug)}
                    className="h-7 text-[0.85em]"
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon-xs"
                    disabled={!slug.trim()}
                    onClick={copySlugUrl}
                    aria-label="Copy slug URL"
                  >
                    <Copy />
                  </Button>
                </div>
              </Field>
            </div>
            <Collapsible defaultOpen={!!(category || subcategory || description)}>
              <CollapsibleTrigger className="flex w-full items-center gap-1.5 text-[0.78em] font-normal text-muted-foreground [&[data-state=open]>svg]:rotate-90">
                <ChevronRight className="size-3.5 shrink-0 transition-transform" />
                Category &amp; Description
              </CollapsibleTrigger>
              <CollapsibleContent className="flex flex-col gap-2 pt-1.5">
                <div className="flex gap-2">
                  <Field label="Category" className="flex-1">
                    <Input value={category} onChange={(e) => setCategory(e.target.value)} className="h-7 text-[0.85em]" />
                  </Field>
                  <Field label="Subcategory" className="flex-1">
                    <Input value={subcategory} onChange={(e) => setSubcategory(e.target.value)} className="h-7 text-[0.85em]" />
                  </Field>
                </div>
                <Field label="Description">
                  <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} className="text-[0.85em]" />
                </Field>
              </CollapsibleContent>
            </Collapsible>
            <RoleMultiSelect roles={roles} value={allowedRoles} onChange={setAllowedRoles} collapsible />
          </div>
          <div className="flex-none overflow-y-auto border-t border-sidebar-border px-2" style={{ height: treeHeight }}>
            <ComponentTree
              parameters={content.parameters}
              datastores={content.datastores}
              root={root}
              drilldowns={content.drilldowns ?? []}
              links={content.links ?? []}
              selection={selection}
              onSelect={setSelection}
              onAddParameter={addParameter}
              onDeleteParameter={deleteParameter}
              onCopyParameter={copyParameter}
              onPasteParameter={pasteParameter}
              onViewJsonParameter={setViewJsonParamName}
              onAddDatastore={() => setDatastoreDialog({ initial: null })}
              onDeleteDatastore={deleteDatastore}
              onCopyDatastore={copyDatastore}
              onPasteDatastore={pasteDatastore}
              onViewJsonDatastore={setViewJsonDatastoreId}
              onAddDrilldown={addDrilldown}
              onDeleteDrilldown={deleteDrilldown}
              onAddLink={addLink}
              onDeleteLink={deleteLink}
              onCopyLink={copyLink}
              onPasteLink={pasteLink}
              onViewJsonLink={setViewJsonLinkId}
              onAddChild={handleAddChild}
              onDeleteNode={deleteContentNode}
              onCopyNode={copyContentNode}
              onPasteNode={pasteContentNode}
              onMoveNode={moveContentNode}
              onViewSource={setViewSourceId}
              onLoadColumns={handleLoadColumns}
              onLoadColumnsFromJson={setJsonColumnsNodeId}
            />
          </div>
          <ResizeHandle direction="vertical" onMouseDown={treeDrag} />
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-sidebar-border">
            <SelectionProperties
              selection={selection}
              content={content}
              datastoreOptions={datastoreOptions}
              drilldownOptions={drilldownOptions}
              linkOptions={linkOptions}
              onUpdateParameter={updateParameter}
              onUpdateNode={updateContentNode}
              onUpdateDrilldown={updateDrilldown}
              onUpdateLink={updateLink}
              onEditDatastore={(ref) => setDatastoreDialog({ initial: ref })}
            />
          </div>
        </div>

        <ResizeHandle direction="horizontal" onMouseDown={sidebarDrag} />

        <div className="min-h-0 min-w-0 flex-1 overflow-hidden bg-muted/40">
          <Tabs value={mode} onValueChange={(v) => setMode(v as 'design' | 'preview')} className="flex h-full flex-col gap-0">
            <TabsList variant="line" className="flex-none border-b border-border bg-background px-3">
              <TabsTrigger value="design">Design</TabsTrigger>
              <TabsTrigger value="preview">Preview</TabsTrigger>
            </TabsList>
            <TabsContent value="design" className="min-h-0 flex-1 overflow-auto p-5">
              <div className="mx-auto h-full max-w-[820px]">
                <DesignModeLayout node={root} />
              </div>
            </TabsContent>
            <TabsContent value="preview" className="min-h-0 flex-1 overflow-auto p-5">
              <div className="mx-auto flex h-full max-w-[820px] flex-col gap-2">
                <Alert className="flex-none">
                  <Info />
                  <AlertDescription>Preview loads at most 100 records per datastore, for performance.</AlertDescription>
                </Alert>
                <div className="min-h-0 flex-1">
                  <ParameterProvider
                    parameters={content.parameters}
                    datastores={content.datastores}
                    content={content.content}
                    panelId={panelId}
                    key={content.parameters.map((p) => p.name).join(',')}
                  >
                    {/* LinkProvider outermost: DrilldownProvider's own popup dialog
                        renders a full PanelLayout of its own (nested controls that
                        also call useLinkMenu), so it must sit inside LinkProvider's
                        subtree too, not just be a sibling of it -- swapping this
                        order would leave the drilldown popup's controls without a
                        LinkContext ancestor. */}
                    <LinkProvider links={content.links ?? []}>
                      <DrilldownProvider drilldowns={content.drilldowns ?? []} datastores={content.datastores} previewMode>
                        <PanelLayout
                          node={root}
                          datastores={content.datastores}
                          previewMode
                          selectedId={selection?.kind === 'node' ? selection.id : undefined}
                          onSelect={(nodeId) => setSelection({ kind: 'node', id: nodeId })}
                        />
                      </DrilldownProvider>
                    </LinkProvider>
                  </ParameterProvider>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </div>
      </div>

      <StatusBar>{panelId || 'Unsaved panel'}</StatusBar>

      <SaveAsDialog open={saveAsOpen} onClose={() => setSaveAsOpen(false)} onSave={saveAs} />

      {openDialogOpen && (
        <OpenPanelDialog
          currentId={panelId}
          onClose={() => setOpenDialogOpen(false)}
          onSelect={(targetId) => {
            setOpenDialogOpen(false)
            guardedNavigate(() => navigate(`/editor/${targetId}`))
          }}
        />
      )}

      {viewSourceNode && (
        <EditComponentJsonDialog
          node={viewSourceNode}
          onApply={(next) => applyNodeJson(viewSourceNode.id, next)}
          onClose={() => setViewSourceId(null)}
        />
      )}
      {viewJsonParam && (
        <EditParameterJsonDialog
          parameter={viewJsonParam}
          onApply={(next) => applyParameterJson(viewJsonParam.name, next)}
          onClose={() => setViewJsonParamName(null)}
        />
      )}
      {viewJsonDatastore && (
        <ViewSourceDialog
          title={`${viewJsonDatastore.name} (${viewJsonDatastore.scope})`}
          value={viewJsonDatastore}
          onClose={() => setViewJsonDatastoreId(null)}
        />
      )}
      {viewJsonLink && (
        <ViewSourceDialog title={viewJsonLink.name} value={viewJsonLink} onClose={() => setViewJsonLinkId(null)} />
      )}

      {jsonDialogOpen && (
        <PanelJsonDialog content={content} onApply={applyJsonContent} onClose={() => setJsonDialogOpen(false)} />
      )}

      {loadColumnsPrompt && (
        <LoadColumnsDialog
          onClose={() => setLoadColumnsPrompt(null)}
          onReplace={() => {
            applyLoadedColumns(loadColumnsPrompt.nodeId, loadColumnsPrompt.columns, 'replace')
            setLoadColumnsPrompt(null)
          }}
          onAddOnly={() => {
            applyLoadedColumns(loadColumnsPrompt.nodeId, loadColumnsPrompt.columns, 'add')
            setLoadColumnsPrompt(null)
          }}
        />
      )}

      {jsonColumnsNodeId && (
        <LoadColumnsFromJsonDialog
          onSubmit={(rows) => {
            finishLoadColumns(jsonColumnsNodeId, rows)
            setJsonColumnsNodeId(null)
          }}
          onClose={() => setJsonColumnsNodeId(null)}
        />
      )}

      {datastoreDialog && (
        <DatastoreRefDialog
          initial={datastoreDialog.initial}
          globalDatastoreIds={globalDatastoreIds}
          connections={connections}
          actions={actions}
          actionOptions={actionOptions}
          onClose={() => setDatastoreDialog(null)}
          onSave={saveDatastoreRef}
        />
      )}

      {pendingNav && (
        <Dialog open onOpenChange={(o) => !o && setPendingNav(null)}>
          <DialogContent className="sm:max-w-xs">
            <DialogHeader>
              <DialogTitle>Unsaved changes</DialogTitle>
            </DialogHeader>
            <p className="text-[0.85em] text-muted-foreground">Save this dashboard before leaving?</p>
            <DialogFooter className="flex-col gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" size="sm" onClick={() => setPendingNav(null)}>
                Cancel
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const go = pendingNav
                  setPendingNav(null)
                  go?.()
                }}
              >
                Discard
              </Button>
              <Button
                size="sm"
                onClick={async () => {
                  const ok = await save()
                  const go = pendingNav
                  setPendingNav(null)
                  if (ok) go?.()
                }}
              >
                Save
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  )
}

function SelectionProperties({
  selection,
  content,
  datastoreOptions,
  drilldownOptions,
  linkOptions,
  onUpdateParameter,
  onUpdateNode,
  onUpdateDrilldown,
  onUpdateLink,
  onEditDatastore,
}: {
  selection: Selection
  content: PanelContent
  datastoreOptions: string[]
  drilldownOptions: { id: string; name: string }[]
  linkOptions: { id: string; name: string }[]
  onUpdateParameter: (name: string, patch: Record<string, unknown>) => void
  onUpdateNode: (id: string, patch: Record<string, unknown>) => void
  onUpdateDrilldown: (id: string, patch: Record<string, unknown>) => void
  onUpdateLink: (id: string, patch: Record<string, unknown>) => void
  onEditDatastore: (ref: PanelDatastoreRef) => void
}) {
  if (!selection) return <p className="p-3 text-[0.78em] text-muted-foreground">Select an item in the tree.</p>

  if (selection.kind === 'parameter') {
    const param = content.parameters.find((p) => p.name === selection.name)
    if (!param) return null
    return (
      <PropertyPanel
        title={`Parameter: ${param.name}`}
        record={param as unknown as Record<string, unknown>}
        schema={PARAMETER_SCHEMA}
        datastoreOptions={datastoreOptions}
        onChange={(patch) => onUpdateParameter(param.name, patch)}
      />
    )
  }

  if (selection.kind === 'datastore') {
    const ref = content.datastores.find((d) => d.id === selection.id)
    if (!ref) return null
    return (
      <div className="flex flex-col gap-2 p-3 text-[0.85em]">
        <div>
          <span className="text-muted-foreground">Name: </span>
          {ref.name}
        </div>
        <div>
          <span className="text-muted-foreground">Scope: </span>
          {ref.scope}
        </div>
        {ref.scope === 'local' && (
          <div>
            <span className="text-muted-foreground">Source: </span>
            {ref.source_type}
          </div>
        )}
        <Button size="sm" variant="outline" className="self-start" onClick={() => onEditDatastore(ref)}>
          Edit
        </Button>
      </div>
    )
  }

  if (selection.kind === 'drilldown') {
    const drilldown = content.drilldowns?.find((d) => d.id === selection.id)
    if (!drilldown) return null
    return (
      <PropertyPanel
        title={`Drilldown: ${drilldown.name}`}
        record={drilldown as unknown as Record<string, unknown>}
        schema={DRILLDOWN_META_SCHEMA}
        datastoreOptions={datastoreOptions}
        onChange={(patch) => onUpdateDrilldown(drilldown.id, patch)}
      />
    )
  }

  if (selection.kind === 'link') {
    const link = content.links?.find((l) => l.id === selection.id)
    if (!link) return null
    return (
      <PropertyPanel
        title={`Link: ${link.name}`}
        record={link as unknown as Record<string, unknown>}
        schema={LINK_SCHEMA}
        datastoreOptions={datastoreOptions}
        onChange={(patch) => onUpdateLink(link.id, patch)}
      />
    )
  }

  if (selection.kind !== 'node') return null

  const node = findNodeInContent(content, selection.id)
  if (!node) return null
  return (
    <PropertyPanel
      title={node.type}
      record={node as unknown as Record<string, unknown>}
      schema={schemaFor(node.type)}
      datastoreOptions={datastoreOptions}
      drilldownOptions={drilldownOptions}
      linkOptions={linkOptions}
      onChange={(patch) => onUpdateNode(node.id, patch)}
    />
  )
}

function SaveAsDialog({
  open,
  onClose,
  onSave,
}: {
  open: boolean
  onClose: () => void
  onSave: (id: string) => void
}) {
  const [id, setId] = useState('')

  useEffect(() => {
    if (open) setId('')
  }, [open])

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-xs">
        <DialogHeader>
          <DialogTitle>Save As</DialogTitle>
        </DialogHeader>
        <p className="text-[0.85em] text-muted-foreground">
          Saves the current dashboard content under a new id, leaving the original untouched.
        </p>
        <Field label="New dashboard id">
          <Input autoFocus value={id} onChange={(e) => setId(e.target.value)} className="h-8 text-[0.85em]" />
        </Field>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" disabled={!id} onClick={() => onSave(id)}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
