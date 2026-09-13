import { Monitor, Moon, Settings, Sun } from 'lucide-react'

import {
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'

import { useUiPrefsStore, type ColorMode, type FontSizeKey } from '../store/uiPrefs'

const MODES: { value: ColorMode; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'Match system', icon: Monitor },
]

const FONT_SIZE_KEYS: FontSizeKey[] = ['S', 'M', 'L']

/**
 * Light/dark mode and text size controls, as a submenu meant to be nested
 * inside a page's own "More actions" ellipsis menu (see AccountMenuItems)
 * rather than getting its own toolbar trigger.
 */
export function SettingsMenu() {
  const mode = useUiPrefsStore((s) => s.mode)
  const setMode = useUiPrefsStore((s) => s.setMode)
  const fontSizeKey = useUiPrefsStore((s) => s.fontSizeKey)
  const setFontSizeKey = useUiPrefsStore((s) => s.setFontSizeKey)

  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger>
        <Settings />
        Settings
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-56">
        <div className="flex items-center justify-between gap-2 px-1.5 py-1">
          <span className="text-xs text-muted-foreground">Text size</span>
          <div className="flex gap-1">
            {FONT_SIZE_KEYS.map((key) => (
              <button
                key={key}
                onClick={() => setFontSizeKey(key)}
                className={cn(
                  'h-6 w-6 rounded-[5px] border text-xs',
                  fontSizeKey === key
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border bg-transparent text-muted-foreground'
                )}
              >
                {key}
              </button>
            ))}
          </div>
        </div>
        <DropdownMenuSeparator />
        {MODES.map((m) => (
          <DropdownMenuItem key={m.value} data-active={mode === m.value} onClick={() => setMode(m.value)}>
            <m.icon className={cn(mode === m.value && 'text-foreground')} />
            {m.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  )
}
