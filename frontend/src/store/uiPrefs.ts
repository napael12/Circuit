import { create } from 'zustand'

export const FONT_SIZES = { S: 13, M: 15, L: 17 } as const
export type FontSizeKey = keyof typeof FONT_SIZES

export type ColorMode = 'light' | 'dark' | 'system'

const FONT_SIZE_STORAGE_KEY = 'breadboard-font-size'
const MODE_STORAGE_KEY = 'breadboard-color-mode'

function loadInitialFontSize(): FontSizeKey {
  const stored = localStorage.getItem(FONT_SIZE_STORAGE_KEY)
  return stored && stored in FONT_SIZES ? (stored as FontSizeKey) : 'M'
}

function loadInitialMode(): ColorMode {
  const stored = localStorage.getItem(MODE_STORAGE_KEY)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

function systemPrefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function applyMode(mode: ColorMode) {
  const isDark = mode === 'dark' || (mode === 'system' && systemPrefersDark())
  document.documentElement.classList.toggle('dark', isDark)
}

interface UiPrefsState {
  fontSizeKey: FontSizeKey
  setFontSizeKey: (key: FontSizeKey) => void
  mode: ColorMode
  setMode: (mode: ColorMode) => void
}

/** Text-size (S/M/L) and light/dark/system preferences -- see specs/UI mockups' top-strip controls. */
export const useUiPrefsStore = create<UiPrefsState>((set) => ({
  fontSizeKey: loadInitialFontSize(),
  setFontSizeKey: (key) => {
    localStorage.setItem(FONT_SIZE_STORAGE_KEY, key)
    set({ fontSizeKey: key })
  },
  mode: loadInitialMode(),
  setMode: (mode) => {
    localStorage.setItem(MODE_STORAGE_KEY, mode)
    applyMode(mode)
    set({ mode })
  },
}))

applyMode(useUiPrefsStore.getState().mode)

window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  if (useUiPrefsStore.getState().mode === 'system') applyMode('system')
})
