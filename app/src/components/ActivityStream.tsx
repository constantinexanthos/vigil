import { useEffect, useRef } from "react";
import type { SessionGroup, SessionFile } from "../types";
import { displayPath } from "../lib/path";

interface Props {
  session: SessionGroup;
}

interface Row {
  id: string;
  timestamp: string;
  glyph: string;
  text: React.ReactNode;
  added?: number;
  removed?: number;
}

// ActivityStream is the timeline of file ops inside a session. Polished
// to match the AuditFeed row pattern in the proxy tab: 24px rows, tabular
// timestamps, single-line, hover-tint. The per-op color coding (add was
// emerald, modify was blue, delete was red) collapses to neutral glyphs
// + a single accent strip on the add/remove count, so the eye reads
// activity density from text shape, not hue. Removes framer-motion since
// per-row animation overhead doesn't earn its weight in a flowing stream.
export function ActivityStream({ session }: Props) {
  const rows = fileRows(session.files, session.repoPath);
  const ref = useRef<HTMLDivElement>(null);
  const lockedToBottom = useRef(true);

  useEffect(() => {
    if (!ref.current) return;
    if (lockedToBottom.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [rows.length]);

  function onScroll() {
    if (!ref.current) return;
    const { scrollTop, scrollHeight, clientHeight } = ref.current;
    lockedToBottom.current = scrollHeight - (scrollTop + clientHeight) < 20;
  }

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      className="flex-1 overflow-y-auto font-mono"
      data-testid="activity-stream"
    >
      {rows.length === 0 && (
        <div className="px-4 py-2 text-[12px] text-vigil-mute font-sans">
          No activity yet.
        </div>
      )}
      {rows.map((r) => (
        <div
          key={r.id}
          className="grid grid-cols-[70px_14px_1fr_auto] gap-2 items-center px-4 h-6 text-[11.5px] text-vigil-ink hover:bg-vigil-surface transition-colors duration-fast"
        >
          <span className="text-vigil-mute tabular-nums">
            {shortTime(r.timestamp)}
          </span>
          <span className="text-vigil-mute text-center">{r.glyph}</span>
          <span className="truncate">{r.text}</span>
          {typeof r.added === "number" && (
            <span className="text-[10px] text-vigil-mute tabular-nums shrink-0">
              +{r.added} −{r.removed}
            </span>
          )}
        </div>
      ))}
    </div>
  );
}

function fileRows(
  files: SessionFile[],
  repoPath: string | null | undefined,
): Row[] {
  return files
    .filter((f) => !isNoise(f.path))
    .map((f, i) => ({
      id: `${i}-${f.path}`,
      timestamp: new Date().toISOString(),
      glyph: f.kind === "file_create" ? "+" : f.kind === "file_delete" ? "×" : "~",
      text: displayPath(f.path, repoPath),
      added: f.added,
      removed: f.removed,
    }));
}

function isNoise(path: string): boolean {
  if (!path) return false;
  const name = path.split("/").pop() ?? "";
  if (name.includes(".tmp.")) return true;
  if (name.endsWith("~")) return true;
  if (name.startsWith(".#")) return true;
  return false;
}

function shortTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function pad(n: number): string {
  return String(n).padStart(2, "0");
}
