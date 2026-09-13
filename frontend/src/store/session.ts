import { create } from 'zustand'

import { api } from '../api/client'
import type { SessionInfo } from '../api/types'

interface SessionState {
  session: SessionInfo | null
  loading: boolean
  load: () => Promise<void>
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

export const useSessionStore = create<SessionState>((set) => ({
  session: null,
  loading: true,
  load: async () => {
    const session = await api.get<SessionInfo>('/auth/session/')
    set({ session, loading: false })
  },
  login: async (username, password) => {
    const session = await api.post<SessionInfo>('/auth/login/', { username, password })
    set({ session })
  },
  logout: async () => {
    await api.post('/auth/logout/')
    set({ session: { authenticated: false } })
  },
}))
