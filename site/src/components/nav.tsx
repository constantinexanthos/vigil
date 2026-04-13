"use client"

import Link from "next/link"

export function Nav() {
  return (
    <nav className="fixed top-0 left-0 right-0 z-50 border-b border-[#1a1d23] bg-[rgba(7,8,10,0.88)] backdrop-blur-md">
      <div className="mx-auto max-w-4xl px-6 py-4 flex justify-between items-center">
        <Link href="/" className="font-mono font-bold text-lg text-[#22d3ee] uppercase tracking-[0.12em]"
          style={{
            textShadow:
              "0 0 7px rgba(34, 211, 238, 0.6), 0 0 20px rgba(34, 211, 238, 0.25), 0 0 42px rgba(34, 211, 238, 0.1)",
          }}
        >
          vigil<span className="animate-pulse">_</span>
        </Link>
        <div className="flex gap-6 font-mono text-xs">
          <Link
            href="#features"
            className="text-[#6b7084] uppercase tracking-[0.08em] transition-colors hover:text-[#22d3ee]"
          >
            Features
          </Link>
          <Link
            href="#how"
            className="text-[#6b7084] uppercase tracking-[0.08em] transition-colors hover:text-[#22d3ee]"
          >
            How
          </Link>
          <Link
            href="#agents"
            className="text-[#6b7084] uppercase tracking-[0.08em] transition-colors hover:text-[#22d3ee]"
          >
            Agents
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
