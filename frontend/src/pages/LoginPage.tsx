import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

import { Alert, AlertDescription } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Field } from '@/components/Field'
import { Input } from '@/components/ui/input'

import { AppIcon } from '../components/layout/AppIcon'
import { useBrandingStore } from '../store/branding'
import { useSessionStore } from '../store/session'

export function LoginPage() {
  const login = useSessionStore((s) => s.login)
  const appName = useBrandingStore((s) => s.branding.name)
  const appVersion = useBrandingStore((s) => s.branding.version)
  const navigate = useNavigate()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)
    try {
      await login(username, password)
      navigate('/')
    } catch {
      setError('Invalid username or password')
    }
  }

  return (
    <div className="flex h-screen items-center justify-center">
      <form onSubmit={handleSubmit} className="w-80 rounded-xl border border-border bg-card p-8">
        <div className="mb-1 flex items-center gap-2 text-[1.4em] font-bold">
          <AppIcon className="size-6" />
          {appName}
        </div>
        {appVersion && <div className="mb-4 pl-8 text-[0.68em] text-muted-foreground">v{appVersion}</div>}
        <div className="flex flex-col gap-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <Field label="Username">
            <Input value={username} onChange={(e) => setUsername(e.target.value)} autoFocus />
          </Field>
          <Field label="Password">
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)} />
          </Field>
          <Button type="submit">Sign in</Button>
        </div>
      </form>
    </div>
  )
}
