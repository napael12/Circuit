import { useState } from 'react'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Field } from '@/components/Field'

interface Props {
  /** Dialog title, e.g. "Clone dashboard". */
  title: string
  /** Text-field label, e.g. "Name". */
  label: string
  /** Pre-filled as "{item name}-copy". */
  suggestedName: string
  helperText?: string
  onClone: (name: string) => Promise<void>
  onClose: () => void
}

/**
 * Prompts for a new name (suggested as "{item name}-copy") and clones the
 * item under it -- shared by Dashboards/Connections/Datastores, whose own
 * duplicate/ endpoints do the actual server-side copy (so real secrets like
 * a connection's password, which the client never otherwise sees, carry
 * over correctly instead of being read back redacted).
 */
export function CloneDialog({ title, label, suggestedName, helperText, onClone, onClose }: Props) {
  const [name, setName] = useState(suggestedName)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleClone = async () => {
    setSaving(true)
    setError(null)
    try {
      await onClone(name.trim())
      onClose()
    } catch (err) {
      setError(String(err))
      setSaving(false)
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
        </DialogHeader>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}
        <Field label={label} helperText={helperText}>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && name.trim() && !saving && handleClone()}
            className="h-8 text-[0.85em]"
            autoFocus
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleClone} disabled={saving || !name.trim()}>
            Clone
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
