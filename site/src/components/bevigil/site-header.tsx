import Link from "next/link"
import { Suspense } from "react"
import { REPO_URL, PROXY_URL, VERSION } from "./content"
import { GithubGlyph } from "./icons"
import { BrandLogo } from "./brand-logo"
import { ViewToggle } from "./view-toggle"
import type { ViewMode } from "./view"

const MONO = "var(--font-mono), ui-monospace, SFMono-Regular, Menlo, monospace"
const SANS =
  "var(--font-inter), -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', 'Helvetica Neue', Arial, sans-serif"

interface SiteHeaderProps {
  pathname?: "/" | "/about" | "/docs"
  /** When 'agent', internal nav links carry ?view=agent so the user
   *  doesn't get bounced back to human view by clicking around. */
  view?: ViewMode
}

// Sticky top header used across the v2 site (home, about, docs) — and
// also rendered above the agent view's terminal body so the top nav
// ribbon stays visually identical in both modes. Only the body below
// changes between marketing-rendered and terminal-prose-rendered.
export function SiteHeader({
  pathname = "/",
  view = "human",
}: SiteHeaderProps) {
  // Internal nav suffix preserves the active view across page nav.
  const suffix = view === "agent" ? "?view=agent" : ""
  return (
    <header className="sticky top-0 z-40 border-b border-stone-200 bg-white/85 backdrop-blur-md">
      <div className="mx-auto flex w-full max-w-[1180px] items-center justify-between gap-4 px-6 py-3.5">
        <BrandLogo href={`/${suffix}`} />

        <nav
          className="hidden items-center gap-1 rounded-full border border-stone-200 bg-white px-1.5 py-1 text-[12.5px] text-stone-500 sm:flex"
          aria-label="Primary"
          style={{ fontFamily: SANS }}
        >
          <NavItem href={`/${suffix}`} active={pathname === "/"}>
            home
          </NavItem>
          <NavItem href={`/about${suffix}`} active={pathname === "/about"}>
            about
          </NavItem>
          <NavItem href={PROXY_URL} external ariaLabel="Vigil proxy on GitHub">
            proxy
          </NavItem>
          <NavItem href={`/docs${suffix}`} active={pathname === "/docs"}>
            docs
          </NavItem>
          <NavItem
            href={REPO_URL}
            external
            ariaLabel="Vigil on GitHub"
          >
            <span className="inline-flex items-center gap-1.5">
              <GithubGlyph />
              github
            </span>
          </NavItem>
        </nav>

        <div className="flex items-center gap-3">
          <Suspense
            fallback={
              <div
                className="hidden h-7 w-[110px] rounded-full border border-stone-200 bg-white sm:inline-flex"
                aria-hidden
              />
            }
          >
            <ViewToggle className="hidden sm:inline-flex" />
          </Suspense>
          <span
            className="hidden text-[11px] tracking-tight text-stone-400 md:inline"
            style={{ fontFamily: MONO }}
          >
            {VERSION}
          </span>
        </div>
      </div>
    </header>
  )
}

function NavItem({
  href,
  active,
  children,
  ariaLabel,
  external,
}: {
  href: string
  active?: boolean
  children: React.ReactNode
  ariaLabel?: string
  external?: boolean
}) {
  const className = `inline-flex items-center rounded-full px-3 py-1 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-white focus-visible:ring-cyan-700/40 ${
    active
      ? "bg-stone-100 text-stone-900"
      : "text-stone-500 hover:text-stone-900"
  }`
  if (external) {
    return (
      <a
        href={href}
        aria-label={ariaLabel}
        className={className}
        target="_blank"
        rel="noreferrer noopener"
      >
        {children}
      </a>
    )
  }
  return (
    <Link href={href} aria-label={ariaLabel} className={className}>
      {children}
    </Link>
  )
}
