import { useCallback, useEffect, useState } from 'react'
import { DatabaseBackup, Save } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Spinner } from '@/components/ui/spinner'

import { api } from '../../api/client'

interface BackupConfig {
  path: string
  cron: string
  last_run: string
  last_result: string
}

interface BackupRunResult extends BackupConfig {
  ok: boolean
  message: string
}

/** Portal Management > Backup: where to write the JSON backup, when to run it (5-field cron, UTC), and a Run now button. */
export function BackupPanel() {
  const [config, setConfig] = useState<BackupConfig | null>(null)
  const [path, setPath] = useState('')
  const [cron, setCron] = useState('')
  const [saving, setSaving] = useState(false)
  const [running, setRunning] = useState(false)

  const apply = useCallback((c: BackupConfig) => {
    setConfig(c)
    setPath(c.path)
    setCron(c.cron)
  }, [])

  useEffect(() => {
    api.get<BackupConfig>('/backup/').then(apply).catch((err) => toast.error(String(err)))
  }, [apply])

  const dirty = config !== null && (path !== config.path || cron !== config.cron)

  const save = async () => {
    setSaving(true)
    try {
      apply(await api.put<BackupConfig>('/backup/', { path, cron }))
      toast.success('Backup settings saved.')
    } catch (err) {
      toast.error(String(err))
    } finally {
      setSaving(false)
    }
  }

  const runNow = async () => {
    setRunning(true)
    try {
      const result = await api.post<BackupRunResult>('/backup/')
      apply(result)
      if (result.ok) toast.success(result.message)
      else toast.error(result.message)
    } catch (err) {
      toast.error(String(err))
    } finally {
      setRunning(false)
    }
  }

  if (!config) return <Spinner className="size-6" />

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="text-[1.05em] font-bold">Backup</div>

      <label className="flex flex-col gap-1 text-[0.85em]">
        <span className="font-medium">Backup path</span>
        <Input value={path} onChange={(e) => setPath(e.target.value)} placeholder="D:\backups\breadboard" />
        <span className="text-muted-foreground">
          A folder on the server. Each dashboard, connection and datastore is written as its own JSON file into the
          dashboards, connections and datastores sub-folders (created if missing). Connection secrets are not included.
        </span>
      </label>

      <label className="flex flex-col gap-1 text-[0.85em]">
        <span className="font-medium">Cron expression</span>
        <Input value={cron} onChange={(e) => setCron(e.target.value)} placeholder="0 2 * * *" className="font-mono" />
        <span className="text-muted-foreground">
          Five fields (minute hour day month weekday), evaluated in UTC -- "0 2 * * *" is daily at 02:00. Leave blank
          for no scheduled backups.
        </span>
      </label>

      <div className="flex items-center gap-2">
        <Button size="sm" onClick={save} disabled={!dirty || saving}>
          <Save />
          Save
        </Button>
        <Button variant="outline" size="sm" onClick={runNow} disabled={running || dirty || !config.path}>
          {running ? <Spinner /> : <DatabaseBackup />}
          Run backup now
        </Button>
        {dirty && <span className="text-[0.8em] text-muted-foreground">Save changes before running.</span>}
      </div>

      <div className="text-[0.85em]">
        <span className="font-medium">Last run: </span>
        {config.last_run ? (
          <>
            {new Date(config.last_run).toLocaleString()} -- {config.last_result}
          </>
        ) : (
          <span className="text-muted-foreground">never</span>
        )}
      </div>
    </div>
  )
}
