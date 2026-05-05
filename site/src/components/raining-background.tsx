"use client"

import { useState, useEffect, useCallback } from "react"

interface Character {
  char: string
  x: number
  y: number
  speed: number
}

const ALL_CHARS =
  "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()_+-=[]{}|;:,.<>?"

// Mobile devices halve out at ~100 chars to keep the falling-character
// signature visible without tanking Lighthouse perf below 80.
function pickCharCount() {
  if (typeof window === "undefined") return 300
  return window.matchMedia("(max-width: 767px)").matches ? 100 : 300
}

interface RainingBackgroundProps {
  /**
   * Subtle ("light theme watermark") or full ("legacy dark Vigil chrome").
   * Default subtle to match v2.
   */
  variant?: "subtle" | "full"
}

export function RainingBackground({
  variant = "subtle",
}: RainingBackgroundProps = {}) {
  const [characters, setCharacters] = useState<Character[]>([])
  const [activeIndices, setActiveIndices] = useState<Set<number>>(new Set())

  const createCharacters = useCallback((charCount: number) => {
    const newCharacters: Character[] = []

    for (let i = 0; i < charCount; i++) {
      newCharacters.push({
        char: ALL_CHARS[Math.floor(Math.random() * ALL_CHARS.length)],
        x: Math.random() * 100,
        y: Math.random() * 100,
        speed: 0.1 + Math.random() * 0.3,
      })
    }

    return newCharacters
  }, [])

  // One-shot init: matches the original behaviour.
  useEffect(() => {
    setCharacters(createCharacters(pickCharCount()))
  }, [createCharacters])

  // Re-create the field when the mobile breakpoint flips.
  useEffect(() => {
    const mql = window.matchMedia("(max-width: 767px)")
    const onChange = () => {
      setCharacters(createCharacters(pickCharCount()))
    }
    mql.addEventListener("change", onChange)
    return () => mql.removeEventListener("change", onChange)
  }, [createCharacters])

  useEffect(() => {
    const updateActiveIndices = () => {
      const newActiveIndices = new Set<number>()
      const numActive = Math.floor(Math.random() * 3) + 3
      for (let i = 0; i < numActive; i++) {
        newActiveIndices.add(Math.floor(Math.random() * characters.length))
      }
      setActiveIndices(newActiveIndices)
    }

    const flickerInterval = setInterval(updateActiveIndices, 50)
    return () => clearInterval(flickerInterval)
  }, [characters.length])

  useEffect(() => {
    let animationFrameId: number

    const updatePositions = () => {
      setCharacters((prevChars) =>
        prevChars.map((char) => ({
          ...char,
          y: char.y + char.speed,
          ...(char.y >= 100 && {
            y: -5,
            x: Math.random() * 100,
            char: ALL_CHARS[Math.floor(Math.random() * ALL_CHARS.length)],
          }),
        }))
      )
      animationFrameId = requestAnimationFrame(updatePositions)
    }

    animationFrameId = requestAnimationFrame(updatePositions)
    return () => cancelAnimationFrame(animationFrameId)
  }, [])

  // Subtle watermark for the v2 light theme: muted gray characters at very
  // low opacity, low-intensity cyan flicker. Must NOT compete with content.
  // Full variant preserves the legacy dark behaviour for /old.
  const isSubtle = variant === "subtle"
  const baseColor = isSubtle ? "#a8a29e" : "#3d4150"
  const baseOpacity = isSubtle ? 0.08 : 0.4
  const activeColor = isSubtle ? "#0891b2" : "#22d3ee"
  const activeOpacity = isSubtle ? 0.3 : 1

  return (
    <div className="fixed inset-0 z-0 pointer-events-none overflow-hidden">
      {characters.map((char, index) => {
        const active = activeIndices.has(index)
        return (
          <span
            key={index}
            className="absolute text-xs"
            style={{
              left: `${char.x}%`,
              top: `${char.y}%`,
              transform: `translate(-50%, -50%) ${active ? "scale(1.25)" : "scale(1)"}`,
              color: active ? activeColor : baseColor,
              fontWeight: active ? 700 : 300,
              textShadow: active && !isSubtle
                ? "0 0 8px rgba(34, 211, 238, 0.8), 0 0 12px rgba(34, 211, 238, 0.4)"
                : "none",
              opacity: active ? activeOpacity : baseOpacity,
              transition: "color 0.1s, transform 0.1s, text-shadow 0.1s",
              willChange: "transform, top",
              fontSize: "1.8rem",
              fontFamily: "var(--font-mono), monospace",
            }}
          >
            {char.char}
          </span>
        )
      })}
    </div>
  )
}
