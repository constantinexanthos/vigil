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
    <motion.div className="mb-3" layout transition={spring}>
      {/* Agent header */}
      <div
        className="flex items-center justify-between px-3 py-2.5 rounded-md cursor-pointer hover:shadow-card transition-shadow"
        onClick={() => setCollapsed(!collapsed)}
      >
        <div className="flex items-center gap-2.5">
          <AgentLogo agent={agent} />
          <span className="text-lg font-medium text-text-primary">{agentDisplayName(agent)}</span>
          <span className="text-sm text-text-muted">{sessions.length} session{sessions.length !== 1 ? "s" : ""}</span>
        </div>
        <div className="flex items-center gap-2">
          {totalCost > 0 && (
            <span className="text-xs text-text-muted bg-bg-secondary px-2 py-0.5 rounded-sm">{formatCost(totalCost)}</span>
          )}
          <motion.span
            className="text-text-muted text-xs"
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
