import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { toast } from 'sonner'

import { api } from '../api/client'
import type { Panel } from '../api/types'
import { DashboardsGrid } from '../components/layout/DashboardsGrid'
import { StatusBar } from '../components/layout/StatusBar'
import { useBrandingStore } from '../store/branding'

interface HomeKpis {
  total_dashboards: number
  dashboards_last_24h: number
  active_users_last_24h: number
}

function KpiCard({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="flex min-w-[160px] flex-1 flex-col gap-1 rounded-[10px] border border-border bg-card px-4 py-3">
      <span className="text-[1.6em] font-bold leading-none">{value ?? '—'}</span>
      <span className="text-[0.78em] text-muted-foreground">{label}</span>
    </div>
  )
}

/**
 * "/" -- specs/homepage.md's Home/Categories/Favorites content, all one
 * component since they're really the same list view (search + data grid,
 * see DashboardsGrid) over three different slices of the same panel list,
 * selected via AppSidebar's own `?view=`/`category=`/`subcategory=` links
 * rather than separate routes -- KPIs are the only piece unique to the
 * plain Home view (no category/favorites param set).
 */
export function HomePage() {
  const brandName = useBrandingStore((s) => s.branding.name)
  const [searchParams] = useSearchParams()
  const category = searchParams.get('category') ?? ''
  const subcategory = searchParams.get('subcategory') ?? ''
  const isFavoritesView = searchParams.get('view') === 'favorites'
  const isPlainHome = !category && !isFavoritesView

  const [panels, setPanels] = useState<Panel[]>([])
  const [loading, setLoading] = useState(true)
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set())
  const [kpis, setKpis] = useState<HomeKpis | null>(null)

  useEffect(() => {
    setLoading(true)
    Promise.all([api.get<Panel[]>('/panels/'), api.get<string[]>('/panels/favorite-ids/')])
      .then(([panelList, favIds]) => {
        setPanels(panelList)
        setFavoriteIds(new Set(favIds))
      })
      .catch((err) => toast.error(String(err)))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => {
    if (!isPlainHome) return
    api.get<HomeKpis>('/panels/home-kpis/').then(setKpis).catch(() => setKpis(null))
  }, [isPlainHome])

  const rows = useMemo(() => {
    if (isFavoritesView) return panels.filter((p) => favoriteIds.has(p.id))
    if (category) return panels.filter((p) => p.category === category && (!subcategory || p.subcategory === subcategory))
    return panels
  }, [panels, favoriteIds, isFavoritesView, category, subcategory])

  const toggleFavorite = async (panel: Panel, next: boolean) => {
    // Optimistic: the whole point of a star-toggle is that it feels instant.
    setFavoriteIds((ids) => {
      const copy = new Set(ids)
      if (next) copy.add(panel.id)
      else copy.delete(panel.id)
      return copy
    })
    try {
      if (next) await api.post(`/panels/${panel.id}/favorite/`)
      else await api.delete(`/panels/${panel.id}/favorite/`)
    } catch (err) {
      toast.error(String(err))
      // Roll back on failure.
      setFavoriteIds((ids) => {
        const copy = new Set(ids)
        if (next) copy.delete(panel.id)
        else copy.add(panel.id)
        return copy
      })
    }
  }

  const heading = isFavoritesView ? 'Favorites' : category ? [category, subcategory].filter(Boolean).join(' / ') : 'Home'

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4">
        <div className="text-[1.1em] font-bold">{heading}</div>
        {isPlainHome && (
          <div className="flex flex-wrap gap-3">
            <KpiCard label="Dashboards" value={kpis?.total_dashboards ?? null} />
            <KpiCard label="Dashboards (Last 24h)" value={kpis?.dashboards_last_24h ?? null} />
            <KpiCard label="Active Users (Last 24h)" value={kpis?.active_users_last_24h ?? null} />
          </div>
        )}
        <DashboardsGrid rows={rows} loading={loading} favoriteIds={favoriteIds} onToggleFavorite={toggleFavorite} />
      </div>
      <StatusBar>{brandName}</StatusBar>
    </div>
  )
}
