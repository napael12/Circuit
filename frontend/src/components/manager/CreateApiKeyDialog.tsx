import { useState } from 'react'
import { Check, Copy } from 'lucide-react'
import { toast } from 'sonner'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Field } from '@/components/Field'

import { api } from '../../api/client'
import type { ApiKeyCreateResult, AppUser } from '../../api/types'

interface Props {
  users: AppUser[]
  onClose: () => void
  onCreated: () => void
}

/**
 * Two steps in one dialog: a name + assigned-user form, then -- once the
 * server has generated the key -- a one-time "copy this now" reveal. The
 * plaintext secret is never retrievable again after this (only its hash is
 * stored -- see backend/apikeys/models.py), so closing this dialog without
 * copying it means generating a new key.
 */
export function CreateApiKeyDialog({ users, onClose, onCreated }: Props) {
  const [name, setName] = useState('')
  const [userId, setUserId] = useState<string>('')
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [created, setCreated] = useState<ApiKeyCreateResult | null>(null)
  const [copied, setCopied] = useState(false)

  const handleCreate = async () => {
    setSaving(true)
    setError(null)
    try {
      const result = await api.post<ApiKeyCreateResult>('/api-keys/', { name: name.trim(), user: Number(userId) })
      setCreated(result)
      onCreated()
    } catch (err) {
      setError(String(err))
    } finally {
      setSaving(false)
    }
  }

  const handleCopy = async () => {
    if (!created) return
    try {
      await navigator.clipboard.writeText(created.key)
      setCopied(true)
      toast.success('Copied.')
    } catch {
      toast.error('Clipboard access was denied.')
    }
  }

  if (created) {
    return (
      <Dialog open onOpenChange={(open) => !open && onClose()}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>API key created</DialogTitle>
          </DialogHeader>
          <Alert variant="destructive">
            <AlertDescription>
              Copy this key now -- it won't be shown again. Only its hash is stored.
            </AlertDescription>
          </Alert>
          <div className="flex items-center gap-2">
            <Input readOnly value={created.key} className="font-mono text-[0.82em]" onFocus={(e) => e.target.select()} />
            <Button type="button" variant="outline" size="icon-sm" onClick={handleCopy} aria-label="Copy key">
              {copied ? <Check /> : <Copy />}
            </Button>
          </div>
          <DialogFooter>
            <Button size="sm" onClick={onClose}>
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    )
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>New API key</DialogTitle>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Field label="Name">
          <Input value={name} onChange={(e) => setName(e.target.value)} className="h-8 text-[0.85em]" autoFocus />
        </Field>
        <Field label="Assigned user" helperText="The key authenticates every request as this user -- role/access restrictions still apply.">
          <Select value={userId} onValueChange={setUserId}>
            <SelectTrigger className="h-8 w-full text-[0.85em]">
              <SelectValue placeholder="Select a user" />
            </SelectTrigger>
            <SelectContent>
              {users.map((u) => (
                <SelectItem key={u.id} value={String(u.id)}>
                  {u.username}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleCreate} disabled={saving || !name.trim() || !userId}>
            Create
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
