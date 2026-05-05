import { NextResponse } from "next/server"

// v0 stub: accepts an email, logs it, returns 200.
// No persistence, no real backend. Replace with a real handler before launch.
export async function POST(request: Request) {
  let email = ""

  try {
    const body = (await request.json()) as { email?: unknown }
    if (typeof body?.email === "string") {
      email = body.email.trim()
    }
  } catch {
    // ignore — fall through to validation below
  }

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(
      { ok: false, error: "Please enter a valid email address." },
      { status: 400 }
    )
  }

  // v0: log only. Wire to a real list (Resend, Loops, etc.) before launch.
  console.log("[early-access] new signup:", email)

  return NextResponse.json({ ok: true })
}
