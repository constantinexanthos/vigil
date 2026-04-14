import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import SessionList from "./components/SessionList";
import SessionReview from "./components/SessionReview";
import { getActiveAgents, getEventCount, type SessionResponse } from "./tauri";

type Tab = "dashboard" | "sessions";

export default function App() {
  const [tab, setTab] = useState<Tab>("dashboard");
  const [selectedSession, setSelectedSession] = useState<SessionResponse | null>(null);
  const [agents, setAgents] = useState<string[]>([]);
  const [eventCount, setEventCount] = useState<number>(0);

  useEffect(() => {
    getActiveAgents().then(setAgents).catch(() => {});
    getEventCount().then(setEventCount).catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-bg">
      {/* Header */}
      <div className="px-4 pt-4 pb-2">
        <h1 className="text-base font-semibold text-text">Vigil</h1>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 border-b border-border px-4">
        {(["dashboard", "sessions"] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              setSelectedSession(null);
            }}
            className={`px-3 py-2 text-xs uppercase tracking-wider transition-colors cursor-pointer ${
              tab === t
                ? "text-cyan border-b-2 border-cyan"
                : "text-text-muted hover:text-text border-b-2 border-transparent"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Content */}
      <motion.div
        key={tab + (selectedSession?.id ?? "")}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.15 }}
      >
        {tab === "dashboard" && (
          <div className="p-4 flex flex-col gap-4">
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="text-[11px] uppercase tracking-wider text-text-muted mb-2">
                Active Agents
              </div>
              {agents.length === 0 ? (
                <div className="text-text-muted text-sm">None detected</div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {agents.map((a) => (
                    <span
                      key={a}
                      className="px-2 py-1 rounded border border-cyan/30 text-cyan text-xs"
                    >
                      {a}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="rounded-lg border border-border bg-surface p-4">
              <div className="text-[11px] uppercase tracking-wider text-text-muted mb-2">
                Events Today
              </div>
              <div className="text-2xl font-semibold text-text">
                {eventCount}
              </div>
            </div>
          </div>
        )}

        {tab === "sessions" && !selectedSession && (
          <SessionList onSelect={setSelectedSession} />
        )}

        {tab === "sessions" && selectedSession && (
          <SessionReview
            session={selectedSession}
            onBack={() => setSelectedSession(null)}
          />
        )}
      </motion.div>
    </div>
  );
}
