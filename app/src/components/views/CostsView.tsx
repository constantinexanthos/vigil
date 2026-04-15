import type { useDaemonData } from "../../hooks";
import { agentColor, agentDisplayName, formatCost, formatTokens } from "../../types";

interface Props {
  data: ReturnType<typeof useDaemonData>;
}

export default function CostsView({ data }: Props) {
  const { costSummary } = data;

  return (
    <div className="p-6 space-y-6 overflow-y-auto">
      {/* Big total cost card */}
      <div className="bg-surface rounded-xl p-6 text-center">
        <div className="text-[12px] text-text-secondary mb-2">Total Cost (24h)</div>
        <div className="text-[32px] font-semibold text-text-primary leading-none">
          {costSummary.total_cost_usd > 0 ? formatCost(costSummary.total_cost_usd) : "$0.00"}
        </div>
      </div>

      {/* Per-agent table */}
      {costSummary.agents.length > 0 && (
        <div>
          <h3 className="text-xs text-text-muted uppercase tracking-wider mb-3">Per Agent</h3>
          <div className="bg-surface rounded-xl overflow-hidden">
            <table className="w-full text-[12px]">
              <thead>
                <tr className="border-b border-border text-text-muted text-left">
                  <th className="px-4 py-2.5 font-normal">Agent</th>
                  <th className="px-4 py-2.5 font-normal text-right">Events</th>
                  <th className="px-4 py-2.5 font-normal text-right">Tokens</th>
                  <th className="px-4 py-2.5 font-normal text-right">Cost</th>
                </tr>
              </thead>
              <tbody>
                {costSummary.agents.map((agent) => {
                  const color = agentColor(agent.agent);
                  const totalTokens = agent.input_tokens + agent.output_tokens;
                  return (
                    <tr key={agent.agent} className="border-b border-border last:border-b-0 hover:bg-elevated/30 transition-colors">
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
                          <span className="text-text-primary">{agentDisplayName(agent.agent)}</span>
                        </div>
                      </td>
                      <td className="px-4 py-2.5 text-right text-text-secondary">{agent.event_count}</td>
                      <td className="px-4 py-2.5 text-right text-text-secondary font-mono">{formatTokens(totalTokens)}</td>
                      <td className="px-4 py-2.5 text-right text-text-primary font-medium">{formatCost(agent.total_cost_usd)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {costSummary.agents.length === 0 && (
        <div className="text-center py-12">
          <p className="text-sm text-text-muted">No cost data available</p>
          <p className="text-xs text-text-muted mt-1">Cost tracking requires agents with API usage</p>
        </div>
      )}
    </div>
  );
}
