import { motion } from "framer-motion";
import { hostToken } from "../lib/host-tokens";
import { repoName } from "../lib/formatters";
import { ModelChip } from "./ModelChip";
import type { SessionGroup } from "../types";

interface Props {
  session: SessionGroup;
  selected: boolean;
  onSelect: () => void;
}

export function SessionRow({ session, selected, onSelect }: Props) {
  const token = hostToken(session.hostKind);
  const addedRemoved = tallyFiles(session);

  return (
    <motion.button
      type="button"
      onClick={onSelect}
      layout
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="w-full text-left px-2.5 py-2 rounded-md transition-colors"
      style={{
        background: selected ? `${token.color}1A` : "transparent",
        borderLeft: `2px solid ${selected ? token.color : "transparent"}`,
        boxShadow: selected ? `inset 0 0 0 1px ${token.color}26` : undefined,
      }}
    >
      <div className="flex items-baseline justify-between gap-2">
        <span className={`text-[12px] truncate ${selected ? "text-white font-semibold" : "text-white/80"}`}>
          {session.description || "(no description)"}
        </span>
        <ModelChip model={session.model} />
      </div>
      <div className="text-[11px] text-white/50 flex justify-between gap-2 mt-0.5">
        <span className="truncate">{session.agent} · {repoName(session.repoPath)}</span>
        <span className="font-mono shrink-0">
          <span className="text-emerald-400">+{addedRemoved.added}</span>{" "}
          <span className="text-rose-400">-{addedRemoved.removed}</span>
        </span>
      </div>
    </motion.button>
  );
}

function tallyFiles(s: SessionGroup) {
  return s.files.reduce(
    (acc, f) => ({ added: acc.added + (f.added || 0), removed: acc.removed + (f.removed || 0) }),
    { added: 0, removed: 0 },
  );
}

