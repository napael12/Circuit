import { useBrandingStore } from '../../store/branding'

/** specs/circuit.md: the white-labeled application icon (Manager -> Settings' app.icon), for page headers (main/management/editor). */
export function AppIcon({ className = 'size-5' }: { className?: string }) {
  const icon = useBrandingStore((s) => s.branding.icon)
  return <img src={icon} alt="" className={className} />
}
