"use client"

import Link from "next/link"
import Image from "next/image"

export function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#1a1d23] bg-[rgba(7,8,10,0.88)] backdrop-blur-md">
      <div className="w-full px-6 sm:px-10 py-3 flex justify-between items-center">
        <Link href="/" className="flex items-center gap-2.5">
          <Image
            src="/logo.png"
            alt="Vigil"
            width={28}
            height={28}
            className="opacity-90"
          />
          <span
            className="font-mono font-bold text-lg text-[#22d3ee] uppercase tracking-[0.12em]"
            style={{
              textShadow:
                "0 0 7px rgba(34, 211, 238, 0.6), 0 0 20px rgba(34, 211, 238, 0.25), 0 0 42px rgba(34, 211, 238, 0.1)",
            }}
          >
            vigil<span className="animate-pulse">_</span>
          </span>
        </Link>
        <div className="flex items-center gap-6 font-mono text-xs">
          <Link
            href="/#features"
            className="text-[#6b7084] uppercase tracking-[0.08em] transition-colors hover:text-[#22d3ee]"
          >
            Features
          </Link>
          <Link
            href="/#how"
            className="text-[#6b7084] uppercase tracking-[0.08em] transition-colors hover:text-[#22d3ee]"
          >
            How
          </Link>
          <Link
            href="/#agents"
            className="text-[#6b7084] uppercase tracking-[0.08em] transition-colors hover:text-[#22d3ee]"
          >
            Agents
          </Link>
          <Link
            href="/docs"
            className="text-[#6b7084] uppercase tracking-[0.08em] transition-colors hover:text-[#22d3ee]"
          >
            Docs
          </Link>
          <Link
            href="/changelog"
            className="text-[#6b7084] uppercase tracking-[0.08em] transition-colors hover:text-[#22d3ee]"
          >
            Changelog
          </Link>
          <a
            href="https://github.com/constantinexanthos/vigil"
            target="_blank"
            rel="noopener noreferrer"
            className="text-[#6b7084] uppercase tracking-[0.08em] transition-colors hover:text-[#22d3ee]"
          >
            GitHub
          </a>
        </div>
      </div>
    </nav>
  )
}
