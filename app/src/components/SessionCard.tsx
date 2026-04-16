import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import SessionDetail from "./SessionDetail";
import { relativeTime } from "../types";
import type { SessionGroup } from "../types";

interface Props {
  session: SessionGroup;
  isNew?: boolean;
  showDivider?: boolean;
}

function confidenceBorderColor(score: number): string {
  if (score >= 80) return "#15803D";
  if (score >= 60) return "#D97706";
  if (score >= 40) return "#f97316";
  if (score > 0) return "#B91C1C";
  return "#3A3A3C";
}

function confidenceLabel(score: number): { text: string; color: string } {
  if (score >= 80) return { text: "High", color: "#15803D" };
  if (score >= 60) return { text: "Moderate", color: "#D97706" };
  if (score >= 40) return { text: "Low", color: "#f97316" };
  return { text: "Review", color: "#B91C1C" };
}

export default function SessionCard({ session, isNew }: Props) {
  const [expanded, setExpanded] = useState(false);
  const borderColor = confidenceBorderColor(session.confidence);
  const badge = confidenceLabel(session.confidence);

  return (
    <motion.div
      style={{
        borderLeft: `3px solid ${borderColor}`,
        background: "#232326",
        borderRadius: "0 8px 8px 0",
        marginBottom: 6,
        overflow: "hidden",
      }}
      initial={isNew ? { opacity: 0, y: -8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div
        className="cursor-pointer transition-colors"
        style={{ padding: "12px 14px" }}
        onClick={() => setExpanded(!expanded)}
        onMouseEnter={(e) => { e.currentTarget.style.background = "#2C2C2E"; }}
        onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
      >
        {/* Line 1: description + timestamp */}
        <div className="flex items-start gap-2">
          <p className="flex-1" style={{ fontSize: 13, color: "#D1D5DB", fontWeight: 400, lineHeight: "18px" }}>
            {session.description}
          </p>
          <span className="flex-shrink-0" style={{ fontSize: 11, color: "#6B7280", marginTop: 2 }}>
            {relativeTime(session.endTime)}
          </span>
        </div>
        {/* Line 2: stats */}
        <div className="flex items-center gap-2" style={{ marginTop: 4 }}>
          <span style={{ fontSize: 11, color: "#6B7280" }}>
            {session.files.length} file{session.files.length !== 1 ? "s" : ""}
          </span>
          <span style={{
            fontSize: 10, fontWeight: 500, color: badge.color,
            background: badge.color + "18", padding: "1px 6px", borderRadius: 3,
          }}>
            {badge.text}
          </span>
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
    </motion.div>
  );
}
