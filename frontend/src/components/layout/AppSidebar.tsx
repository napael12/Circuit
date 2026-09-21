import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation, useSearchParams } from 'react-router-dom'
import { ChevronDown, ChevronLeft, ChevronRight, Folder, Home, MoreHorizontal, Star, Wrench, type LucideIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

import { api } from '../../api/client'
import type { Panel } from '../../api/types'
import { useBrandingStore } from '../../store/branding'
import { useSessionStore } from '../../store/session'
import { AccountMenuItems } from './AccountMenuItems'
import { AppIcon } from './AppIcon'

interface CategoryNode {
  name: string
  subcategories: string[]
}

/** Distinct category -> sorted distinct subcategory names, from the panel list's own category/subcategory fields -- no separate endpoint, since /panels/ already carries them. */
function buildCategoryTree(panels: Panel[]): CategoryNode[] {
  const subsByCategory = new Map<string, Set<string>>()
  for (const p of panels) {
    const category = p.category?.trim()
    if (!category) continue
    if (!subsByCategory.has(category)) subsByCategory.set(category, new Set())
    const subcategory = p.subcategory?.trim()
    if (subcategory) subsByCategory.get(category)!.add(subcategory)
  }
  return Array.from(subsByCategory.entries())
    .map(([name, subs]) => ({ name, subcategories: Array.from(subs).sort() }))
    .sort((a, b) => a.name.localeCompare(b.name))
}

/**
 * specs/homepage.md: the persistent left-hand navigation shared by every
 * authenticated page (see AppShell) -- app branding, Home/Categories/
 * Favorites/Manager nav, and a bottom logged-in-user block with Settings/
 * Sign out. Replaces the old per-viewer NavTreeSidebar; Home's own KPIs/
 * search/list content lives in HomePage, driven by this component's own
 * `?view=`/`category=`/`subcategory=` links so the URL stays shareable.
 */
export function AppSidebar() {
  // specs/circuit.md follow-up: a panel opened via "Open in New Window"
  // appends ?sidebar=collapsed so the fresh window starts collapsed rather
  // than re-showing the full nav chrome -- read once at mount (this
  // component never remounts across in-app navigation, so this only ever
  // reflects the URL the window/tab was first loaded with).
  const [collapsed, setCollapsed] = useState(() => new URLSearchParams(window.location.search).get('sidebar') === 'collapsed')
  const [categoriesOpen, setCategoriesOpen] = useState(false)
  const [openCategories, setOpenCategories] = useState<Record<string, boolean>>({})
  const [panels, setPanels] = useState<Panel[]>([])
  const brandName = useBrandingStore((s) => s.branding.name)
  const brandVersion = useBrandingStore((s) => s.branding.version)
  const session = useSessionStore((s) => s.session)
  const location = useLocation()
  const [searchParams] = useSearchParams()

  const onHomeRoute = location.pathname === '/'

  // Refetches whenever the user lands back on "/" (not on every render --
  // this component never unmounts across route changes, being the one
  // persistent piece of chrome, so a plain mount-only effect would leave
  // the Categories tree stale after e.g. editing a dashboard's category and
  // returning Home).
  useEffect(() => {
    api.get<Panel[]>('/panels/').then(setPanels).catch(() => {})
  }, [onHomeRoute])

  const categories = useMemo(() => buildCategoryTree(panels), [panels])

  const activeView = onHomeRoute ? (searchParams.get('view') ?? '') : ''
  const activeCategory = onHomeRoute ? (searchParams.get('category') ?? '') : ''
  const activeSubcategory = onHomeRoute ? (searchParams.get('subcategory') ?? '') : ''
  const isHome = onHomeRoute && !activeView && !activeCategory
  const isFavorites = activeView === 'favorites'
  const isManager = location.pathname.startsWith('/manager')

  if (collapsed) {
    return (
      <div className="flex w-11 flex-none flex-col items-center gap-3 border-r border-sidebar-border bg-sidebar py-3">
        <AppIcon />
        <button
          onClick={() => setCollapsed(false)}
          aria-label="Expand sidebar"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted"
        >
          <ChevronRight className="size-4" />
        </button>
      </div>
    )
  }

  return (
    <div className="flex w-[240px] flex-none flex-col border-r border-sidebar-border bg-sidebar">
      <div className="flex items-center gap-2 px-3 pt-3 pb-1">
        <AppIcon className="size-5" />
        <span className="flex-1 truncate text-[0.95em] font-bold">{brandName}</span>
        <button
          onClick={() => setCollapsed(true)}
          aria-label="Collapse sidebar"
          className="rounded-md p-1 text-muted-foreground hover:bg-muted"
        >
          <ChevronLeft className="size-4" />
        </button>
      </div>
      {/* "add 'version' feature ... display version below application title/icon" */}
      {brandVersion && <div className="px-3 pb-2 text-[0.68em] text-muted-foreground">v{brandVersion}</div>}

      <nav className="flex-1 overflow-y-auto px-2 py-1">
        <NavRow icon={Home} label="Home" to="/" active={isHome} />

        <div>
          <button
            onClick={() => setCategoriesOpen((o) => !o)}
            className={cn(
              'flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[0.85em] font-medium hover:bg-muted',
              !!activeCategory && 'text-foreground',
            )}
          >
            <Folder className="size-4 shrink-0 text-muted-foreground" />
            <span className="flex-1 truncate">Categories</span>
            {categories.length > 0 &&
              (categoriesOpen ? (
                <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
              ) : (
                <ChevronRight className="size-3.5 shrink-0 text-muted-foreground" />
              ))}
          </button>
          {categoriesOpen && (
            <div className="ml-2 border-l border-sidebar-border pl-2">
              {categories.length === 0 && <div className="px-2 py-1 text-[0.78em] text-muted-foreground">No categories yet.</div>}
              {categories.map((cat) => {
                const isOpen = !!openCategories[cat.name]
                const isCatActive = activeCategory === cat.name && !activeSubcategory
                return (
                  <div key={cat.name}>
                    <div className="flex items-center gap-1">
                      {cat.subcategories.length > 0 ? (
                        <button
                          onClick={() => setOpenCategories((o) => ({ ...o, [cat.name]: !o[cat.name] }))}
                          className="inline-flex size-4 shrink-0 items-center justify-center text-muted-foreground"
                        >
                          {isOpen ? <ChevronDown className="size-3" /> : <ChevronRight className="size-3" />}
                        </button>
                      ) : (
                        <span className="inline-flex size-4 shrink-0" />
                      )}
                      <Link
                        to={`/?category=${encodeURIComponent(cat.name)}`}
                        className={cn(
                          'flex-1 truncate rounded-md px-1.5 py-1 text-[0.83em] hover:bg-muted',
                          isCatActive ? 'bg-muted font-semibold text-foreground' : 'text-muted-foreground',
                        )}
                      >
                        {cat.name}
                      </Link>
                    </div>
                    {isOpen &&
                      cat.subcategories.map((sub) => (
                        <Link
                          key={sub}
                          to={`/?category=${encodeURIComponent(cat.name)}&subcategory=${encodeURIComponent(sub)}`}
                          className={cn(
                            'ml-5 flex truncate rounded-md px-1.5 py-1 text-[0.82em] hover:bg-muted',
                            activeCategory === cat.name && activeSubcategory === sub
                              ? 'bg-muted font-semibold text-foreground'
                              : 'text-muted-foreground',
                          )}
                        >
                          {sub}
                        </Link>
                      ))}
                  </div>
                )
              })}
            </div>
          )}
        </div>

        <NavRow icon={Star} label="Favorites" to="/?view=favorites" active={isFavorites} />

        {session?.is_admin && <NavRow icon={Wrench} label="Manager" to="/manager" active={isManager} />}
      </nav>

      <div className="flex items-center gap-2 border-t border-sidebar-border px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <div className="truncate text-[0.85em] font-semibold">{session?.username}</div>
          <div className="truncate text-[0.72em] text-muted-foreground">{(session?.roles ?? []).join(', ') || 'No roles'}</div>
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon-xs" aria-label="Account">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-[180px]">
            <AccountMenuItems />
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  )
}

function NavRow({ icon: Icon, label, to, active }: { icon: LucideIcon; label: string; to: string; active: boolean }) {
  return (
    <Link
      to={to}
      className={cn(
        'flex items-center gap-2 rounded-md px-2 py-1.5 text-[0.85em] font-medium hover:bg-muted',
        active ? 'bg-muted text-foreground' : 'text-foreground/90',
      )}
    >
      <Icon className="size-4 shrink-0 text-muted-foreground" />
      {label}
    </Link>
  )
}
