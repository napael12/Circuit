import DOMPurify from 'dompurify'
import { useMemo } from 'react'

import { useParameterValues } from '../layout/ParameterContext'
import { substituteParams } from '../../utils/panelTemplating'
import { discoverTemplateVars } from '../../utils/sqlParams'
import { ControlContextMenu } from './ControlContextMenu'
import type { ControlProps } from './types'

const noop = () => {}

/**
 * Renders `component.body` as HTML -- admin-authored (IsAdminOrReadOnly
 * gates editing), same trust boundary as every other control's config, just
 * rendered instead of interpreted. ${param} tokens are substituted via the
 * same reactive mechanism as useTitleText: useParameterValues subscribes
 * only to the names this body actually references, so the control re-renders
 * whenever one of those parameter values changes, without polling.
 *
 * The substituted result is run through DOMPurify before rendering --
 * sanitized *after* substitution, not before, so a parameter value can't
 * smuggle in a <script> tag or an on* handler that substituting into an
 * already-sanitized string would have let through. DOMPurify's defaults
 * already strip <script> and on* attributes; this only needs to be explicit
 * about the two the request called out.
 */
export function HtmlControl({ component }: ControlProps) {
  const body = component.body ?? ''
  const names = useMemo(() => discoverTemplateVars(body), [body])
  const values = useParameterValues(names)
  const html = useMemo(() => {
    const substituted = substituteParams(body, values)
    // DOMPurify's ALLOWED_ATTR allow-list already excludes on* handlers by
    // default; FORBID_TAGS is explicit here since script removal is the
    // one behavior this control depends on rather than incidentally gets.
    return DOMPurify.sanitize(substituted, { FORBID_TAGS: ['script'] })
  }, [body, values])

  return (
    <ControlContextMenu
      onRefresh={noop}
      canRefresh={false}
      onExport={noop}
      canExport={false}
      drilldownIds={component.drilldownIds}
      linkIds={component.linkIds}
    >
      <div className="h-full w-full overflow-auto p-2" dangerouslySetInnerHTML={{ __html: html }} />
    </ControlContextMenu>
  )
}
