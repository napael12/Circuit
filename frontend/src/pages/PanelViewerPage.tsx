import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { Info, MoreHorizontal } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Spinner } from '@/components/ui/spinner'

import { api } from '../api/client'
import type { Panel, PanelParameter } from '../api/types'
import { DrilldownProvider } from '../components/layout/DrilldownContext'
import { LinkProvider } from '../components/layout/LinkContext'
import { ParameterProvider, useAllParameterValues, useOpenParametersDialog } from '../components/layout/ParameterContext'
import { PanelLayout } from '../components/layout/PanelLayout'
import { StatusBar } from '../components/layout/StatusBar'
import { PanelUsageDialog } from '../components/manager/PanelUsageDialog'
import { openInNewWindow } from '../utils/newWindow'
import { visibleParameters } from '../utils/panelParams'
import { substituteParams } from '../utils/panelTemplating'
import { useBrandingStore } from '../store/branding'
import { useSessionStore } from '../store/session'

/** api/client.ts throws Error("{status} {detail}") -- pull the two apart to
 * tell "no access" (403, specs/permissions.md #6) from a bad id/slug (404). */
function describeLoadError(err: unknown): string {
  const message = err instanceof Error ? err.message : String(err)
  const match = /^(\d+)\s(.*)$/.exec(message)
  if (!match) return message
  const [, status, detail] = match
  if (status === '403') return detail || "You don't have access to this dashboard."
  if (status === '404') return 'Dashboard not found.'
  return detail || message
}

/** "/panel/:id" -- renders one saved dashboard. specs/homepage.md: "/" itself is HomePage now; AppShell renders AppSidebar alongside whichever of these routes is active. */
export function PanelViewerPage() {
  const { id } = useParams<{ id: string }>()
  const [panel, setPanel] = useState<Panel | null>(null)
  const [loading, setLoading] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)

  const load = () => {
    if (!id) return
    setLoading(true)
    setLoadError(null)
    api
      .get<Panel>(`/panels/${id}/`)
      .then(setPanel)
      .catch((err) => setLoadError(describeLoadError(err)))
      .finally(() => setLoading(false))
  }

  useEffect(() => {
    setPanel(null)
    load()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id])

  const body = loadError ? (
    <div className="flex h-full items-center justify-center text-muted-foreground">{loadError}</div>
  ) : loading || !panel ? (
    <div className="flex h-full items-center justify-center">
      <Spinner className="size-6" />
    </div>
  ) : (
    <div className="min-h-0 flex-1 overflow-auto p-4">
      <PanelLayout node={panel.content.content[0]} datastores={panel.content.datastores ?? []} />
    </div>
  )

  const content = (
    <div className="flex min-w-0 flex-1 flex-col">
      <ViewerToolbar panel={panel} onReload={load} />
      {body}
      <StatusBar>
        {panel ? (
          <ParameterSummary
            parameters={visibleParameters(panel.content.parameters ?? [], [
              ...panel.content.content,
              ...(panel.content.drilldowns ?? []).map((d) => d.root),
            ])}
          />
        ) : (
          <BrandName />
        )}
      </StatusBar>
    </div>
  )

  if (!panel) return content
  return (
    <ParameterProvider
      parameters={panel.content.parameters ?? []}
      datastores={panel.content.datastores ?? []}
      content={[...panel.content.content, ...(panel.content.drilldowns ?? []).map((d) => d.root)]}
      panelId={panel.id}
      key={panel.id}
    >
      {/* LinkProvider outermost: DrilldownProvider's own popup dialog renders
          a full PanelLayout of its own (nested controls that also call
          useLinkMenu), so it must sit inside LinkProvider's subtree too, not
          just be a sibling of it -- see the matching comment in EditorPage.tsx. */}
      <LinkProvider links={panel.content.links ?? []}>
        <DrilldownProvider drilldowns={panel.content.drilldowns ?? []} datastores={panel.content.datastores ?? []}>
          {content}
        </DrilldownProvider>
      </LinkProvider>
    </ParameterProvider>
  )
}

function ViewerToolbar({ panel, onReload }: { panel: Panel | null; onReload?: () => void }) {
  const isAdmin = useSessionStore((s) => s.session?.is_admin)
  const navigate = useNavigate()
  const [usageOpen, setUsageOpen] = useState(false)

  const addToFavorites = async (panelId: string) => {
    try {
      await api.post(`/panels/${panelId}/favorite/`)
      toast.success('Added to favorites.')
    } catch (err) {
      toast.error(String(err))
    }
  }

  const subtitle = panel ? [panel.category, panel.subcategory].filter(Boolean).join(' → ') : ''

  return (
    <div className="flex flex-none items-center gap-2.5 border-b border-border px-[18px] py-2.5">
      {/* specs/homepage.md: app branding now lives once in AppSidebar -- no app.icon on this content page. */}
      <div className="flex flex-col justify-center">
        <div className="flex items-center gap-1.5 text-[1.25em] font-bold">
          {panel ? <PanelTitle panel={panel} /> : <BrandName />}
          {panel?.description && (
            <span title={panel.description} className="text-muted-foreground">
              <Info className="size-4" />
            </span>
          )}
        </div>
        {subtitle && <div className="text-[0.72em] text-muted-foreground">{subtitle}</div>}
      </div>
      <div className="flex-1" />
      {onReload && (
        <Button variant="outline" size="sm" onClick={onReload}>
          Reload
        </Button>
      )}
      {panel && <ParametersButton />}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" size="icon-sm" aria-label="More actions">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-[200px]">
          {panel && (
            <>
              <DropdownMenuItem onClick={() => openInNewWindow(window.location.href)}>Open in New Window</DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => navigator.clipboard.writeText(`${window.location.origin}/panel/${panel.slug || panel.id}`)}
              >
                Copy Page Link
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => addToFavorites(panel.id)}>Add to Favorites</DropdownMenuItem>
              {isAdmin && <DropdownMenuItem onClick={() => setUsageOpen(true)}>View KPIs</DropdownMenuItem>}
              {isAdmin && <DropdownMenuItem onClick={() => navigate(`/editor/${panel.id}`)}>Edit Page</DropdownMenuItem>}
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      {panel && usageOpen && <PanelUsageDialog panel={panel} onClose={() => setUsageOpen(false)} />}
    </div>
  )
}

function PanelTitle({ panel }: { panel: Panel }) {
  const values = useAllParameterValues()
  return <>{substituteParams(panel.name, values)}</>
}

/** specs/circuit.md: the configured application name, wherever no dashboard/panel title takes precedence. */
function BrandName() {
  return <>{useBrandingStore((s) => s.branding.name)}</>
}

/** Opens the shared ParametersDialog (rendered by ParameterProvider); hidden when there's nothing to show, same as the old inline popover trigger. */
function ParametersButton() {
  const { show, hasParameters } = useOpenParametersDialog()
  if (!hasParameters) return null
  return (
    <Button variant="outline" size="sm" onClick={show}>
      Parameters
    </Button>
  )
}

/** `parameters` is expected pre-filtered via visibleParameters (see caller in PanelViewerPage). */
function ParameterSummary({ parameters }: { parameters: PanelParameter[] }) {
  const values = useAllParameterValues()
  if (parameters.length === 0) return null
  return <>{parameters.map((p) => `${p.label} = ${values[p.name] || '—'}`).join('   ')}</>
}
