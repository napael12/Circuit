import { useEffect } from 'react'
import { Navigate, Route, Routes } from 'react-router-dom'

import { Spinner } from '@/components/ui/spinner'

import { AppSidebar } from './components/layout/AppSidebar'
import { EditorPage } from './pages/EditorPage'
import { HomePage } from './pages/HomePage'
import { LoginPage } from './pages/LoginPage'
import { ManagerPage } from './pages/ManagerPage'
import { PanelViewerPage } from './pages/PanelViewerPage'
import { useBrandingStore } from './store/branding'
import { useSessionStore } from './store/session'

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSessionStore()
  if (loading) return <Spinner className="m-8 size-6" />
  if (!session?.authenticated) return <Navigate to="/login" replace />
  return <>{children}</>
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSessionStore()
  if (loading) return <Spinner className="m-8 size-6" />
  if (!session?.is_admin) return <Navigate to="/" replace />
  return <>{children}</>
}

/** specs/homepage.md: the persistent app shell -- AppSidebar plus whichever page is routed into the content panel beside it. */
function AppShell() {
  return (
    <div className="flex h-screen min-h-0">
      <AppSidebar />
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/panel/:id" element={<PanelViewerPage />} />
        <Route
          path="/editor/:id"
          element={
            <RequireAdmin>
              <EditorPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/manager"
          element={
            <RequireAdmin>
              <ManagerPage />
            </RequireAdmin>
          }
        />
      </Routes>
    </div>
  )
}

// specs/homepage.md: AppShell's AppSidebar is the one persistent piece of
// chrome across every authenticated page; each routed page still owns its
// own toolbar/content below/beside it.
export default function App() {
  const load = useSessionStore((s) => s.load)
  const loadBranding = useBrandingStore((s) => s.load)
  const branding = useBrandingStore((s) => s.branding)

  useEffect(() => {
    load()
    loadBranding()
  }, [load, loadBranding])

  // specs/circuit.md: the browser tab title/icon are plain DOM, not React
  // output, so a white-labeled name/favicon has to be pushed onto them
  // imperatively once branding loads -- index.html's own <title>/<link
  // rel="icon"> stay as the pre-JS fallback (same default values).
  useEffect(() => {
    document.title = branding.name
    let iconLink = document.querySelector<HTMLLinkElement>('link[rel="icon"]')
    if (!iconLink) {
      iconLink = document.createElement('link')
      iconLink.rel = 'icon'
      document.head.appendChild(iconLink)
    }
    iconLink.href = branding.favicon
  }, [branding])

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/*"
        element={
          <RequireAuth>
            <AppShell />
          </RequireAuth>
        }
      />
    </Routes>
  )
}
