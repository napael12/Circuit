import { useMemo } from 'react'

import { useParameterValues } from '../components/layout/ParameterContext'
import { discoverTemplateVars } from '../utils/sqlParams'
import { substituteParams } from '../utils/panelTemplating'

/** Substitutes ${param} in a node's title, subscribing only to the parameter names it actually references. */
export function useTitleText(title: string | undefined): string | undefined {
  const names = useMemo(() => (title ? discoverTemplateVars(title) : []), [title])
  const values = useParameterValues(names)
  return title ? substituteParams(title, values) : undefined
}
