import { useMemo, useState } from "react";
import type { AuditFilter } from "../../types";
import { AuditFeed } from "./AuditFeed";
import { CountersPane } from "./CountersPane";
import { IdentitiesPane } from "./IdentitiesPane";
import { useProxyData } from "./useProxyData";

// Top-level Proxy tab. Owns filter state, threads it into the Tauri data
// hook, and lays out the three panes the brief specifies:
//   identities (left)  ·  counters (top of right column)  ·  audit (below)
// The right column flexes to fill the remaining space; identities is fixed
// at 240px so the audit table has room for the query column.
export function ProxyPane() {
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [windowMinutes, setWindowMinutes] = useState<number>(60);
  const [msgTypeFilter, setMsgTypeFilter] = useState<string>("all");
  const [decisionFilter, setDecisionFilter] = useState<string>("all");

  const sinceTs = useMemo<string | null>(() => {
    if (windowMinutes <= 0) return null;
    return new Date(Date.now() - windowMinutes * 60_000).toISOString();
  }, [windowMinutes]);

  const filter = useMemo<AuditFilter>(
    () => ({
      agent_id: agentFilter,
      since_ts: sinceTs,
      msg_type: null, // applied client-side in the feed
    }),
    [agentFilter, sinceTs],
  );

  const { status, identities, rows, counters, loading, error } =
    useProxyData(filter);

  const agentOptions = useMemo(
    () => identities.map((i) => ({ id: i.id, name: i.agent_name })),
    [identities],
  );

  return (
    <section
      aria-label="Proxy"
      className="h-full flex flex-col text-white"
      data-testid="proxy-pane"
    >
      {status?.fixture_mode && (
        <div
          role="status"
          className="bg-amber-500/[0.08] border-b border-amber-400/15 px-3.5 py-1 text-[10.5px] text-amber-200/80 flex items-center gap-2"
        >
          <span className="w-1 h-1 rounded-full bg-amber-300/70" aria-hidden />
          <span>
            Fixture data — proxy not running.
            {!status.db_present && (
              <>{" "}<span className="text-amber-200/50">No <code className="font-mono">~/.vigil/proxy.db</code> on disk.</span></>
            )}
          </span>
        </div>
      )}
      {error && (
        <div className="bg-rose-500/10 border-b border-rose-400/20 px-3.5 py-1 text-[11px] text-rose-200">
          Couldn't read proxy.db: {error}
        </div>
      )}

      <div
        className="grid flex-1 min-h-0"
        style={{ gridTemplateColumns: "240px 1fr" }}
      >
        <IdentitiesPane
          identities={identities}
          selectedId={agentFilter}
          onSelect={setAgentFilter}
        />
        <div className="flex flex-col min-w-0 min-h-0">
          <CountersPane counters={counters} />
          <AuditFeed
            rows={rows}
            agentFilter={agentFilter}
            setAgentFilter={setAgentFilter}
            windowMinutes={windowMinutes}
            setWindowMinutes={setWindowMinutes}
            msgTypeFilter={msgTypeFilter}
            setMsgTypeFilter={setMsgTypeFilter}
            decisionFilter={decisionFilter}
            setDecisionFilter={setDecisionFilter}
            agentOptions={agentOptions}
          />
        </div>
      </div>

      {loading && rows.length === 0 && (
        <div className="absolute inset-0 flex items-center justify-center text-[11px] text-white/40 pointer-events-none">
          Loading proxy data…
        </div>
      )}
    </section>
  );
}
