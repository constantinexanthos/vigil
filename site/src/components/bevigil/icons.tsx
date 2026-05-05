import type { PrimitiveIconKey } from "./content"

// Inline SVG icons for the five primitives. Single-color, line-based.
// Sized 24x24, stroke 1.5. The parent passes color via currentColor.

interface IconProps {
  className?: string
  size?: number
}

const baseProps = (size = 24, className?: string) => ({
  xmlns: "http://www.w3.org/2000/svg",
  viewBox: "0 0 24 24",
  width: size,
  height: size,
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className,
  "aria-hidden": true,
})

// Identity = key shape.
function IdentityIcon({ className, size }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <circle cx="8" cy="12" r="4" />
      <path d="M12 12h9" />
      <path d="M17 12v3" />
      <path d="M20 12v2" />
    </svg>
  )
}

// Rate limit = gauge.
function RateLimitIcon({ className, size }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M3 14a9 9 0 0 1 18 0" />
      <path d="M12 14l5-4" />
      <circle cx="12" cy="14" r="1" />
    </svg>
  )
}

// Coalescing = converging arrows.
function CoalesceIcon({ className, size }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M3 5l8 7" />
      <path d="M3 19l8-7" />
      <path d="M11 12h10" />
      <path d="M18 9l3 3-3 3" />
    </svg>
  )
}

// Blast radius = nested boundary.
function BlastIcon({ className, size }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <rect x="3" y="3" width="18" height="18" rx="2" />
      <rect x="7" y="7" width="10" height="10" rx="1" />
      <path d="M10 12h4" />
    </svg>
  )
}

// Audit trail = stamped document.
function AuditIcon({ className, size }: IconProps) {
  return (
    <svg {...baseProps(size, className)}>
      <path d="M6 3h9l3 3v15H6z" />
      <path d="M9 9h6" />
      <path d="M9 13h6" />
      <path d="M9 17h3" />
      <circle cx="17" cy="17" r="2.5" />
    </svg>
  )
}

const map: Record<PrimitiveIconKey, (p: IconProps) => React.JSX.Element> = {
  identity: IdentityIcon,
  "rate-limit": RateLimitIcon,
  coalesce: CoalesceIcon,
  blast: BlastIcon,
  audit: AuditIcon,
}

export function PrimitiveIcon({
  iconKey,
  className,
  size,
}: {
  iconKey: PrimitiveIconKey
  className?: string
  size?: number
}) {
  const Component = map[iconKey]
  return <Component className={className} size={size} />
}

// GitHub glyph (used in nav + footer + GitHub link).
export function GithubGlyph({
  size = 14,
  className,
}: {
  size?: number
  className?: string
}) {
  return (
    <svg
      aria-hidden
      viewBox="0 0 16 16"
      width={size}
      height={size}
      fill="currentColor"
      className={className ?? "shrink-0"}
    >
      <path d="M8 .2a8 8 0 0 0-2.5 15.6c.4.07.55-.17.55-.38v-1.34c-2.22.48-2.69-1.07-2.69-1.07-.36-.92-.89-1.17-.89-1.17-.73-.5.06-.49.06-.49.8.06 1.23.83 1.23.83.72 1.23 1.88.87 2.34.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.83-2.15-.08-.2-.36-1.02.08-2.13 0 0 .67-.21 2.2.82a7.6 7.6 0 0 1 4 0c1.53-1.03 2.2-.82 2.2-.82.44 1.11.16 1.93.08 2.13.51.56.83 1.28.83 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48v2.19c0 .21.15.46.55.38A8 8 0 0 0 8 .2Z" />
    </svg>
  )
}
