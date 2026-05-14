# Conductor Prompt — Agent: Show HN + Launch Tweet Draft

You are working on **Vigil**, an agent-aware data plane proxy. Your job is to draft the public launch artifacts (Show HN post + launch tweet thread + the announcement email to the waitlist) so they're ready the moment v0.1.0d lands a real coalescing dedup percentage.

**Why now:** The v0.1.0d push is happening in parallel. When Agent 2's bench harness reports the actual dedup rate (target ≥40%), we want to launch the same day, not spend a day writing copy. Your draft is filled with `<DEDUP_PERCENT>` and other placeholders that the lead agent fills in at launch time.

## Required reading before you write a single word

1. `docs/superpowers/specs/2026-05-04-vigil-data-plane-design.md` — canonical product spec. The thesis you're communicating.
2. `site/src/components/bevigil/home-view.tsx` and `content.ts` — the public website's voice, claims, and concrete scenario. Match this voice; do not re-invent it.
3. `proxy/README.md` — the technical install story.
4. `proxy/bench/RESULTS.md` — the current bench output. Once Agent 2 lands, this file gets the real numbers; your draft anticipates that shape.
5. `docs/superpowers/specs/2026-05-15-three-agent-push-v01c-v01d-design.md` — what's shipping in the launch milestone.
6. The "Why this is venture-grade" sections of recent push specs — the framing the founder believes.

## What you ship

Three drafts, all in `docs/launch/`:

### 1. `docs/launch/show-hn-post.md` — the Show HN submission
Format: Show HN posts have a 80-char title and a body up to ~5000 chars. Conventions:
- Title: `Show HN: Vigil — agent-aware data plane that cuts agent DB traffic <DEDUP_PERCENT>%`
- Body: opens with what it does + why it exists, then proof, then how to try, then call for feedback.
- HN audience hates marketing speak. Plain words. No "synergize." No "revolutionize." No "unlocks."
- HN respects honesty about what's NOT done yet. Be explicit: identity + audit + rate limit + coalesce ship in v0.1.0d; policy engine + Redis + HTTP proxy come next.
- Length sweet spot: ~400 words.

### 2. `docs/launch/launch-tweet-thread.md` — Twitter/X thread
- 5–8 tweets, each ≤280 chars.
- Tweet 1 is the hook — leads with the dedup % number. Should make a developer stop scrolling.
- Tweet 2: the problem, in 2 sentences (the website's "humans vs agents" frame is good source material).
- Tweets 3–5: how Vigil solves it (the 5 primitives). One tweet per 1–2 primitives.
- Tweet 6: the install in one command.
- Tweet 7: link to Show HN + open source repo.
- Plain text, no emoji unless they earn their keep. One mention of the founder's @ handle is fine; otherwise no name-drops.

### 3. `docs/launch/waitlist-announcement-email.md` — the email to the waitlist
- Subject line drafts (3 options): one with the dedup %, one with the tagline, one with a question.
- Body: ~250 words. Plain text formatting (the Resend broadcast supports HTML, but the first email is a personal-sounding update, not a polished marketing piece).
- Opens with what's now real (identity, audit, rate-limit, coalesce, the bench number).
- Tells them how to get the binary: `brew install vigil` (assume Homebrew formula will be ready by launch — note it as a TODO if it isn't).
- One "what's next" sentence (policy engine).
- Personal sign-off from Costa.

## Voice and constraints — do not violate

- **Match the website.** The site at `site/src/components/bevigil/home-view.tsx` has the canonical voice. Read it twice. Do not introduce new metaphors, taglines, or product framings. The tagline is "The seatbelt for your agent fleet." Don't invent a new one.
- **No competitive name-drops in body copy.** The site's previous version named CodeRabbit, Conductor, Datadog, Langfuse. The current site does not. Keep that discipline — name competitors only inline if HN commenters force the comparison.
- **Numbers must be honest.** Use `<DEDUP_PERCENT>` as a placeholder; do NOT invent a number. The lead agent fills it in from the actual `RESULTS.md` once v0.1.0d lands.
- **No quotes from imaginary users.** No "developers love it." No fictional testimonials.
- **Founder credit is "Costa Xanthos"**, GitHub `@constantinexanthos`. Do not invent a Twitter handle if you don't know one — leave `<@TWITTER_HANDLE>` as a placeholder and the lead fills it in.
- **Open source emphasis matters.** The site says MIT, single binary, free for individuals. Repeat this on every surface; it's the trust hook.

## Files you own

- `docs/launch/` — new directory.
  - `docs/launch/show-hn-post.md`
  - `docs/launch/launch-tweet-thread.md`
  - `docs/launch/waitlist-announcement-email.md`
  - `docs/launch/README.md` — short index explaining what each file is and when it gets sent.

## Files you MUST NOT touch

- Anything outside `docs/launch/` — including `site/`, the live website. This is draft material, not deployment-ready content. The lead agent decides what gets cut/posted.

## Acceptance criteria

There are no automated tests. Quality bar:

1. **Reads like Costa wrote it.** A founder posts on HN; this needs to sound like a founder's voice, not a marketing department's. Read your draft out loud — if a sentence sounds like agency copy, rewrite it.
2. **Every claim is true.** Walk through each sentence and confirm it matches what's actually in the repo or the spec. If you write "we cache 1000 queries per agent," that number better come from `proxy/internal/coalesce/`.
3. **Placeholders are obvious.** `<DEDUP_PERCENT>`, `<@TWITTER_HANDLE>`, `<INSTALL_COMMAND_IF_NOT_BREW>` — anything you can't pin down today is bracketed in caps so the lead can grep + fill at launch.
4. **The "what's NOT in v0.1.0d" sentence is present.** Honesty about scope is the strongest credibility signal on HN. Don't bury it.
5. **The Show HN post passes the smell test for HN front page.** No emoji in the title. No exclamation marks. The first sentence has either a concrete number, a concrete pain, or a concrete capability — not "we're excited to announce."

## Out of scope

- Press release, blog post (those come later if the launch goes well).
- LinkedIn post drafts.
- Designed graphics or video scripts.
- ProductHunt launch (different rhythm; we'll decide after Show HN response).
- Cold outreach templates to investors.

## How to know you are done

- The 3 launch files exist in `docs/launch/`.
- The README in that directory explains what each file is.
- You read each draft out loud and didn't cringe.
- Every imaginary number / handle / link is a bracketed placeholder, not made up.

## When you finish

Open a PR. The lead agent will:
- Read each draft out loud themselves.
- Suggest 1–3 specific tightenings (likely: shorter opening sentence, less marketing voice in 1 spot).
- Save the files and we ship them at launch with the placeholders filled.

## When you get stuck

If you find yourself writing "Vigil unlocks the next generation of..." — stop. Delete the sentence. Open `site/src/components/bevigil/home-view.tsx` and re-read the first three paragraphs. Match that voice and try again.
