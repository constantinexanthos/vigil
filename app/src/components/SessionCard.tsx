import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import SessionDetail from "./SessionDetail";
import { relativeTime, formatCost } from "../types";
import type { SessionGroup } from "../types";

interface Props {
  session: SessionGroup;
  isNew?: boolean;
}

function confidenceBorder(score: number): string {
  if (score <= 0) return "transparent";
  if (score >= 80) return "#15803D";
  if (score >= 60) return "#D97706";
  if (score >= 40) return "#f97316";
  return "#B91C1C";
}

function confidenceLabel(score: number): { text: string; color: string } {
  if (score >= 80) return { text: "High", color: "#15803D" };
  if (score >= 60) return { text: "Review", color: "#D97706" };
  return { text: "Needs Attention", color: "#B91C1C" };
}

export default function SessionCard({ session, isNew }: Props) {
  const [expanded, setExpanded] = useState(false);
  const borderColor = confidenceBorder(session.confidence);
  const badge = session.confidence > 0 ? confidenceLabel(session.confidence) : null;

  return (
    <motion.div
      className="ml-3 rounded-md cursor-pointer transition-shadow hover:shadow-card"
      style={{ borderLeft: `2px solid ${borderColor}` }}
      initial={isNew ? { opacity: 0, y: -8 } : false}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="px-3 py-2.5" onClick={() => setExpanded(!expanded)}>
        {/* Line 1: description + time */}
        <div className="flex items-center gap-2">
          <p className="text-base text-text-primary truncate flex-1">{session.description}</p>
          <span className="text-xs text-text-muted flex-shrink-0">{relativeTime(session.endTime)}</span>
          <motion.span className="text-text-muted text-xs" animate={{ rotate: expanded ? 0 : -90 }} transition={{ duration: 0.15 }}>▾</motion.span>
        </div>
        {/* Line 2: stats */}
        <div className="flex items-center gap-2 mt-0.5">
          <span className="text-sm text-text-muted">{session.files.length} file{session.files.length !== 1 ? "s" : ""}</span>
          {badge && (
            <span className="text-xs px-1.5 py-0.5 rounded-sm" style={{ color: badge.color, background: badge.color + "18" }}>{badge.text}</span>
          )}
          {session.costUsd > 0 && <span className="text-sm text-text-muted">{formatCost(session.costUsd)}</span>}
          {session.hasWarning && <span className="w-1.5 h-1.5 rounded-full bg-amber" />}
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
