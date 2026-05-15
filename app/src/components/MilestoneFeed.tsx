import type { SessionTurn } from "../types";

interface Props {
  turns: SessionTurn[];
}

const MAX_VISIBLE = 6;

// MilestoneFeed renders the last assistant turns inside the summary block.
// Matches the AuditFeed row treatment in the proxy tab — tabular hh:mm,
// single 24px line per milestone, hover-tint.
export function MilestoneFeed({ turns }: Props) {
  const milestones = turns
    .filter(
      (t) =>
        t.role === "assistant" &&
        t.text.trim().length > 0 &&
        t.tool_names.length === 0,
    )
    .slice(-MAX_VISIBLE);

  if (milestones.length === 0) return null;

  return (
    <ul
      className="mt-3 pt-3 border-t border-vigil-rule list-none"
      role="list"
      data-testid="milestone-feed"
    >
      {milestones.map((m) => {
        const d = new Date(m.timestamp);
        const hhmm = `${d.getHours()}:${String(d.getMinutes()).padStart(2, "0")}`;
        return (
          <li
            key={m.timestamp}
            className="grid grid-cols-[50px_1fr] gap-2 items-center h-6 px-1 text-[12px] text-vigil-ink hover:bg-vigil-surface transition-colors duration-fast"
            role="listitem"
          >
            <span
              data-milestone-time
              className="font-mono text-[11px] text-vigil-mute tabular-nums"
            >
              {hhmm}
            </span>
            <span className="truncate">{firstSentence(m.text)}</span>
          </li>
        );
      })}
    </ul>
  );
}

function firstSentence(text: string): string {
  const trimmed = text.trim();
  const match = trimmed.match(/^[^.!?\n]{1,140}[.!?]/);
  if (match) return match[0];
  if (trimmed.length > 120) return trimmed.slice(0, 117) + "…";
  return trimmed;
}
