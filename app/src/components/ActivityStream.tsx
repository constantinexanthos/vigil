import { useEffect, useRef } from "react";
import { motion } from "framer-motion";
import type { SessionGroup, SessionFile } from "../types";

interface Props {
  session: SessionGroup;
}

interface Row {
  id: string;
  timestamp: string;
  glyph: string;
  glyphColor: string;
  text: React.ReactNode;
  added?: number;
  removed?: number;
}

export function ActivityStream({ session }: Props) {
  const rows: Row[] = fileRows(session.files);
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
    <div ref={ref} onScroll={onScroll} className="flex-1 overflow-y-auto px-5 py-3 font-mono text-[12px]">
      {rows.length === 0 && (
        <div className="text-white/45 text-[12px]">No activity yet.</div>
      )}
      {rows.map((r) => (
        <motion.div
          key={r.id}
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="flex gap-2.5 py-1.5 text-white/55"
        >
          <span className="text-white/30 min-w-[44px]">{shortTime(r.timestamp)}</span>
          <span style={{ color: r.glyphColor }} className="min-w-[14px]">{r.glyph}</span>
          <span className="flex-1 truncate">{r.text}</span>
          {typeof r.added === "number" && (
            <span className="ml-auto text-white/30">+{r.added} -{r.removed}</span>
          )}
        </motion.div>
      ))}
    </div>
  );
}

function fileRows(files: SessionFile[]): Row[] {
  return files.map((f, i) => {
    const glyph = f.kind === "file_create" ? "+" : f.kind === "file_delete" ? "×" : "~";
    const color = f.kind === "file_create" ? "#4ade80" : f.kind === "file_delete" ? "#f87171" : "#60a5fa";
    return {
      id: `${i}-${f.path}`,
      timestamp: new Date().toISOString(),
      glyph,
      glyphColor: color,
      text: <span className="text-white/85">{f.path}</span>,
      added: f.added,
      removed: f.removed,
    };
  });
}

function shortTime(iso: string): string {
  const d = new Date(iso);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function pad(n: number): string { return String(n).padStart(2, "0"); }
