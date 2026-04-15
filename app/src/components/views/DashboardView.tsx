import type { useDaemonData } from "../../hooks";
import { agentColor, agentDisplayName, fileName, formatCost, relativeTime, truncatePath } from "../../types";
import Sparkline from "../Sparkline";

interface Props {
  data: ReturnType<typeof useDaemonData>;
}

export default function DashboardView({ data }: Props) {
  const { connected, agentStats, workspaceSummary, costSummary, agentActivity, commitGroups, collisions } = data;

  if (!connected) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center px-8">
        <div className="w-10 h-10 rounded-full flex items-center justify-center mb-5 border border-border">
          <div className="w-2.5 h-2.5 rounded-full bg-text-muted" />
        </div>
        <p className="text-text-secondary text-sm mb-1">Waiting for daemon</p>
        <p className="text-text-muted text-xs mb-4">Start monitoring to see agent activity</p>
        <code className="text-accent text-xs bg-surface border border-border px-3 py-1.5 rounded font-mono">
          vigil watch &lt;dir&gt;
        </code>
      </div>
    );
  }

  const recentCommits = commitGroups.slice(0, 5);

  return (
    <div className="p-6 space-y-6 overflow-y-auto">
      {/* Stats row - 2x2 grid */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-surface rounded-xl p-5">
          <div className="text-[12px] text-text-secondary mb-2">Active Agents</div>
          <div className="text-[24px] font-semibold text-text-primary leading-none">
            {agentStats.length}
          </div>
          {agentStats.length > 0 && (
            <div className="flex gap-1.5 mt-2">
              {agentStats.map((s) => (
                <span
                  key={s.agent}
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: agentColor(s.agent) }}
                  title={agentDisplayName(s.agent)}
                />
              ))}
            </div>
          )}
        </div>

        <div className="bg-surface rounded-xl p-5">
          <div className="text-[12px] text-text-secondary mb-2">Files Changed</div>
          <div className="text-[24px] font-semibold text-text-primary leading-none">
            {workspaceSummary.files_changed_today}
          </div>
        </div>

        <div className="bg-surface rounded-xl p-5">
          <div className="text-[12px] text-text-secondary mb-2">Total Cost</div>
          <div className="text-[24px] font-semibold text-text-primary leading-none">
            {costSummary.total_cost_usd > 0 ? formatCost(costSummary.total_cost_usd) : "\u2014"}
          </div>
        </div>

        <div className="bg-surface rounded-xl p-5">
          <div className="text-[12px] text-text-secondary mb-2">Commits</div>
          <div className="text-[24px] font-semibold text-text-primary leading-none">
            {workspaceSummary.commits_today}
          </div>
        </div>
      </div>

      {/* Agent cards - horizontal scroll */}
      {agentStats.length > 0 && (
        <div>
          <h3 className="text-xs text-text-muted uppercase tracking-wider mb-3">Agents</h3>
          <div className="flex gap-3 overflow-x-auto pb-1">
            {agentStats.map((stat) => {
              const color = agentColor(stat.agent);
              const activity = agentActivity.get(stat.agent);
              const lastFile = activity?.lastFile;
              const sparkline = activity?.sparkline ?? [];
              return (
                <div
                  key={stat.agent}
                  className="flex-shrink-0 bg-surface rounded-lg p-3 min-w-[180px]"
                  style={{ borderLeft: `3px solid ${color}` }}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <span className="text-[12px] font-medium text-text-primary">
                      {agentDisplayName(stat.agent)}
                    </span>
                  </div>
                  {lastFile && (
                    <div className="text-[11px] text-text-secondary truncate mb-2" title={lastFile}>
                      working on {fileName(lastFile)}
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] text-text-muted">{stat.count} files</span>
                    {sparkline.length > 0 && <Sparkline data={sparkline} color={color} />}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent activity */}
      {recentCommits.length > 0 && (
        <div>
          <h3 className="text-xs text-text-muted uppercase tracking-wider mb-3">Recent Activity</h3>
          <div className="space-y-1">
            {recentCommits.map((commit, i) => {
              const color = agentColor(commit.agent);
              return (
                <div key={`${commit.commit_hash}-${i}`} className="flex items-center gap-3 bg-surface rounded-lg px-4 py-2.5">
                  <span className="text-[10px] text-text-muted w-[48px] flex-shrink-0">
                    {relativeTime(commit.timestamp)}
                  </span>
                  <span
                    className="text-[10px] px-1.5 py-0.5 rounded flex-shrink-0"
                    style={{ color, backgroundColor: color + "15", border: `1px solid ${color}30` }}
                  >
                    {agentDisplayName(commit.agent)}
                  </span>
                  <span className="text-[12px] text-text-primary truncate flex-1">
                    {commit.commit_message || "(no message)"}
                  </span>
                  {commit.files.length > 0 && (
                    <span className="text-[10px] text-text-muted bg-elevated px-1.5 py-0.5 rounded flex-shrink-0">
                      {commit.files.length}
                    </span>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Alerts - only if collisions exist */}
      {collisions.length > 0 && (
        <div>
          <h3 className="text-xs text-text-muted uppercase tracking-wider mb-3">Alerts</h3>
          <div className="space-y-2">
            {collisions.map((col) => (
              <div
                key={col.file_path}
                className="bg-surface rounded-lg px-4 py-3"
                style={{ borderLeft: "3px solid #fbbf24" }}
              >
                <div className="text-[11px] text-amber font-medium mb-1">Collision</div>
                <div className="text-[12px] text-text-primary font-mono truncate mb-1.5">
                  {truncatePath(col.file_path)}
                </div>
                <div className="flex gap-1.5">
                  {col.agents.map((agent) => {
                    const c = agentColor(agent);
                    return (
                      <span
                        key={agent}
                        className="text-[10px] px-1.5 py-0.5 rounded"
                        style={{ color: c, backgroundColor: c + "15", border: `1px solid ${c}30` }}
                      >
                        {agentDisplayName(agent)}
                      </span>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
