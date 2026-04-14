"use client"

import type React from "react"
import { useState, useEffect, useRef } from "react"

class TextScramble {
  el: HTMLElement
  chars: string
  queue: Array<{
    from: string
    to: string
    start: number
    end: number
    char?: string
  }>
  frame: number
  frameRequest: number
  resolve: (value: void | PromiseLike<void>) => void

  constructor(el: HTMLElement) {
    this.el = el
    this.chars = '!<>-_\\/[]{}—=+*^?#'
    this.queue = []
    this.frame = 0
    this.frameRequest = 0
    this.resolve = () => {}
    this.update = this.update.bind(this)
  }

  setText(newText: string) {
    const oldText = this.el.innerText
    const length = Math.max(oldText.length, newText.length)
    const promise = new Promise<void>((resolve) => this.resolve = resolve)
    this.queue = []

    for (let i = 0; i < length; i++) {
      const from = oldText[i] || ''
      const to = newText[i] || ''
      const start = Math.floor(Math.random() * 40)
      const end = start + Math.floor(Math.random() * 40)
      this.queue.push({ from, to, start, end })
    }

    cancelAnimationFrame(this.frameRequest)
    this.frame = 0
    this.update()
    return promise
  }

  update() {
    let output = ''
    let complete = 0

    for (let i = 0, n = this.queue.length; i < n; i++) {
      let { from, to, start, end, char } = this.queue[i]
      if (this.frame >= end) {
        complete++
        output += to
      } else if (this.frame >= start) {
        if (!char || Math.random() < 0.28) {
          char = this.chars[Math.floor(Math.random() * this.chars.length)]
          this.queue[i].char = char
        }
        output += `<span class="dud">${char}</span>`
      } else {
        output += from
      }
    }

    // Safe: output is built entirely from hardcoded chars, no user input
    this.el.innerHTML = output
    if (complete === this.queue.length) {
      this.resolve()
    } else {
      this.frameRequest = requestAnimationFrame(this.update)
      this.frame++
    }
  }
}

const ScrambledTitle: React.FC = () => {
  const elementRef = useRef<HTMLHeadingElement>(null)
  const scramblerRef = useRef<TextScramble | null>(null)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    if (elementRef.current && !scramblerRef.current) {
      scramblerRef.current = new TextScramble(elementRef.current)
      setMounted(true)
    }
  }, [])

  useEffect(() => {
    if (mounted && scramblerRef.current) {
      const phrases = [
        'VIGIL',
        'Trust your agents.',
        'See everything.',
        'Zero config.',
        'Local first.',
        'The control panel.',
      ]

      let counter = 0
      const next = () => {
        if (scramblerRef.current) {
          scramblerRef.current.setText(phrases[counter]).then(() => {
            setTimeout(next, 2400)
          })
          counter = (counter + 1) % phrases.length
        }
      }

      next()
    }
  }, [mounted])

  return (
    <h1
      ref={elementRef}
      className="text-[#e4e4e7] text-5xl md:text-7xl font-bold tracking-wider text-center"
      style={{ fontFamily: 'var(--font-mono), monospace' }}
    >
      VIGIL
    </h1>
  )
}

const HeroSection: React.FC = () => {
  const [copied, setCopied] = useState(false)

  const handleCopy = () => {
    navigator.clipboard.writeText('brew install vigil')
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  return (
    <div className="relative w-full h-screen overflow-hidden">
      {/* Grid background */}
      <div
        className="absolute inset-0 opacity-[0.04]"
        style={{
          backgroundImage:
            'linear-gradient(rgba(34, 211, 238, 1) 1px, transparent 1px), linear-gradient(90deg, rgba(34, 211, 238, 1) 1px, transparent 1px)',
          backgroundSize: '40px 40px',
        }}
      />

      {/* Radial glow from top */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 60% 50% at 50% 0%, rgba(34, 211, 238, 0.08) 0%, transparent 70%)',
        }}
      />

      {/* Center content */}
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-6">
        <span className="text-[#22d3ee] text-xs uppercase tracking-[0.15em] font-mono"
          style={{ textShadow: '0 0 10px rgba(34, 211, 238, 0.3)' }}
        >
          // the control panel for coding agents
        </span>

        <ScrambledTitle />

        <p className="text-[#6b7084] text-center max-w-xl text-sm md:text-base font-sans leading-relaxed px-4">
          Your agents are writing code faster than you can review it. Vigil watches
          all of them &mdash; Claude Code, Cursor, Codex, Conductor, Aider &mdash;
          in one place. Local-first. Zero config. No cloud.
        </p>

        <button
          onClick={handleCopy}
          className="mt-4 group relative font-mono text-sm border border-[#22d3ee]/30 bg-[#0d0f12] px-6 py-3 flex items-center gap-3 cursor-pointer transition-all hover:border-[#22d3ee]/60 hover:shadow-[0_0_20px_rgba(34,211,238,0.1)]"
          style={{
            boxShadow: '0 0 20px rgba(34, 211, 238, 0.06)',
          }}
        >
          <span className="text-[#22d3ee]" style={{ textShadow: '0 0 8px rgba(34, 211, 238, 0.5)' }}>$</span>
          <span className="text-[#e4e4e7]">brew install vigil</span>
          <span className={`text-xs ml-3 transition-opacity ${copied ? 'text-[#22d3ee]' : 'text-[#6b7084]'}`}>
            {copied ? 'copied' : 'click to copy'}
          </span>
        </button>
      </div>
    </div>
  )
}

export default HeroSection
