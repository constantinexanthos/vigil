import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import SessionDetail from "./SessionDetail";
import { relativeTime, formatCost } from "../types";
import type { SessionGroup } from "../types";

interface Props {
  session: SessionGroup;
  isNew?: boolean;
  showDivider?: boolean;
}

function confidenceBorderColor(score: number): string {
  if (score <= 0) return "transparent";
  if (score >= 80) return "#15803D";
  if (score >= 60) return "#D97706";
  if (score >= 40) return "#f97316";
  return "#B91C1C";
}

function confidenceLabel(score: number): { text: string; color: string } | null {
  if (score <= 0) return null;
  if (score >= 80) return { text: "High", color: "#15803D" };
  if (score >= 60) return { text: "Review", color: "#D97706" };
  return { text: "Low", color: "#B91C1C" };
}

export default function SessionCard({ session, isNew, showDivider }: Props) {
  const [expanded, setExpanded] = useState(false);
  const borderColor = confidenceBorderColor(session.confidence);
  const badge = confidenceLabel(session.confidence);

  return (
    <motion.div
      style={{ borderLeft: `3px solid ${borderColor}` }}
      initial={isNew ? { opacity: 0, y: -8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div
        className="cursor-pointer transition-colors"
        style={{ padding: "10px 14px", background: "transparent" }}
        onClick={() => setExpanded(!expanded)}
        onMouseEnter={(e) => { e.currentTarget.style.background = "#2C2C2E"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        {/* Line 1: commit message + timestamp */}
        <div className="flex items-center gap-2">
          <p className="truncate flex-1" style={{ fontSize: 13, color: "#D1D5DB", fontWeight: 400 }}>{session.description}</p>
          <span className="flex-shrink-0" style={{ fontSize: 12, color: "#6B7280" }}>{relativeTime(session.endTime)}</span>
        </div>
        {/* Line 2: stats */}
        <div className="flex items-center gap-2" style={{ marginTop: 2 }}>
          <span style={{ fontSize: 12, color: "#6B7280" }}>{session.files.length} file{session.files.length !== 1 ? "s" : ""}</span>
          {badge && (
            <span style={{ fontSize: 11, color: badge.color, background: badge.color + "18", padding: "1px 6px", borderRadius: 3 }}>{badge.text}</span>
          )}
          {session.costUsd > 0 && <span style={{ fontSize: 12, color: "#6B7280" }}>{formatCost(session.costUsd)}</span>}
        </div>
      </div>

      <AnimatePresence initial={false}>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            <SessionDetail session={session} />
          </motion.div>
        )}
      </AnimatePresence>

      {showDivider && !expanded && (
        <div style={{ height: 1, background: "rgba(255,255,255,0.04)", marginLeft: 14, marginRight: 14 }} />
      )}
    </motion.div>
  );
}
