import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { getSessions, type SessionResponse } from "../tauri";

const AGENT_COLORS: Record<string, string> = {
  "claude-code": "#22d3ee",
  cursor: "#a78bfa",
  conductor: "#f97316",
  aider: "#facc15",
  codex: "#34d399",
  cline: "#fb7185",
};

function agentColor(agent: string): string {
  return AGENT_COLORS[agent] ?? "#71717a";
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

interface Props {
  onSelect: (session: SessionResponse) => void;
}

export default function SessionList({ onSelect }: Props) {
  const [sessions, setSessions] = useState<SessionResponse[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getSessions(24)
      .then(setSessions)
      .catch((e) => setError(String(e)))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return <div className="p-4 text-text-muted">Loading sessions...</div>;
  }

  if (error) {
    return <div className="p-4 text-red">{error}</div>;
  }

  if (sessions.length === 0) {
    return <div className="p-4 text-text-muted">No sessions in the last 24 hours.</div>;
  }

  return (
    <div className="flex flex-col gap-2 p-3">
      <AnimatePresence>
        {sessions.map((session) => (
          <motion.button
            key={session.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            onClick={() => onSelect(session)}
            className="w-full text-left rounded-lg border border-border bg-surface p-4 transition-colors hover:border-cyan/40 cursor-pointer"
          >
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: agentColor(session.agent) }}
                />
                <span className="text-sm font-semibold text-text">
                  {session.agent}
                </span>
              </div>
              <span className="text-xs text-text-muted">
                {formatTime(session.start_time)} - {formatTime(session.end_time)}
              </span>
            </div>

            <div className="flex items-center gap-4 text-xs text-text-muted">
              <span>{session.files.length} files</span>
              <span>{session.event_count} events</span>
              <span
                className={
                  session.confidence_score >= 70
                    ? "text-green"
                    : session.confidence_score >= 40
                      ? "text-yellow-400"
                      : "text-red"
                }
              >
                confidence: {session.confidence_score}
              </span>
            </div>
          </motion.button>
        ))}
      </AnimatePresence>
    </div>
  );
}
