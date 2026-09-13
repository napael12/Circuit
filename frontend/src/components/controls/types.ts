import type { PanelDatastoreRef, PanelNode } from '../../api/types'

export interface ControlProps {
  component: PanelNode
  /** The panel's full datastore manifest, so the control can resolve component.datastore by name -- see hooks/useDatastore.ts. */
  datastores: PanelDatastoreRef[]
  /** Editor's Preview tab for an in-progress (possibly unsaved) panel -- local datastores run via /datastores/preview-config/ instead of the saved panel's own endpoint. */
  previewMode?: boolean
}

// Note: links (specs/link.md) are NOT threaded through ControlProps -- unlike
// datastores, a control resolves its own component.linkIds through the
// shared LinkProvider context (see components/layout/LinkContext.tsx),
// mirroring how drilldowns are resolved via DrilldownProvider rather than a
// prop drilled down from PanelLayout.
