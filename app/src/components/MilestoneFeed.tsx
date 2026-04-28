import type { SessionTurn } from "../types";

interface Props {
  turns: SessionTurn[];
}

const MAX_VISIBLE = 6;

export function MilestoneFeed({ turns }: Props) {
  const milestones = turns
    .filter(t => t.role === "assistant" && t.text.trim().length > 0 && t.tool_names.length === 0)
    .slice(-MAX_VISIBLE);

  if (milestones.length === 0) return null;

  return (
    <ul className="mt-3 pt-3 border-t border-white/5 space-y-1 list-none pl-0" role="list">
      {milestones.map(m => {
        const d = new Date(m.timestamp);
        const hhmm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
        return (
          <li
            key={m.timestamp}
            className="flex gap-2.5 text-feed text-white/75"
            role="listitem"
          >
            <span
              data-milestone-time
              className="w-10 shrink-0 font-mono text-white/45 tabular-nums"
            >
              {hhmm}
            </span>
            <span className="flex-1">{firstSentence(m.text)}</span>
          </li>
        );
      })}
    </ul>
  );
}

/** Keep each milestone to one readable sentence. Clips at first period/newline. */
function firstSentence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^[^.!?\n]{1,140}[.!?]/);
  if (match) return match[0];
  if (trimmed.length > 120) return trimmed.slice(0, 117) + "…";
  return trimmed;
}
