// Types shared between the Tauri Rust backend and the React renderer.
//
// Post-pivot the app only consumes the proxy's audit + identity data; pre-
// pivot daemon-derived types (sessions, hosts, agent stats, hourly buckets,
// cost summaries, review signals) are gone alongside the daemon itself.

// Decision is the v0.1.0c/d audit verdict per row. 'allowed' is the default
// when neither rate-limiting nor coalescing fires. 'coalesced' means the
// proxy answered from a recent identical-result cache; 'rate_limited' means
// the proxy refused on policy grounds and returned an ErrorResponse to the
// client. Values are wire-format (underscored) so they match the SQLite
// values written by the proxy daemon.
export type Decision = "allowed" | "coalesced" | "rate_limited";

// =============================================================================
// Proxy tab types — mirror the v0.1.0c/d audit + identity SQLite schema in
// ~/.vigil/proxy.db. The Tauri side reads, the React side renders. The app
// never writes to proxy.db.
// =============================================================================

export interface ProxyIdentity {
  id: string;
  agent_name: string;
  principal: string;
  scopes: string[];
  public_key: string;
  issued_at: string;
  expires_at: string;
}

export interface AuditRow {
  id: number;
  ts: string;
  agent_id: string | null;
  agent_name: string | null;
  conn_id: string;
  direction: "client" | "server";
  msg_type: string;
  query_text: string | null;
  bytes: number;
  sig: string;
  // Optional: pre-v0.1.0c proxy.db files may not have the decision column
  // on disk. The Rust read layer fills 'allowed' when the column is absent,
  // so consumers can rely on a default rather than checking for undefined.
  decision?: Decision;
}

export interface ProxyCounter {
  agent_id: string | null;
  agent_name: string | null;
  queries_today: number;
  queries_deduped: number;
  queries_rate_limited: number;
}

// ProxyStatus drives the EmptyStateOnboarding swap and any future health
// UI. fixture_mode is true when ~/.vigil/proxy.db is missing or has zero
// rows in both tables; the React layer renders the dashboard identically
// against fixture and real data — the banner is the only fixture-aware
// surface.
export interface ProxyStatus {
  db_present: boolean;
  fixture_mode: boolean;
  identity_count: number;
  audit_count: number;
}

export interface AuditFilter {
  agent_id?: string | null;
  since_ts?: string | null;
  msg_type?: string | null;
  // decision is server-side: it cuts from the SQL result, not from already-
  // loaded rows. Reason: filtering a 10k-row audit table down to just the
  // rate-limited ones is the natural operator gesture; we don't want to
  // ship 10k rows to the renderer to whittle to 12.
  decision?: Decision | null;
}
