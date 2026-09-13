import { LogOut } from 'lucide-react'
import { useNavigate } from 'react-router-dom'

import { DropdownMenuItem } from '@/components/ui/dropdown-menu'

import { SettingsMenu } from '../SettingsMenu'
import { useSessionStore } from '../../store/session'

/**
 * Settings + Sign out, as items meant to be nested inside a page's own
 * "More actions" ellipsis menu -- so account/appearance controls live in
 * one place with every other command instead of getting dedicated toolbar
 * buttons. Callers that already have other items above these should put a
 * DropdownMenuSeparator before this component themselves.
 */
export function AccountMenuItems() {
  const { session, logout } = useSessionStore()
  const navigate = useNavigate()
  if (!session?.authenticated) return null
  return (
    <>
      <SettingsMenu />
      <DropdownMenuItem
        variant="destructive"
        onClick={async () => {
          await logout()
          navigate('/login')
        }}
      >
        <LogOut />
        Sign out
      </DropdownMenuItem>
    </>
  )
}
