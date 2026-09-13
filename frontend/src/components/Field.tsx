import type { ReactNode } from 'react'

import { Label } from '@/components/ui/label'
import { cn } from '@/lib/utils'

interface FieldProps {
  label?: string
  error?: boolean
  helperText?: string
  className?: string
  children: ReactNode
}

/** Label + control + helper/error text, replacing MUI TextField's built-in chrome. */
export function Field({ label, error, helperText, className, children }: FieldProps) {
  return (
    <div className={cn('flex flex-col gap-1', className)}>
      {label && <Label className="text-[0.78em] font-normal text-muted-foreground">{label}</Label>}
      {children}
      {helperText && (
        <span className={cn('text-[0.72em]', error ? 'text-destructive' : 'text-muted-foreground')}>
          {helperText}
        </span>
      )}
    </div>
  )
}
