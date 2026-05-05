"use client"

import { useState, type FormEvent } from "react"

type Status = "idle" | "submitting" | "ok" | "error"

interface EarlyAccessFormProps {
  /** Optional id used by the input element (for label association). */
  id?: string
}

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
        setMessage("Thanks. We'll be in touch.")
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
    <form
      onSubmit={onSubmit}
      className="flex w-full max-w-md flex-col gap-3 sm:flex-row"
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
        className="h-11 flex-1 rounded-md border border-stone-300 bg-white px-3.5 text-[15px] text-stone-900 placeholder:text-stone-400 outline-none transition focus:border-[#c2410c] focus:ring-2 focus:ring-[#c2410c]/20"
        disabled={status === "submitting"}
      />
      <button
        type="submit"
        disabled={status === "submitting"}
        className="inline-flex h-11 items-center justify-center rounded-md bg-[#c2410c] px-5 text-[15px] font-semibold text-white transition hover:bg-[#9a330a] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#c2410c]/40 disabled:opacity-60"
      >
        {status === "submitting" ? "Sending…" : "Get early access"}
      </button>
      {message ? (
        <p
          role="status"
          className={`mt-1 text-[13px] ${
            status === "ok" ? "text-emerald-700" : "text-red-700"
          } sm:absolute sm:translate-y-12 sm:mt-0`}
        >
          {message}
        </p>
      ) : null}
    </form>
  )
}
