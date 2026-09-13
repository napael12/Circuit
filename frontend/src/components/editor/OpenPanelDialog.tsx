import { useEffect, useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { toast } from 'sonner'

import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'

import { api } from '../../api/client'
import type { Panel } from '../../api/types'

interface Props {
  currentId: string
  onClose: () => void
  onSelect: (id: string) => void
}

/** Toolbar "Open": browse/filter saved dashboards and jump the editor to one, without leaving the editor. */
export function OpenPanelDialog({ currentId, onClose, onSelect }: Props) {
  const [panels, setPanels] = useState<Panel[]>([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')

  useEffect(() => {
    api
      .get<Panel[]>('/panels/')
      .then(setPanels)
      .catch((err) => toast.error(String(err)))
      .finally(() => setLoading(false))
  }, [])

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return panels
    return panels.filter((p) => p.name.toLowerCase().includes(q) || p.id.toLowerCase().includes(q))
  }, [panels, filter])

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Open dashboard</DialogTitle>
        </DialogHeader>
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            autoFocus
            placeholder="Filter by name or id…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            className="h-8 pl-7 text-[0.85em]"
          />
        </div>
        <div className="max-h-80 overflow-y-auto rounded-md border border-border">
          {loading && <div className="p-3 text-[0.85em] text-muted-foreground">Loading…</div>}
          {!loading && filtered.length === 0 && (
            <div className="p-3 text-[0.85em] text-muted-foreground">No dashboards found.</div>
          )}
          {filtered.map((p) => (
            <button
              key={p.id}
              type="button"
              disabled={p.id === currentId}
              onClick={() => onSelect(p.id)}
              className="flex w-full flex-col items-start gap-0.5 border-b border-border px-3 py-2 text-left text-[0.85em] last:border-b-0 hover:bg-muted/50 disabled:cursor-default disabled:opacity-50"
            >
              <span className="font-medium">{p.name}</span>
              <span className="text-[0.78em] text-muted-foreground">{p.id}</span>
            </button>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
