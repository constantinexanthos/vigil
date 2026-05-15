import { toolVerb } from "../lib/tool-verbs";

interface Props {
  toolNames: string[];
  turnAt: string | null;
  now: number;
  isLive: boolean;
}

const STALE_AFTER_MS = 45_000;

// PulseLine shows what tool the live agent is using. Was green-on-green
// (text-ok + bg-ok/5 + border-ok) — three hits on the green-success hue.
// The polish pass swaps to vigil-accent so the row stays in the spine
// palette; status changes are still legible via the pulsing dot.
export function PulseLine({ toolNames, turnAt, now, isLive }: Props) {
  if (!isLive) return null;
  const verb = toolVerb(toolNames);
  if (!verb) return null;

  const ageMs = turnAt ? now - new Date(turnAt).getTime() : 0;
  const stale = ageMs > STALE_AFTER_MS;

  return (
    <div
      className="mt-3 inline-flex items-center gap-2 border-l-2 border-vigil-accent px-3 h-6 font-mono text-[11px] text-vigil-accent"
      style={stale ? { opacity: 0.5 } : undefined}
      aria-live="polite"
    >
      <span
        aria-hidden
        className="inline-block w-1 h-1 rounded-full bg-vigil-accent animate-pulse-alive"
      />
      <span>{verb}</span>
    </div>
  );
}
