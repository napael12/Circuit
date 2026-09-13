/**
 * Opens `path` (relative or absolute) in a new browser window/tab with
 * AppSidebar collapsed by default -- every "View/Open in New Window" action
 * across the app should feel like a focused pop-out, not a second full copy
 * of the nav chrome. AppSidebar reads this `sidebar` param once at mount
 * (see its own `collapsed` state initializer); it has no effect on the
 * window/tab that's still open.
 */
export function openInNewWindow(path: string) {
  const url = new URL(path, window.location.origin)
  url.searchParams.set('sidebar', 'collapsed')
  window.open(url.toString(), '_blank')
}
