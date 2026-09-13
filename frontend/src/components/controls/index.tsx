import type { ComponentType as ReactComponentType } from 'react'

import type { NodeType } from '../../api/types'
import { ChartControl } from './ChartControl'
import { DatatableControl } from './DatatableControl'
import { PivotControl } from './PivotControl'
import type { ControlProps } from './types'

/** Leaf control types (specs/control_attributes.md) -- layout/tab/datatable-column/chart-column/pivot-column are structural, not rendered through this registry. */
export const CONTROL_REGISTRY: Partial<Record<NodeType, ReactComponentType<ControlProps>>> = {
  datatable: DatatableControl,
  chart: ChartControl,
  pivot: PivotControl,
}
