export type FormFieldType = 'text' | 'number' | 'password' | 'select' | 'textarea' | 'json' | 'checkbox' | 'multiselect'

export interface FormField {
  /** Dot-path into the record, e.g. "config.access_key" for a nested field. */
  key: string
  label: string
  type: FormFieldType
  /** For type=select/multiselect. */
  options?: { value: string; label: string }[]
  /** Disabled once editing an existing row (e.g. the primary key). */
  fixedOnEdit?: boolean
  help?: string
  /** type=multiselect only: renders behind a disclosure toggle instead of always-open -- collapsed by default unless values are already selected. */
  collapsible?: boolean
  /** Pairs with an adjacent `half` field to share one row (two-column) instead of each taking a full-width row. An unpaired `half` field (odd one out) still renders full width. */
  half?: boolean
  /** When given, the field is only shown while this returns true for the record's current values. */
  showIf?: (values: Record<string, unknown>) => boolean
}
