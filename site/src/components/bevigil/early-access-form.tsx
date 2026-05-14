"use client"

import { useState, type FormEvent } from "react"

type Status = "idle" | "submitting" | "ok" | "error"

interface EarlyAccessFormProps {
  /** Optional id used by the input element (for label association). */
  id?: string
}

// Light-theme variant for v2. Same POST contract, restyled for white bg
// + dark-cyan accent. Visible focus rings on input + button.
export function EarlyAccessForm({ id = "ea-email" }: EarlyAccessFormProps) {
  const [email, setEmail] = useState("")
  const [status, setStatus] = useState<Status>("idle")
  const [message, setMessage] = useState("")

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (status === "submitting") return

    setStatus("submitting")
    setMessage("")

    try {
      const res = await fetch("/api/early-access", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      })
      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean
        error?: string
      }
      if (res.ok && data.ok) {
        setStatus("ok")
        setMessage("You're on the list. We'll email you when v1 ships.")
        setEmail("")
      } else {
        setStatus("error")
        setMessage(data.error ?? "Something went wrong. Try again?")
      }
    } catch {
      setStatus("error")
      setMessage("Network error. Try again?")
    }
  }

  return (
    <div className="flex w-full max-w-md flex-col gap-2.5">
      <form
        onSubmit={onSubmit}
        className="flex w-full flex-col gap-3 sm:flex-row"
        noValidate
      >
        <label htmlFor={id} className="sr-only">
          Email address
        </label>
        <input
          id={id}
          type="email"
          required
          autoComplete="email"
          placeholder="you@yourcompany.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-11 flex-1 rounded-md border border-stone-300 bg-white px-3.5 text-[15px] text-stone-900 placeholder:text-stone-400 outline-none transition focus:border-cyan-700 focus:ring-2 focus:ring-cyan-700/20"
          disabled={status === "submitting"}
        />
        <button
          type="submit"
          disabled={status === "submitting"}
          className="inline-flex h-11 items-center justify-center rounded-md bg-cyan-700 px-5 text-[14px] font-semibold tracking-tight text-white transition hover:bg-cyan-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-cyan-700/40 focus-visible:ring-offset-1 focus-visible:ring-offset-white disabled:opacity-60"
        >
          {status === "submitting" ? "Joining…" : "Join waitlist"}
        </button>
      </form>
      {message ? (
        <p
          role="status"
          className={`text-[13px] leading-snug ${
            status === "ok" ? "text-emerald-700" : "text-red-700"
          }`}
        >
          {message}
        </p>
      ) : null}
    </div>
  )
}
