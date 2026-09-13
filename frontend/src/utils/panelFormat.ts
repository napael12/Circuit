// Formats raw datastore row values for display per control_attributes.md's
// datatable-column/chart-column :dataType and :dataFormat. No date/number
// library dependency -- dataFormat patterns are small enough to hand-roll
// (confirmed no date-fns/dayjs in package.json).

const pad2 = (n: number) => String(n).padStart(2, '0')

function toDate(value: unknown): Date | null {
  if (value instanceof Date) return value
  if (typeof value === 'number') return new Date(value)
  if (typeof value === 'string' && value) {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  }
  return null
}

/**
 * Applies a "yyyy-MM-dd" / "yyyyMMdd HH:mm" style pattern. Uses UTC getters
 * throughout so a plain "YYYY-MM-DD" date-only value (parsed by `Date` as
 * UTC midnight) never shifts by a day under a non-UTC local timezone.
 */
function formatDatePattern(date: Date, pattern: string): string {
  return pattern.replace(/([a-zA-Z])\1*/g, (run) => {
    switch (run[0]) {
      case 'y':
        return run.length >= 4 ? String(date.getUTCFullYear()) : String(date.getUTCFullYear()).slice(-2)
      case 'M':
        return pad2(date.getUTCMonth() + 1)
      case 'd':
        return pad2(date.getUTCDate())
      case 'H':
        return pad2(date.getUTCHours())
      case 'm':
        return pad2(date.getUTCMinutes())
      case 's':
        return pad2(date.getUTCSeconds())
      default:
        return run
    }
  })
}

function formatDate(value: unknown, pattern: string | undefined, includeTime: boolean): string {
  const date = toDate(value)
  if (!date) return value == null ? '' : String(value)
  if (pattern) return formatDatePattern(date, pattern)
  return includeTime ? date.toISOString().slice(0, 16).replace('T', ' ') : date.toISOString().slice(0, 10)
}

/** Applies a "0,000.00" style pattern: decimals = digits after '.', grouping = pattern contains ','. */
function formatNumber(value: unknown, pattern: string | undefined): string {
  const num = typeof value === 'number' ? value : parseFloat(String(value))
  if (Number.isNaN(num)) return value == null ? '' : String(value)
  if (!pattern) return String(num)
  const dotIndex = pattern.indexOf('.')
  const decimals = dotIndex === -1 ? 0 : pattern.length - dotIndex - 1
  return new Intl.NumberFormat(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
    useGrouping: pattern.includes(','),
  }).format(num)
}

/** dataType='badge' is rendered as a Badge component by the caller -- this only covers plain-text formatting. */
export function formatValue(value: unknown, dataType: string | undefined, dataFormat: string | undefined): string {
  if (value === null || value === undefined) return ''
  switch (dataType) {
    case 'number':
      return formatNumber(value, dataFormat)
    case 'date':
      return formatDate(value, dataFormat, false)
    case 'datetime':
      return formatDate(value, dataFormat, true)
    default:
      return String(value)
  }
}

/** Reads a possibly dot-path'd value out of a row, e.g. "meta.symbol". */
export function getFieldValue(row: Record<string, unknown>, fieldPath: string): unknown {
  return fieldPath.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object') return (acc as Record<string, unknown>)[key]
    return undefined
  }, row)
}
