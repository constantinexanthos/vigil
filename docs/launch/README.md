# docs/launch

Launch artifacts for Vigil v0.1.0d. Drafted ahead of time so the day-of work
is "fill in the placeholders, paste, post" — not "write the post."

All four files use the same placeholders so a single grep + replace fills them
everywhere:

- `<DEDUP_PERCENT>` — the headline dedup percentage from `proxy/bench/RESULTS.md` (refactor preset). Filled in from the bench run on launch day, not from any number sitting in the repo today.
- `<INSTALL_COMMAND_IF_NOT_BREW>` — the install one-liner if the Homebrew formula isn't published by launch (e.g. `curl ... | sh` or `go install ...`). If `brew install vigil` is live, replace with that.
- `<SHOW_HN_URL>` — the news.ycombinator.com permalink to the Show HN submission. Only used in the tweet thread; fill in once the post is live.
- `<@TWITTER_HANDLE>` — Costa's X handle. Unknown at draft time.

## Files

### `show-hn-post.md` — Show HN submission

The 400-word post for news.ycombinator.com. Opens with the dedup number, explains the problem-shape mismatch, walks the five primitives (four shipped + policy "next"), gives a one-command try-it, and explicitly states what's NOT in v0.1.0d so the comment thread doesn't get derailed by "but does it do X." **Submitted to news.ycombinator.com on launch day.** Title is in a fenced code block at the top so it's grep-able.

### `launch-tweet-thread.md` — Twitter / X thread

Seven tweets, each annotated with its character count. Tweet 1 leads with the dedup number; Tweets 2–5 walk the problem and the five primitives; Tweet 6 is install; Tweet 7 is the link bundle. **Posted ~30 minutes after the Show HN goes live**, so anyone who follows the thread to the HN link sees a thread that's already trending rather than one that links to an empty page.

### `waitlist-announcement-email.md` — waitlist broadcast

Plain-text personal update to the waitlist, ~250 words. Three subject-line options at the top — one with the dedup %, one with the "seatbelt" tagline, one framed as a question — pick whichever feels right on the day. Signed personally from Costa, not from a brand voice. **Sent via Resend broadcast to the waitlist on launch day, same day as Show HN.** Includes an inline `TODO(launch)` comment to confirm the Homebrew formula is published before sending — if not, swap the install line for `<INSTALL_COMMAND_IF_NOT_BREW>`.

## Do not merge until

The lead has greenlit the launch and `<DEDUP_PERCENT>` has been filled in everywhere. Search the four files for `<` and the only matches you should see are the four placeholders above.
