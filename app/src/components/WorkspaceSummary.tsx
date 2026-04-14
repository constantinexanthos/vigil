import { agentColor, agentDisplayName, formatCost } from "../types";
import type { WorkspaceSummary as WS } from "../types";

interface Props {
  summary: WS;
}

export default function WorkspaceSummary({ summary }: Props) {
  return (
    <div className="px-4 py-3 border-b border-border">
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="bg-surface rounded-lg p-2.5">
          <div className="text-lg font-semibold text-text-primary">{summary.commits_today}</div>
          <div className="text-[10px] text-text-muted">commits</div>
        </div>
        <div className="bg-surface rounded-lg p-2.5">
          <div className="text-lg font-semibold text-text-primary">{summary.files_changed_today}</div>
          <div className="text-[10px] text-text-muted">files changed</div>
        </div>
        <div className="bg-surface rounded-lg p-2.5">
          <div className="text-lg font-semibold text-amber">{summary.total_cost_today > 0 ? formatCost(summary.total_cost_today) : "$0"}</div>
          <div className="text-[10px] text-text-muted">spent today</div>
        </div>
      </div>
      {summary.agent_commits.length > 0 && (
        <div className="flex gap-2 flex-wrap">
          {summary.agent_commits.map((ac) => (
            <span
              key={ac.agent}
              className="text-[10px] px-2 py-0.5 rounded-full border"
              style={{
                color: agentColor(ac.agent),
                borderColor: agentColor(ac.agent) + "30",
                backgroundColor: agentColor(ac.agent) + "10",
              }}
            >
              {agentDisplayName(ac.agent)} {ac.commit_count}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
