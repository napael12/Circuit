import { create, type StoreApi, type UseBoundStore } from 'zustand'

export interface ParameterState {
  values: Record<string, string>
  /** Which control (PanelNode.id) most recently set each parameter -- '' for external sources (the Parameters dialog, on-load defaults). */
  origin: Record<string, string>
  setValue: (name: string, value: string, originId?: string) => void
  setValues: (values: Record<string, string>, originId?: string) => void
}

export type ParameterStore = UseBoundStore<StoreApi<ParameterState>>

/**
 * One store instance per open panel. Controls select just the parameter
 * names they care about via useParameterValues(), so only they re-render/
 * refetch when those specific values change -- a real listener pattern
 * instead of a global poll. `origin` additionally tracks which control last
 * set each value, so a control whose own row-click set a parameter can skip
 * reacting to that particular change (specs/panel_rendering.md's "render...
 * EXCEPT control originating the event") -- see
 * components/layout/useComponentParams.ts.
 */
export function createParameterStore(initial: Record<string, string>): ParameterStore {
  return create<ParameterState>((set) => ({
    values: initial,
    origin: {},
    setValue: (name, value, originId = '') =>
      set((state) => ({
        values: { ...state.values, [name]: value },
        origin: { ...state.origin, [name]: originId },
      })),
    setValues: (values, originId = '') =>
      set((state) => ({
        values: { ...state.values, ...values },
        origin: { ...state.origin, ...Object.fromEntries(Object.keys(values).map((n) => [n, originId])) },
      })),
  }))
}
