import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'
import { useShallow } from 'zustand/react/shallow'

import { createParameterStore, type ParameterStore } from '../../store/parameterStore'
import type { PanelDatastoreRef, PanelNode, PanelParameter } from '../../api/types'
import { visibleParameters } from '../../utils/panelParams'
import { ParametersDialog } from './ParametersDialog'

const ParameterStoreContext = createContext<ParameterStore | null>(null)
// Empty string means "not yet saved" (e.g. a brand-new dashboard in the
// editor) -- local:xxx datastore references can't resolve until a real
// panel id exists server-side, see hooks/useDatastore.ts.
const PanelIdContext = createContext<string>('')

interface ParametersDialogContextValue {
  /** Parameters actually worth surfacing (excludes PanelParameter.hidden and hidden-column-linked ones) -- see visibleParameters. */
  parameters: PanelParameter[]
  show: () => void
}
const ParametersDialogContext = createContext<ParametersDialogContextValue | null>(null)

export function ParameterProvider({
  parameters,
  datastores = [],
  content = [],
  panelId = '',
  children,
}: {
  parameters: PanelParameter[]
  /** Needed for a select-type Parameter field in the dialog (ParamField's dynamic option list). */
  datastores?: PanelDatastoreRef[]
  /** The dashboard's component tree, so the dialog can exclude parameters only settable via a hidden column's click-to-select (see utils/panelParams). */
  content?: PanelNode[]
  panelId?: string
  children: ReactNode
}) {
  const store = useMemo(
    () =>
      createParameterStore(
        Object.fromEntries(parameters.map((p) => [p.name, p.defaultValue ?? ''])),
      ),
    // Parameters are fixed for the lifetime of a mounted panel.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  )
  const [dialogOpen, setDialogOpen] = useState(false)
  const visible = useMemo(() => visibleParameters(parameters, content), [parameters, content])
  const dialogContext = useMemo<ParametersDialogContextValue>(
    () => ({ parameters: visible, show: () => setDialogOpen(true) }),
    [visible],
  )

  return (
    <PanelIdContext.Provider value={panelId}>
      <ParameterStoreContext.Provider value={store}>
        <ParametersDialogContext.Provider value={dialogContext}>
          {children}
          <ParametersDialog
            open={dialogOpen}
            onClose={() => setDialogOpen(false)}
            parameters={visible}
            datastores={datastores}
          />
        </ParametersDialogContext.Provider>
      </ParameterStoreContext.Provider>
    </PanelIdContext.Provider>
  )
}

function useParameterStoreContext(): ParameterStore {
  const store = useContext(ParameterStoreContext)
  if (!store) throw new Error('useParameterValues must be used within a ParameterProvider')
  return store
}

/** Subscribes to only the named parameters -- the control-side "listener". */
export function useParameterValues(names: string[]): Record<string, string> {
  const store = useParameterStoreContext()
  return store(
    useShallow((state) => Object.fromEntries(names.map((n) => [n, state.values[n] ?? '']))),
  )
}

export function useSetParameter(): (name: string, value: string, originId?: string) => void {
  const store = useParameterStoreContext()
  return store((state) => state.setValue)
}

/** Subscribes to which control (PanelNode.id) most recently set each named parameter. */
export function useParameterOrigins(names: string[]): Record<string, string> {
  const store = useParameterStoreContext()
  return store(
    useShallow((state) => Object.fromEntries(names.map((n) => [n, state.origin[n] ?? '']))),
  )
}

export function useAllParameterValues(): Record<string, string> {
  const store = useParameterStoreContext()
  return store((state) => state.values)
}

/** The id of the panel currently being viewed/edited, for resolving "local:xxx" datastore refs. */
export function usePanelId(): string {
  return useContext(PanelIdContext)
}

/**
 * Opens the shared Parameters dialog (see ParametersDialog) -- used by both
 * the viewer toolbar's "Parameters" button and each control's right-click
 * menu, so either one opens the exact same dialog instead of duplicating
 * the form. `hasParameters` lets a caller hide/disable its own trigger when
 * there's nothing to show (mirrors the toolbar button's existing behavior).
 */
export function useOpenParametersDialog(): { show: () => void; hasParameters: boolean } {
  const ctx = useContext(ParametersDialogContext)
  if (!ctx) throw new Error('useOpenParametersDialog must be used within a ParameterProvider')
  return { show: ctx.show, hasParameters: ctx.parameters.length > 0 }
}

/** The same pre-filtered (non-hidden) list the Parameters dialog itself shows -- see ParametersControl.tsx, an inline always-visible alternative to that dialog. */
export function usePanelParameters(): PanelParameter[] {
  const ctx = useContext(ParametersDialogContext)
  if (!ctx) throw new Error('usePanelParameters must be used within a ParameterProvider')
  return ctx.parameters
}
