import type { ReactNode } from 'react'

import { useSessionStore } from '../../store/session'

/**
 * Thin footer bar (mutedBg background, small muted text) used on every
 * screen. Always carries the signed-in username on the right -- moved here
 * from a toolbar pill (UserPill) so every page gets it for free instead of
 * repeating the lookup.
 */
export function StatusBar({ children }: { children?: ReactNode }) {
  const username = useSessionStore((s) => s.session?.username)
  return (
    <div className="flex flex-none items-center justify-between gap-3 border-t border-zinc-200 bg-zinc-100 px-[18px] py-1.5 text-[0.75em] text-zinc-500 dark:border-zinc-800 dark:bg-[#1f1f22] dark:text-zinc-400">
      <div className="min-w-0 truncate">{children}</div>
      {username && <div className="shrink-0">User: {username}</div>}
    </div>
  )
}
