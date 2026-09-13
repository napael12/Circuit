import { create } from 'zustand'

import { api } from '../api/client'
import type { BrandingInfo } from '../api/types'

/**
 * specs/circuit.md: white-label branding (app name, header icon, favicon),
 * fetched once on app boot from the AllowAny /api/branding/ endpoint --
 * readable pre-login, unlike the generic Settings CRUD. `branding` starts
 * pre-populated with the same defaults the backend falls back to (see
 * portal.views.BrandingView.DEFAULTS) so every header/login screen renders
 * the right thing immediately instead of flashing empty while the fetch is
 * in flight; `load()` just overwrites it once the real (possibly
 * admin-customized) values come back.
 */
interface BrandingState {
  branding: BrandingInfo
  load: () => Promise<void>
}

export const DEFAULT_BRANDING: BrandingInfo = { name: 'Circuit', icon: '/circuit.png', favicon: '/circuit.png' }

export const useBrandingStore = create<BrandingState>((set) => ({
  branding: DEFAULT_BRANDING,
  load: async () => {
    const branding = await api.get<BrandingInfo>('/branding/')
    set({ branding })
  },
}))
