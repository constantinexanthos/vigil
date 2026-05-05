// Shared <Section /> + <SectionLabel /> primitives for the v2 site.
// Centralised so the eyebrow treatment and divider behaviour stay
// identical across home / about / docs.
//
// Decisions:
// - Eyebrow: small caps, mono, accent-tinted. NO leading hairline rule
//   (the previous "— EYEBROW" decoration read as a partial-width em-dash
//   and visually competed with the section divider below).
// - Divider: omitted. Whitespace + the eyebrow do the job. Earlier
//   versions used a 1px rule constrained to max-width PLUS extra inline
//   margin which read as a half-line-bug across the page.

const MONO = "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace"

export function Section({
  children,
  eyebrow,
  id,
  maxWidth = 1180,
}: {
  children: React.ReactNode
  eyebrow: string
  id?: string
  /** Content max-width in px. 1180 for home, 860 for about/docs. */
  maxWidth?: number
}) {
  return (
    <section id={id} className="relative">
      <div
        className="mx-auto w-full px-6 pb-32 pt-20 sm:pb-40 sm:pt-24"
        style={{ maxWidth: `${maxWidth}px` }}
      >
        <SectionLabel>{eyebrow}</SectionLabel>
        <div className="mt-6">{children}</div>
      </div>
    </section>
  )
}

export function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span
      className="inline-flex items-center text-[10.5px] uppercase tracking-[0.2em] text-cyan-700"
      style={{ fontFamily: MONO }}
    >
      {children}
    </span>
  )
}
