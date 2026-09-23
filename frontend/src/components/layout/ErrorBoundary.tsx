import { Component, type ReactNode } from 'react'

import { Button } from '@/components/ui/button'

interface Props {
  children: ReactNode
}

interface State {
  error: Error | null
}

/**
 * Catches a render-time crash in whatever's routed into AppShell's content
 * area (see App.tsx) so it shows a recoverable message instead of a silent
 * blank page -- the previous failure mode for e.g. opening a dashboard
 * whose content doesn't match the shape the Editor assumes (a hand-edited
 * or otherwise not-quite-right imported .json). React has no default UI for
 * an uncaught render error; without a boundary the whole tree just unmounts.
 */
export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack: string }) {
    // eslint-disable-next-line no-console
    console.error('Unhandled error rendering the page:', error, info.componentStack)
  }

  render() {
    const { error } = this.state
    if (!error) return this.props.children
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 p-8 text-center">
        <div className="text-[1.05em] font-bold">Something went wrong displaying this page.</div>
        <div className="max-w-md text-[0.85em] text-muted-foreground">{error.message}</div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => this.setState({ error: null })}>
            Try again
          </Button>
          <Button size="sm" onClick={() => (window.location.href = '/')}>
            Go home
          </Button>
        </div>
      </div>
    )
  }
}
