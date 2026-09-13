/** Triggers a browser download of `data` as a formatted JSON file. */
export function downloadJson(data: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.click()
  URL.revokeObjectURL(url)
}

/** Triggers a browser download from a same-origin URL that responds with Content-Disposition: attachment. */
export function downloadUrl(url: string): void {
  const a = document.createElement('a')
  a.href = url
  a.click()
}

/**
 * Reads a single-item export file (per-item import/export -- specs/
 * connection.md, specs/datasource_enhancements.md). Accepts either a bare
 * object or a one-element array (what per-item Export produces); rejects
 * anything with more than one item, and -- when `expectedId` is given --
 * rejects a file for a different id, so a row's "Import" action can't
 * silently overwrite a different record than the one it was clicked on.
 */
export async function readSingleItemJson(file: File, expectedId?: string): Promise<Record<string, unknown>> {
  const payload = JSON.parse(await file.text())
  const items = Array.isArray(payload) ? payload : [payload]
  if (items.length !== 1) {
    throw new Error(`Expected exactly one item in this file, found ${items.length}.`)
  }
  const item = items[0] as Record<string, unknown>
  if (expectedId && item.id !== expectedId) {
    throw new Error(`This file is for "${String(item.id)}", not "${expectedId}".`)
  }
  return item
}
