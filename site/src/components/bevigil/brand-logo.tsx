import Link from "next/link"
import { VigilMark } from "./icons"

const SERIF =
  "var(--font-serif), 'Newsreader', ui-serif, Georgia, Cambria, 'Times New Roman', serif"

// Bordered brand pill: small Vigil mark (stylized eye) on the left,
// serif "Vigil" wordmark on the right. Used across every nav surface
// (home, about, docs — both human and agent views).
//
// Treatment: subtle 1px stone-200 border, ~4px radius, slight padding;
// reads as a designed brand mark rather than a click target. Hover lifts
// the border to cyan-700/40 to telegraph it's still the home link.
export function BrandLogo({
  href = "/",
  className = "",
}: {
  href?: string
  className?: string
}) {
  return (
    <Link
      href={href}
      aria-label="Vigil — home"
      className={`group inline-flex items-center gap-2 rounded-[5px] border border-stone-200 px-2.5 py-1.5 text-stone-900 transition-colors hover:border-cyan-700/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700/40 focus-visible:ring-offset-1 focus-visible:ring-offset-white ${className}`}
    >
      <VigilMark size={14} className="shrink-0 text-stone-700 transition-colors group-hover:text-cyan-700" />
      <span
        className="text-[15.5px] font-medium leading-none tracking-[-0.01em]"
        style={{ fontFamily: SERIF }}
      >
        Vigil
      </span>
    </Link>
  )
}
