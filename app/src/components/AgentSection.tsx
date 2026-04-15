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
    <motion.div
      layout
      transition={spring}
      style={{
        marginBottom: "24px",
        borderBottom: "1px solid rgba(255,255,255,0.04)",
        paddingBottom: "16px",
      }}
    >
      {/* Agent header */}
      <div
        onClick={() => setCollapsed(!collapsed)}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "12px 16px",
          cursor: "pointer",
          background: "#2C2C2E",
          borderRadius: "8px",
          marginBottom: collapsed ? 0 : "8px",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <AgentLogo agent={agent} />
          <span style={{
            fontSize: "15px",
            fontWeight: 600,
            color: "#F9FAFB",
            letterSpacing: "-0.01em",
          }}>
            {agentDisplayName(agent)}
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <span style={{
            fontSize: "12px",
            color: "#9CA3AF",
          }}>
            {sessions.length} session{sessions.length !== 1 ? "s" : ""}
          </span>
          {totalCost > 0 && (
            <span style={{
              fontSize: "12px",
              color: "#9CA3AF",
              background: "#3A3A3C",
              padding: "2px 8px",
              borderRadius: "4px",
            }}>
              {formatCost(totalCost)}
            </span>
          )}
          <motion.span
            style={{ color: "#6B7280", fontSize: "12px" }}
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
            {sessions.map((session) => (
              <SessionCard
                key={session.id}
                session={session}
                isNew={newSessionIds.has(session.id)}
              />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
