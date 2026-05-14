import { NextResponse } from "next/server"

// Waitlist endpoint.
//
// Storage in production: Resend Audiences is the canonical list. Every
// signup also fires a transactional notification email so the team sees
// new contacts in real time.
//
// Required env vars (set in Vercel project settings):
//   RESEND_API_KEY        — Resend API key (https://resend.com/api-keys)
//   RESEND_AUDIENCE_ID    — UUID of the "Vigil waitlist" audience
//   WAITLIST_NOTIFY_FROM  — verified from-address, e.g. "Vigil <noreply@bevigil.ai>"
//   WAITLIST_NOTIFY_TO    — where new-signup notifications land, e.g. "costa@bevigil.ai"
//
// When env vars are absent (preview deployments, local dev), the handler
// logs to stdout and returns 200 — so the form is testable without secrets.

const RESEND_API = "https://api.resend.com"
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface Body {
  email?: unknown
}

export async function POST(request: Request) {
  let email = ""
  try {
    const body = (await request.json()) as Body
    if (typeof body?.email === "string") {
      email = body.email.trim().toLowerCase()
    }
  } catch {
    // fall through to validation
  }

  if (!email || email.length > 254 || !EMAIL_RE.test(email)) {
    return NextResponse.json(
      { ok: false, error: "Please enter a valid email address." },
      { status: 400 }
    )
  }

  const apiKey = process.env.RESEND_API_KEY
  const audienceId = process.env.RESEND_AUDIENCE_ID
  const notifyFrom = process.env.WAITLIST_NOTIFY_FROM
  const notifyTo = process.env.WAITLIST_NOTIFY_TO

  if (!apiKey || !audienceId) {
    // Preview / local fallback — keep the form usable without secrets.
    console.log("[waitlist] no Resend config; would store:", email)
    return NextResponse.json({ ok: true, mode: "console" })
  }

  // 1. Add to the Resend audience (the actual list). Idempotent: Resend
  //    returns 200 on a duplicate, so re-signups are harmless.
  const audRes = await fetch(
    `${RESEND_API}/audiences/${audienceId}/contacts`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ email, unsubscribed: false }),
    }
  )

  if (!audRes.ok && audRes.status !== 409) {
    const detail = await audRes.text().catch(() => "")
    console.error("[waitlist] resend audience add failed:", audRes.status, detail)
    return NextResponse.json(
      { ok: false, error: "Could not add to the waitlist. Try again?" },
      { status: 502 }
    )
  }

  // 2. Notification email so the team sees signups live. We await this
  //    rather than fire-and-forget because Vercel's serverless runtime can
  //    terminate the function as soon as we return — a discarded promise
  //    may never reach Resend. Failures here are logged but don't fail the
  //    request: the user is already on the list, which is the load-bearing
  //    thing. A 3s timeout guards against slow upstream rare cases.
  if (notifyFrom && notifyTo) {
    try {
      const notifyRes = await fetch(`${RESEND_API}/emails`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: notifyFrom,
          to: [notifyTo],
          subject: `Vigil waitlist: ${email}`,
          text: `New signup: ${email}\nAt: ${new Date().toISOString()}`,
        }),
        signal: AbortSignal.timeout(3000),
      })
      if (!notifyRes.ok) {
        const detail = await notifyRes.text().catch(() => "")
        console.error(
          "[waitlist] notification email rejected:",
          notifyRes.status,
          detail
        )
      }
    } catch (err) {
      console.error("[waitlist] notification email fetch failed:", err)
    }
  }

  return NextResponse.json({ ok: true })
}
