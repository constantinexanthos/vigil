import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AuditFilter, Decision } from "../../types";
import { AuditFeed, type AuditFeedHandle } from "./AuditFeed";
import { CountersPane } from "./CountersPane";
import { EmptyStateOnboarding } from "./EmptyStateOnboarding";
import { IdentitiesPane } from "./IdentitiesPane";
import { KeyboardHelp } from "./KeyboardHelp";
import { useProxyData } from "./useProxyData";

// ProxyPane composes the three panes (identities · counters · audit) and
// owns the cross-pane glue: filter state, the click-to-drill handler from
// counters → audit, and the keyboard map (i/f/j/k/Esc/?). The strip of
// drill cards lives inside CountersPane; the feed below shares the
// decisionFilter so a click in one updates the other in the same render.
export function ProxyPane() {
  const [agentFilter, setAgentFilter] = useState<string | null>(null);
  const [windowMinutes, setWindowMinutes] = useState<number>(60);
  const [msgTypeFilter, setMsgTypeFilter] = useState<string>("all");
  const [decisionFilter, setDecisionFilter] = useState<string>("all");
  const [showDemo, setShowDemo] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);

  const sinceTs = useMemo<string | null>(() => {
    if (windowMinutes <= 0) return null;
    return new Date(Date.now() - windowMinutes * 60_000).toISOString();
  }, [windowMinutes]);

  const decisionForFilter = useMemo<Decision | null>(() => {
    if (decisionFilter === "all") return null;
    return decisionFilter as Decision;
  }, [decisionFilter]);

  const filter = useMemo<AuditFilter>(
    () => ({
      agent_id: agentFilter,
      since_ts: sinceTs,
      msg_type: null,
      decision: decisionForFilter,
    }),
    [agentFilter, sinceTs, decisionForFilter],
  );

  const { status, identities, rows, counters, loading, error, isPolling } =
    useProxyData(filter);

  const agentOptions = useMemo(
    () => identities.map((i) => ({ id: i.id, name: i.agent_name })),
    [identities],
  );

  const identitiesRef = useRef<HTMLDivElement | null>(null);
  const auditFeedRef = useRef<AuditFeedHandle | null>(null);
  const feedSectionRef = useRef<HTMLDivElement | null>(null);

  // Drill flow (brief acceptance #5): clicking a counter card sets the
  // decisionFilter and scrolls the feed into view so the operator sees
  // the now-filtered rows without manual scrolling.
  const onDecisionClick = useCallback((decision: string) => {
    setDecisionFilter(decision);
    feedSectionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, []);

  // Window-level keyboard map (brief #9). We intentionally do NOT
  // hijack keys while a typeable element is focused — `f` in a select
  // is the user navigating the dropdown, not asking to refocus the
  // filter.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target as HTMLElement | null;
      if (target && /^(input|textarea|select)$/i.test(target.tagName)) {
        if (e.key !== "Escape") return;
      }
      if (e.key === "i") {
        e.preventDefault();
        identitiesRef.current?.focus();
      } else if (e.key === "f") {
        e.preventDefault();
        auditFeedRef.current?.focusFilter();
      } else if (e.key === "?") {
        e.preventDefault();
        setHelpOpen((v) => !v);
      } else if (e.key === "Escape") {
        // Clear filters; explicit reset path.
        setAgentFilter(null);
        setDecisionFilter("all");
        setMsgTypeFilter("all");
        setHelpOpen(false);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const showOnboarding = status?.db_present === false && !showDemo;

  return (
    <section
      aria-label="Proxy"
      className="h-full flex flex-col text-vigil-ink"
      data-testid="proxy-pane"
    >
      {showOnboarding ? (
        <EmptyStateOnboarding onShowDemo={() => setShowDemo(true)} />
      ) : (
        <>
          {status?.fixture_mode && (
            <div
              role="status"
              className="h-6 px-4 text-[11px] text-vigil-mute flex items-center gap-2 border-b border-vigil-rule"
            >
              <span className="w-1 h-1 rounded-full bg-vigil-accent" aria-hidden />
              <span>
                Fixture data — proxy not running.
                {!status.db_present && (
                  <span className="text-vigil-mute/70">
                    {" "}No <code className="font-mono">~/.vigil/proxy.db</code> on disk.
                  </span>
                )}
              </span>
            </div>
          )}
          {error && (
            <div className="h-6 px-4 text-[11px] text-vigil-accent flex items-center border-b border-vigil-rule">
              Couldn't read proxy.db: {error}
            </div>
          )}

          <div className="grid flex-1 min-h-0" style={{ gridTemplateColumns: "240px 1fr" }}>
            <IdentitiesPane
              ref={identitiesRef}
              identities={identities}
              selectedId={agentFilter}
              onSelect={setAgentFilter}
            />
            <div className="flex flex-col min-w-0 min-h-0">
              <CountersPane
                counters={counters}
                rows={rows}
                decisionFilter={decisionFilter}
                onDecisionClick={onDecisionClick}
              />
              <div ref={feedSectionRef} className="flex flex-col flex-1 min-h-0">
                <AuditFeed
                  ref={auditFeedRef}
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
                  isPolling={isPolling}
                />
              </div>
            </div>
          </div>

          {loading && rows.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-[12px] text-vigil-mute pointer-events-none">
              Loading proxy data…
            </div>
          )}

          <button
            type="button"
            aria-label="Keyboard shortcuts"
            title="Keyboard shortcuts (?)"
            data-testid="keyboard-help-trigger"
            onClick={() => setHelpOpen(true)}
            className="fixed right-3 bottom-3 w-5 h-5 rounded border border-vigil-rule text-[11px] text-vigil-mute hover:text-vigil-ink hover:border-vigil-accent flex items-center justify-center font-mono transition-colors duration-fast"
          >
            ?
          </button>
          <KeyboardHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
        </>
      )}
    </section>
  );
}
