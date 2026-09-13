import { Clock, RefreshCw } from 'lucide-react'

interface Props {
  refreshMode: 'on_demand' | 'scheduled' | null
  /** refresh_mode=scheduled only: when the server last actually ran this datastore. */
  lastRunAt: string | null
}

function formatLastRun(iso: string | null): string {
  if (!iso) return 'never loaded'
  const date = new Date(iso)
  const diffSec = Math.round((Date.now() - date.getTime()) / 1000)
  if (diffSec < 5) return 'just now'
  if (diffSec < 60) return `${diffSec}s ago`
  const diffMin = Math.round(diffSec / 60)
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHour = Math.round(diffMin / 60)
  if (diffHour < 24) return `${diffHour}h ago`
  return date.toLocaleString()
}

/**
 * Small "how is this datasource loaded" indicator (specs/
 * datasource_enhancements.md): on-demand datastores just say so; scheduled
 * ones also show when the server last actually refreshed them. Renders
 * nothing until the owning datastore's refresh_mode is known.
 */
export function DatastoreStatusBadge({ refreshMode, lastRunAt }: Props) {
  if (!refreshMode) return null

  const isScheduled = refreshMode === 'scheduled'
  const title = isScheduled && lastRunAt ? new Date(lastRunAt).toLocaleString() : undefined

  return (
    <div
      title={title}
      className="absolute top-1.5 right-1.5 z-10 flex items-center gap-1 rounded-full border border-border bg-card/90 px-1.5 py-0.5 text-[0.68em] text-muted-foreground shadow-sm backdrop-blur-sm"
    >
      {isScheduled ? <Clock className="size-2.5" /> : <RefreshCw className="size-2.5" />}
      {isScheduled ? `Scheduled · ${formatLastRun(lastRunAt)}` : 'On demand'}
    </div>
  )
}
