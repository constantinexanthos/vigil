import { toolVerb } from "../lib/tool-verbs";

interface Props {
  toolNames: string[];
  turnAt: string | null;       // ISO-8601 timestamp of the latest turn
  now: number;                 // Date.now() injected for tests
  isLive: boolean;
}

const STALE_AFTER_MS = 45_000;

export function PulseLine({ toolNames, turnAt, now, isLive }: Props) {
  if (!isLive) return null;
  const verb = toolVerb(toolNames);
  if (!verb) return null;

  const ageMs = turnAt ? now - new Date(turnAt).getTime() : 0;
  const stale = ageMs > STALE_AFTER_MS;

  return (
    <div
      className="mt-3 flex items-center gap-2 rounded-sm border-l-2 border-ok bg-ok/5 px-2.5 py-1.5 font-mono text-ok"
      style={stale ? { opacity: 0.5, fontSize: "11px" } : { fontSize: "11px" }}
      aria-live="polite"
    >
      <span
        aria-hidden
        className="inline-block w-1.5 h-1.5 rounded-full bg-ok animate-pulse-alive"
      />
      <span>{verb}</span>
    </div>
  );
}
