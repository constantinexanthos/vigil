import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import AgentLogo from "./AgentLogo";
import SessionCard from "./SessionCard";
import { agentDisplayName, formatCost } from "../types";
import type { SessionGroup, Collision } from "../types";

interface Props {
  agent: string;
  sessions: SessionGroup[];
  totalCost: number;
  collisions: Collision[];
  newSessionIds: Set<string>;
}

const spring = { type: "spring" as const, stiffness: 400, damping: 30 };

export default function AgentSection({ agent, sessions, totalCost, collisions: _collisions, newSessionIds }: Props) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <motion.div style={{ marginBottom: 20 }} layout transition={spring}>
      {/* Agent header */}
      <div
        className="flex items-center justify-between cursor-pointer"
        style={{
          background: "#2C2C2E",
          borderRadius: 8,
          padding: "10px 14px",
          marginBottom: 4,
        }}
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2.5">
          <div style={{ width: 20, height: 20 }}><AgentLogo agent={agent} /></div>
          <span style={{ fontSize: 15, fontWeight: 600, color: "#F9FAFB" }}>{agentDisplayName(agent)}</span>
          <span style={{ fontSize: 12, color: "#6B7280" }}>{sessions.length} session{sessions.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex items-center gap-2">
          {totalCost > 0 && (
            <span style={{ fontSize: 12, color: "#6B7280" }}>{formatCost(totalCost)}</span>
          )}
          <motion.span
            style={{ color: "#6B7280", fontSize: 11 }}
            animate={{ rotate: collapsed ? -90 : 0 }}
            transition={{ duration: 0.15 }}
          >
            ▾
          </motion.span>
        </div>
      </div>

      <AnimatePresence initial={false}>
        {!collapsed && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
            className="overflow-hidden"
          >
            {sessions.map((session, i) => (
              <SessionCard
                key={session.id}
                session={session}
                isNew={newSessionIds.has(session.id)}
                showDivider={i < sessions.length - 1}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
