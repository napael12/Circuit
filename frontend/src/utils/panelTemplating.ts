/**
 * Substitutes ${name} tokens in panel-JSON text (titles, column labels...)
 * with panel parameter values -- the client-side mirror of
 * backend/breadboard/templating.py's substitute_setting_vars regex, and of
 * datastore/services.py's own ${name} substitution for datastore config
 * text. Unknown names are left as-is.
 */
export function substituteParams(text: string, values: Record<string, string>): string {
  return text.replace(/\$\{(\w+)\}/g, (match, name: string) => values[name] ?? match)
}
