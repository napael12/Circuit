const BIND_RE = /:(\w+)/g
const TEMPLATE_RE = /\$\{(\w+)\}/g

/** Discovers :paramname bind-variable names referenced in SQL text. */
export function discoverSqlParams(sql: string | undefined): string[] {
  if (!sql) return []
  return Array.from(new Set(Array.from(sql.matchAll(BIND_RE), (m) => m[1])))
}

/** Discovers ${paramname} template-variable names referenced in SQL or REST url/path/body text. */
export function discoverTemplateVars(text: string | undefined): string[] {
  if (!text) return []
  return Array.from(new Set(Array.from(text.matchAll(TEMPLATE_RE), (m) => m[1])))
}

/** Union of :paramname and ${paramname} variable names found across any number of text sources. */
export function discoverAllParams(...texts: (string | undefined)[]): string[] {
  const names = new Set<string>()
  for (const text of texts) {
    discoverSqlParams(text).forEach((n) => names.add(n))
    discoverTemplateVars(text).forEach((n) => names.add(n))
  }
  return Array.from(names)
}
